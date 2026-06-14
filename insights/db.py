import os
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, JSON, Integer, Boolean
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://osf:osf@db:5432/osf"
).replace("postgresql://", "postgresql+asyncpg://")

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    poolclass=NullPool
)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()


class Agent(Base):
    __tablename__ = "agents"

    id              = Column(String, primary_key=True)
    name            = Column(String, nullable=False)
    email           = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=True)
    api_key         = Column(String, unique=True, nullable=True, index=True)
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime, default=datetime.utcnow)


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