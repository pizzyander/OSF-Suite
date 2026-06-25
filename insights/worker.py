import asyncio, os, json, httpx, boto3
import redis.asyncio as aioredis
from datetime import datetime
from sqlalchemy import select

from db import init_db, AsyncSessionLocal, Meeting
from db_context import CompanyContext

REDIS_URL     = os.getenv("REDIS_URL", "redis://redis:6379")
OLLAMA_URL    = os.getenv("OLLAMA_URL", "http://ollama:11434")
OLLAMA_MODEL  = os.getenv("OLLAMA_MODEL", "phi3:mini")
SQS_QUEUE_URL = os.getenv("SQS_QUEUE_URL", "")
AWS_REGION    = os.getenv("AWS_DEFAULT_REGION", "us-east-1")

SYSTEM_PROMPT = """
You are an elite private sales performance coach AND a senior sales intelligence analyst.
Given a sales call transcript, you extract exact behavioral metrics, structured meeting
intelligence, and hyper-tactical coaching feedback to help a sales agent close more deals.
You evaluate based on core sales psychology principles: active listening, open-ended
discovery, objection handling, and clear closing and next steps.
Respond ONLY with valid JSON. No explanation, no markdown, no text outside the JSON object.
"""

USER_PROMPT = """
Analyze this sales call transcript and return a single JSON object with exactly these fields:

{
  "meeting_intelligence": {
    "summary": "<2-3 sentence overview of the meeting>",
    "action_items": [
      {"owner": "agent|client", "task": "<string>", "deadline": "<string or null>"}
    ],
    "client_pain_points": ["<string>"],
    "objections_raised": [
      {"objection": "<string>", "how_handled": "<string or null>"}
    ],
    "buying_signals": ["<string>"],
    "deal_health": {
      "score": "hot|warm|cold",
      "reasoning": "<string>",
      "next_steps": ["<string>"]
    },
    "client_personality": {
      "communication_style": "<string>",
      "decision_making": "<string>",
      "key_motivators": ["<string>"]
    },
    "calendar_schedule": [
      {"event": "<string>", "suggested_date": "<string or null>", "participants": ["<string>"]}
    ],
    "intelligence_insights": ["<string>"]
  },
  "coaching": {
    "metrics": {
      "agent_talk_ratio_percentage": <integer 0-100>,
      "client_talk_ratio_percentage": <integer 0-100>,
      "open_ended_questions_count": <integer>,
      "closed_questions_count": <integer>
    },
    "overall_grade": {
      "score_out_of_100": <integer>,
      "headline_summary": "<punchy 1-sentence summary of agent performance>"
    },
    "objections_handled": [
      {
        "client_objection": "<string>",
        "agent_response": "<string>",
        "effectiveness_score_out_of_10": <integer>,
        "coaching_critique": "<2 sentences max>",
        "exact_alternative_script": "<word-for-word what agent should say next time>"
      }
    ],
    "missed_revenue_cues": [
      {
        "timestamp_or_context": "<string>",
        "client_buying_signal": "<string>",
        "agent_missed_action": "<string>"
      }
    ],
    "top_three_action_items": [
      "<actionable step 1>",
      "<actionable step 2>",
      "<actionable step 3>"
    ]
  }
}

{company_context_block}

TRANSCRIPT:
{transcript}
"""

COMPANY_CONTEXT_TEMPLATE = """
COMPANY CONTEXT (use this to evaluate the agent's knowledge, pricing accuracy, and alignment
with company policy — flag any deviations in your coaching feedback):
---------------------------------------------------------------------------
{company_context}
---------------------------------------------------------------------------
"""


