import httpx, os, json
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

WHISPER_URL  = os.getenv("WHISPER_URL", "http://whisper:8000")
OLLAMA_URL   = os.getenv("OLLAMA_URL", "http://ollama:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

app = FastAPI(title="Sales Insights Service", version="1.0.0")

SYSTEM_PROMPT = """
You are an expert sales intelligence analyst. Given a meeting transcript, 
extract structured insights to help a sales agent understand their client 
and close deals. Respond ONLY with valid JSON, no explanation, no markdown.
"""

USER_PROMPT = """
Analyze this sales meeting transcript and return a JSON object with exactly 
these fields:

{
  "summary": "2-3 sentence overview of the meeting",
  "action_items": [
    {"owner": "agent|client", "task": "...", "deadline": "...or null"}
  ],
  "client_pain_points": ["..."],
  "objections_raised": [
    {"objection": "...", "how_handled": "...or null"}
  ],
  "buying_signals": ["..."],
  "deal_health": {
    "score": "hot|warm|cold",
    "reasoning": "...",
    "next_steps": ["..."]
  },
  "client_personality": {
    "communication_style": "...",
    "decision_making": "...",
    "key_motivators": ["..."]
  },
  "calendar_schedule": [
    {"event": "...", "suggested_date": "...or null", "participants": ["..."]}
  ],
  "intelligence_insights": ["..."]
}

TRANSCRIPT:
{transcript}
"""

async def transcribe(file: UploadFile) -> str:
    async with httpx.AsyncClient(timeout=300) as client:
        response = await client.post(
            f"{WHISPER_URL}/transcribe",
            files={"file": (file.filename, await file.read(), file.content_type)},
            data={"language": "en"}
        )
    response.raise_for_status()
    return response.json()["text"]


async def analyze(transcript: str) -> dict:
    prompt = USER_PROMPT.replace("{transcript}", transcript)
    async with httpx.AsyncClient(timeout=300) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "system": SYSTEM_PROMPT,
                "prompt": prompt,
                "stream": False,
                "format": "json"        # Ollama JSON mode — forces valid JSON output
            }
        )
    response.raise_for_status()
    raw = response.json()["response"]
    return json.loads(raw)


@app.post("/analyze")
async def analyze_meeting(file: UploadFile = File(...)):
    """Upload a meeting audio file — get back full sales intelligence."""
    try:
        transcript = await transcribe(file)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Transcription failed: {e}")

    try:
        insights = await analyze(transcript)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Analysis failed: {e}")

    return JSONResponse({"transcript": transcript, "insights": insights})


@app.post("/analyze-text")
async def analyze_text(payload: dict):
    """Send transcript text directly if you already have it."""
    transcript = payload.get("transcript", "")
    if not transcript:
        raise HTTPException(status_code=400, detail="transcript field required")
    insights = await analyze(transcript)
    return JSONResponse({"insights": insights})


@app.get("/health")
def health():
    return {"status": "ok"}