import asyncio
import os
import json
import httpx
import boto3
import redis.asyncio as aioredis
from datetime import datetime, timedelta
from sqlalchemy import select
from botocore.config import Config
from db import init_db, AsyncSessionLocal, Meeting, Agent
from db_coaching import CoachingPlan, WinningPattern
from mailer import (
    send_meeting_ready_email, send_coaching_plan_email,
    send_renewal_receipt_email, send_payment_failed_email, send_access_expired_email,
)
from coaching_agent import run_gap_analysis, run_winning_pattern_extraction, get_winning_patterns_block
from db_billing import Subscription
from billing_routes import PLANS
import paystack_client
import uuid
from db_context import CompanyContext
from embeddings import similarity_search
from reconciler import reconciler_loop

REDIS_URL       = os.getenv("REDIS_URL",       "redis://redis:6379")
OLLAMA_URL      = os.getenv("OLLAMA_URL",      "https://ollama.com")
OLLAMA_API_KEY  = os.getenv("OLLAMA_API_KEY",  "")
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL",    "gpt-oss:20b-cloud")
PASS1_MODEL     = os.getenv("PASS1_MODEL",     "gpt-oss:20b-cloud")
SQS_QUEUE_URL   = os.getenv("SQS_QUEUE_URL",   "")
AWS_REGION      = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
WHISPER_URL     = os.getenv("WHISPER_URL",     "http://whisper:8000")
DIARIZATION_URL = os.getenv("DIARIZATION_URL", "http://diarization:8002")
S3_BUCKET       = os.getenv("S3_BUCKET",       "")

OLLAMA_HEADERS = {"Authorization": f"Bearer {OLLAMA_API_KEY}"} if OLLAMA_API_KEY else {}

PROMPT_CACHE_KEY = "osf:prompt_cache:system_v1"
PROMPT_CACHE_TTL = 60 * 60 * 24

SYSTEM_PROMPT = """You are an elite private sales performance coach AND a senior sales \
intelligence analyst. Given a sales call transcript, you extract exact behavioral metrics, \
structured meeting intelligence, and hyper-tactical coaching feedback to help a sales agent \
close more deals. You evaluate based on core sales psychology principles: active listening, \
open-ended discovery, objection handling, and clear closing and next steps.
Respond ONLY with valid JSON. No explanation, no markdown, no text outside the JSON object."""

PASS1_PROMPT = """Extract from this sales call transcript:
1. All objections the client raised (exact phrases)
2. Any competitors mentioned
3. Key topics discussed (pricing, features, timeline, budget)

Respond ONLY with valid JSON:
{
  "objections": ["<string>"],
  "competitors": ["<string>"],
  "topics": ["<string>"]
}

TRANSCRIPT:
{transcript_sample}
"""

