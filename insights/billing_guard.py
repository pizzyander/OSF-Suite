"""
billing_guard.py — the actual gate. Import require_active_access and add
it as a Depends() on any route that should be blocked once a trial/
subscription has expired.

Example (in main.py or wherever a route is defined):

    from billing_guard import require_active_access

    @app.post("/meetings/start")
    async def start_meeting(
        request: Request,
        agent: Agent = Depends(get_current_agent),
        db: AsyncSession = Depends(get_session),
        _access = Depends(require_active_access),   # <-- add this
    ):
        ...

CHANGED: now trial-aware. An owner with no Subscription row can still
pass this gate if they have a TrialUsage record whose 7-day window
hasn't lapsed. The 5-meeting cap is deliberately NOT checked here —
see db_trial.py's docstring for why that lives only in
main.py's /meetings/start instead.
"""
from datetime import datetime, timedelta

from fastapi import HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session, Agent
from db_billing import Subscription
from db_trial import TrialUsage, TRIAL_DAYS
from auth import get_current_agent


async def require_active_access(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session),
):
    owner_id = agent.org_id or agent.id

    result = await db.execute(select(Subscription).where(Subscription.owner_id == owner_id))
    sub = result.scalar_one_or_none()

    if sub:
        if not sub.current_period_end or sub.current_period_end <= datetime.utcnow():
            raise HTTPException(status_code=402, detail="Your subscription has expired. Update your payment method to continue.")
        return  # active paid subscription — access granted, trial is irrelevant

    # No subscription at all — fall back to trial status.
    trial_result = await db.execute(select(TrialUsage).where(TrialUsage.owner_id == owner_id))
    trial = trial_result.scalar_one_or_none()

    if not trial:
        # No subscription AND no trial record yet. This should be rare in
        # practice — /meetings/start creates the trial record lazily on
        # first use, so by the time any OTHER guarded endpoint is hit,
        # a trial row should already exist. Treat as "never started."
        raise HTTPException(status_code=402, detail="Start your free trial or choose a plan to continue.")

    trial_expires_at = trial.trial_started_at + timedelta(days=TRIAL_DAYS)
    if datetime.utcnow() > trial_expires_at:
        raise HTTPException(status_code=402, detail="Your 7-day trial has ended. Choose a plan to continue.")

    return  # within the trial window — meeting-count cap enforced separately
