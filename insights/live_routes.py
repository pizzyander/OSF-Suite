import os
import json
import asyncio
import logging

import boto3
import websockets
import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select

from db import AsyncSessionLocal, Meeting
from auth import decode_token

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


async def authenticate_ws(token: str, meeting_id: str) -> str | None:
    """
    Validates the JWT and confirms the requesting agent actually owns this
    meeting. Returns the agent_id on success, None on any failure.

    This mirrors what get_current_agent() does for your REST routes, but
    browsers can't attach an Authorization header to a WebSocket handshake —
    the token arrives as a query param instead, so we validate it by hand
    here rather than reusing the HTTPBearer dependency.
    """
    try:
        agent_id = decode_token(token)
    except Exception:
        return None

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Meeting)
            .where(Meeting.id == meeting_id)
            .where(Meeting.user_id == agent_id)
        )
        meeting = result.scalar_one_or_none()

    return agent_id if meeting else None


async def finalize_meeting(meeting_id: str, final_segments: list[dict]):
    """
    Assembles the full diarized transcript from everything Deepgram sent us
    during the live session, saves it, and queues the same "analyze" SQS
    message your worker already knows how to handle — so Pass 1/Pass 2 LLM
    analysis runs identically whether the transcript came from a live
    session or a manual file upload. This function is the live-session
    equivalent of what process_chunk() used to build up over many chunks.
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
    # HTTP-level rejection with no code the frontend can act on, which would
    # make the 4401 check below silently pointless.
    await websocket.accept()

    agent_id = await authenticate_ws(token, meeting_id)
    if not agent_id:
        await websocket.close(code=4401, reason="Unauthorized")
        return

    logger.info(f"Live transcription session started for meeting={meeting_id}")

    # One Redis connection, reused for every incremental segment write during
    # this session — opening a fresh connection per segment (as an earlier
    # version of this did) adds needless overhead on longer calls with many
    # final segments.
    redis_client = aioredis.from_url(REDIS_URL)
    heartbeat_task = None  # declared here so exception handlers can safely cancel it too

    # Every FINAL segment Deepgram sends us, in arrival order — this list
    # becomes the meeting's full transcript once the session ends.
    final_segments: list[dict] = []
    ended_deliberately = False

    try:
        async with websockets.connect(
            DEEPGRAM_URL,
            additional_headers={"Authorization": f"Token {DEEPGRAM_API_KEY}"}
        ) as deepgram_ws:

            async def browser_to_deepgram() -> bool:
                """
                Reads whatever the browser sends: raw PCM audio bytes get
                forwarded straight to Deepgram; a {"type": "end"} JSON
                message means the user deliberately clicked Stop.
                Returns True for a deliberate end, False for a dropped
                connection — the caller uses this to decide whether to
                finalize the meeting or just clean up quietly.
                """
                while True:
                    message = await websocket.receive()

                    if message["type"] == "websocket.disconnect":
                        return False  # connection dropped, not a deliberate end

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
                """
                Reads transcript events back from Deepgram, relays a
                simplified version to the browser for live captions, and
                keeps a running list of finalized segments for when we
                need to assemble the full transcript.
                """
                async for raw_message in deepgram_ws:
                    data = json.loads(raw_message)

                    if data.get("type") != "Results":
                        continue  # ignore Metadata/UtteranceEnd/etc. for now

                    alt = data.get("channel", {}).get("alternatives", [{}])[0]
                    text = alt.get("transcript", "").strip()
                    if not text:
                        continue  # Deepgram sends empty results during silence

                    is_final = data.get("is_final", False)
                    words = alt.get("words", [])
                    # Diarization is per-word; we label the whole segment
                    # with whichever speaker started it. Good enough for
                    # live captions — fine-grained per-word speaker changes
                    # are rare mid-sentence in a two-person sales call.
                    speaker = words[0].get("speaker", 0) if words else 0

                    await websocket.send_json({
                        "type": "transcript",
                        "speaker": speaker,
                        "text": text,
                        "is_final": is_final,
                    })

                    if is_final:
                        final_segments.append({"speaker": speaker, "text": text})
                        # Persist incrementally, not just at the end — if the
                        # connection drops mid-call (wifi cut, tab crash), we
                        # still have everything transcribed up to that point
                        # sitting safely in Redis instead of only in memory.
                        try:
                            await redis_client.rpush(
                                f"meeting:{meeting_id}:live_segments",
                                json.dumps({"speaker": speaker, "text": text})
                            )
                        except Exception as e:
                            logger.error(f"Failed to persist live segment for meeting={meeting_id}: {e}")

            async def heartbeat_loop():
                """
                Refreshes a short-lived "I'm still alive" key on a fixed
                timer, independent of whether anyone is actually speaking.
                Without this running on its own timer, a long silence in
                the conversation (e.g. someone put on hold) would let the
                heartbeat expire and the reconciler would wrongly treat a
                perfectly healthy session as abandoned.
                """
                while True:
                    try:
                        await redis_client.set(
                            f"meeting:{meeting_id}:live_heartbeat", "1", ex=HEARTBEAT_TTL_SECONDS
                        )
                    except Exception as e:
                        logger.error(f"Heartbeat refresh failed for meeting={meeting_id}: {e}")
                    await asyncio.sleep(HEARTBEAT_REFRESH_SECONDS)

            browser_task   = asyncio.create_task(browser_to_deepgram())
            deepgram_task  = asyncio.create_task(deepgram_to_browser())
            heartbeat_task = asyncio.create_task(heartbeat_loop())

            ended_deliberately = await browser_task

            # Tell Deepgram we're done sending audio, then give it a short
            # grace period to flush any final results for words spoken right
            # before Stop was clicked — without this, the last second or two
            # of speech could be lost since Deepgram batches slightly behind
            # real time.
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

    # Belt-and-suspenders: whichever path we took to get here (clean stop,
    # dropped connection, or an exception mid-session), make sure the
    # heartbeat task isn't left running in the background — an un-cancelled
    # heartbeat would keep refreshing the TTL key forever, permanently
    # hiding a genuinely dead session from the reconciler.
    if heartbeat_task and not heartbeat_task.done():
        heartbeat_task.cancel()

    if final_segments:
        # Finalize regardless of HOW the session ended. A dropped connection
        # (wifi cut, tab crash) still leaves everything transcribed up to
        # that point sitting in final_segments — throwing it away because
        # the user didn't click Stop cleanly would lose real, usable data
        # for no good reason. The coaching insights will simply reflect
        # whatever portion of the call was captured.
        logger.info(
            f"Finalizing meeting={meeting_id} "
            f"(ended_deliberately={ended_deliberately}, segments={len(final_segments)})"
        )
        await finalize_meeting(meeting_id, final_segments)

        # The transcript now lives safely in Postgres — the incremental
        # backup copy in Redis (and its heartbeat) has served its purpose
        # and can be cleared, rather than left behind indefinitely for
        # every meeting ever recorded.
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