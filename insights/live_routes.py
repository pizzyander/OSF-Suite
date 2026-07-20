import os
import json
import asyncio
import logging
from datetime import datetime

import boto3
import websockets
import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select

from db import AsyncSessionLocal, Meeting, Agent
from db_context import CompanyContext
from auth import decode_token
from embeddings import get_context_owner_id
from nudge_triggers import classify_segment
from nudge_engine import generate_event_nudge, generate_periodic_nudge

logger = logging.getLogger(__name__)
router = APIRouter()

REDIS_URL        = os.getenv("REDIS_URL", "redis://redis:6379")
SQS_QUEUE_URL    = os.getenv("SQS_QUEUE_URL", "")
AWS_REGION       = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")

# Query params here configure Deepgram's behavior for this session:
#   - linear16 @ 16kHz mono matches exactly what our pcm-processor.js sends
#   - diarize=true tags each word with a speaker number
#   - interim_results=true gives us the fast, "still typing" partial text
#     the frontend fades out until a final version replaces it
#   - smart_format adds punctuation/casing so the transcript reads naturally
DEEPGRAM_URL = (
    "wss://api.deepgram.com/v1/listen"
    "?model=nova-3"
    "&language=en"
    "&encoding=linear16"
    "&sample_rate=16000"
    "&channels=1"
    "&diarize=true"
    "&punctuate=true"
    "&smart_format=true"
    "&interim_results=true"
)

# How often the live session "checks in" while active, and how long a
# missed check-in is tolerated before the reconciler assumes the process
# that owned this session has died. Must be well longer than the refresh
# interval so a single slow tick doesn't cause a false orphan detection.
HEARTBEAT_REFRESH_SECONDS = 20
HEARTBEAT_TTL_SECONDS     = 60

# How often the periodic "call health" nudge check runs (talk ratio,
# discovery gaps, closing) — this is a slow-moving signal, not something
# worth checking every few seconds like objections/buying signals are.
PERIODIC_NUDGE_INTERVAL_SECONDS = 30
# Skip periodic checks in the first few seconds of a call — barely any
# transcript exists yet, so an LLM call here would just waste a request.
MIN_CALL_MINUTES_BEFORE_PERIODIC_CHECKS = 0.5


async def authenticate_ws(token: str, meeting_id: str) -> Agent | None:
    """
    Validates the JWT and confirms the requesting agent actually owns this
    meeting. Returns the full Agent row on success (not just the id) —
    the nudge system needs agent.org_id to resolve shared team context,
    which a bare id string can't give us.
    """
    try:
        agent_id = decode_token(token)
    except Exception as e:
        logger.warning(f"Live auth failed for meeting={meeting_id}: invalid/expired token ({e})")
        return None

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Meeting)
            .where(Meeting.id == meeting_id)
            .where(Meeting.user_id == agent_id)
        )
        meeting = result.scalar_one_or_none()
        if not meeting:
            logger.warning(
                f"Live auth failed for meeting={meeting_id}: no meeting found for "
                f"agent={agent_id} (wrong owner, or meeting_id doesn't exist)"
            )
            return None

        agent_result = await db.execute(select(Agent).where(Agent.id == agent_id))
        return agent_result.scalar_one_or_none()


async def get_live_context(agent: Agent, redis_client: aioredis.Redis) -> str:
    """
    Fetches this agent's (or their org's) active company context, for
    grounding nudges in real pricing/positioning instead of generic
    advice — same Redis-first, Postgres-fallback pattern worker.py uses
    for the post-call analysis, just without the RAG similarity search,
    since nudge_engine trims to a fixed length itself rather than needing
    query-specific retrieval.
    """
    owner_id = get_context_owner_id(agent)

    try:
        cached = await redis_client.get(f"agent_context:{owner_id}")
        if cached:
            return cached.decode() if isinstance(cached, bytes) else cached
    except Exception as e:
        logger.error(f"Redis context fetch failed for owner={owner_id}: {e}")

    try:
        async with AsyncSessionLocal() as db:
            if agent.org_id:
                scope_filter = (CompanyContext.org_id == agent.org_id)
            else:
                scope_filter = (CompanyContext.agent_id == agent.id) & (CompanyContext.org_id.is_(None))
            result = await db.execute(
                select(CompanyContext).where(scope_filter).where(CompanyContext.is_active == True)
            )
            context = result.scalar_one_or_none()
            if context:
                return context.extracted_text
    except Exception as e:
        logger.error(f"Postgres context fetch failed for owner={owner_id}: {e}")

    return ""


