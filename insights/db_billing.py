"""
db_billing.py — subscription/billing state for Paystack-gated access.

Design note: rather than mixing Paystack's native recurring "Plan"
objects (fixed intervals: monthly, annually, etc — no 14-day option
exists) with a separate one-off flow for the 2-week tier, EVERY plan
here is billed the same way: we save the customer's card via a Paystack
reusable authorization, and OUR OWN scheduler (worker.py's billing_loop)
re-charges it every `interval_days`. Paystack is purely the charge
processor; we own the billing calendar. This is what lets a 14-day plan
and a 365-day plan share one mechanism instead of needing two.
"""
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, Float
from db import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    id       = Column(String, primary_key=True)
    owner_type = Column(String, nullable=False)
    owner_id   = Column(String, nullable=False, index=True, unique=True)

    plan          = Column(String, nullable=True)
    seats         = Column(Integer, nullable=True)
    amount        = Column(Float, nullable=True)  # in whatever PAYSTACK_CURRENCY is set to (NGN, not USD)
    interval_days = Column(Integer, nullable=True)

    status = Column(String, default="trialing")

    trial_ends_at       = Column(DateTime, nullable=True)
    current_period_end  = Column(DateTime, nullable=True)

    paystack_customer_code      = Column(String, nullable=True)
    paystack_authorization_code = Column(String, nullable=True)
    last_charge_reference       = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)