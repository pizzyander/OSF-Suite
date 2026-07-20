"""
nudge_engine.py — generates live, in-call coaching nudges for sales agents.

Two kinds of nudges, matching two different rhythms of a sales call:

  - EVENT nudges: fired the instant a single transcript segment matches a
    cheap keyword pre-filter (nudge_triggers.py) — objections and buying
    signals. These need to feel instant, so the prompt is kept tiny: one
    segment of text, not the whole call.

  - PERIODIC nudges: checked on a fixed timer against the WHOLE transcript
    so far — talk ratio, missing discovery questions, and whether the
    call is drifting toward its end with no next step locked in. These
    are slower-moving signals that don't make sense to evaluate
    sentence-by-sentence, so they run on their own clock instead.

Both share the same Ollama Cloud config your worker.py already uses —
same model, same auth pattern — just pointed at much smaller, much
faster prompts than the full Pass 1/Pass 2 analysis.
"""
import os
import json
import httpx

OLLAMA_URL     = os.getenv("OLLAMA_URL", "https://ollama.com")
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")
OLLAMA_MODEL   = os.getenv("OLLAMA_MODEL", "gpt-oss:20b-cloud")

OLLAMA_HEADERS = {"Authorization": f"Bearer {OLLAMA_API_KEY}"} if OLLAMA_API_KEY else {}

EVENT_SYSTEM_PROMPT = """You are a live sales call coach whispering a single, short suggestion \
into a sales agent's ear DURING an active call. You have one moment to help — be extremely \
concise. Respond ONLY with valid JSON, no markdown, no explanation outside the JSON."""

EVENT_PROMPT_TEMPLATE = """The client just said this during a live sales call:
"{segment_text}"

This was flagged as a possible {category}.
{context_block}
If this genuinely warrants a coaching nudge, respond with:
{{"nudge": true, "text": "<one short, specific, actionable sentence the agent can act on RIGHT NOW>"}}

If this is a false alarm and doesn't need a nudge, respond with:
{{"nudge": false}}
"""

PERIODIC_SYSTEM_PROMPT = """You are a live sales call coach checking in on how a call is going \
SO FAR, partway through an active call. You only speak up if there's something genuinely useful \
to flag right now. Respond ONLY with valid JSON, no markdown, no explanation outside the JSON."""

PERIODIC_PROMPT_TEMPLATE = """Here is the call so far:

{transcript_so_far}

Speaking time so far — Agent: {agent_pct}%, Client: {client_pct}%.
Call duration so far: {duration_minutes} minutes.
{context_block}
Check for ONE of these, in priority order, and only flag the single most useful one right now:
1. Talk ratio: is the agent dominating the conversation (agent over 65%)? If so, suggest they ask an open-ended question.
2. Discovery gaps: has budget, timeline, or decision-making process NOT been asked about yet, even though the call is well underway?
3. Closing: if the call sounds like it's wrapping up, has a clear next step (meeting, follow-up, contract) been proposed? If not, nudge the agent to lock one in.

Respond with:
{{"nudge": true, "category": "talk_ratio"|"discovery_gap"|"closing", "text": "<one short, specific, actionable sentence>"}}

Or, if none of these are worth flagging right now:
{{"nudge": false}}
"""


def _build_context_block(context_text: str) -> str:
    if not context_text or not context_text.strip():
        return ""
    trimmed = context_text[:1500]
    return f"\nCompany context (for accuracy — pricing, positioning, competitors):\n{trimmed}\n"


async def _call_ollama(system_prompt: str, prompt: str, timeout: float = 12.0) -> dict | None:
    """
    Shared low-level call — deliberately a SHORT timeout (12s), nothing
    like worker.py's Pass 2 analysis timeout (1500s). A nudge that
    arrives 10 seconds late is close to useless in a live call; better to
    silently skip it than hold up the pipeline waiting on a slow response.
    Any failure here — timeout, bad JSON, Ollama being down — degrades
    to "no nudge" rather than breaking the call itself.
    """
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                headers=OLLAMA_HEADERS,
                json={
                    "model": OLLAMA_MODEL,
                    "system": system_prompt,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                }
            )
        response.raise_for_status()
        outer = json.loads(response.text.strip().splitlines()[0])
        raw = outer.get("response", "{}")
        return json.loads(raw)
    except Exception as e:
        print(f"Nudge generation failed (non-fatal): {e}")
        return None


async def generate_event_nudge(category: str, segment_text: str, context_text: str) -> str | None:
    """category is 'objection' or 'buying_signal', from nudge_triggers.classify_segment()."""
    prompt = EVENT_PROMPT_TEMPLATE.format(
        segment_text=segment_text,
        category=category.replace("_", " "),
        context_block=_build_context_block(context_text),
    )
    result = await _call_ollama(EVENT_SYSTEM_PROMPT, prompt)
    if result and result.get("nudge") and result.get("text"):
        return result["text"]
    return None


async def generate_periodic_nudge(
    transcript_so_far: str,
    agent_pct: int,
    client_pct: int,
    duration_minutes: float,
    context_text: str,
) -> dict | None:
    trimmed_transcript = transcript_so_far[-4000:]

    prompt = PERIODIC_PROMPT_TEMPLATE.format(
        transcript_so_far=trimmed_transcript,
        agent_pct=agent_pct,
        client_pct=client_pct,
        duration_minutes=round(duration_minutes, 1),
        context_block=_build_context_block(context_text),
    )
    result = await _call_ollama(PERIODIC_SYSTEM_PROMPT, prompt)
    if result and result.get("nudge") and result.get("text"):
        return {"category": result.get("category", "general"), "text": result["text"]}
    return None