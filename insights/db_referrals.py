"""
db_referrals.py — affiliate/referral tracking.

Design mirrors db_billing.py's philosophy: this is its own small,
additive module. No changes to the Agent model or db.py are needed —
referral codes and referral records live entirely in these two tables,
keyed loosely by agent_id (string), same pattern Subscription.owner_id
already uses elsewhere in this codebase.

Reward model (v1, deliberately simple): 20% of the referred customer's
FIRST payment, tracked as owed credit. Payout/crediting is a manual
process for now — automating it needs a real decision on mechanism
(account credit vs. bank payout vs. discount code), which isn't made
here. reward_status starts at "pending" and you update it manually
once you've reviewed and applied it.
"""
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float
from db import Base

REFERRAL_REWARD_PERCENTAGE = 0.20  # 20% of the referred customer's first payment


class ReferralCode(Base):
    """
    One code per agent, generated lazily on first request (see
    referral_routes.py's GET /referrals/my-code). Short and shareable —
    not a UUID — since it goes into a public URL.
    """
    __tablename__ = "referral_codes"

    code       = Column(String, primary_key=True)
    agent_id   = Column(String, nullable=False, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Referral(Base):
    """
    One row per successfully referred signup. Created at registration
    time (status="signed_up"), updated to "converted" the moment that
    referred agent's first subscription payment succeeds.
    """
    __tablename__ = "referrals"

    id                 = Column(String, primary_key=True)
    referrer_agent_id  = Column(String, nullable=False, index=True)
    referred_agent_id  = Column(String, nullable=False, unique=True)  # each new agent can only be referred once
    referral_code      = Column(String, nullable=False)

    status = Column(String, default="signed_up")  # signed_up -> converted
    converted_at = Column(DateTime, nullable=True)

    reward_amount   = Column(Float, nullable=True)   # computed at conversion time
    reward_currency = Column(String, nullable=True)  # matches the referred customer's payment currency
    reward_status   = Column(String, default="pending")  # pending -> applied (set manually once you've paid/credited it)

    created_at = Column(DateTime, default=datetime.utcnow)
