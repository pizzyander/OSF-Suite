"""
context_routes.py — company context upload, retrieval, and history endpoints.

Mount in main.py with:
    from context_routes import router as context_router
    app.include_router(context_router)
"""

import uuid
import json
from datetime import datetime

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis
import os

from db import get_session, Agent
from db_context import CompanyContext
from db import ContextChunk
from auth import get_current_agent
from extraction import extract, extract_from_raw_text, ExtractionError
from embeddings import embed_and_store, get_context_owner_id

REDIS_URL         = os.getenv("REDIS_URL", "redis://redis:6379")
REDIS_CONTEXT_TTL = 60 * 60 * 24 * 7  # 7 days

router = APIRouter(prefix="/agents/context", tags=["Company Context"])


def _require_context_admin(agent: Agent):
    """
    Only an org admin may upload/delete the organization's SHARED context —
    every rep in the org draws from this same pool, so letting any member
    overwrite it could disrupt everyone else's coaching output mid-week.
    Individual accounts (org_id is None) always manage their own context
    freely, exactly as before this change.
    """
    if agent.org_id and agent.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only an organization admin can update company context."
        )


async def _write_to_redis(owner_id: str, text: str):
    r = aioredis.from_url(REDIS_URL)
    await r.set(f"agent_context:{owner_id}", text, ex=REDIS_CONTEXT_TTL)
    await r.aclose()


async def _deactivate_previous(agent: Agent, db: AsyncSession):
    """
    Deactivates whatever context is currently active for this scope —
    the org's shared context if the agent belongs to one, otherwise just
    this individual's own personal context. The org_id filter in the
    individual branch matters: without it, deactivating "my" context
    could accidentally touch a differently-scoped row that happens to
    share the same agent_id value (see embeddings.py's note on that
    column's dual meaning).
    """
    if agent.org_id:
        await db.execute(
            update(CompanyContext)
            .where(CompanyContext.org_id == agent.org_id)
            .where(CompanyContext.is_active == True)
            .values(is_active=False)
        )
    else:
        await db.execute(
            update(CompanyContext)
            .where(CompanyContext.agent_id == agent.id)
            .where(CompanyContext.org_id.is_(None))
            .where(CompanyContext.is_active == True)
            .values(is_active=False)
        )


def _scope_filter(agent: Agent):
    """Returns the SQLAlchemy filter clause matching this agent's context scope."""
    if agent.org_id:
        return CompanyContext.org_id == agent.org_id
    return (CompanyContext.agent_id == agent.id) & (CompanyContext.org_id.is_(None))


# ---------------------------------------------------------------------------
# POST /agents/context/upload
# ---------------------------------------------------------------------------

@router.post("/upload")
async def upload_context_file(
    request: Request,
    file: UploadFile = File(...),
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    _require_context_admin(agent)

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    filename = file.filename or "upload"

    try:
        extracted_text, source_type = extract(data, filename)
    except ExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))

    await _deactivate_previous(agent, db)

    owner_id = get_context_owner_id(agent)

    context = CompanyContext(
        id               = str(uuid.uuid4()),
        agent_id         = agent.id,          # who uploaded it (attribution — always the real uploader)
        org_id           = agent.org_id,       # sharing scope — None for individual accounts
        version          = str(uuid.uuid4()),
        source_type      = source_type,
        original_filename= filename,
        extracted_text   = extracted_text,
        is_active        = True,
        created_at       = datetime.utcnow()
    )
    db.add(context)
    await db.commit()

    # Write to Redis cache, keyed by owner scope (org or individual)
    await _write_to_redis(owner_id, extracted_text)

    # Embed and store vectors in pgvector (non-fatal if it fails)
    try:
        await embed_and_store(owner_id, context.id, extracted_text, db)
    except Exception as e:
        print(f"Embedding failed for owner {owner_id}: {e}")

    return {
        "context_id":       context.id,
        "version":          context.version,
        "source_type":      source_type,
        "original_filename":filename,
        "character_count":  len(extracted_text),
        "created_at":       context.created_at,
        "shared_with_org":  bool(agent.org_id),
        "message":          "Company context uploaded and active."
    }


# ---------------------------------------------------------------------------
# POST /agents/context/text
# ---------------------------------------------------------------------------

@router.post("/text")
async def upload_context_text(
    payload: dict,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    _require_context_admin(agent)

    raw = payload.get("text", "")
    try:
        extracted_text, source_type = extract_from_raw_text(raw)
    except ExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))

    await _deactivate_previous(agent, db)

    owner_id = get_context_owner_id(agent)

    context = CompanyContext(
        id               = str(uuid.uuid4()),
        agent_id         = agent.id,
        org_id           = agent.org_id,
        version          = str(uuid.uuid4()),
        source_type      = source_type,
        original_filename= None,
        extracted_text   = extracted_text,
        is_active        = True,
        created_at       = datetime.utcnow()
    )
    db.add(context)
    await db.commit()

    await _write_to_redis(owner_id, extracted_text)

    try:
        await embed_and_store(owner_id, context.id, extracted_text, db)
    except Exception as e:
        print(f"Embedding failed for owner {owner_id}: {e}")

    return {
        "context_id":      context.id,
        "version":         context.version,
        "source_type":     source_type,
        "original_filename": None,
        "character_count": len(extracted_text),
        "created_at":      context.created_at,
        "shared_with_org": bool(agent.org_id),
        "message":         "Company context saved and active."
    }


# ---------------------------------------------------------------------------
# GET /agents/context
# ---------------------------------------------------------------------------

@router.get("")
async def get_active_context(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    # Any org member can VIEW the shared context — only admins can change it.
    result = await db.execute(
        select(CompanyContext)
        .where(_scope_filter(agent))
        .where(CompanyContext.is_active == True)
    )
    context = result.scalar_one_or_none()

    if not context:
        raise HTTPException(
            status_code=404,
            detail="No company context uploaded yet. "
                   "Use POST /agents/context/upload or /agents/context/text."
        )

    return {
        "context_id":       context.id,
        "version":          context.version,
        "source_type":      context.source_type,
        "original_filename":context.original_filename,
        "extracted_text":   context.extracted_text,
        "character_count":  len(context.extracted_text),
        "created_at":       context.created_at,
        "shared_with_org":  bool(context.org_id)
    }


# ---------------------------------------------------------------------------
# GET /agents/context/history
# ---------------------------------------------------------------------------

@router.get("/history")
async def get_context_history(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(
        select(CompanyContext)
        .where(_scope_filter(agent))
        .order_by(CompanyContext.created_at.desc())
    )
    rows = result.scalars().all()

    return {
        "total_versions": len(rows),
        "history": [
            {
                "context_id":       c.id,
                "version":          c.version,
                "source_type":      c.source_type,
                "original_filename":c.original_filename,
                "character_count":  len(c.extracted_text),
                "is_active":        c.is_active,
                "created_at":       c.created_at
            }
            for c in rows
        ]
    }


# ---------------------------------------------------------------------------
# DELETE /agents/context
# ---------------------------------------------------------------------------

@router.delete("")
async def delete_context(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    _require_context_admin(agent)

    await _deactivate_previous(agent, db)
    await db.commit()

    owner_id = get_context_owner_id(agent)
    r = aioredis.from_url(REDIS_URL)
    await r.delete(f"agent_context:{owner_id}")
    await r.aclose()

    return {"message": "Company context cleared. Previous versions remain in history."}