"""
legal_routes.py — public legal document metadata + view/acceptance logging.
No auth required on either route: these pages are read before someone
even has an account.
"""
import uuid
from datetime import datetime
from fastapi import APIRouter, Request, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from db_legal import LegalView, LEGAL_META
from auth import decode_token

router = APIRouter(prefix="/legal", tags=["Legal"])


def _optional_agent_id(request: Request) -> str | None:
    """
    Same defensive pattern main.py's get_agent_id already uses for rate
    limiting: try to read a bearer token if one's present, but never
    require it. A logged-out visitor reading /privacy is completely
    normal and shouldn't 401.
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            return decode_token(auth.split(" ")[1])
        except Exception:
            return None
    return None


@router.get("/meta")
async def get_legal_meta():
    return LEGAL_META


@router.post("/view")
async def log_legal_view(
    request: Request,
    payload: dict,
    db: AsyncSession = Depends(get_session),
):
    document = payload.get("document")
    event_type = payload.get("event_type", "view")
    if document not in ("terms", "privacy"):
        return {"error": "document must be 'terms' or 'privacy'"}, 400

    db.add(LegalView(
        id=str(uuid.uuid4()),
        document=document,
        version=LEGAL_META[document]["version"],
        agent_id=_optional_agent_id(request),
        event_type=event_type,
        created_at=datetime.utcnow(),
    ))
    await db.commit()
    return {"status": "logged"}