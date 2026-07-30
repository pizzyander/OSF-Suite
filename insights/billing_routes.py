"""
billing_routes.py — checkout, Paystack webhook, and subscription status.

CHANGED from the trial-based version:
  - No trial period. The initial charge IS the subscription payment,
    not a small card-verification amount that gets refunded.
  - Subscription is created with status="active" and a real
    current_period_end immediately upon successful payment — there is
    no "trialing" state anymore.
  - individual_2week price dropped to 12,000 (same unit convention the
    codebase already used for `amount` — confirm this matches what
    your Paystack integration expects, e.g. kobo vs. naira, since that
    wasn't fully documented in the original code).

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
from mailer import send_subscription_started_email
import paystack_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["Billing"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost")

PLANS = {
    "individual_2week":  {"label": "2 Weeks",  "amount": 12000,   "interval_days": 14},
    "individual_1month": {"label": "1 Month",  "amount": 22700,   "interval_days": 30},
    "individual_1year":  {"label": "1 Year",   "amount": 259000,  "interval_days": 365},
    "team_monthly":       {"label": "Team (monthly)", "amount_per_seat": 139000, "interval_days": 30, "min_seats": 5},
}


def _resolve_owner(agent: Agent) -> tuple[str, str]:
    """Returns (owner_type, owner_id) — one subscription per org, or per individual account."""
    if agent.org_id:
        return "team", agent.org_id
    return "individual", agent.id


# ---------------------------------------------------------------------------
# POST /billing/subscribe — pick a plan, pay in full, access starts immediately
# ---------------------------------------------------------------------------

@router.post("/subscribe")
async def subscribe(
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
        amount = PLANS["team_monthly"]["amount_per_seat"] * seats
    else:
        if owner_type != "individual":
            raise HTTPException(status_code=400, detail="This plan is for individual accounts.")
        amount = PLANS[plan_key]["amount"]
        # Individual plans have no seat count. Force this to None rather
        # than trusting whatever the frontend happened to send in
        # payload["seats"] (observed sending "" for individual checkouts,
        # which crashes the webhook's INSERT — seats is an Integer column).
        seats = None

    existing = await db.execute(select(Subscription).where(Subscription.owner_id == owner_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="A subscription already exists for this account.")

    reference = f"sub-{uuid.uuid4().hex[:16]}"

    try:
        result = await paystack_client.initialize_transaction(
            email=agent.email,
            amount=amount,
            reference=reference,
            callback_url=f"{FRONTEND_URL}/billing/callback",
            metadata={
                "kind": "subscription_payment",
                "owner_type": owner_type,
                "owner_id": owner_id,
                "plan": plan_key,
                "seats": seats,
                "amount": amount,
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

    logger.info(f"Received Paystack webhook: event={event_type} kind={metadata.get('kind')}")

    if event_type == "charge.success" and metadata.get("kind") == "subscription_payment":
        await _handle_subscription_started(data, metadata, db)
    elif event_type == "charge.success" and metadata.get("kind") == "renewal":
        await _handle_renewal_success(data, metadata, db)

    return {"received": True}


async def _handle_subscription_started(data: dict, metadata: dict, db: AsyncSession):
    owner_id = metadata["owner_id"]

    existing = await db.execute(select(Subscription).where(Subscription.owner_id == owner_id))
    if existing.scalar_one_or_none():
        return  # already processed — webhooks can be delivered more than once

    now = datetime.utcnow()

    # Defensive coercion: Paystack echoes back transaction metadata with
    # every value stringified, regardless of what type you originally
    # sent (confirmed by the "unsupported type for timedelta days
    # component: str" crash below on interval_days, and the earlier
    # seats='' crash). Never trust metadata's types on the way back in —
    # coerce everything numeric explicitly before using it.
    try:
        interval_days_value = int(metadata["interval_days"])
    except (TypeError, ValueError, KeyError) as e:
        logger.error(f"Invalid interval_days in webhook metadata for owner={owner_id}: {metadata.get('interval_days')!r} ({e})")
        raise HTTPException(status_code=422, detail="Invalid interval_days in webhook metadata")

    try:
        amount_value = float(metadata["amount"])
    except (TypeError, ValueError, KeyError) as e:
        logger.error(f"Invalid amount in webhook metadata for owner={owner_id}: {metadata.get('amount')!r} ({e})")
        raise HTTPException(status_code=422, detail="Invalid amount in webhook metadata")

    period_end = now + timedelta(days=interval_days_value)

    # Defensive coercion: seats must be a real int or None. Catches any
    # stray "" (or other non-numeric junk) from the checkout payload
    # before it reaches the DB — this INSERT previously crashed with
    # "invalid input for query argument $5" when seats was "".
    raw_seats = metadata.get("seats")
    try:
        seats_value = int(raw_seats) if raw_seats not in (None, "") else None
    except (TypeError, ValueError):
        logger.warning(f"Non-numeric seats value in webhook metadata for owner={owner_id}: {raw_seats!r} — storing as None")
        seats_value = None

    # NOTE: this charge is the real subscription payment now, not a
    # refundable card-verification amount — do NOT call
    # paystack_client.refund_transaction here.
    sub = Subscription(
        id=str(uuid.uuid4()),
        owner_type=metadata["owner_type"],
        owner_id=owner_id,
        plan=metadata["plan"],
        seats=seats_value,
        amount=amount_value,
        interval_days=interval_days_value,
        status="active",
        trial_ends_at=None,
        current_period_end=period_end,
        paystack_customer_code=data.get("customer", {}).get("customer_code"),
        paystack_authorization_code=data.get("authorization", {}).get("authorization_code"),
        last_charge_reference=data.get("reference"),
    )
    db.add(sub)
    await db.commit()

    logger.info(f"Subscription activated for owner={owner_id} plan={metadata['plan']} period_end={period_end}")

    # Non-fatal, matches the pattern used elsewhere in this codebase
    # (e.g. process_message_analysis's meeting-ready email) — a failed
    # send shouldn't undo a subscription that genuinely went through.
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
                send_subscription_started_email, agent.email, agent.name, plan_label,
                metadata["amount"], period_end.strftime("%B %d, %Y")
            )
    except Exception as e:
        logger.error(f"Subscription-started email failed (non-fatal) for owner={owner_id}: {e}")


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
        "current_period_end": sub.current_period_end,
        "has_access": sub.current_period_end is not None and sub.current_period_end > datetime.utcnow(),
    }