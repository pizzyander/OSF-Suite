"""
billing_routes.py — checkout, Paystack webhook, and subscription status.

Mount in main.py with:
    from billing_routes import router as billing_router
    app.include_router(billing_router)
"""
import os
import uuid
import asyncio
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session, Agent
from db_billing import Subscription
from auth import get_current_agent
from mailer import send_trial_started_email
import paystack_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["Billing"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost")
TRIAL_DAYS = 7
CARD_VERIFICATION_USD = 1.00  # small charge to obtain a reusable card token, refunded once the trial starts

PLANS = {
    "individual_2week":  {"label": "2 Weeks",  "amount_usd": 20,  "interval_days": 14},
    "individual_1month": {"label": "1 Month",  "amount_usd": 38,  "interval_days": 30},
    "individual_1year":  {"label": "1 Year",   "amount_usd": 432, "interval_days": 365},
    "team_monthly":       {"label": "Team (monthly)", "amount_per_seat_usd": 99, "interval_days": 30, "min_seats": 5},
}


def _resolve_owner(agent: Agent) -> tuple[str, str]:
    """Returns (owner_type, owner_id) — one subscription per org, or per individual account."""
    if agent.org_id:
        return "team", agent.org_id
    return "individual", agent.id


# ---------------------------------------------------------------------------
# POST /billing/start-trial — pick a plan, verify a card, trial begins
# ---------------------------------------------------------------------------

@router.post("/start-trial")
async def start_trial(
    payload: dict,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    plan_key = payload.get("plan", "")
    seats = payload.get("seats")

    if plan_key not in PLANS:
        raise HTTPException(status_code=400, detail="Unknown plan.")

    owner_type, owner_id = _resolve_owner(agent)

    if plan_key == "team_monthly":
        if owner_type != "team":
            raise HTTPException(status_code=400, detail="Team plans require an organization account.")
        if agent.role != "admin":
            raise HTTPException(status_code=403, detail="Only an org admin can manage billing.")
        seats = int(seats or PLANS["team_monthly"]["min_seats"])
        if seats < PLANS["team_monthly"]["min_seats"]:
            raise HTTPException(status_code=400, detail=f"Team plans require at least {PLANS['team_monthly']['min_seats']} seats.")
        amount_usd = PLANS["team_monthly"]["amount_per_seat_usd"] * seats
    else:
        if owner_type != "individual":
            raise HTTPException(status_code=400, detail="This plan is for individual accounts.")
        amount_usd = PLANS[plan_key]["amount_usd"]

    existing = await db.execute(select(Subscription).where(Subscription.owner_id == owner_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="A subscription already exists for this account.")

    reference = f"trial-verify-{uuid.uuid4().hex[:16]}"

    try:
        result = await paystack_client.initialize_transaction(
            email=agent.email,
            amount_usd=CARD_VERIFICATION_USD,
            reference=reference,
            callback_url=f"{FRONTEND_URL}/billing/callback",
            metadata={
                "kind": "trial_verification",
                "owner_type": owner_type,
                "owner_id": owner_id,
                "plan": plan_key,
                "seats": seats,
                "amount_usd": amount_usd,
                "interval_days": PLANS[plan_key]["interval_days"],
            },
        )
    except Exception as e:
        logger.error(f"Paystack initialize failed for owner={owner_id}: {e}")
        raise HTTPException(status_code=502, detail="Could not start checkout — try again shortly.")

    return {"authorization_url": result["data"]["authorization_url"], "reference": reference}


# ---------------------------------------------------------------------------
# POST /billing/webhook — Paystack calls this, not the browser
# ---------------------------------------------------------------------------

@router.post("/webhook")
async def paystack_webhook(request: Request, db: AsyncSession = Depends(get_session)):
    raw_body = await request.body()
    signature = request.headers.get("x-paystack-signature", "")

    if not paystack_client.verify_webhook_signature(raw_body, signature):
        logger.warning("Rejected webhook with invalid signature")
        raise HTTPException(status_code=401, detail="Invalid signature")

    event = await request.json()
    event_type = event.get("event")
    data = event.get("data", {})
    metadata = data.get("metadata", {})

    if event_type == "charge.success" and metadata.get("kind") == "trial_verification":
        await _handle_trial_verified(data, metadata, db)
    elif event_type == "charge.success" and metadata.get("kind") == "renewal":
        await _handle_renewal_success(data, metadata, db)

    return {"received": True}


async def _handle_trial_verified(data: dict, metadata: dict, db: AsyncSession):
    owner_id = metadata["owner_id"]

    existing = await db.execute(select(Subscription).where(Subscription.owner_id == owner_id))
    if existing.scalar_one_or_none():
        return  # already processed — webhooks can be delivered more than once

    now = datetime.utcnow()
    trial_ends_at = now + timedelta(days=TRIAL_DAYS)

    sub = Subscription(
        id=str(uuid.uuid4()),
        owner_type=metadata["owner_type"],
        owner_id=owner_id,
        plan=metadata["plan"],
        seats=metadata.get("seats"),
        amount_usd=metadata["amount_usd"],
        interval_days=metadata["interval_days"],
        status="trialing",
        trial_ends_at=trial_ends_at,
        current_period_end=trial_ends_at,
        paystack_customer_code=data.get("customer", {}).get("customer_code"),
        paystack_authorization_code=data.get("authorization", {}).get("authorization_code"),
        last_charge_reference=data.get("reference"),
    )
    db.add(sub)
    await db.commit()

    try:
        await paystack_client.refund_transaction(data.get("reference"))
    except Exception as e:
        logger.error(f"Trial verification refund failed for owner={owner_id} (non-fatal): {e}")

    try:
        if metadata["owner_type"] == "individual":
            agent_result = await db.execute(select(Agent).where(Agent.id == owner_id))
        else:
            agent_result = await db.execute(
                select(Agent).where(Agent.org_id == owner_id).where(Agent.role == "admin").limit(1)
            )
        agent = agent_result.scalars().first()
        if agent:
            plan_label = PLANS.get(metadata["plan"], {}).get("label", metadata["plan"])
            await asyncio.to_thread(
                send_trial_started_email, agent.email, agent.name, plan_label,
                trial_ends_at.strftime("%B %d, %Y")
            )
    except Exception as e:
        logger.error(f"Trial-started email failed (non-fatal) for owner={owner_id}: {e}")


async def _handle_renewal_success(data: dict, metadata: dict, db: AsyncSession):
    owner_id = metadata.get("owner_id")
    if not owner_id:
        return
    result = await db.execute(select(Subscription).where(Subscription.owner_id == owner_id))
    sub = result.scalar_one_or_none()
    if sub and sub.status != "active":
        sub.status = "active"
        await db.commit()


@router.get("/status")
async def billing_status(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    owner_type, owner_id = _resolve_owner(agent)
    result = await db.execute(select(Subscription).where(Subscription.owner_id == owner_id))
    sub = result.scalar_one_or_none()

    if not sub:
        return {"has_subscription": False}

    return {
        "has_subscription": True,
        "plan": sub.plan,
        "status": sub.status,
        "seats": sub.seats,
        "trial_ends_at": sub.trial_ends_at,
        "current_period_end": sub.current_period_end,
        "has_access": sub.current_period_end is not None and sub.current_period_end > datetime.utcnow(),
    }
