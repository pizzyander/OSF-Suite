"""
verification_routes.py — email verification and password reset.

Mount in main.py with:
    from verification_routes import router as verification_router
    app.include_router(verification_router)
"""
import asyncio

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter
from slowapi.util import get_remote_address

from db import get_session, Agent
from auth import (
    decode_token, create_email_verification_token, create_password_reset_token,
    hash_password, get_current_agent,
)
from mailer import send_verification_email, send_password_reset_email

router = APIRouter(tags=["Verification"])
limiter = Limiter(key_func=get_remote_address)


async def run_send(fn, *args):
    """Runs email.py's sync boto3 calls in a thread so they don't block the event loop."""
    return await asyncio.to_thread(fn, *args)


# ---------------------------------------------------------------------------
# POST /agents/verify-email
# ---------------------------------------------------------------------------

@router.post("/agents/verify-email")
async def verify_email(payload: dict, db: AsyncSession = Depends(get_session)):
    token = payload.get("token", "")
    if not token:
        raise HTTPException(status_code=400, detail="token required")

    agent_id = decode_token(token, token_type="email_verify")

    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Account not found")

    agent.email_verified = True
    await db.commit()

    return {"message": "Email verified.", "email_verified": True}


# ---------------------------------------------------------------------------
# POST /agents/resend-verification (authenticated — resend for yourself)
# ---------------------------------------------------------------------------

@router.post("/agents/resend-verification")
@limiter.limit("3/minute")
async def resend_verification(request: Request, agent: Agent = Depends(get_current_agent)):
    if agent.email_verified:
        return {"message": "Already verified."}

    token = create_email_verification_token(agent.id)
    sent = await run_send(send_verification_email, agent.email, agent.name, token)

    return {"message": "Verification email sent." if sent else "Could not send email — try again shortly."}


# ---------------------------------------------------------------------------
# POST /agents/forgot-password (public — request a reset link)
# ---------------------------------------------------------------------------

@router.post("/agents/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(request: Request, payload: dict, db: AsyncSession = Depends(get_session)):
    email = payload.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email required")

    result = await db.execute(select(Agent).where(Agent.email == email))
    agent = result.scalar_one_or_none()

    # Always return the same success message whether or not the account
    # exists — confirming/denying an email's existence here would let
    # someone enumerate real accounts by trying addresses one at a time.
    if agent:
        token = create_password_reset_token(agent.id)
        await run_send(send_password_reset_email, agent.email, agent.name, token)

    return {"message": "If an account with that email exists, a reset link has been sent."}


# ---------------------------------------------------------------------------
# POST /agents/reset-password (public — token proves identity, not a session)
# ---------------------------------------------------------------------------

@router.post("/agents/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, payload: dict, db: AsyncSession = Depends(get_session)):
    token = payload.get("token", "")
    new_password = payload.get("new_password", "")

    if not token or not new_password:
        raise HTTPException(status_code=400, detail="token and new_password required")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    agent_id = decode_token(token, token_type="password_reset")

    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Account not found")

    agent.hashed_password = hash_password(new_password)
    await db.commit()

    return {"message": "Password reset. You can now log in with your new password."}