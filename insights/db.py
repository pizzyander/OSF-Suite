import os
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, JSON, Integer, Boolean
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://osf:osf@db:5432/osf"
).replace("postgresql://", "postgresql+asyncpg://")

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=10,
    max_overflow=10,
    pool_timeout=30,
    pool_pre_ping=True,
    pool_recycle=1800,
)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

# Register CompanyContext with Base metadata
from db_context import CompanyContext  # noqa: F401

# Register Organization + Invite with Base metadata
from db_org import Organization, Invite  # noqa: F401

from db_coaching import CoachingPlan, WinningPattern  # noqa: F401

from db_feedback import Feedback, FeatureRequest, FeatureVote  # noqa: F401

from db_legal import LegalView  # noqa: F401

# Register ContextChunk with Base metadata — avoids circular import
from db_vectors import init_vectors
ContextChunk = init_vectors(Base)


class Agent(Base):
    __tablename__ = "agents"

    id              = Column(String, primary_key=True)
    name            = Column(String, nullable=False)
    email           = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=True)
    api_key         = Column(String, unique=True, nullable=True, index=True)
    is_active       = Column(Boolean, default=True)
    email_verified  = Column(Boolean, default=False)
    created_at      = Column(DateTime, default=datetime.utcnow)

    # -- Organization membership (all nullable — a null org_id means a
    # standalone individual account, exactly as it works today) -----------
    org_id     = Column(String, nullable=True, index=True)
    # "admin" | "manager" | "member" — meaningless/null for individual accounts
    role       = Column(String, nullable=True)
    # Self-referencing: which agent this person reports to. Used to scope
    # a manager's dashboard to "my direct reports" without a separate
    # permissions table. Null for admins and individual accounts.
    manager_id = Column(String, nullable=True, index=True)

    # -- Onboarding profile fields ------------------------------------------
    country             = Column(String, nullable=True)
    language             = Column(String, nullable=True)
    job_title             = Column(String, nullable=True)
    role_summary           = Column(Text, nullable=True)
    # Individual accounts only — org accounts show Organization.name instead,
    # so we don't store the same company name in two places that could drift.
    company_name             = Column(String, nullable=True)
    sales_methodology         = Column(String, nullable=True)  # "MEDDIC" | "SPIN" | "Challenger" | etc.
    primary_goal               = Column(String, nullable=True)
    what_we_sell                 = Column(Text, nullable=True)
    onboarding_completed           = Column(Boolean, default=False)
    terms_accepted_version   = Column(String, nullable=True)
    privacy_accepted_version = Column(String, nullable=True)
    legal_accepted_at        = Column(DateTime, nullable=True)


class Meeting(Base):
    __tablename__ = "meetings"

    id           = Column(String, primary_key=True)
    user_id      = Column(String, nullable=False, index=True)
    status       = Column(String, default="recording")
    transcript   = Column(Text, default="")
    insights     = Column(JSON, nullable=True)
    chunks       = Column(Integer, default=0)
    created_at   = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