async def finalize_meeting(meeting_id: str, final_segments: list[dict]):
    """
    Assembles the full diarized transcript from everything Deepgram sent us
    during the live session, saves it, and queues the same "analyze" SQS
    message your worker already knows how to handle — so Pass 1/Pass 2 LLM
    analysis runs identically whether the transcript came from a live
    session or a manual file upload.
    """
    lines = [f"[Speaker {seg['speaker']}]: {seg['text']}" for seg in final_segments]
    full_transcript = "\n".join(lines).strip()

    if not full_transcript:
        logger.warning(f"Meeting {meeting_id} ended with no transcribed speech — skipping analysis")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
        meeting = result.scalar_one_or_none()
        if not meeting:
            logger.error(f"Meeting {meeting_id} not found when finalizing live session")
            return
        meeting.transcript = full_transcript
        meeting.status = "processing"
        await db.commit()

    async with aioredis.from_url(REDIS_URL) as r:
        await r.hset(f"meeting:{meeting_id}", mapping={
            "status": "processing",
            "transcript": full_transcript,
        })

    sqs = boto3.client("sqs", region_name=AWS_REGION)
    await asyncio.to_thread(
        sqs.send_message,
        QueueUrl=SQS_QUEUE_URL,
        MessageBody=json.dumps({"type": "analyze", "meeting_id": meeting_id})
    )

    logger.info(f"Meeting {meeting_id} finalized from live session ({len(full_transcript)} chars) — analysis queued")


