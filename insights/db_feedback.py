"""
db_feedback.py — general feedback (private) and public feature requests
with upvoting.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, UniqueConstraint
from db import Base


class Feedback(Base):
    """Free-text feedback from a user — never shown publicly, just a private inbox."""
    __tablename__ = "feedback"

    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_id   = Column(String, nullable=False, index=True)
    message    = Column(Text, nullable=False)
    category   = Column(String, nullable=False, default="general")  # "bug" | "idea" | "general"
    created_at = Column(DateTime, default=datetime.utcnow)


class FeatureRequest(Base):
    """A publicly visible, votable feature suggestion."""
    __tablename__ = "feature_requests"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_id    = Column(String, nullable=False, index=True)  # who submitted it
    title       = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    # under_review | planned | in_progress | done | declined — nothing
    # writes anything but the default yet; a future admin view can.
    status      = Column(String, nullable=False, default="under_review")
    created_at  = Column(DateTime, default=datetime.utcnow)


class FeatureVote(Base):
    """One row per (feature, voter). The unique constraint is what actually
    enforces 'one vote per person' — never trust the frontend alone for that."""
    __tablename__ = "feature_votes"

    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    feature_id = Column(String, ForeignKey("feature_requests.id"), nullable=False, index=True)
    agent_id   = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("feature_id", "agent_id", name="uq_one_vote_per_agent"),)