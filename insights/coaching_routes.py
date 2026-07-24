"""
coaching_routes.py — view coaching plans and the winning-patterns library.

Mount in main.py with:
    from coaching_routes import router as coaching_router
    app.include_router(coaching_router)
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session, Agent
from db_coaching import CoachingPlan, WinningPattern
from auth import get_current_agent

router = APIRouter(prefix="/coaching", tags=["Coaching"])


@router.get("/plan")
async def get_latest_plan(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(
        select(CoachingPlan)
        .where(CoachingPlan.agent_id == agent.id)
        .order_by(CoachingPlan.generated_at.desc())
        .limit(1)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        return {"plan": None}

    if not plan.is_read:
        plan.is_read = True
        await db.commit()

    return {
        "plan": {
            "id": plan.id,
            "generated_at": plan.generated_at,
            "period_start": plan.period_start,
            "period_end": plan.period_end,
            "meetings_analyzed": plan.meetings_analyzed,
            "avg_coaching_score": plan.avg_coaching_score,
            "plan_text": plan.plan_text,
        }
    }


@router.get("/plans")
async def get_plan_history(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(
        select(CoachingPlan)
        .where(CoachingPlan.agent_id == agent.id)
        .order_by(CoachingPlan.generated_at.desc())
        .limit(20)
    )
    plans = result.scalars().all()
    return {
        "plans": [
            {
                "id": p.id,
                "generated_at": p.generated_at,
                "meetings_analyzed": p.meetings_analyzed,
                "avg_coaching_score": p.avg_coaching_score,
                "plan_text": p.plan_text,
                "is_read": p.is_read,
            }
            for p in plans
        ]
    }


@router.get("/winning-patterns")
async def get_winning_patterns(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    owner_scope_id = agent.org_id or agent.id
    result = await db.execute(
        select(WinningPattern)
        .where(WinningPattern.owner_scope_id == owner_scope_id)
        .order_by(WinningPattern.created_at.desc())
        .limit(20)
    )
    patterns = result.scalars().all()

    agent_ids = {p.source_agent_id for p in patterns}
    agents_result = await db.execute(select(Agent).where(Agent.id.in_(agent_ids)))
    names_by_id = {a.id: a.name for a in agents_result.scalars().all()}

    return {
        "patterns": [
            {
                "id": p.id,
                "category": p.category,
                "technique": p.technique,
                "source_agent_name": names_by_id.get(p.source_agent_id, "A teammate"),
                "source_meeting_id": p.source_meeting_id,
                "created_at": p.created_at,
            }
            for p in patterns
        ]
    }
