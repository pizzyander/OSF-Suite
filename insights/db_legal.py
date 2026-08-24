"""
db_legal.py — legal document metadata (single source of truth for dates
and contact info, so PrivacyPolicy.jsx/TermsOfUse.jsx never hardcode a
date that drifts out of sync) + a lightweight view/acceptance log.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime
from db import Base

# Edit these when the actual document text changes — this is the ONE
# place the date lives now, instead of being duplicated in two JSX files.
LEGAL_META = {
    "terms": {
        "version": "2026-09-05",
        "updated_at": "September 5, 2026",
        "effective_at": "September 5, 2026",
    },
    "privacy": {
        "version": "2026-09-05",
        "updated_at": "September 5, 2026",
        "effective_at": "September 5, 2026",
    },
    "contact": {
        "name": "Akinfe Adesanmi",
        "email": "akinfeadesanmit@gmail.com",
        "phone": "08120697429",
        "website": "https://www.hygini.app",
    },
}


class LegalView(Base):
    """
    One row per page view/acceptance. agent_id is nullable — these pages
    are public (read before signup), so we log the event regardless of
    whether the visitor is logged in, and attach their identity when we
    have it.
    """
    __tablename__ = "legal_views"

    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document   = Column(String, nullable=False)   # "terms" | "privacy"
    version    = Column(String, nullable=False)   # snapshot of LEGAL_META[doc]["version"] at view time
    agent_id   = Column(String, nullable=True, index=True)  # null if not logged in
    event_type = Column(String, nullable=False, default="view")  # "view" | "accept"
    created_at = Column(DateTime, default=datetime.utcnow)