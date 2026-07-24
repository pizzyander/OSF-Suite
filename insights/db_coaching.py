"""
db_coaching.py — CoachingPlan (gap-analysis output) and WinningPattern
(extracted techniques from top-performing calls).
"""
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer, Float, Boolean
from db import Base


class CoachingPlan(Base):
    __tablename__ = "coaching_plans"

    id                 = Column(String, primary_key=True)
    agent_id           = Column(String, nullable=False, index=True)
    generated_at       = Column(DateTime, default=datetime.utcnow)
    period_start       = Column(DateTime, nullable=False)
    period_end         = Column(DateTime, nullable=False)
    meetings_analyzed  = Column(Integer, default=0)
    avg_coaching_score = Column(Float, nullable=True)
    plan_text          = Column(Text, nullable=False)
    is_read            = Column(Boolean, default=False)


class WinningPattern(Base):
    __tablename__ = "winning_patterns"

    id                = Column(String, primary_key=True)
    source_agent_id   = Column(String, nullable=False, index=True)  # who actually said it (attribution)
    source_meeting_id = Column(String, nullable=False)
    # org_id if the source rep belongs to an org, else their own agent_id —
    # same dual-purpose scoping pattern as CompanyContext.org_id/agent_id.
    # Controls who this pattern gets shared with: teammates in the same
    # org, or just the individual rep's own future calls.
    owner_scope_id    = Column(String, nullable=False, index=True)
    category          = Column(String, nullable=False)  # objection_handling | discovery | closing | buying_signal
    technique         = Column(Text, nullable=False)
    created_at        = Column(DateTime, default=datetime.utcnow)
