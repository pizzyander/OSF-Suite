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

FastAPI resolves Depends() in the function signature regardless of
argument order, so this can be added to any existing route without
reshuffling its other parameters. 
"""
from datetime import datetime

from fastapi import HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session, Agent
from db_billing import Subscription
from auth import get_current_agent


async def require_active_access(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session),
):
    owner_id = agent.org_id or agent.id

    result = await db.execute(select(Subscription).where(Subscription.owner_id == owner_id))
    sub = result.scalar_one_or_none()

    if not sub:
        raise HTTPException(status_code=402, detail="No active subscription. Start a trial to continue.")

    if not sub.current_period_end or sub.current_period_end <= datetime.utcnow():
        detail = (
            "Your trial has ended. Choose a plan to continue."
            if sub.status == "trialing"
            else "Your subscription has expired. Update your payment method to continue."
        )
        raise HTTPException(status_code=402, detail=detail)
