"""
db_trial.py — free trial tracking: 7 days, up to 5 meetings.

Kept as its own module, same pattern as db_billing.py/db_referrals.py.
One row per owner (same owner_id resolution used everywhere else in
billing: agent.org_id if set, else agent.id), created lazily the first
time that owner starts a meeting with no active Subscription.

Design split, important for correctness:
  - The 7-DAY WINDOW is checked in billing_guard.py's require_active_access,
    since that dependency guards every meeting-related endpoint
    (start, upload-url, upload-complete, chunk) — a lapsed trial should
    block all of them.
  - The 5-MEETING CAP is checked and incremented ONLY in main.py's
    /meetings/start, since that's the one moment a "meeting" is
    actually created. Re-checking the cap on upload-url/upload-complete
    would incorrectly block a trial user partway through their 5th
    meeting (those calls happen AFTER meetings_used was already
    incremented to 5).
"""
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer
from db import Base

TRIAL_DAYS = 7
TRIAL_MEETING_CAP = 5


class TrialUsage(Base):
    __tablename__ = "trial_usage"

    owner_id          = Column(String, primary_key=True)  # agent.org_id or agent.id
    owner_type        = Column(String, nullable=False)     # "individual" | "team"
    trial_started_at  = Column(DateTime, nullable=False, default=datetime.utcnow)
    meetings_used     = Column(Integer, nullable=False, default=0)
    created_at        = Column(DateTime, default=datetime.utcnow)
    updated_at        = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