USER_PROMPT = """Analyze this sales call transcript and return a single JSON object \
with exactly these fields:

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


async def get_cached_system_prompt() -> str:
    try:
        async with aioredis.from_url(REDIS_URL) as r:
            cached = await r.get(PROMPT_CACHE_KEY)
            if cached:
                return cached.decode() if isinstance(cached, bytes) else cached
            await r.set(PROMPT_CACHE_KEY, SYSTEM_PROMPT, ex=PROMPT_CACHE_TTL)
    except Exception as e:
        print(f"Prompt cache error (non-fatal): {e}")
    return SYSTEM_PROMPT


async def extract_keywords(transcript: str) -> dict:
    sample = transcript[:2000]
    prompt = PASS1_PROMPT.replace("{transcript_sample}", sample)
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                headers=OLLAMA_HEADERS,
                json={
                    "model": PASS1_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                }
            )
        response.raise_for_status()
        body = response.text.strip()
        line = body.splitlines()[0]
        outer = json.loads(line)
        raw = outer.get("response", "{}")
        return json.loads(raw)
    except Exception as e:
        print(f"Pass 1 keyword extraction failed (non-fatal): {e}")
        return {"objections": [], "competitors": [], "topics": []}


def build_rag_query(keywords: dict) -> str:
    parts = []
    if keywords.get("objections"):
        parts.append("Objections: " + ", ".join(keywords["objections"][:5]))
    if keywords.get("competitors"):
        parts.append("Competitors: " + ", ".join(keywords["competitors"][:3]))
    if keywords.get("topics"):
        parts.append("Topics: " + ", ".join(keywords["topics"][:5]))
    return "\n".join(parts) if parts else ""


async def resolve_context_scope(agent_id: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Agent).where(Agent.id == agent_id))
        agent = result.scalar_one_or_none()

    if agent and agent.org_id:
        return agent.org_id, (CompanyContext.org_id == agent.org_id)
    return agent_id, ((CompanyContext.agent_id == agent_id) & (CompanyContext.org_id.is_(None)))


async def get_agent_context_rag(agent_id: str, rag_query: str) -> str:
    owner_id, scope_filter = await resolve_context_scope(agent_id)
    base_context = await _get_agent_context_rag_base(owner_id, scope_filter, rag_query)

    try:
        async with AsyncSessionLocal() as db:
            winning_block = await get_winning_patterns_block(owner_id, db)
    except Exception as e:
        print(f"Winning patterns fetch failed (non-fatal) for owner={owner_id}: {e}")
        winning_block = ""

    return base_context + winning_block


async def _get_agent_context_rag_base(owner_id: str, scope_filter, rag_query: str) -> str:
    if rag_query:
        try:
            async with AsyncSessionLocal() as db:
                chunks = await similarity_search(owner_id, rag_query, db)
            if chunks:
                context = "\n\n".join(chunks)
                print(f"RAG retrieved {len(chunks)} chunks ({len(context)} chars) for owner {owner_id}")
                return context
        except Exception as e:
            print(f"pgvector search failed for owner {owner_id}: {e}")

    try:
        async with aioredis.from_url(REDIS_URL) as r:
            cached = await r.get(f"agent_context:{owner_id}")
            if cached:
                text = cached.decode() if isinstance(cached, bytes) else cached
                print(f"Fallback: using full Redis context ({len(text)} chars) for owner {owner_id}")
                return text
    except Exception as e:
        print(f"Redis context fallback failed for owner {owner_id}: {e}")

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(CompanyContext)
                .where(scope_filter)
                .where(CompanyContext.is_active == True)
            )
            context = result.scalar_one_or_none()
            if context:
                print(f"Fallback: using Postgres context ({len(context.extracted_text)} chars) for owner {owner_id}")
                return context.extracted_text
    except Exception as e:
        print(f"Postgres context fallback failed for owner {owner_id}: {e}")

    return ""


def build_prompt(transcript: str, company_context: str) -> str:
    context_block = COMPANY_CONTEXT_TEMPLATE.format(company_context=company_context) if company_context.strip() else ""
    return USER_PROMPT.replace("{company_context_block}", context_block).replace("{transcript}", transcript)


async def analyze(transcript: str, company_context: str, system_prompt: str) -> dict:
    if not transcript or not transcript.strip():
        raise ValueError("Transcript is empty - cannot generate insights")

    prompt = build_prompt(transcript, company_context)

    async with httpx.AsyncClient(timeout=1500) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            headers=OLLAMA_HEADERS,
            json={
                "model": OLLAMA_MODEL,
                "system": system_prompt,
                "prompt": prompt,
                "stream": False,
                "format": "json",
            }
        )
    response.raise_for_status()

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


def merge_transcript_diarization(transcript_segments, diarization_segments):
    if not diarization_segments:
        return " ".join(s.get("text", "") for s in transcript_segments)
    lines = []
    for t_seg in transcript_segments:
        t_start = t_seg.get("start", 0)
        t_end = t_seg.get("end", 0)
        t_text = t_seg.get("text", "").strip()
        best_role = "Unknown"
        best_overlap = 0
        for d_seg in diarization_segments:
            overlap = min(t_end, d_seg["end"]) - max(t_start, d_seg["start"])
            if overlap > best_overlap:
                best_overlap = overlap
                best_role = d_seg.get("role", "Unknown")
        timestamp = f"{int(t_start//60):02d}:{int(t_start%60):02d}"
        lines.append(f"[{best_role} {timestamp}]: {t_text}")
    return "\n".join(lines)


async def process_chunk(message: dict, sqs_client):
    meeting_id = message["meeting_id"]
    s3_key = message["s3_key"]
    chunk_index = int(message["chunk_index"])

    print(f"Processing chunk {chunk_index} for meeting {meeting_id}")

    s3 = boto3.client(
        "s3",
        region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-1"),
        config=Config(signature_version="s3v4")
    )
    s3_obj = await asyncio.to_thread(s3.get_object, Bucket=S3_BUCKET, Key=s3_key)
    audio_bytes = s3_obj["Body"].read()
    filename = s3_key.split("/")[-1]
    content_type = "audio/webm" if filename.endswith(".webm") else "audio/ogg"

    async with httpx.AsyncClient(timeout=300) as client:
        transcribe_task = client.post(
            f"{WHISPER_URL}/transcribe",
            files={"file": (filename, audio_bytes, content_type)},
            data={"language": "en", "word_timestamps": "true"}
        )
        diarize_task = client.post(
            f"{DIARIZATION_URL}/diarize",
            files={"file": (filename, audio_bytes, content_type)}
        )
        transcribe_resp, diarize_resp = await asyncio.gather(transcribe_task, diarize_task, return_exceptions=True)

    if isinstance(transcribe_resp, Exception):
        raise RuntimeError(f"Transcription failed for chunk {chunk_index}: {transcribe_resp}")

    transcribe_resp.raise_for_status()
    transcript_data = transcribe_resp.json()

    diarization_segments = []
    if not isinstance(diarize_resp, Exception):
        try:
            diarize_resp.raise_for_status()
            diarization_segments = diarize_resp.json().get("segments", [])
        except Exception:
            pass

    diarized_text = merge_transcript_diarization(transcript_data.get("segments", []), diarization_segments)

    async with aioredis.from_url(REDIS_URL) as r:
        await r.hset(f"meeting:{meeting_id}:chunks", str(chunk_index), diarized_text)
        meeting_meta = await r.hgetall(f"meeting:{meeting_id}")
        ended = meeting_meta.get(b"ended", b"0") == b"1"
        total_chunks = int(meeting_meta.get(b"total_chunks", b"0"))
        done_count = await r.hlen(f"meeting:{meeting_id}:chunks")

        print(f"Chunk {chunk_index} transcribed ({len(diarized_text)} chars) | done={done_count}/{total_chunks} ended={ended}")

        if ended and total_chunks > 0 and done_count >= total_chunks:
            chunk_map = await r.hgetall(f"meeting:{meeting_id}:chunks")
            ordered_texts = [
                chunk_map[k].decode() if isinstance(chunk_map[k], bytes) else chunk_map[k]
                for k in sorted(chunk_map.keys(), key=lambda x: int(x))
            ]
            full_transcript = "\n".join(ordered_texts).strip()

            async with AsyncSessionLocal() as db:
                db_result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
                meeting = db_result.scalar_one_or_none()
                if meeting:
                    meeting.transcript = full_transcript
                    await db.commit()

            print(f"All {total_chunks} chunks assembled ({len(full_transcript)} chars) — queuing analysis")

            await asyncio.to_thread(
                sqs_client.send_message,
                QueueUrl=SQS_QUEUE_URL,
                MessageBody=json.dumps({"type": "analyze", "meeting_id": meeting_id})
            )


async def process_message_analysis(meeting_id: str):
    async with AsyncSessionLocal() as db:
        db_result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
        meeting = db_result.scalar_one_or_none()
        if not meeting:
            print(f"Meeting {meeting_id} not found in DB")
            return
        transcript = meeting.transcript
        agent_id = meeting.user_id

    if not transcript or not transcript.strip():
        raise ValueError("Transcript is empty - cannot generate insights")

    system_prompt = await get_cached_system_prompt()

    print(f"Pass 1: extracting keywords for meeting {meeting_id}...")
    keywords = await extract_keywords(transcript)
    rag_query = build_rag_query(keywords)
    print(f"Pass 1 complete — objections: {keywords.get('objections', [])}, topics: {keywords.get('topics', [])}")

    company_context = await get_agent_context_rag(agent_id, rag_query)

    print(f"Pass 2: analyzing meeting {meeting_id}...")
    insights = await analyze(transcript, company_context, system_prompt)

    async with AsyncSessionLocal() as db:
        db_result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
        meeting = db_result.scalar_one_or_none()
        if not meeting:
            return
        meeting.insights = insights
        meeting.status = "done"
        meeting.completed_at = datetime.utcnow()
        await db.commit()

    async with aioredis.from_url(REDIS_URL) as r:
        await r.hset(f"meeting:{meeting_id}", mapping={
            "status": "done",
            "insights": json.dumps(insights.get("meeting_intelligence", {})),
            "coaching": json.dumps(insights.get("coaching", {})),
        })

    try:
        async with AsyncSessionLocal() as db:
            agent_result = await db.execute(select(Agent).where(Agent.id == agent_id))
            owner = agent_result.scalar_one_or_none()
        if owner:
            summary = insights.get("meeting_intelligence", {}).get("summary")
            await asyncio.to_thread(send_meeting_ready_email, owner.email, owner.name, meeting_id, summary)
    except Exception as e:
        print(f"Meeting-ready email failed (non-fatal) for meeting={meeting_id}: {e}")

    print(f"Meeting {meeting_id} completed successfully")


DAILY_COACHING_INTERVAL_SECONDS = 24 * 60 * 60


async def daily_coaching_loop():
    while True:
        await asyncio.sleep(DAILY_COACHING_INTERVAL_SECONDS)
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Agent).where(Agent.is_active == True))
                agents = result.scalars().all()

            print(f"Daily coaching run starting for {len(agents)} agents")

            for agent in agents:
                try:
                    plan = await run_gap_analysis(agent.id)
                    if plan:
                        async with AsyncSessionLocal() as db:
                            db.add(CoachingPlan(id=str(uuid.uuid4()), **plan))
                            await db.commit()
                        await asyncio.to_thread(
                            send_coaching_plan_email, agent.email, agent.name, plan["plan_text"]
                        )

                    patterns = await run_winning_pattern_extraction(agent.id)
                    if patterns:
                        async with AsyncSessionLocal() as db:
                            for p in patterns:
                                db.add(WinningPattern(id=str(uuid.uuid4()), **p))
                            await db.commit()
                except Exception as e:
                    print(f"Daily coaching run failed for agent={agent.id} (non-fatal): {e}")

            print("Daily coaching run complete")
        except Exception as e:
            print(f"Daily coaching loop error: {e}")


BILLING_CHECK_INTERVAL_SECONDS = 60 * 60
PAST_DUE_GRACE_DAYS = 3


async def billing_loop():
    """
    Runs hourly. Finds every subscription whose current_period_end has
    passed and attempts to charge the saved card for the next period.

    CHANGED: renewal charges now pass currency=sub.currency —
    Paystack authorizations are tied to the currency they were created
    in, so a subscription created in USD must be re-charged in USD,
    never assumed to be NGN.
    """
    while True:
        await asyncio.sleep(BILLING_CHECK_INTERVAL_SECONDS)
        try:
            now = datetime.utcnow()
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Subscription)
                    .where(Subscription.status.in_(["trialing", "active", "past_due"]))
                    .where(Subscription.current_period_end <= now)
                )
                due = result.scalars().all()

            if due:
                print(f"Billing run: {len(due)} subscription(s) due for renewal")

            for sub in due:
                await _process_renewal(sub.id)
        except Exception as e:
            print(f"Billing loop error: {e}")


async def _process_renewal(subscription_id: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Subscription).where(Subscription.id == subscription_id))
        sub = result.scalar_one_or_none()
        if not sub:
            return

        if sub.owner_type == "individual":
            agent_result = await db.execute(select(Agent).where(Agent.id == sub.owner_id))
        else:
            agent_result = await db.execute(
                select(Agent).where(Agent.org_id == sub.owner_id).where(Agent.role == "admin").limit(1)
            )
        agent = agent_result.scalars().first()
        if not agent or not sub.paystack_authorization_code:
            print(f"Cannot renew subscription={subscription_id}: missing agent or saved card")
            return

        currency = sub.currency or "NGN"
        reference = f"renewal-{uuid.uuid4().hex[:16]}"
        try:
            result = await paystack_client.charge_authorization(
                email=agent.email,
                amount=sub.amount,
                currency=currency,
                authorization_code=sub.paystack_authorization_code,
                reference=reference,
            )
            charge_status = result.get("data", {}).get("status")
        except Exception as e:
            print(f"Renewal charge failed for subscription={subscription_id}: {e}")
            charge_status = "failed"

        if charge_status == "success":
            sub.status = "active"
            sub.current_period_end = datetime.utcnow() + timedelta(days=sub.interval_days)
            sub.last_charge_reference = reference
            await db.commit()
            print(f"Renewed subscription={subscription_id} ({currency}), next charge in {sub.interval_days} days")

            plan_label = PLANS.get(sub.plan, {}).get("label", sub.plan)
            await asyncio.to_thread(
                send_renewal_receipt_email, agent.email, agent.name, plan_label,
                sub.amount, currency, sub.current_period_end.strftime("%B %d, %Y")
            )
        else:
            grace_deadline = (sub.trial_ends_at or sub.current_period_end) + timedelta(days=PAST_DUE_GRACE_DAYS) \
                if sub.status == "active" else datetime.utcnow() + timedelta(days=PAST_DUE_GRACE_DAYS)
            was_already_past_due = sub.status == "past_due"

            if was_already_past_due and datetime.utcnow() > grace_deadline:
                sub.status = "expired"
            else:
                sub.status = "past_due"
            await db.commit()
            print(f"Renewal charge failed for subscription={subscription_id}, status={sub.status}")

            if sub.status == "expired":
                await asyncio.to_thread(send_access_expired_email, agent.email, agent.name)
            else:
                days_left = max(0, (grace_deadline - datetime.utcnow()).days)
                await asyncio.to_thread(send_payment_failed_email, agent.email, agent.name, days_left)


async def run():
    await init_db()
    sqs = await asyncio.to_thread(boto3.client, "sqs", region_name=AWS_REGION)
    print("Worker started - polling SQS for jobs...")
    print(f"PID: {os.getpid()}")
    print(f"SQS_QUEUE_URL: {SQS_QUEUE_URL}")

    asyncio.create_task(reconciler_loop(REDIS_URL))
    asyncio.create_task(daily_coaching_loop())
    asyncio.create_task(billing_loop())

    while True:
        try:
            response = await asyncio.to_thread(
                sqs.receive_message,
                QueueUrl=SQS_QUEUE_URL,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=20,
                AttributeNames=['ApproximateReceiveCount']
            )

            messages = response.get("Messages", [])
            if not messages:
                continue

            for message in messages:
                body = message["Body"]
                receipt = message["ReceiptHandle"]

                print(f"Raw message body: {body[:200]}")

                try:
                    payload = json.loads(body)
                    msg_type = payload.get("type", "analyze")
                except (json.JSONDecodeError, AttributeError):
                    payload = {"type": "analyze", "meeting_id": body}
                    msg_type = "analyze"

                meeting_id = payload.get("meeting_id", body)
                print(f"Received {msg_type} job: {meeting_id}")

                try:
                    if msg_type == "chunk":
                        await process_chunk(payload, sqs)
                    else:
                        print(f"Starting process_message for {meeting_id}")
                        await process_message_analysis(meeting_id)
                        print(f"process_message completed for {meeting_id}")

                    await asyncio.to_thread(sqs.delete_message, QueueUrl=SQS_QUEUE_URL, ReceiptHandle=receipt)
                    print(f"Job {meeting_id} ({msg_type}) deleted from queue")

                except Exception as e:
                    import traceback
                    print(f"EXCEPTION in {msg_type} job {meeting_id}:")
                    print(traceback.format_exc())

                    receive_count = int(message.get("Attributes", {}).get("ApproximateReceiveCount", "1"))
                    max_attempts = 3

                    if receive_count >= max_attempts:
                        try:
                            async with AsyncSessionLocal() as db:
                                db_result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
                                m = db_result.scalar_one_or_none()
                                if m:
                                    m.status = "failed"
                                    await db.commit()
                        except Exception:
                            pass
                        await asyncio.to_thread(sqs.delete_message, QueueUrl=SQS_QUEUE_URL, ReceiptHandle=receipt)
                        print(f"Job {meeting_id} ({msg_type}) failed permanently after {receive_count} attempts")
                    else:
                        print(f"Job {meeting_id} ({msg_type}) failed (attempt {receive_count}/{max_attempts}) — leaving in queue for retry")
        except Exception as e:
            print(f"Worker error: {e}, retrying in 5s...")
            await asyncio.sleep(5)

if __name__ == "__main__":
    import sys
    import signal

    def handle_signal(signum, frame):
        print(f"Worker received signal {signum} — exiting")
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    print("Starting worker process...")
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        print("Worker stopped by keyboard interrupt")
    except SystemExit as e:
        print(f"Worker SystemExit: {e.code}")
        sys.exit(e.code)
    except Exception as e:
        import traceback
        print("FATAL worker crash:")
        print(traceback.format_exc())
        sys.exit(1)
    finally:
        print("Worker process exiting")
