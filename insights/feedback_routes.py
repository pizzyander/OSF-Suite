"""
feedback_routes.py — private feedback inbox + public feature request board.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session, Agent
from db_feedback import Feedback, FeatureRequest, FeatureVote
from auth import get_current_agent

router = APIRouter(tags=["Feedback"])


@router.post("/feedback")
async def submit_feedback(
    payload: dict,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    message = (payload.get("message") or "").strip()
    category = payload.get("category") or "general"
    if not message:
        return {"error": "message is required"}, 400

    db.add(Feedback(agent_id=agent.id, message=message, category=category))
    await db.commit()
    return {"status": "received"}


@router.get("/features")
async def list_features(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    features_result = await db.execute(
        select(FeatureRequest).order_by(FeatureRequest.created_at.desc())
    )
    features = features_result.scalars().all()

    # Vote counts per feature, computed live via GROUP BY rather than a
    # stored counter — always correct, never needs a sync step.
    count_result = await db.execute(
        select(FeatureVote.feature_id, func.count(FeatureVote.id))
        .group_by(FeatureVote.feature_id)
    )
    vote_counts = dict(count_result.all())

    # Which features THIS user has already voted on, so the frontend can
    # show the button as already-pressed rather than everyone seeing a
    # neutral "vote" button regardless of their own vote state.
    my_votes_result = await db.execute(
        select(FeatureVote.feature_id).where(FeatureVote.agent_id == agent.id)
    )
    my_votes = {row[0] for row in my_votes_result.all()}

    submitter_ids = {f.agent_id for f in features}
    agents_result = await db.execute(select(Agent).where(Agent.id.in_(submitter_ids)))
    names_by_id = {a.id: a.name for a in agents_result.scalars().all()}

    out = [
        {
            "id": f.id,
            "title": f.title,
            "description": f.description,
            "status": f.status,
            "created_at": f.created_at,
            "submitted_by": names_by_id.get(f.agent_id, "A teammate"),
            "vote_count": vote_counts.get(f.id, 0),
            "has_voted": f.id in my_votes,
        }
        for f in features
    ]
    # Highest-voted first — the whole point of a public board like this.
    out.sort(key=lambda f: f["vote_count"], reverse=True)
    return {"features": out}


@router.post("/features")
async def submit_feature(
    payload: dict,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    title = (payload.get("title") or "").strip()
    description = (payload.get("description") or "").strip() or None
    if not title:
        return {"error": "title is required"}, 400

    feature = FeatureRequest(agent_id=agent.id, title=title, description=description)
    db.add(feature)
    await db.commit()
    return {"id": feature.id}


@router.post("/features/{feature_id}/vote")
async def toggle_feature_vote(
    feature_id: str,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(
        select(FeatureVote)
        .where(FeatureVote.feature_id == feature_id)
        .where(FeatureVote.agent_id == agent.id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()
        has_voted = False
    else:
        db.add(FeatureVote(feature_id=feature_id, agent_id=agent.id))
        await db.commit()
        has_voted = True

    count_result = await db.execute(
        select(func.count(FeatureVote.id)).where(FeatureVote.feature_id == feature_id)
    )
    vote_count = count_result.scalar_one()

    return {"has_voted": has_voted, "vote_count": vote_count}