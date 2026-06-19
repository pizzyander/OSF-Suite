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
from auth import get_current_agent
from extraction import extract, extract_from_raw_text, ExtractionError

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
REDIS_CONTEXT_TTL = 60 * 60 * 24 * 7  # 7 days — refreshed on every upload

router = APIRouter(prefix="/agents/context", tags=["Company Context"])


async def _write_to_redis(agent_id: str, text: str):
    """Cache the active context text in Redis for fast worker lookup."""
    r = aioredis.from_url(REDIS_URL)
    await r.set(f"agent_context:{agent_id}", text, ex=REDIS_CONTEXT_TTL)
    await r.aclose()


async def _deactivate_previous(agent_id: str, db: AsyncSession):
    """Mark all existing active rows for this agent as inactive."""
    await db.execute(
        update(CompanyContext)
        .where(CompanyContext.agent_id == agent_id)
        .where(CompanyContext.is_active == True)
        .values(is_active=False)
    )


# ---------------------------------------------------------------------------
# POST /agents/context/upload  — upload a PDF, DOCX, or .txt file
# ---------------------------------------------------------------------------

@router.post("/upload")
async def upload_context_file(
    request: Request,
    file: UploadFile = File(...),
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    """
    Upload a PDF, DOCX, or plain text file as the agent's company context.
    Deactivates the previous context version and stores the new one.
    Accepts: .pdf  .docx  .txt  .text
    """
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    filename = file.filename or "upload"

    try:
        extracted_text, source_type = extract(data, filename)
    except ExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))

    await _deactivate_previous(agent.id, db)

    context = CompanyContext(
        id=str(uuid.uuid4()),
        agent_id=agent.id,
        version=str(uuid.uuid4()),
        source_type=source_type,
        original_filename=filename,
        extracted_text=extracted_text,
        is_active=True,
        created_at=datetime.utcnow()
    )
    db.add(context)
    await db.commit()

    await _write_to_redis(agent.id, extracted_text)

    return {
        "context_id": context.id,
        "version": context.version,
        "source_type": source_type,
        "original_filename": filename,
        "character_count": len(extracted_text),
        "created_at": context.created_at,
        "message": "Company context uploaded and active."
    }


# ---------------------------------------------------------------------------
# POST /agents/context/text  — paste raw text directly (no file)
# ---------------------------------------------------------------------------

@router.post("/text")
async def upload_context_text(
    payload: dict,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    """
    Submit raw text as the agent's company context (no file upload needed).
    Body: { "text": "<your company info / pricing here>" }
    """
    raw = payload.get("text", "")
    try:
        extracted_text, source_type = extract_from_raw_text(raw)
    except ExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))

    await _deactivate_previous(agent.id, db)

    context = CompanyContext(
        id=str(uuid.uuid4()),
        agent_id=agent.id,
        version=str(uuid.uuid4()),
        source_type=source_type,
        original_filename=None,
        extracted_text=extracted_text,
        is_active=True,
        created_at=datetime.utcnow()
    )
    db.add(context)
    await db.commit()

    await _write_to_redis(agent.id, extracted_text)

    return {
        "context_id": context.id,
        "version": context.version,
        "source_type": source_type,
        "original_filename": None,
        "character_count": len(extracted_text),
        "created_at": context.created_at,
        "message": "Company context saved and active."
    }


# ---------------------------------------------------------------------------
# GET /agents/context  — fetch current active context
# ---------------------------------------------------------------------------

@router.get("")
async def get_active_context(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    """
    Return the agent's current active company context.
    Returns 404 if none has been uploaded yet.
    """
    result = await db.execute(
        select(CompanyContext)
        .where(CompanyContext.agent_id == agent.id)
        .where(CompanyContext.is_active == True)
    )
    context = result.scalar_one_or_none()

    if not context:
        raise HTTPException(
            status_code=404,
            detail="No company context uploaded yet. Use POST /agents/context/upload or /agents/context/text."
        )

    return {
        "context_id": context.id,
        "version": context.version,
        "source_type": context.source_type,
        "original_filename": context.original_filename,
        "extracted_text": context.extracted_text,
        "character_count": len(context.extracted_text),
        "created_at": context.created_at
    }


# ---------------------------------------------------------------------------
# GET /agents/context/history  — full version history (latest first)
# ---------------------------------------------------------------------------

@router.get("/history")
async def get_context_history(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    """
    Return all past company context versions for this agent, newest first.
    Only one will have is_active=True (the current version).
    """
    result = await db.execute(
        select(CompanyContext)
        .where(CompanyContext.agent_id == agent.id)
        .order_by(CompanyContext.created_at.desc())
    )
    rows = result.scalars().all()

    return {
        "total_versions": len(rows),
        "history": [
            {
                "context_id": c.id,
                "version": c.version,
                "source_type": c.source_type,
                "original_filename": c.original_filename,
                "character_count": len(c.extracted_text),
                "is_active": c.is_active,
                "created_at": c.created_at
            }
            for c in rows
        ]
    }


# ---------------------------------------------------------------------------
# DELETE /agents/context  — clear active context
# ---------------------------------------------------------------------------

@router.delete("")
async def delete_context(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    """
    Deactivate the current context without uploading a replacement.
    History is preserved; the AI just won't receive context on future meetings.
    """
    await _deactivate_previous(agent.id, db)
    await db.commit()

    r = aioredis.from_url(REDIS_URL)
    await r.delete(f"agent_context:{agent.id}")
    await r.aclose()

    return {"message": "Company context cleared. Previous versions remain in history."}