import json
import asyncio
import logging

import redis.asyncio as aioredis
from sqlalchemy import select

from db import AsyncSessionLocal, Meeting

logger = logging.getLogger(__name__)

# How often to check for orphaned sessions. Doesn't need to be frequent —
# this is a safety net for a rare failure mode (process crash mid-call),
# not a hot path. Every 2 minutes catches an orphan reasonably quickly
# without adding meaningful load.
SWEEP_INTERVAL_SECONDS = 120


async def sweep_orphaned_live_sessions(redis_url: str):
    """
    Finds live-transcription sessions whose server process died mid-call —
    the WebSocket handler in live_routes.py was killed (crash, OOM, deploy
    restart) before it could finalize the transcript itself.

    Detection relies on the heartbeat live_transcription() refreshes every
    ~20s while genuinely active (see HEARTBEAT_REFRESH_SECONDS in
    live_routes.py). If a live_segments key exists but its matching
    heartbeat key has expired, whatever process owned that session is gone
    — the transcript sitting in Redis would otherwise be lost forever,
    with the meeting permanently stuck at status "recording".
    """
    # Local import to avoid a circular import at module load time —
    # live_routes.py doesn't import this module, so this is safe.
    from live_routes import finalize_meeting

    r = aioredis.from_url(redis_url)
    swept_count = 0

    try:
        async for raw_key in r.scan_iter(match="meeting:*:live_segments"):
            key = raw_key.decode() if isinstance(raw_key, bytes) else raw_key
            meeting_id = key.split(":")[1]

            heartbeat_key = f"meeting:{meeting_id}:live_heartbeat"
            if await r.exists(heartbeat_key):
                continue  # a live session is genuinely still using this key — leave it alone

            # Heartbeat expired. Confirm the meeting genuinely never got
            # finalized through the normal path before we touch anything —
            # it's possible finalize_meeting() already ran and just hasn't
            # had its Redis keys cleaned up yet for some unrelated reason.
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
                meeting = result.scalar_one_or_none()

            if not meeting or meeting.status != "recording":
                await r.delete(key, heartbeat_key)
                continue

            raw_segments = await r.lrange(key, 0, -1)
            segments = [json.loads(s) for s in raw_segments]

            if not segments:
                await r.delete(key, heartbeat_key)
                continue

            logger.warning(
                f"Reconciler: found orphaned live session for meeting={meeting_id} "
                f"({len(segments)} segments captured before the process died) — finalizing"
            )

            await finalize_meeting(meeting_id, segments)
            await r.delete(key, heartbeat_key)
            swept_count += 1

    except Exception as e:
        logger.error(f"Reconciler sweep encountered an error: {repr(e)}")
    finally:
        await r.aclose()

    if swept_count:
        logger.info(f"Reconciler: recovered {swept_count} orphaned live session(s)")


async def reconciler_loop(redis_url: str):
    """
    Runs sweep_orphaned_live_sessions() on a fixed timer, forever, as a
    background task alongside the main SQS job-processing loop in worker.py.

    A failed sweep logs the error and waits for the next tick rather than
    crashing the whole worker process — this is a safety net, and a safety
    net that can itself take down the primary job queue defeats the point.
    """
    logger.info(f"Reconciler loop started — sweeping every {SWEEP_INTERVAL_SECONDS}s")
    while True:
        await sweep_orphaned_live_sessions(redis_url)
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)