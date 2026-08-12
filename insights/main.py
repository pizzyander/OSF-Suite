import os, uuid, json, httpx, boto3, asyncio
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer
from sqlalchemy import select, update, desc, text
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import redis.asyncio as aioredis
from botocore.config import Config
import logging
from org_routes import router as org_router
from onboarding_routes import router as onboarding_router
from manager_routes import router as manager_router
logger = logging.getLogger(__name__)

from db import init_db, get_session, Agent, Meeting
from auth import (
    get_current_agent, generate_api_key,
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token, create_email_verification_token
)
from verification_routes import router as verification_router
# At the top with other imports
from context_routes import router as context_router
from live_routes import router as live_router
from mailer import send_verification_email
from coaching_routes import router as coaching_router
from billing_routes import router as billing_router
from billing_guard import require_active_access
from db_billing import Subscription
from db_trial import TrialUsage, TRIAL_MEETING_CAP
from referral_routes import router as referral_router
from db_referrals import Referral

REDIS_URL       = os.getenv("REDIS_URL", "redis://redis:6379")
WHISPER_URL     = os.getenv("WHISPER_URL", "http://whisper:8000")
OLLAMA_URL      = os.getenv("OLLAMA_URL", "http://ollama:11434")
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL", "phi3:mini")
SQS_QUEUE_URL   = os.getenv("SQS_QUEUE_URL", "")
S3_BUCKET       = os.getenv("S3_BUCKET", "")
DIARIZATION_URL = os.getenv("DIARIZATION_URL", "http://diarization:8002")
ACCESS_EXPIRE  = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

