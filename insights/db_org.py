"""
Organization + Invite models — multi-seat team accounts for OSF-Suite.
Import this alongside db.py; init_db() in db.py will pick it up automatically
once you add the import to db.py (see instructions at bottom of this file).
"""

from datetime import datetime
from sqlalchemy import Column, String, DateTime
from db import Base


class Organization(Base):
    __tablename__ = "organizations"

    id         = Column(String, primary_key=True)   # uuid4
    name       = Column(String, nullable=False)      # this IS the org's "Company" name shown during onboarding
    created_at = Column(DateTime, default=datetime.utcnow)


class Invite(Base):
    __tablename__ = "invites"

    id         = Column(String, primary_key=True)    # uuid4
    org_id     = Column(String, nullable=False, index=True)
    email      = Column(String, nullable=False, index=True)
    role       = Column(String, nullable=False)        # "manager" | "member" — admins aren't invited this
                                                          # way; the org creator is the first admin, and
                                                          # promoting someone to admin happens after they join
    manager_id = Column(String, nullable=True)          # who this person reports to — only meaningful
                                                          # when role == "member"; carried through to the
                                                          # Agent row once the invite is accepted
    invited_by = Column(String, nullable=False)         # agent_id of whoever sent the invite
    token      = Column(String, unique=True, nullable=False, index=True)  # goes in the invite link URL
    status     = Column(String, default="pending")       # "pending" | "accepted" | "expired" | "revoked"
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# SETUP INSTRUCTIONS
# ---------------------------------------------------------------------------
# 1. Add this import to db.py (anywhere after Base is defined):
#
#        from db_org import Organization, Invite  # noqa: F401
#
# 2. These two tables (organizations, invites) are brand new — they get
#    created automatically by Base.metadata.create_all() on next startup,
#    same as company_context was. No manual migration needed for these two.
#
# 3. HOWEVER: the new columns added to the *existing* agents and
#    company_context tables (org_id, role, manager_id, onboarding fields,
#    etc.) are NOT auto-created — create_all() only creates missing tables,
#    it never alters ones that already exist. Run migration.sql once against
#    your production database before deploying this code.
# ---------------------------------------------------------------------------