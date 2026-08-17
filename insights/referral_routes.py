"""
referral_routes.py — affiliate link generation and stats.

Mount in main.py with:
    from referral_routes import router as referral_router
    app.include_router(referral_router)
"""
import os
import uuid
import string
import secrets
import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session, Agent
from db_referrals import ReferralCode, Referral
from auth import get_current_agent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/referrals", tags=["Referrals"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost")
CODE_ALPHABET = string.ascii_uppercase + string.digits
CODE_LENGTH = 7


def _generate_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


@router.get("/my-code")
async def get_my_referral_code(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    """
    Returns this agent's referral code and full shareable link,
    generating one on first request if they don't have one yet.
    """
    result = await db.execute(select(ReferralCode).where(ReferralCode.agent_id == agent.id))
    row = result.scalar_one_or_none()

    if not row:
        # Collision retry — astronomically unlikely at 7 chars from a
        # 36-char alphabet (~78 billion combinations), but cheap to guard.
        for _ in range(5):
            candidate = _generate_code()
            existing = await db.execute(select(ReferralCode).where(ReferralCode.code == candidate))
            if not existing.scalar_one_or_none():
                row = ReferralCode(code=candidate, agent_id=agent.id)
                db.add(row)
                await db.commit()
                break
        else:
            raise RuntimeError("Could not generate a unique referral code after 5 attempts")

    return {
        "code": row.code,
        "link": f"{FRONTEND_URL}/signup?ref={row.code}",
    }


@router.get("/stats")
async def get_referral_stats(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    """
    Everyone this agent has referred, their status, and total reward
    owed (grouped by currency, since NGN and USD rewards shouldn't be
    summed together).
    """
    result = await db.execute(
        select(Referral).where(Referral.referrer_agent_id == agent.id).order_by(Referral.created_at.desc())
    )
    referrals = result.scalars().all()

    totals: dict[str, float] = {}
    for r in referrals:
        if r.status == "converted" and r.reward_amount and r.reward_currency:
            totals[r.reward_currency] = totals.get(r.reward_currency, 0) + r.reward_amount

    return {
        "total_referred": len(referrals),
        "total_converted": sum(1 for r in referrals if r.status == "converted"),
        "reward_totals_by_currency": totals,  # e.g. {"NGN": 4540.0, "USD": 6.0} — pending manual review/payout
        "referrals": [
            {
                "referred_agent_id": r.referred_agent_id,
                "status": r.status,
                "converted_at": r.converted_at,
                "reward_amount": r.reward_amount,
                "reward_currency": r.reward_currency,
                "reward_status": r.reward_status,
                "created_at": r.created_at,
            }
            for r in referrals
        ],
    }
