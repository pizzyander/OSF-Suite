"""
db_coaching.py — CoachingPlan (gap-analysis output) and WinningPattern
(extracted techniques from top-performing calls).
"""

from db import Base

import uuid
from datetime import date
from sqlalchemy import Column, String, Integer, Float, Date, DateTime, ForeignKey, Boolean, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

# NOTE: assumes `Base` is already imported/declared in this file the same
# way it is for CoachingPlan / WinningPattern. Adjust the import if your
# Base lives elsewhere (e.g. `from db import Base`).


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