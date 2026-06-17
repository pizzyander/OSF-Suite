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
    raw = response.json()["response"]

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Strip any accidental markdown fences if model misbehaves
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(clean)


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

            # Save full merged result
            meeting.insights = insights
            meeting.status = "done"
            meeting.completed_at = datetime.utcnow()
            await db.commit()

            # Cache both sections separately in Redis for fast UI access
            r = aioredis.from_url(REDIS_URL)
            await r.hset(f"meeting:{meeting_id}", mapping={
                "status": "done",
                "insights": json.dumps(insights.get("meeting_intelligence", {})),
                "coaching": json.dumps(insights.get("coaching", {})),
            })
            await r.aclose()

            print(f"Meeting {meeting_id} completed successfully")

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