def get_agent_id(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            return decode_token(auth.split(" ")[1])
        except:
            pass
    return get_remote_address(request)


def merge_transcript_diarization(transcript_segments, diarization_segments):
    if not diarization_segments:
        return " ".join(s.get("text", "") for s in transcript_segments)
    lines = []
    for t_seg in transcript_segments:
        t_start = t_seg.get("start", 0)
        t_end   = t_seg.get("end", 0)
        t_text  = t_seg.get("text", "").strip()
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


limiter = Limiter(key_func=get_agent_id)
app = FastAPI(title="OSF Insights Service", version="5.1.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(org_router)
app.include_router(context_router)
app.include_router(live_router)
app.include_router(onboarding_router)
app.include_router(manager_router)
app.include_router(verification_router)
app.include_router(coaching_router)
app.include_router(billing_router)
app.include_router(referral_router)

@app.on_event("startup")
async def startup():
    await init_db()


# -- Auth routes (public) -----------------------------------------------------

@app.post("/agents/register")
@limiter.limit("5/minute")
async def register(request: Request, payload: dict, db: AsyncSession = Depends(get_session)):
    name     = payload.get("name", "").strip()
    email    = payload.get("email", "").strip().lower()
    password = payload.get("password", "").strip()
    referral_code = payload.get("referral_code", "").strip().upper() if payload.get("referral_code") else None

    if not name or not email or not password:
        raise HTTPException(status_code=400, detail="name, email and password required")

    existing = await db.execute(select(Agent).where(Agent.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    agent = Agent(
        id=str(uuid.uuid4()),
        name=name,
        email=email,
        hashed_password=hash_password(password),
        api_key=generate_api_key()
    )
    db.add(agent)

    # If this signup came in through a referral link, record it now.
    # Non-fatal by design — an invalid/expired code should never block
    # registration itself, just silently skip the referral tracking.
    if referral_code:
        try:
            from db_referrals import ReferralCode
            code_result = await db.execute(select(ReferralCode).where(ReferralCode.code == referral_code))
            code_row = code_result.scalar_one_or_none()
            if code_row and code_row.agent_id != agent.id:
                db.add(Referral(
                    id=str(uuid.uuid4()),
                    referrer_agent_id=code_row.agent_id,
                    referred_agent_id=agent.id,
                    referral_code=referral_code,
                    status="signed_up",
                ))
            elif not code_row:
                logger.warning(f"Signup referenced unknown referral code: {referral_code}")
        except Exception as e:
            logger.error(f"Referral tracking failed (non-fatal) for new agent={agent.id}: {e}")

    await db.commit()
    verify_token = create_email_verification_token(agent.id)
    await asyncio.to_thread(send_verification_email, agent.email, agent.name, verify_token)
 
    access_token  = create_access_token(agent.id)
    refresh_token = create_refresh_token(agent.id)

    return {
        "agent_id": agent.id,
        "name": agent.name,
        "email": agent.email,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in_minutes": int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
    }


@app.post("/agents/login")
@limiter.limit("10/minute")
async def login(request: Request, payload: dict, db: AsyncSession = Depends(get_session)):
    email    = payload.get("email", "").strip().lower()
    password = payload.get("password", "").strip()

    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password required")

    result = await db.execute(select(Agent).where(Agent.email == email))
    agent  = result.scalar_one_or_none()

    if not agent or not verify_password(password, agent.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not agent.is_active:
        raise HTTPException(status_code=401, detail="Account inactive")

    access_token  = create_access_token(agent.id)
    refresh_token = create_refresh_token(agent.id)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in_minutes": int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
    }

@app.post("/agents/refresh")
async def refresh_token(payload: dict, db: AsyncSession = Depends(get_session)):
    token = payload.get("refresh_token", "")
    if not token:
        raise HTTPException(status_code=400, detail="refresh_token required")

    agent_id = decode_token(token, token_type="refresh")
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id).where(Agent.is_active == True)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=401, detail="Agent not found or inactive")

    access_token = create_access_token(agent.id)
    new_refresh_token = create_refresh_token(agent.id)
    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "expires_in_minutes": ACCESS_EXPIRE,
    }

# -- Agent routes (protected) -------------------------------------------------

@app.put("/agents/password")
async def change_password(
    payload: dict,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    old_password = payload.get("old_password", "")
    new_password = payload.get("new_password", "")

    if not verify_password(old_password, agent.hashed_password):
        raise HTTPException(status_code=401, detail="Old password is incorrect")

    result = await db.execute(select(Agent).where(Agent.id == agent.id))
    db_agent = result.scalar_one()
    db_agent.hashed_password = hash_password(new_password)
    await db.commit()
    return {"message": "Password updated successfully"}

# -- Meeting lifecycle (protected) --------------------------------------------

@app.post("/meetings/start")
@limiter.limit("100/minute")
async def start_meeting(
    request: Request,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session),
    _access = Depends(require_active_access),
    
):
    # require_active_access already confirmed this owner is either
    # subscribed or within their 7-day trial window. If they're NOT
    # subscribed, this is a trial meeting — enforce the 5-meeting cap
    # here specifically, since this is the one place a meeting is
    # actually created. See db_trial.py's docstring for why this check
    # doesn't also live in the shared dependency.
    owner_id = agent.org_id or agent.id

    sub_result = await db.execute(select(Subscription).where(Subscription.owner_id == owner_id))
    has_active_subscription = sub_result.scalar_one_or_none() is not None

    if not has_active_subscription:
        trial_result = await db.execute(select(TrialUsage).where(TrialUsage.owner_id == owner_id))
        trial = trial_result.scalar_one_or_none()

        if not trial:
            # First meeting ever attempted by this owner with no
            # subscription — the trial officially starts now.
            owner_type = "team" if agent.org_id else "individual"
            trial = TrialUsage(owner_id=owner_id, owner_type=owner_type, meetings_used=0)
            db.add(trial)
            await db.flush()

        if trial.meetings_used >= TRIAL_MEETING_CAP:
            raise HTTPException(
                status_code=402,
                detail=f"You've used all {TRIAL_MEETING_CAP} meetings in your free trial. Choose a plan to continue."
            )

        trial.meetings_used += 1

    meeting_id = str(uuid.uuid4())
    meeting = Meeting(id=meeting_id, user_id=agent.id)
    db.add(meeting)
    await db.commit()

    r = aioredis.from_url(REDIS_URL)
    await r.hset(f"meeting:{meeting_id}", mapping={
        "status": "recording",
        "chunks": 0,
        "transcript": "",
        "user_id": agent.id
    })
    await r.aclose()
    return {"meeting_id": meeting_id}


@app.get("/meetings/{meeting_id}/upload-url")
async def get_upload_url(
    meeting_id: str,
    filename: str,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session),
    _access = Depends(require_active_access),
):
    result = await db.execute(
        select(Meeting)
        .where(Meeting.id == meeting_id)
        .where(Meeting.user_id == agent.id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if not S3_BUCKET:
        logger.error("S3_BUCKET env var is not set — cannot generate upload URL")
        raise HTTPException(status_code=500, detail="Server misconfiguration: storage not set up")

    s3_key = f"meetings/{meeting_id}/{filename}"

    try:
        s3 = boto3.client(
            "s3",
            region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-1"),
            config=Config(signature_version="s3v4")
        )
        presigned_url = s3.generate_presigned_url(
            "put_object",
            Params={"Bucket": S3_BUCKET, "Key": s3_key},
            ExpiresIn=3600
        )
    except Exception as e:
        logger.error(f"Failed to generate presigned URL for meeting={meeting_id} filename={filename}: {repr(e)}")
        raise HTTPException(status_code=502, detail="Could not generate upload URL, please try again")

    return {"upload_url": presigned_url, "s3_key": s3_key}


@app.post("/meetings/{meeting_id}/upload-complete")
@limiter.limit("20/minute")
async def upload_complete(
    request: Request,
    meeting_id: str,
    s3_key: str = Form(...),
    chunk_seconds: int = Form(30),
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session),
    _access = Depends(require_active_access),
):
    result = await db.execute(
        select(Meeting)
        .where(Meeting.id == meeting_id)
        .where(Meeting.user_id == agent.id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if chunk_seconds <= 0:
        raise HTTPException(status_code=400, detail="chunk_seconds must be positive")

    s3 = boto3.client(
        "s3",
        region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-1"),
        config=Config(signature_version="s3v4")
    )

    try:
        s3_obj = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
        audio_bytes = s3_obj["Body"].read()
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Could not fetch uploaded file from S3: {exc}")

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    filename = s3_key.split("/")[-1]

    try:
        async with httpx.AsyncClient(timeout=1800) as client:
            whisper_resp = await client.post(
                f"{WHISPER_URL}/transcribe-chunked",
                files={"file": (filename, audio_bytes, "audio/mpeg")},
                data={
                    "language": "en",
                    "word_timestamps": "false",
                    "chunk_seconds": str(chunk_seconds),
                },
            )
        whisper_resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Whisper chunked transcription failed: {exc.response.text}",
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Whisper service unreachable: {exc}")

    whisper_data = whisper_resp.json()
    chunks = whisper_data.get("chunks", [])
    if not chunks:
        raise HTTPException(status_code=422, detail="Transcription produced no chunks")

    transcript_parts = [c["text"] for c in chunks if c.get("text")]
    full_transcript = "\n".join(transcript_parts).strip()

    if not full_transcript:
        raise HTTPException(status_code=422, detail="Transcription returned no usable text")

    meeting.transcript = full_transcript
    meeting.chunks = len(chunks)
    meeting.status = "processing"
    await db.commit()

    r = aioredis.from_url(REDIS_URL)
    await r.hset(f"meeting:{meeting_id}", mapping={
        "status": "processing",
        "transcript": full_transcript,
        "chunks": len(chunks),
    })
    await r.aclose()

    sqs = boto3.client("sqs", region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-1"))
    sqs.send_message(QueueUrl=SQS_QUEUE_URL, MessageBody=meeting_id)

    return {
        "meeting_id": meeting_id,
        "status": "processing",
        "chunk_count": len(chunks),
        "audio_duration": whisper_data.get("audio_duration"),
        "chars_transcribed": len(full_transcript),
    }


@app.post("/meetings/{meeting_id}/chunk")
@limiter.limit("100/minute")
async def upload_chunk(
    request: Request,
    meeting_id: str,
    s3_key: str = Form(...),
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session),
    _access = Depends(require_active_access),
):
    result = await db.execute(
        select(Meeting)
        .where(Meeting.id == meeting_id)
        .where(Meeting.user_id == agent.id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    r = aioredis.from_url(REDIS_URL)
    chunk_index = await r.hincrby(f"meeting:{meeting_id}", "chunks", 1)
    await r.aclose()

    meeting.chunks = chunk_index
    await db.commit()

    try:
        sqs = boto3.client("sqs", region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-1"))
        sqs_response = sqs.send_message(
            QueueUrl=SQS_QUEUE_URL,
            MessageBody=json.dumps({
                "type":        "chunk",
                "meeting_id":  meeting_id,
                "s3_key":      s3_key,
                "chunk_index": chunk_index,
            })
        )
        logger.info(f"SQS chunk message sent: meeting={meeting_id} "
                    f"chunk={chunk_index} MessageId={sqs_response.get('MessageId')}")
    except Exception as e:
        logger.error(f"SQS send_message FAILED for meeting={meeting_id} "
                     f"chunk={chunk_index}: {repr(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to queue chunk for processing: {repr(e)}"
        )

    return JSONResponse(status_code=202, content={
        "meeting_id":  meeting_id,
        "chunk_index": chunk_index,
        "status":      "queued"
    })

@app.post("/meetings/{meeting_id}/end")
@limiter.limit("100/minute")
async def end_meeting(
    request: Request,
    meeting_id: str,
    payload: dict = {},
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(
        select(Meeting)
        .where(Meeting.id == meeting_id)
        .where(Meeting.user_id == agent.id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    total_chunks = payload.get("total_chunks", 0)

    r = aioredis.from_url(REDIS_URL)
    await r.hset(f"meeting:{meeting_id}", mapping={
        "ended":        "1",
        "total_chunks": str(total_chunks)
    })
    await r.aclose()

    meeting.status = "processing"
    meeting.chunks = total_chunks
    await db.commit()

    return {"meeting_id": meeting_id, "status": "processing", "total_chunks": total_chunks}


@app.get("/meetings/{meeting_id}/results")
@limiter.limit("100/minute")
async def get_results(
    request: Request,
    meeting_id: str,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(
        select(Meeting)
        .where(Meeting.id == meeting_id)
        .where(Meeting.user_id == agent.id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    return {
        "meeting_id":   meeting.id,
        "status":       meeting.status,
        "transcript":   meeting.transcript,
        "insights":     meeting.insights,
        "created_at":   meeting.created_at,
        "completed_at": meeting.completed_at
    }


# -- History & growth (protected) ---------------------------------------------

@app.get("/meetings")
@limiter.limit("100/minute")
async def get_my_meetings(
    request: Request,
    limit: int = 20,
    offset: int = 0,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(
        select(Meeting)
        .where(Meeting.user_id == agent.id)
        .where(Meeting.status == "done")
        .order_by(desc(Meeting.created_at))
        .limit(limit)
        .offset(offset)
    )
    meetings = result.scalars().all()
    return {
        "total": len(meetings),
        "meetings": [
            {
                "meeting_id":   m.id,
                "created_at":   m.created_at,
                "completed_at": m.completed_at,
                "summary":      m.insights.get("summary") if m.insights else None,
                "deal_health":  m.insights.get("deal_health") if m.insights else None,
            }
            for m in meetings
        ]
    }


@app.get("/meetings/{meeting_id}")
async def get_single_meeting(
    meeting_id: str,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(
        select(Meeting)
        .where(Meeting.id == meeting_id)
        .where(Meeting.user_id == agent.id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    return {
        "meeting_id":   meeting.id,
        "status":       meeting.status,
        "transcript":   meeting.transcript,
        "insights":     meeting.insights,
        "chunks":       meeting.chunks,
        "created_at":   meeting.created_at,
        "completed_at": meeting.completed_at
    }


@app.get("/growth")
@limiter.limit("100/minute")
async def get_growth(
    request: Request,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(
        select(Meeting)
        .where(Meeting.user_id == agent.id)
        .where(Meeting.status == "done")
        .order_by(Meeting.created_at)
    )
    meetings = result.scalars().all()

    if not meetings:
        return {"meetings_analyzed": 0, "growth": []}

    growth = []
    for m in meetings:
        if not m.insights:
            continue
        growth.append({
            "meeting_id":            m.id,
            "date":                  m.created_at,
            "deal_health_score":     m.insights.get("deal_health", {}).get("score"),
            "buying_signals_count":  len(m.insights.get("buying_signals", [])),
            "objections_count":      len(m.insights.get("objections_raised", [])),
            "action_items_count":    len(m.insights.get("action_items", [])),
            "pain_points_count":     len(m.insights.get("client_pain_points", [])),
        })

    return {"meetings_analyzed": len(growth), "growth": growth}


# -- Health & metrics ---------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/metrics")
async def get_metrics(db: AsyncSession = Depends(get_session)):
    metrics = {}

    try:
        sqs = boto3.client("sqs", region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-1"))
        attrs = sqs.get_queue_attributes(
            QueueUrl=SQS_QUEUE_URL,
            AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"]
        )
        metrics["sqs"] = {
            "messages_waiting":    int(attrs["Attributes"]["ApproximateNumberOfMessages"]),
            "messages_processing": int(attrs["Attributes"]["ApproximateNumberOfMessagesNotVisible"])
        }
    except Exception as e:
        metrics["sqs"] = {"error": str(e)}

    try:
        total      = await db.execute(text("SELECT COUNT(*) FROM meetings"))
        done       = await db.execute(text("SELECT COUNT(*) FROM meetings WHERE status = 'done'"))
        failed     = await db.execute(text("SELECT COUNT(*) FROM meetings WHERE status = 'failed'"))
        processing = await db.execute(text("SELECT COUNT(*) FROM meetings WHERE status = 'processing'"))
        agents     = await db.execute(text("SELECT COUNT(*) FROM agents WHERE is_active = true"))
        profiles = await db.execute(text("SELECT COUNT(*) FROM company_context WHERE is_active = true"))

        metrics["database"] = {
            "total_meetings":       total.scalar(),
            "completed_meetings":   done.scalar(),
            "failed_meetings":      failed.scalar(),
            "processing_meetings":  processing.scalar(),
            "active_agents":        agents.scalar(),
            "agents_with_context": profiles.scalar(),
        }
    except Exception as e:
        metrics["database"] = {"error": str(e)}

    try:
        s3 = boto3.client("s3", region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-1"))
        response = s3.list_objects_v2(Bucket=S3_BUCKET)
        metrics["s3"] = {"total_audio_files": response.get("KeyCount", 0)}
    except Exception as e:
        metrics["s3"] = {"error": str(e)}

    metrics["services"] = {
        "api":       "ok",
        "timestamp": datetime.utcnow().isoformat()
    }

    return JSONResponse(metrics)
