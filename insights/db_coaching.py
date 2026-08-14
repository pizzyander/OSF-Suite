"""
db_coaching.py — CoachingPlan (gap-analysis output) and WinningPattern
(extracted techniques from top-performing calls).
"""


import uuid
from datetime import date, datetime
from sqlalchemy import Column, String, Integer, Float, Text, Date, DateTime, ForeignKey, Boolean, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
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


class DailyQuiz(Base):
    """
    One row per agent per calendar day. This is the 'test paper' —
    QuizQuestion rows below are the individual scenarios on it.

    We key on (agent_id, quiz_date) with a unique constraint so the daily
    worker job is naturally idempotent: if it runs twice in one day (retry,
    redeploy, whatever), the second attempt just finds the existing quiz
    instead of generating a duplicate.
    """
    __tablename__ = "daily_quizzes"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False, index=True)
    quiz_date = Column(Date, nullable=False, default=date.today)
    generated_at = Column(DateTime, server_default=func.now())

    # Denormalized snapshot of *why* this quiz was generated — useful for
    # showing the rep "this quiz targets your talk-ratio issue this week"
    # without re-joining back to the gap analysis later.
    based_on_gap_summary = Column(String, nullable=True)

    questions = relationship("QuizQuestion", back_populates="quiz", order_by="QuizQuestion.position")

    __table_args__ = (UniqueConstraint("agent_id", "quiz_date", name="uq_agent_quiz_per_day"),)


class QuizQuestion(Base):
    """
    A single made-up scenario + 4 options, one of which is correct.

    is_correct / selected_index start out NULL/None — they only get filled
    in once the rep actually answers (see the /answer route). Until then,
    the API must NOT send correct_index or explanation to the frontend,
    or the "quiz" is just an answer key with extra steps.
    """
    __tablename__ = "quiz_questions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    quiz_id = Column(String, ForeignKey("daily_quizzes.id"), nullable=False, index=True)
    position = Column(Integer, nullable=False)  # 1..5, display order

    scenario = Column(String, nullable=False)          # the made-up situation
    options = Column(JSONB, nullable=False)             # list[str], length 4
    correct_index = Column(Integer, nullable=False)     # 0-3
    explanation = Column(String, nullable=False)        # why that option is right
    skill_area = Column(String, nullable=False)         # e.g. "objection_handling", "talk_ratio", "discovery"

    selected_index = Column(Integer, nullable=True)     # filled in on answer
    is_correct = Column(Boolean, nullable=True)          # filled in on answer
    answered_at = Column(DateTime, nullable=True)

    quiz = relationship("DailyQuiz", back_populates="questions")