import asyncio, os, json, httpx, boto3
import redis.asyncio as aioredis
from datetime import datetime
from sqlalchemy import select

from db import init_db, AsyncSessionLocal, Meeting

REDIS_URL     = os.getenv("REDIS_URL", "redis://redis:6379")
OLLAMA_URL    = os.getenv("OLLAMA_URL", "http://ollama:11434")
OLLAMA_MODEL  = os.getenv("OLLAMA_MODEL", "phi3:mini")
SQS_QUEUE_URL = os.getenv("SQS_QUEUE_URL", "")
AWS_REGION    = os.getenv("AWS_DEFAULT_REGION", "us-east-1")

SYSTEM_PROMPT = """
You are an expert sales intelligence analyst. Given a meeting transcript,
extract structured insights to help a sales agent understand their client
and close deals. Respond ONLY with valid JSON, no explanation, no markdown.
"""

USER_PROMPT = """
Analyze this sales meeting transcript and return a JSON object with exactly
these fields:

{
  "summary": "2-3 sentence overview of the meeting",
  "action_items": [
    {"owner": "agent|client", "task": "...", "deadline": "...or null"}
  ],
  "client_pain_points": ["..."],
  "objections_raised": [
    {"objection": "...", "how_handled": "...or null"}
  ],
  "buying_signals": ["..."],
  "deal_health": {
    "score": "hot|warm|cold",
    "reasoning": "...",
    "next_steps": ["..."]
  },
  "client_personality": {
    "communication_style": "...",
    "decision_making": "...",
    "key_motivators": ["..."]
  },
  "calendar_schedule": [
    {"event": "...", "suggested_date": "...or null", "participants": ["..."]}
  ],
  "intelligence_insights": ["..."]
}

TRANSCRIPT:
{transcript}
"""


async def analyze(transcript: str) -> dict:
    prompt = USER_PROMPT.replace("{transcript}", transcript)
    async with httpx.AsyncClient(timeout=300) as client:
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
    return json.loads(response.json()["response"])


async def process_message(meeting_id: str):
    async with AsyncSessionLocal() as db:
        try:
            db_result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
            meeting = db_result.scalar_one_or_none()
            if not meeting:
                print(f"Meeting {meeting_id} not found in DB")
                return

            print(f"Analyzing meeting {meeting_id}...")
            insights = await analyze(meeting.transcript)

            meeting.insights = insights
            meeting.status = "done"
            meeting.completed_at = datetime.utcnow()
            await db.commit()

            r = aioredis.from_url(REDIS_URL)
            await r.hset(f"meeting:{meeting_id}", mapping={
                "status": "done",
                "insights": json.dumps(insights)
            })
            await r.aclose()

            print(f"Meeting {meeting_id} saved successfully")

        except Exception as e:
            print(f"Failed to process {meeting_id}: {e}")
            async with AsyncSessionLocal() as db2:
                db_result2 = await db2.execute(select(Meeting).where(Meeting.id == meeting_id))
                m = db_result2.scalar_one_or_none()
                if m:
                    m.status = "failed"
                    await db2.commit()


async def run():
    await init_db()
    sqs = boto3.client("sqs", region_name=AWS_REGION)
    print("Worker started - polling SQS for jobs...")

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
                meeting_id = message["Body"]
                receipt_handle = message["ReceiptHandle"]
                print(f"Received job: {meeting_id}")

                await process_message(meeting_id)

                # Delete from SQS only after successful processing
                sqs.delete_message(
                    QueueUrl=SQS_QUEUE_URL,
                    ReceiptHandle=receipt_handle
                )
                print(f"Job {meeting_id} deleted from queue")

        except Exception as e:
            print(f"Worker error: {e}, retrying in 5s...")
            await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(run())