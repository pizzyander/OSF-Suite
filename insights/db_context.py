"""
CompanyContext model — versioned company/pricing context per agent, or per
organization for multi-seat accounts. Import this alongside db.py; init_db()
in db.py will pick it up automatically once you add the import to db.py
(see instructions at bottom of this file).
"""

from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Boolean
from db import Base


class CompanyContext(Base):
    __tablename__ = "company_context"

    id                = Column(String, primary_key=True)   # uuid4
    agent_id          = Column(String, nullable=False, index=True)  # who uploaded it (always set, for attribution)
    # Set for an organization's shared context; null means this is a
    # personal, individual-account context exactly as it worked before.
    # When agent_id belongs to an org, retrieval should look up context by
    # org_id instead of agent_id — every rep in the org shares one pool
    # rather than each uploading the same pricing sheet separately.
    org_id            = Column(String, nullable=True, index=True)
    version           = Column(String, nullable=False)     # uuid4, each upload gets one
    source_type       = Column(String, nullable=False)     # "pdf" | "docx" | "text"
    original_filename = Column(String, nullable=True)      # null for raw text input
    extracted_text    = Column(Text, nullable=False)
    is_active         = Column(Boolean, default=True)      # only one active per agent OR per org
    created_at        = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# SETUP INSTRUCTIONS
# ---------------------------------------------------------------------------
# 1. Add this import to db.py (anywhere after Base is defined):
#
#        from db_context import CompanyContext  # noqa: F401
#
#    SQLAlchemy's metadata.create_all() in init_db() will then automatically
#    create the company_context table on next startup. No migrations needed
#    — UNLESS this table already exists in production, in which case the
#    new org_id column needs the accompanying migration.sql (create_all()
#    never alters existing tables, only creates missing ones).
#
# 2. Add CompanyContext to db.py's imports so other modules can import it
#    from one place:
#
#        from db import ..., CompanyContext
#
# ---------------------------------------------------------------------------