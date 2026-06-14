import os, io, tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from pyannote.audio import Pipeline
import torch

HF_TOKEN = os.getenv("HF_TOKEN", "")
NUM_SPEAKERS = int(os.getenv("NUM_SPEAKERS", "2"))

app = FastAPI(title="OSF Diarization Service", version="1.0.0")

pipeline = None


@app.on_event("startup")
async def startup():
    global pipeline
    print("Loading diarization pipeline...")
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=HF_TOKEN
    )
    pipeline.to(torch.device("cpu"))
    print("Diarization pipeline ready")


@app.post("/diarize")
async def diarize(file: UploadFile = File(...)):
    """
    Accepts audio file, returns speaker segments.
    Output: [{"speaker": "SPEAKER_00", "start": 0.0, "end": 3.5}, ...]
    """
    if not pipeline:
        raise HTTPException(status_code=503, detail="Pipeline not loaded")

    audio_bytes = await file.read()

    with tempfile.NamedTemporaryFile(suffix=".ogg", delete=True) as tmp:
        tmp.write(audio_bytes)
        tmp.flush()

        diarization = pipeline(
            tmp.name,
            num_speakers=NUM_SPEAKERS
        )

    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append({
            "speaker": speaker,
            "start": round(turn.start, 3),
            "end": round(turn.end, 3)
        })

    # Map SPEAKER_00 to Agent, SPEAKER_01 to Client
    speaker_map = {}
    for seg in segments:
        if seg["speaker"] not in speaker_map:
            if len(speaker_map) == 0:
                speaker_map[seg["speaker"]] = "Agent"
            else:
                speaker_map[seg["speaker"]] = "Client"

    for seg in segments:
        seg["role"] = speaker_map.get(seg["speaker"], "Unknown")

    return JSONResponse({
        "segments": segments,
        "speaker_map": speaker_map,
        "total_segments": len(segments)
    })


@app.get("/health")
def health():
    return {"status": "ok", "pipeline_loaded": pipeline is not None}