"""
coaching_agent.py — the agentic gap-analysis + winning-pattern pipeline.

Runs once daily per agent (see daily_coaching_loop in worker.py). Two
independent jobs, each following the same three-step shape:

  1. GATHER    — pull the relevant meetings straight from Postgres, no LLM.
  2. AGGREGATE — plain Python stats/selection, no LLM. Counting and
     averaging is something code does perfectly and cheaply; asking a
     model to do arithmetic over raw transcripts would be slower,
     costlier, and less reliable than just querying for it.
  3. SYNTHESIZE — ONE LLM call per agent (not per meeting) turns the
     aggregated facts into a short, specific, human-readable coaching
     plan or extracted technique. This is the only step that actually
     needs a model.
"""
from datetime import datetime, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import AsyncSessionLocal, Meeting, Agent
from db_coaching import WinningPattern
from nudge_engine import _call_ollama

GAP_ANALYSIS_WINDOW_DAYS       = 7
WINNING_PATTERN_WINDOW_DAYS    = 30
MIN_MEETINGS_FOR_GAP_ANALYSIS  = 2
WINNING_DEAL_HEALTH            = "hot"
WINNING_SCORE_THRESHOLD        = 80
MAX_WINNING_MEETINGS_PER_RUN   = 3

COACHING_SYSTEM_PROMPT = """You are a sales coaching lead reviewing one rep's recent call history \
to build them a short, specific improvement plan for the week ahead. Be concrete and encouraging, \
never generic. Respond ONLY with valid JSON, no markdown."""

COACHING_PROMPT_TEMPLATE = """Rep: {rep_name}
Meetings analyzed (last {days} days): {meeting_count}
Average coaching score: {avg_score}/100
Average agent talk ratio: {avg_talk_ratio}%

Recurring weak spots identified:
{weak_spots}

Real examples from their actual calls this week (objection + how they responded):
{examples}

Write a short coaching plan: 3-4 specific, actionable focus points for next week. Reference their \
real calls where useful ("last Tuesday, when the client said X..."). Be direct but supportive.

Respond with:
{{"plan": "<the coaching plan, plain text with line breaks between points>"}}
"""

WINNING_PATTERN_SYSTEM_PROMPT = """You are studying a WINNING sales call — this deal closed hot, \
and the coaching score was excellent. Your job is to extract the ONE specific technique or phrase \
this rep used that other reps on the team could learn from and reuse. Respond ONLY with valid JSON."""

WINNING_PATTERN_PROMPT_TEMPLATE = """This call scored {score}/100 with a HOT deal health outcome.

Transcript excerpt:
{transcript_excerpt}

Identify ONE specific, reusable technique this rep used — a phrase, a way of framing pricing, an \
objection response, a discovery question — something concrete enough that another rep could copy \
it in a similar moment.

Respond with:
{{"category": "objection_handling"|"discovery"|"closing"|"buying_signal", "technique": "<what they did, with the actual phrase/quote, in 2-3 sentences>"}}

Or, if nothing genuinely stands out as a reusable technique:
{{"category": null, "technique": null}}
"""