async def get_agent_context(agent_id: str) -> str:
    """
    Fetch the agent's company context. Tries Redis first (fast path),
    falls back to Postgres if cache miss (e.g. Redis was restarted).
    Returns empty string if the agent has no context uploaded.
    """
    # 1. Try Redis cache first
    try:
        r = aioredis.from_url(REDIS_URL)
        cached = await r.get(f"agent_context:{agent_id}")
        await r.aclose()
        if cached:
            return cached.decode("utf-8") if isinstance(cached, bytes) else cached
    except Exception as e:
        print(f"Redis cache miss for agent {agent_id}: {e}")

    # 2. Fall back to Postgres
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(CompanyContext)
                .where(CompanyContext.agent_id == agent_id)
                .where(CompanyContext.is_active == True)
            )
            context = result.scalar_one_or_none()
            if context:
                # Backfill Redis cache while we're here
                try:
                    r = aioredis.from_url(REDIS_URL)
                    await r.set(
                        f"agent_context:{agent_id}",
                        context.extracted_text,
                        ex=60 * 60 * 24 * 7
                    )
                    await r.aclose()
                except Exception:
                    pass
                return context.extracted_text
    except Exception as e:
        print(f"Postgres context lookup failed for agent {agent_id}: {e}")

    return ""


def build_prompt(transcript: str, company_context: str) -> str:
    """Inject company context into the prompt only when it exists."""
    if company_context.strip():
        context_block = COMPANY_CONTEXT_TEMPLATE.format(company_context=company_context)
    else:
        context_block = ""  # no context uploaded — prompt works fine without it

    return USER_PROMPT.replace("{company_context_block}", context_block) \
                      .replace("{transcript}", transcript)


async def analyze(transcript: str, company_context: str) -> dict:
    if not transcript or not transcript.strip():
        raise ValueError("Transcript is empty - cannot generate insights")

    prompt = build_prompt(transcript, company_context)

    async with httpx.AsyncClient(timeout=1500) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "system": SYSTEM_PROMPT,
                "prompt": prompt,
                "stream": False,
                "format": "json"
            }
        )
    response.raise_for_status()

    # Ollama 0.1.44 can return multiple newline-delimited JSON objects
    # even when stream=False. Take only the first non-empty line.
    body_text = response.text.strip()
    first_line = body_text.splitlines()[0]
    outer = json.loads(first_line)
    raw = outer["response"]

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        try:
            return json.loads(clean)
        except json.JSONDecodeError as e:
            raise ValueError(f"Model returned invalid JSON (len={len(raw)}): {raw[:500]!r}") from e

async def process_message(meeting_id: str):
    # Session 1: read only — get transcript and agent_id, then close
    async with AsyncSessionLocal() as db:
        db_result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
        meeting = db_result.scalar_one_or_none()
        if not meeting:
            print(f"Meeting {meeting_id} not found in DB")
            return
        transcript = meeting.transcript
        agent_id   = meeting.user_id

    if not transcript or not transcript.strip():
        raise ValueError("Transcript is empty - cannot generate insights")

    # Fetch context (its own sessions internally)
    company_context = await get_agent_context(agent_id)
    if company_context:
        print(f"Using company context for agent {agent_id} ({len(company_context)} chars)")
    else:
        print(f"No company context for agent {agent_id} — proceeding without it")

    # Ollama call — can take minutes, no DB session held open
    print(f"Analyzing meeting {meeting_id}...")
    insights = await analyze(transcript, company_context)

    # Session 2: write results
    async with AsyncSessionLocal() as db:
        db_result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
        meeting = db_result.scalar_one_or_none()
        if not meeting:
            return
        meeting.insights     = insights
        meeting.status       = "done"
        meeting.completed_at = datetime.utcnow()
        await db.commit()

    r = aioredis.from_url(REDIS_URL)
    await r.hset(f"meeting:{meeting_id}", mapping={
        "status":   "done",
        "insights": json.dumps(insights.get("meeting_intelligence", {})),
        "coaching": json.dumps(insights.get("coaching", {})),
    })
    await r.aclose()

    print(f"Meeting {meeting_id} completed successfully")

