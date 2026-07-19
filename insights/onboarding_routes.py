"""
onboarding_routes.py — saves onboarding profile fields and reports org
context alongside the agent's own profile.

Mount in main.py with:
    from onboarding_routes import router as onboarding_router
    app.include_router(onboarding_router)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session, Agent, Organization
from auth import get_current_agent

router = APIRouter(prefix="/agents", tags=["Onboarding"])

# Whitelisted so a caller can't sneak org_id, role, is_active, etc. into
# this payload and escalate their own privileges — only genuine profile
# fields are writable here.
ALLOWED_FIELDS = {
    "country", "language", "job_title", "role_summary", "company_name",
    "sales_methodology", "primary_goal", "what_we_sell",
}


@router.put("/onboarding")
async def save_onboarding(
    payload: dict,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(select(Agent).where(Agent.id == agent.id))
    db_agent = result.scalar_one()

    for field in ALLOWED_FIELDS:
        if field in payload:
            setattr(db_agent, field, payload[field])

    # Only mark complete when the caller explicitly says so (the frontend
    # sends this on the FINAL onboarding step) — lets onboarding be saved
    # incrementally across several screens without prematurely flipping
    # the flag on an early partial save.
    if payload.get("complete") is True:
        db_agent.onboarding_completed = True

    await db.commit()

    return {
        "message": "Profile updated.",
        "onboarding_completed": db_agent.onboarding_completed,
    }


@router.get("/me")
async def get_me(agent: Agent = Depends(get_current_agent), db: AsyncSession = Depends(get_session)):
    """
    Overrides the simpler /agents/me already in main.py — DELETE that
    version from main.py once this router is mounted, since FastAPI would
    otherwise register two handlers for the same path (the one included
    last wins, which is fragile to rely on rather than an intentional
    single source of truth).
    """
    org_name = None
    if agent.org_id:
        result = await db.execute(select(Organization).where(Organization.id == agent.org_id))
        org = result.scalar_one_or_none()
        org_name = org.name if org else None

    return {
        "agent_id":   agent.id,
        "name":       agent.name,
        "email":      agent.email,
        "created_at": agent.created_at,

        "org_id":     agent.org_id,
        "org_name":   org_name,
        "role":       agent.role,          # "admin" | "manager" | "member" | None (individual account)
        "manager_id": agent.manager_id,

        "onboarding_completed": agent.onboarding_completed,
        "country":            agent.country,
        "language":            agent.language,
        "job_title":            agent.job_title,
        "role_summary":          agent.role_summary,
        "company_name":            agent.company_name,
        "sales_methodology":        agent.sales_methodology,
        "primary_goal":              agent.primary_goal,
        "what_we_sell":                agent.what_we_sell,
    }