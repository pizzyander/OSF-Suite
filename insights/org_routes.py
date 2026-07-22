"""
org_routes.py — organization creation and team invite lifecycle.

Mount in main.py with:
    from org_routes import router as org_router
    app.include_router(org_router)
"""

import os
import uuid
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session, Agent, Organization, Invite
from auth import get_current_agent

router = APIRouter(tags=["Organizations"])

# Used to build the actual clickable invite link returned to the admin.
# Set this to your real frontend domain in .env for production —
# defaults to localhost for local testing.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost")
INVITE_EXPIRY_DAYS = 7


# ---------------------------------------------------------------------------
# POST /organizations — create a new org, caller becomes its first admin
# ---------------------------------------------------------------------------

@router.post("/organizations")
async def create_organization(
    payload: dict,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    if agent.org_id:
        raise HTTPException(status_code=400, detail="You're already part of an organization.")

    name = payload.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Organization name is required.")

    org = Organization(
        id=str(uuid.uuid4()),
        name=name,
        created_at=datetime.utcnow(),
    )
    db.add(org)

    # Re-fetch and mutate explicitly (matches the pattern used elsewhere in
    # this codebase, e.g. change_password) rather than relying on the
    # `agent` object returned by get_current_agent being the same session
    # instance — safer and more explicit than assuming dependency caching.
    result = await db.execute(select(Agent).where(Agent.id == agent.id))
    db_agent = result.scalar_one()
    db_agent.org_id = org.id
    db_agent.role = "admin"

    await db.commit()

    return {
        "org_id": org.id,
        "name": org.name,
        "role": "admin",
        "message": "Organization created. You're the admin.",
    }


# ---------------------------------------------------------------------------
# POST /organizations/invites — admin invites a teammate
# ---------------------------------------------------------------------------

@router.post("/organizations/invites")
async def create_invite(
    payload: dict,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    if not agent.org_id or agent.role != "admin":
        raise HTTPException(status_code=403, detail="Only an organization admin can send invites.")

    org_result = await db.execute(select(Organization).where(Organization.id == agent.org_id))
    org = org_result.scalar_one_or_none()
    org_name_for_email = org.name if org else "your team"

    email = payload.get("email", "").strip().lower()
    role = payload.get("role", "member")
    manager_id = payload.get("manager_id")  # optional — only meaningful when role == "member"

    if not email:
        raise HTTPException(status_code=400, detail="Email is required.")
    if role not in ("manager", "member"):
        raise HTTPException(status_code=400, detail="role must be 'manager' or 'member'.")

    if manager_id:
        result = await db.execute(
            select(Agent)
            .where(Agent.id == manager_id)
            .where(Agent.org_id == agent.org_id)
            .where(Agent.role.in_(["admin", "manager"]))
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="manager_id must reference a manager or admin already in your organization."
            )

    result = await db.execute(
        select(Agent).where(Agent.email == email).where(Agent.org_id == agent.org_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="This person is already part of your organization.")

    result = await db.execute(
        select(Invite)
        .where(Invite.org_id == agent.org_id)
        .where(Invite.email == email)
        .where(Invite.status == "pending")
    )
    invite = result.scalar_one_or_none()

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=INVITE_EXPIRY_DAYS)

    if invite:
        invite.role = role
        invite.manager_id = manager_id
        invite.invited_by = agent.id
        invite.token = token
        invite.expires_at = expires_at
        invite.created_at = datetime.utcnow()
    else:
        invite = Invite(
            id=str(uuid.uuid4()),
            org_id=agent.org_id,
            email=email,
            role=role,
            manager_id=manager_id,
            invited_by=agent.id,
            token=token,
            status="pending",
            expires_at=expires_at,
            created_at=datetime.utcnow(),
        )
        db.add(invite)

    await db.commit()

    invite_link = f"{FRONTEND_URL}/join?token={token}"

    # Send the actual email now — this was previously just returned in the
    # API response with nothing sending it anywhere. Non-fatal: if SES
    # isn't configured or the send fails, the admin still gets the link
    # back in this response and can share it manually.
    import asyncio
    from mailer import send_invite_email
    await asyncio.to_thread(send_invite_email, email, org_name_for_email, agent.name, invite_link)

    return {
        "invite_id": invite.id,
        "email": invite.email,
        "role": invite.role,
        "invite_link": invite_link,
        "expires_at": invite.expires_at,
    }


# ---------------------------------------------------------------------------
# GET /organizations/invites — list all invites for the admin's org
# ---------------------------------------------------------------------------

@router.get("/organizations/invites")
async def list_invites(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    if not agent.org_id or agent.role != "admin":
        raise HTTPException(status_code=403, detail="Only an organization admin can view invites.")

    result = await db.execute(
        select(Invite)
        .where(Invite.org_id == agent.org_id)
        .order_by(Invite.created_at.desc())
    )
    rows = result.scalars().all()

    return {
        "total": len(rows),
        "invites": [
            {
                "invite_id": i.id,
                "email": i.email,
                "role": i.role,
                "status": i.status,
                "expires_at": i.expires_at,
                "created_at": i.created_at,
            }
            for i in rows
        ]
    }


# ---------------------------------------------------------------------------
# DELETE /organizations/invites/{invite_id} — revoke a pending invite
# ---------------------------------------------------------------------------

@router.delete("/organizations/invites/{invite_id}")
async def revoke_invite(
    invite_id: str,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    if not agent.org_id or agent.role != "admin":
        raise HTTPException(status_code=403, detail="Only an organization admin can revoke invites.")

    result = await db.execute(
        select(Invite).where(Invite.id == invite_id).where(Invite.org_id == agent.org_id)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found.")
    if invite.status == "accepted":
        raise HTTPException(status_code=400, detail="Cannot revoke an invite that's already been accepted.")

    invite.status = "revoked"
    await db.commit()

    return {"message": "Invite revoked."}


# ---------------------------------------------------------------------------
# GET /invites/{token} — public preview, no auth required
# ---------------------------------------------------------------------------
# Lets the frontend show "You've been invited to join {org_name}" before
# the person has logged in or even created an account yet.

@router.get("/invites/{token}")
async def preview_invite(
    token: str,
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(select(Invite).where(Invite.token == token))
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found.")

    if invite.status == "pending" and invite.expires_at < datetime.utcnow():
        invite.status = "expired"
        await db.commit()

    if invite.status != "pending":
        raise HTTPException(status_code=400, detail=f"This invite is no longer valid ({invite.status}).")

    org_result = await db.execute(select(Organization).where(Organization.id == invite.org_id))
    org = org_result.scalar_one_or_none()

    return {
        "org_name": org.name if org else "Unknown organization",
        "email": invite.email,
        "role": invite.role,
        "expires_at": invite.expires_at,
    }


# ---------------------------------------------------------------------------
# POST /invites/{token}/accept — join the org
# ---------------------------------------------------------------------------

@router.post("/invites/{token}/accept")
async def accept_invite(
    token: str,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(select(Invite).where(Invite.token == token))
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found.")

    if invite.status == "pending" and invite.expires_at < datetime.utcnow():
        invite.status = "expired"
        await db.commit()

    if invite.status != "pending":
        raise HTTPException(status_code=400, detail=f"This invite is no longer valid ({invite.status}).")

    # Only the specifically invited email can accept — prevents anyone who
    # gets hold of the link from joining as themselves instead of the
    # person it was actually meant for.
    if agent.email.lower() != invite.email.lower():
        raise HTTPException(status_code=403, detail="This invite was sent to a different email address.")

    if agent.org_id:
        raise HTTPException(
            status_code=400,
            detail="You're already part of an organization. Leaving an org isn't supported yet."
        )

    # Defensive re-check: if a manager was set at invite time, confirm that
    # person is STILL a valid manager/admin in this org before we commit to
    # it — their role may have changed in the time since the invite was sent.
    manager_id = None
    if invite.role == "member" and invite.manager_id:
        mgr_result = await db.execute(
            select(Agent)
            .where(Agent.id == invite.manager_id)
            .where(Agent.org_id == invite.org_id)
            .where(Agent.role.in_(["admin", "manager"]))
        )
        if mgr_result.scalar_one_or_none():
            manager_id = invite.manager_id
        # If the manager no longer qualifies, we don't fail the whole
        # acceptance over it — the person still joins the org, just
        # without a manager assigned, rather than being blocked entirely.

    result = await db.execute(select(Agent).where(Agent.id == agent.id))
    db_agent = result.scalar_one()
    db_agent.org_id = invite.org_id
    db_agent.role = invite.role
    db_agent.manager_id = manager_id

    invite.status = "accepted"
    await db.commit()

    org_result = await db.execute(select(Organization).where(Organization.id == invite.org_id))
    org = org_result.scalar_one_or_none()

    return {
        "org_id": invite.org_id,
        "org_name": org.name if org else None,
        "role": invite.role,
        "message": "Welcome to the team!",
    }


# ---------------------------------------------------------------------------
# GET /organizations/members — admin's full team roster
# ---------------------------------------------------------------------------

@router.get("/organizations/members")
async def list_members(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    if not agent.org_id or agent.role != "admin":
        raise HTTPException(status_code=403, detail="Only an organization admin can view the team roster.")

    result = await db.execute(
        select(Agent).where(Agent.org_id == agent.org_id).order_by(Agent.created_at)
    )
    members = result.scalars().all()

    return {
        "total": len(members),
        "members": [
            {
                "agent_id":   m.id,
                "name":       m.name,
                "email":      m.email,
                "role":       m.role,
                "manager_id": m.manager_id,
                "job_title":  m.job_title,
                "created_at": m.created_at,
            }
            for m in members
        ]
    }


# ---------------------------------------------------------------------------
# PATCH /organizations/members/{agent_id} — promote/demote, reassign manager
# ---------------------------------------------------------------------------

@router.patch("/organizations/members/{agent_id}")
async def update_member(
    agent_id: str,
    payload: dict,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    if not agent.org_id or agent.role != "admin":
        raise HTTPException(status_code=403, detail="Only an organization admin can manage team members.")

    if agent_id == agent.id:
        raise HTTPException(status_code=400, detail="You can't change your own role here.")

    result = await db.execute(
        select(Agent).where(Agent.id == agent_id).where(Agent.org_id == agent.org_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="This person isn't part of your organization.")

    new_role = payload.get("role")
    if new_role is not None:
        if new_role not in ("admin", "manager", "member"):
            raise HTTPException(status_code=400, detail="role must be 'admin', 'manager', or 'member'.")
        member.role = new_role
        # Demoting someone out of manager/admin should clear anyone who
        # still lists them as their manager — otherwise a "member" could
        # silently remain the manager_id of other agents, which would be
        # a confusing, invisible inconsistency in the org chart.
        if new_role == "member":
            clear_result = await db.execute(
                select(Agent).where(Agent.manager_id == member.id)
            )
            for report in clear_result.scalars().all():
                report.manager_id = None

    if "manager_id" in payload:
        new_manager_id = payload["manager_id"]
        if new_manager_id:
            if new_manager_id == member.id:
                raise HTTPException(status_code=400, detail="A person can't be their own manager.")
            mgr_result = await db.execute(
                select(Agent)
                .where(Agent.id == new_manager_id)
                .where(Agent.org_id == agent.org_id)
                .where(Agent.role.in_(["admin", "manager"]))
            )
            if not mgr_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=400,
                    detail="manager_id must reference a manager or admin already in your organization."
                )
        member.manager_id = new_manager_id

    await db.commit()

    return {
        "agent_id": member.id,
        "role": member.role,
        "manager_id": member.manager_id,
        "message": "Team member updated.",
    }