async def run_gap_analysis(agent_id: str) -> dict | None:
    since = datetime.utcnow() - timedelta(days=GAP_ANALYSIS_WINDOW_DAYS)

    async with AsyncSessionLocal() as db:
        agent_result = await db.execute(select(Agent).where(Agent.id == agent_id))
        agent = agent_result.scalar_one_or_none()
        if not agent:
            return None

        result = await db.execute(
            select(Meeting)
            .where(Meeting.user_id == agent_id)
            .where(Meeting.status == "done")
            .where(Meeting.created_at >= since)
        )
        meetings = result.scalars().all()

    if len(meetings) < MIN_MEETINGS_FOR_GAP_ANALYSIS:
        return None

    scores, talk_ratios, weak_examples = [], [], []
    for m in meetings:
        insights = m.insights or {}
        coaching = insights.get("coaching", {})
        score = coaching.get("overall_grade", {}).get("score_out_of_100")
        if score is not None:
            scores.append(score)
        talk_ratio = coaching.get("metrics", {}).get("agent_talk_ratio_percentage")
        if talk_ratio is not None:
            talk_ratios.append(talk_ratio)

        for obj in coaching.get("objections_handled", []):
            if obj.get("effectiveness_score_out_of_10", 10) < 6:
                weak_examples.append(
                    f"- Client: \"{obj.get('client_objection')}\" -> Rep said: \"{obj.get('agent_response')}\""
                )

    if not scores:
        return None

    avg_score = round(sum(scores) / len(scores), 1)
    avg_talk_ratio = round(sum(talk_ratios) / len(talk_ratios)) if talk_ratios else None

    weak_spots = []
    if avg_talk_ratio and avg_talk_ratio > 65:
        weak_spots.append(f"Talk ratio has been high (avg {avg_talk_ratio}% agent) — not leaving enough room for discovery.")
    if weak_examples:
        weak_spots.append(f"{len(weak_examples)} objection(s) this week scored below 6/10 in effectiveness.")
    if not weak_spots:
        return None

    prompt = COACHING_PROMPT_TEMPLATE.format(
        rep_name=agent.name,
        days=GAP_ANALYSIS_WINDOW_DAYS,
        meeting_count=len(meetings),
        avg_score=avg_score,
        avg_talk_ratio=avg_talk_ratio or "n/a",
        weak_spots="\n".join(f"- {w}" for w in weak_spots),
        examples="\n".join(weak_examples[:5]) or "(none)",
    )
    result = await _call_ollama(COACHING_SYSTEM_PROMPT, prompt, timeout=30.0)
    if not result or not result.get("plan"):
        return None

    return {
        "agent_id": agent_id,
        "period_start": since,
        "period_end": datetime.utcnow(),
        "meetings_analyzed": len(meetings),
        "avg_coaching_score": avg_score,
        "plan_text": result["plan"],
    }


async def run_winning_pattern_extraction(agent_id: str) -> list[dict]:
    since = datetime.utcnow() - timedelta(days=WINNING_PATTERN_WINDOW_DAYS)

    async with AsyncSessionLocal() as db:
        agent_result = await db.execute(select(Agent).where(Agent.id == agent_id))
        agent = agent_result.scalar_one_or_none()
        if not agent:
            return []

        result = await db.execute(
            select(Meeting)
            .where(Meeting.user_id == agent_id)
            .where(Meeting.status == "done")
            .where(Meeting.created_at >= since)
        )
        meetings = result.scalars().all()

    winners = []
    for m in meetings:
        insights = m.insights or {}
        deal_health = insights.get("meeting_intelligence", {}).get("deal_health", {}).get("score")
        score = insights.get("coaching", {}).get("overall_grade", {}).get("score_out_of_100")
        if deal_health == WINNING_DEAL_HEALTH and score and score >= WINNING_SCORE_THRESHOLD:
            winners.append((m, score))

    winners.sort(key=lambda pair: pair[1], reverse=True)
    winners = winners[:MAX_WINNING_MEETINGS_PER_RUN]

    owner_scope_id = agent.org_id or agent.id
    extracted = []

    for meeting, score in winners:
        transcript_excerpt = (meeting.transcript or "")[:3000]
        if not transcript_excerpt.strip():
            continue
        prompt = WINNING_PATTERN_PROMPT_TEMPLATE.format(score=score, transcript_excerpt=transcript_excerpt)
        result = await _call_ollama(WINNING_PATTERN_SYSTEM_PROMPT, prompt, timeout=30.0)
        if result and result.get("category") and result.get("technique"):
            extracted.append({
                "source_agent_id": agent_id,
                "source_meeting_id": meeting.id,
                "owner_scope_id": owner_scope_id,
                "category": result["category"],
                "technique": result["technique"],
            })

    return extracted


async def get_winning_patterns_block(owner_scope_id: str, db: AsyncSession) -> str:
    """
    Fetches this scope's most recent winning patterns, formatted as a
    text block ready to append to the context used by BOTH the live
    nudge system and the post-call Pass 2 analysis — this is the step
    that closes the loop: winners' techniques become part of what every
    future call gets coached against.
    """
    result = await db.execute(
        select(WinningPattern)
        .where(WinningPattern.owner_scope_id == owner_scope_id)
        .order_by(WinningPattern.created_at.desc())
        .limit(5)
    )
    patterns = result.scalars().all()
    if not patterns:
        return ""

    lines = [f"- [{p.category}] {p.technique}" for p in patterns]
    return "\nProven winning techniques from top-performing calls on this team:\n" + "\n".join(lines) + "\n"
