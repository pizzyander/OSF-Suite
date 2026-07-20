"""
nudge_triggers.py — cheap, instant pre-filters that decide whether a
transcript segment is even worth sending to the LLM for a nudge check.

This is deliberately dumb and fast (plain keyword/regex matching, no
model call) — its only job is to avoid running an LLM call on every
single sentence of a call, which would be both slow and expensive.
False positives are fine (the LLM call itself has final say and can
return {"nudge": false}); false negatives just mean an occasional missed
nudge, an acceptable tradeoff for keeping this cheap and instant.

Analogy: this is a smoke detector, not a fire investigator. It's not
trying to be right about WHY there's smoke — just fast enough to decide
"this is worth someone taking a closer look," and cheap enough to run
constantly without being a burden itself.

Worth revisiting later: replace with a small fine-tuned classifier if
keyword matching proves too noisy in real calls.
"""
import re

OBJECTION_PATTERNS = [
    r"\btoo expensive\b", r"\bcan'?t afford\b", r"\bnot in (the |our )?budget\b",
    r"\balready (have|use|using)\b", r"\bhappy with (our |the )?current\b",
    r"\bneed to think\b", r"\bnot sure (this|it)'?s (for|right for) us\b",
    r"\bget approval\b", r"\bconvince my\b", r"\bnot the right time\b",
    r"\btoo complicated\b", r"\bworried about\b", r"\bconcerned about\b",
    r"\bwhat if it doesn'?t\b", r"\bnot convinced\b", r"\bhesitant\b",
    r"\bcompetitor\b", r"\blooking at other\b",
]

BUYING_SIGNAL_PATTERNS = [
    r"\bsounds good\b", r"\bi like that\b", r"\bhow do we get started\b",
    r"\bwhat'?s the next step\b", r"\bwhen can we\b", r"\bhow soon\b",
    r"\bsign up\b", r"\bhow many seats\b", r"\b(free )?trial\b", r"\bpoc\b",
    r"\bproof of concept\b", r"\bwho else uses\b", r"\bcase stud(y|ies)\b",
    r"\bimplementation time\b", r"\bonboarding process\b", r"\bcontract\b",
    r"\bprocurement\b", r"\bpricing for (our|my) team\b",
]

# Compiled once at import time, not per call — regex compilation isn't
# free, and this runs on every single finalized segment during a live call.
_objection_re = re.compile("|".join(OBJECTION_PATTERNS), re.IGNORECASE)
_buying_signal_re = re.compile("|".join(BUYING_SIGNAL_PATTERNS), re.IGNORECASE)


def classify_segment(text: str) -> str | None:
    """
    Returns 'objection', 'buying_signal', or None. Checked in this order
    deliberately — a sentence that's ambiguous between the two ("I like
    it but it's expensive") is more useful to a rep as an objection flag
    (something to address) than a buying signal (something to celebrate).
    """
    if _objection_re.search(text):
        return "objection"
    if _buying_signal_re.search(text):
        return "buying_signal"
    return None