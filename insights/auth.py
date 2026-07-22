import os, uuid, secrets, string
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Header, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session, Agent

JWT_SECRET     = os.getenv("JWT_SECRET", "change-this-secret")
JWT_ALGORITHM  = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_EXPIRE  = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
# Bumped from 7 to 60 days by default, AND (see main.py's /agents/refresh)
# now rotated on every use — an active user who opens the app at least
# once every 60 days effectively never gets logged out, while someone
# who genuinely stops using the product for 2 months does, which is the
# right tradeoff for "stay logged in" without keeping dead sessions alive forever.
REFRESH_EXPIRE = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "60"))
EMAIL_VERIFY_EXPIRE_HOURS = int(os.getenv("JWT_EMAIL_VERIFY_EXPIRE_HOURS", "48"))
# Deliberately short — a password reset link is a bigger security exposure
# than an email-verify link (it grants account takeover if intercepted),
# so it should go stale fast if unused.
PASSWORD_RESET_EXPIRE_MINUTES = int(os.getenv("JWT_PASSWORD_RESET_EXPIRE_MINUTES", "30"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
bearer_scheme = HTTPBearer()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def generate_api_key() -> str:
    alphabet = string.ascii_letters + string.digits
    random_part = "".join(secrets.choice(alphabet) for _ in range(40))
    return f"osf_{random_part}"


def create_access_token(agent_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_EXPIRE)
    payload = {"sub": agent_id, "exp": expire, "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(agent_id: str) -> str:
    expire = datetime.utcnow() + timedelta(days=REFRESH_EXPIRE)
    payload = {"sub": agent_id, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_email_verification_token(agent_id: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=EMAIL_VERIFY_EXPIRE_HOURS)
    payload = {"sub": agent_id, "exp": expire, "type": "email_verify"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_password_reset_token(agent_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=PASSWORD_RESET_EXPIRE_MINUTES)
    payload = {"sub": agent_id, "exp": expire, "type": "password_reset"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str, token_type: str = "access") -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != token_type:
            raise HTTPException(status_code=401, detail="Invalid token type")
        agent_id = payload.get("sub")
        if not agent_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return agent_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_current_agent(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_session)
) -> Agent:
    agent_id = decode_token(credentials.credentials)
    result = await db.execute(
        select(Agent)
        .where(Agent.id == agent_id)
        .where(Agent.is_active == True)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=401, detail="Agent not found or inactive")
    return agent