@router.websocket("/meetings/{meeting_id}/live")
async def live_transcription(websocket: WebSocket, meeting_id: str, token: str = Query(...)):
    # Accept the handshake FIRST. Custom close codes (4000-4999) only reach
    # the browser's onclose handler reliably for connections that completed
    # the handshake — closing before accept() instead surfaces as a generic
    # HTTP-level rejection with no code the frontend can act on.
    await websocket.accept()

    agent = await authenticate_ws(token, meeting_id)
    if not agent:
        await websocket.close(code=4401, reason="Unauthorized")
        return

    logger.info(f"Live transcription session started for meeting={meeting_id} agent={agent.id}")

    # One Redis connection, reused for every incremental write this session.
    redis_client = aioredis.from_url(REDIS_URL)
    heartbeat_task = None
    periodic_nudge_task = None
    # Fire-and-forget event nudge tasks land here so we can cancel any
    # still in flight when the session ends, instead of leaking them.
    background_nudge_tasks: set[asyncio.Task] = set()

    # Sending happens from THREE different places now — the main
    # transcript relay, individual event-nudge tasks, and the periodic
    # nudge loop. Starlette's WebSocket.send_json isn't guaranteed safe
    # for concurrent calls from multiple tasks at once, so every send in
    # this handler goes through this one lock to keep frames from
    # interleaving or corrupting each other.
    ws_send_lock = asyncio.Lock()

    context_text = await get_live_context(agent, redis_client)
    session_start = datetime.utcnow()

    # Every FINAL segment Deepgram sends us, in arrival order — this list
    # becomes the meeting's full transcript once the session ends, AND
    # doubles as the running "call so far" the periodic nudge check reads.
    final_segments: list[dict] = []
    # Rough per-speaker word counts, used for the talk-ratio nudge.
    speaker_word_counts: dict[int, int] = {}
    ended_deliberately = False

    async def send_nudge(category: str, text: str):
        try:
            async with ws_send_lock:
                await websocket.send_json({"type": "nudge", "category": category, "text": text})
        except Exception as e:
            logger.error(f"Failed to send nudge (meeting={meeting_id}): {e}")

    async def handle_event_nudge(category: str, segment_text: str):
        """
        Runs as a background task, NOT awaited inline — a slow LLM call
        here must never block deepgram_to_browser from reading the next
        transcript event. Worst case, a nudge just never lands for this
        segment; the live captions keep flowing regardless.
        """
        nudge_text = await generate_event_nudge(category, segment_text, context_text)
        if nudge_text:
            await send_nudge(category, nudge_text)

    try:
        async with websockets.connect(
            DEEPGRAM_URL,
            additional_headers={"Authorization": f"Token {DEEPGRAM_API_KEY}"}
        ) as deepgram_ws:

            async def browser_to_deepgram() -> bool:
                while True:
                    message = await websocket.receive()

                    if message["type"] == "websocket.disconnect":
                        return False

                    if message.get("bytes") is not None:
                        await deepgram_ws.send(message["bytes"])
                        continue

                    if message.get("text") is not None:
                        try:
                            control = json.loads(message["text"])
                        except json.JSONDecodeError:
                            continue
                        if control.get("type") == "end":
                            return True

            async def deepgram_to_browser():
                async for raw_message in deepgram_ws:
                    data = json.loads(raw_message)

                    if data.get("type") != "Results":
                        continue

                    alt = data.get("channel", {}).get("alternatives", [{}])[0]
                    text = alt.get("transcript", "").strip()
                    if not text:
                        continue

                    is_final = data.get("is_final", False)
                    words = alt.get("words", [])
                    speaker = words[0].get("speaker", 0) if words else 0

                    async with ws_send_lock:
                        await websocket.send_json({
                            "type": "transcript",
                            "speaker": speaker,
                            "text": text,
                            "is_final": is_final,
                        })

                    if is_final:
                        final_segments.append({"speaker": speaker, "text": text})
                        speaker_word_counts[speaker] = speaker_word_counts.get(speaker, 0) + len(text.split())

                        try:
                            await redis_client.rpush(
                                f"meeting:{meeting_id}:live_segments",
                                json.dumps({"speaker": speaker, "text": text})
                            )
                        except Exception as e:
                            logger.error(f"Failed to persist live segment for meeting={meeting_id}: {e}")

                        # Cheap keyword check first — only spend an LLM
                        # call if this segment actually looks worth it.
                        category = classify_segment(text)
                        if category:
                            task = asyncio.create_task(handle_event_nudge(category, text))
                            background_nudge_tasks.add(task)
                            task.add_done_callback(background_nudge_tasks.discard)

            async def heartbeat_loop():
                while True:
                    try:
                        await redis_client.set(
                            f"meeting:{meeting_id}:live_heartbeat", "1", ex=HEARTBEAT_TTL_SECONDS
                        )
                    except Exception as e:
                        logger.error(f"Heartbeat refresh failed for meeting={meeting_id}: {e}")
                    await asyncio.sleep(HEARTBEAT_REFRESH_SECONDS)

            async def periodic_nudge_loop():
                """
                Checks in on the call as a whole every ~30s — talk ratio,
                discovery gaps, closing — rather than reacting to a single
                sentence the way event nudges do.
                """
                while True:
                    await asyncio.sleep(PERIODIC_NUDGE_INTERVAL_SECONDS)

                    duration_minutes = (datetime.utcnow() - session_start).total_seconds() / 60
                    if duration_minutes < MIN_CALL_MINUTES_BEFORE_PERIODIC_CHECKS or not final_segments:
                        continue

                    total_words = sum(speaker_word_counts.values())
                    if total_words == 0:
                        continue

                    # ASSUMPTION: whoever spoke FIRST is the agent — reps
                    # typically open a sales call with a greeting. This is
                    # a heuristic, not a guarantee, and shares the same
                    # root limitation as the "Speaker 0/1 vs Agent/Client"
                    # gap flagged when diarization was first wired up.
                    # Worth solving properly later (e.g. confirming roles
                    # at call start) before leaning on this for anything
                    # beyond a rough live nudge.
                    agent_speaker = final_segments[0]["speaker"]
                    agent_words = speaker_word_counts.get(agent_speaker, 0)
                    agent_pct = round((agent_words / total_words) * 100)
                    client_pct = 100 - agent_pct

                    lines = [f"[Speaker {s['speaker']}]: {s['text']}" for s in final_segments]
                    transcript_so_far = "\n".join(lines)

                    result = await generate_periodic_nudge(
                        transcript_so_far, agent_pct, client_pct, duration_minutes, context_text
                    )
                    if result:
                        await send_nudge(result["category"], result["text"])

            browser_task        = asyncio.create_task(browser_to_deepgram())
            deepgram_task       = asyncio.create_task(deepgram_to_browser())
            heartbeat_task       = asyncio.create_task(heartbeat_loop())
            periodic_nudge_task  = asyncio.create_task(periodic_nudge_loop())

            ended_deliberately = await browser_task

            try:
                await deepgram_ws.send(json.dumps({"type": "CloseStream"}))
            except Exception:
                pass

            try:
                await asyncio.wait_for(deepgram_task, timeout=5)
            except asyncio.TimeoutError:
                deepgram_task.cancel()

    except WebSocketDisconnect:
        ended_deliberately = False
    except Exception as e:
        logger.error(f"Live transcription error for meeting={meeting_id}: {repr(e)}")
        ended_deliberately = False

    # Belt-and-suspenders cleanup, covering every exit path.
    if heartbeat_task and not heartbeat_task.done():
        heartbeat_task.cancel()
    if periodic_nudge_task and not periodic_nudge_task.done():
        periodic_nudge_task.cancel()
    for task in list(background_nudge_tasks):
        if not task.done():
            task.cancel()

    if final_segments:
        logger.info(
            f"Finalizing meeting={meeting_id} "
            f"(ended_deliberately={ended_deliberately}, segments={len(final_segments)})"
        )
        await finalize_meeting(meeting_id, final_segments)

        try:
            await redis_client.delete(
                f"meeting:{meeting_id}:live_segments",
                f"meeting:{meeting_id}:live_heartbeat",
            )
        except Exception as e:
            logger.error(f"Failed to clean up Redis keys for meeting={meeting_id}: {e}")
    else:
        logger.info(f"Live session for meeting={meeting_id} ended with no transcribed speech captured")

    await redis_client.aclose()