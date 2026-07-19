"""
manager_routes.py — team-scoped meeting visibility for managers and admins.

Mount in main.py with:
    from manager_routes import router as manager_router
    app.include_router(manager_router)

Also see the bottom of this file for a required small change to two
EXISTING routes in main.py (get_results, get_single_meeting) — without it,
a manager/admin can see a meeting in their team list but still can't open
it, since those routes currently only allow the meeting's own owner.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session, Agent, Meeting
from auth import get_current_agent

router = APIRouter(prefix="/team", tags=["Manager Dashboard"])


async def get_team_agent_ids(agent: Agent, db: AsyncSession) -> list[str]:
    """
    Returns the list of agent ids whose meetings the caller is allowed to
    view as a team, based on their role:
      - admin:   everyone in the organization
      - manager: themselves + their direct reports (one level, not recursive —
                 matches the org model's manager_id being a single flat field
                 rather than a full tree)
      - anyone else (member, or no org): not authorized to view a team view
        at all — they have their own personal meeting list already.
    """
    if not agent.org_id or agent.role not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only managers and admins can view team data.")

    if agent.role == "admin":
        result = await db.execute(select(Agent.id).where(Agent.org_id == agent.org_id))
        return [row[0] for row in result.all()]

    # manager
    result = await db.execute(
        select(Agent.id).where(Agent.manager_id == agent.id).where(Agent.org_id == agent.org_id)
    )
    report_ids = [row[0] for row in result.all()]
    return [agent.id] + report_ids


async def can_view_meeting(agent: Agent, meeting: Meeting, db: AsyncSession) -> bool:
    """
    Shared authorization check used by BOTH this router's endpoints and
    the existing single-meeting routes in main.py (get_results,
    get_single_meeting) — a meeting is viewable by its own owner, or by
    an admin/manager whose team scope includes the owner.
    """
    if meeting.user_id == agent.id:
        return True
    if not agent.org_id or agent.role not in ("admin", "manager"):
        return False
    team_ids = await get_team_agent_ids(agent, db)
    return meeting.user_id in team_ids


def _extract_score(insights: dict | None) -> int | None:
    if not insights:
        return None
    return insights.get("coaching", {}).get("overall_grade", {}).get("score_out_of_100")


def _extract_deal_health(insights: dict | None) -> str | None:
    if not insights:
        return None
    return insights.get("meeting_intelligence", {}).get("deal_health", {}).get("score")


# ---------------------------------------------------------------------------
# GET /team/meetings — every completed meeting across the caller's team
# ---------------------------------------------------------------------------

@router.get("/meetings")
async def get_team_meetings(
    limit: int = 50,
    offset: int = 0,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    team_ids = await get_team_agent_ids(agent, db)

    result = await db.execute(
        select(Meeting)
        .where(Meeting.user_id.in_(team_ids))
        .where(Meeting.status == "done")
        .order_by(Meeting.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    meetings = result.scalars().all()

    # One extra query to resolve names — cheaper than N+1'ing it per meeting.
    agent_result = await db.execute(select(Agent).where(Agent.id.in_(team_ids)))
    agents_by_id = {a.id: a for a in agent_result.scalars().all()}

    return {
        "total": len(meetings),
        "meetings": [
            {
                "meeting_id":   m.id,
                "agent_id":     m.user_id,
                "agent_name":   agents_by_id[m.user_id].name if m.user_id in agents_by_id else "Unknown",
                "created_at":   m.created_at,
                "completed_at": m.completed_at,
                "summary":      (m.insights or {}).get("meeting_intelligence", {}).get("summary"),
                "deal_health":  _extract_deal_health(m.insights),
                "coaching_score": _extract_score(m.insights),
            }
            for m in meetings
        ]
    }


# ---------------------------------------------------------------------------
# GET /team/stats — aggregate dashboard numbers
# ---------------------------------------------------------------------------

@router.get("/stats")
async def get_team_stats(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    team_ids = await get_team_agent_ids(agent, db)

    result = await db.execute(
        select(Meeting).where(Meeting.user_id.in_(team_ids)).where(Meeting.status == "done")
    )
    meetings = result.scalars().all()

    agent_result = await db.execute(select(Agent).where(Agent.id.in_(team_ids)))
    agents_by_id = {a.id: a for a in agent_result.scalars().all()}

    deal_health_counts = {"hot": 0, "warm": 0, "cold": 0}
    scores = []
    per_rep: dict[str, dict] = {
        aid: {
            "agent_id": aid,
            "name": a.name,
            "meeting_count": 0,
            "scores": [],
            "latest_deal_health": None,
            "latest_created_at": None,
        }
        for aid, a in agents_by_id.items()
    }

    for m in meetings:
        score = _extract_score(m.insights)
        health = _extract_deal_health(m.insights)

        if health in deal_health_counts:
            deal_health_counts[health] += 1
        if score is not None:
            scores.append(score)

        rep = per_rep.get(m.user_id)
        if rep:
            rep["meeting_count"] += 1
            if score is not None:
                rep["scores"].append(score)
            # Track the most recent meeting's deal health per rep, since
            # that's a better "how are they doing right now" signal than
            # an average across their whole history.
            if rep["latest_created_at"] is None or m.created_at > rep["latest_created_at"]:
                rep["latest_created_at"] = m.created_at
                rep["latest_deal_health"] = health

    per_rep_output = [
        {
            "agent_id": r["agent_id"],
            "name": r["name"],
            "meeting_count": r["meeting_count"],
            "avg_coaching_score": round(sum(r["scores"]) / len(r["scores"]), 1) if r["scores"] else None,
            "latest_deal_health": r["latest_deal_health"],
        }
        for r in per_rep.values()
    ]
    # Reps with more meetings first — the manager's most active people
    # surface at the top rather than being alphabetical/random.
    per_rep_output.sort(key=lambda r: r["meeting_count"], reverse=True)

    return {
        "total_meetings": len(meetings),
        "avg_coaching_score": round(sum(scores) / len(scores), 1) if scores else None,
        "deal_health_counts": deal_health_counts,
        "per_rep": per_rep_output,
    }


# ---------------------------------------------------------------------------
# REQUIRED CHANGE TO EXISTING main.py ROUTES
# ---------------------------------------------------------------------------
#
# get_results() and get_single_meeting() in main.py currently do:
#
#     result = await db.execute(
#         select(Meeting)
#         .where(Meeting.id == meeting_id)
#         .where(Meeting.user_id == agent.id)   # <-- too strict for managers/admins
#     )
#     meeting = result.scalar_one_or_none()
#     if not meeting:
#         raise HTTPException(status_code=404, detail="Meeting not found")
#
# Change BOTH to drop the user_id filter from the query itself, then check
# authorization separately with can_view_meeting() — this lets a manager or
# admin open a team member's report, while still blocking anyone outside
# that scope:
#
#     from manager_routes import can_view_meeting
#
#     result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
#     meeting = result.scalar_one_or_none()
#     if not meeting:
#         raise HTTPException(status_code=404, detail="Meeting not found")
#     if not await can_view_meeting(agent, meeting, db):
#         raise HTTPException(status_code=404, detail="Meeting not found")
#
# NOTE: returning 404 (not 403) when access is denied is intentional — it
# avoids confirming to an unauthorized caller that a given meeting_id
# exists at all.
# ---------------------------------------------------------------------------