async def process_chunk(message: dict):
    meeting_id  = message["meeting_id"]
    s3_key      = message["s3_key"]
    chunk_index = message["chunk_index"]

    # Pull audio from S3
    s3 = boto3.client("sqs", region_name=AWS_REGION)  
    s3 = boto3.client("s3", region_name=AWS_REGION)
    s3_obj = s3.get_object(Bucket=os.getenv("S3_BUCKET", ""), Key=s3_key)
    audio_bytes = s3_obj["Body"].read()
    filename = s3_key.split("/")[-1]

    # Transcribe
    async with httpx.AsyncClient(timeout=300) as client:
        transcribe_task = client.post(
            f"{WHISPER_URL}/transcribe",
            files={"file": (filename, audio_bytes, "audio/ogg")},
            data={"language": "en", "word_timestamps": "true"}
        )
        diarize_task = client.post(
            f"{DIARIZATION_URL}/diarize",
            files={"file": (filename, audio_bytes, "audio/ogg")}
        )
        transcribe_resp, diarize_resp = await asyncio.gather(
            transcribe_task, diarize_task, return_exceptions=True
        )

    if isinstance(transcribe_resp, Exception):
        raise RuntimeError(f"Transcription failed: {transcribe_resp}")

    transcribe_resp.raise_for_status()
    transcript_data = transcribe_resp.json()

    diarization_segments = []
    if not isinstance(diarize_resp, Exception):
        try:
            diarize_resp.raise_for_status()
            diarization_segments = diarize_resp.json().get("segments", [])
        except Exception:
            pass

    from main import merge_transcript_diarization  # or inline the function
    diarized_text = merge_transcript_diarization(
        transcript_data.get("segments", []),
        diarization_segments
    )

    # Store this chunk's text keyed by index — preserves order regardless of
    # which chunk the worker picks up first
    r = aioredis.from_url(REDIS_URL)
    await r.hset(f"meeting:{meeting_id}:chunks", str(chunk_index), diarized_text)

    # Check if meeting has ended AND all expected chunks are now transcribed
    meeting_meta  = await r.hgetall(f"meeting:{meeting_id}")
    ended         = meeting_meta.get(b"ended", b"0") == b"1"
    total_chunks  = int(meeting_meta.get(b"chunks", b"0"))
    done_count    = await r.hlen(f"meeting:{meeting_id}:chunks")
    await r.aclose()

    if ended and done_count >= total_chunks:
        # All chunks transcribed — assemble in order and push to LLM analysis
        r = aioredis.from_url(REDIS_URL)
        chunk_map = await r.hgetall(f"meeting:{meeting_id}:chunks")
        await r.aclose()

        ordered_texts = [
            chunk_map[k].decode()
            for k in sorted(chunk_map.keys(), key=lambda x: int(x))
        ]
        full_transcript = "\n".join(ordered_texts).strip()

        async with AsyncSessionLocal() as db:
            db_result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
            meeting = db_result.scalar_one_or_none()
            if meeting:
                meeting.transcript = full_transcript
                await db.commit()

        sqs = boto3.client("sqs", region_name=AWS_REGION)
        sqs.send_message(
            QueueUrl=SQS_QUEUE_URL,
            MessageBody=json.dumps({"type": "analyze", "meeting_id": meeting_id})
        )
        print(f"All {total_chunks} chunks done for {meeting_id} — queued for analysis")


async def run():
    await init_db()
    sqs = boto3.client("sqs", region_name=AWS_REGION)
    print("Worker started - polling SQS...")

    while True:
        try:
            response = sqs.receive_message(
                QueueUrl=SQS_QUEUE_URL,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=20
            )
            messages = response.get("Messages", [])
            if not messages:
                continue

            for message in messages:
                body = message["Body"]
                receipt = message["ReceiptHandle"]

                # Route by message type
                try:
                    payload = json.loads(body)
                    msg_type = payload.get("type", "analyze")
                except (json.JSONDecodeError, AttributeError):
                    # Legacy plain string = meeting_id for analyze
                    payload = {"type": "analyze", "meeting_id": body}
                    msg_type = "analyze"

                print(f"Received {msg_type} job: {payload.get('meeting_id')}")

                if msg_type == "chunk":
                    await process_chunk(payload)
                else:
                    await process_message(payload["meeting_id"])

                sqs.delete_message(QueueUrl=SQS_QUEUE_URL, ReceiptHandle=receipt)

        except Exception as e:
            print(f"Worker error: {e}, retrying in 5s...")
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(run())