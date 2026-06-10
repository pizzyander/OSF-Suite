"""
Whisper transcription microservice (optimized)
-----------------------------------------------
Opt 1: faster-whisper (CTranslate2) — no PyTorch, ~2.5 GB lighter, faster inference
Opt 2: model loaded from /models volume or fetched from S3/GCS on first startup
Opt 3: nvidia/cuda:12.4.1-runtime base (no cuDNN layer)

POST /transcribe   – transcribe uploaded audio file
GET  /health       – liveness check
GET  /ready        – readiness check (503 until model is loaded)
"""

import logging
import os
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from faster_whisper import WhisperModel
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_NAME    = os.getenv("WHISPER_MODEL", "base")
DEVICE        = os.getenv("WHISPER_DEVICE", "cuda")
COMPUTE_TYPE  = os.getenv("WHISPER_COMPUTE_TYPE", "float16")   # float16 | int8_float16 | int8
MAX_FILE_MB   = int(os.getenv("MAX_FILE_MB", "50"))
MODEL_DIR     = os.getenv("MODEL_DIR", "/models")              # volume mount path



# Optional: pull model from S3 on startup if not present on disk
# Set MODEL_FETCH_BUCKET + MODEL_FETCH_KEY to enable, or leave blank to
# rely on faster-whisper's built-in HuggingFace download as fallback.
S3_BUCKET     = os.getenv("MODEL_FETCH_BUCKET", "")
S3_KEY        = os.getenv("MODEL_FETCH_KEY", "")              # e.g. "whisper/base"

# ── App state ─────────────────────────────────────────────────────────────────
model: Optional[WhisperModel] = None
model_loaded = False


def _resolve_model_path() -> str:
    """
    Resolution order:
      1. /models/<MODEL_NAME>  — pre-populated volume (fastest cold start)
      2. S3 fetch              — pull tar.gz from S3_BUCKET/S3_KEY into /models
      3. HuggingFace download  — faster-whisper falls back to HF if given a name
    Returns the path or model name to pass to WhisperModel().
    """
    local_path = Path(MODEL_DIR) / MODEL_NAME
    if local_path.exists():
        logger.info(f"Using model from volume: {local_path}")
        return str(local_path)

    if S3_BUCKET and S3_KEY:
        logger.info(f"Fetching model from s3://{S3_BUCKET}/{S3_KEY} …")
        import tarfile
        import boto3

        s3 = boto3.client("s3")
        archive = Path(MODEL_DIR) / "model.tar.gz"
        Path(MODEL_DIR).mkdir(parents=True, exist_ok=True)
        s3.download_file(S3_BUCKET, S3_KEY, str(archive))

        with tarfile.open(archive) as tf:
            tf.extractall(MODEL_DIR)
        archive.unlink()

        extracted = local_path if local_path.exists() else Path(MODEL_DIR)
        logger.info(f"Model extracted to {extracted}")
        return str(extracted)

    # Fall back: let faster-whisper pull from HuggingFace Hub
    logger.info(f"No local model found — downloading '{MODEL_NAME}' from HuggingFace Hub …")
    return MODEL_NAME


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, model_loaded

    model_path = _resolve_model_path()
    logger.info(f"Loading faster-whisper model | device={DEVICE} compute={COMPUTE_TYPE}")
    t0 = time.perf_counter()

    model = WhisperModel(
        model_path,
        device=DEVICE,
        compute_type=COMPUTE_TYPE,
        download_root=MODEL_DIR,
        num_workers=1,
    )
    model_loaded = True
    logger.info(f"Model ready in {time.perf_counter() - t0:.2f}s")
    yield
    model = None


app = FastAPI(title="Whisper Transcription Service", version="2.0.0", lifespan=lifespan)

# ── Helpers ───────────────────────────────────────────────────────────────────
SUPPORTED_EXTENSIONS = {
    ".mp3", ".mp4", ".mpeg", ".mpga", ".m4a",
    ".wav", ".webm", ".ogg", ".flac",
}


def validate_upload(file: UploadFile) -> None:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{suffix}'. "
                   f"Accepted: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "model_loaded": model_loaded,
    }


@app.get("/ready")
def ready():
    if not model_loaded:
        raise HTTPException(status_code=503, detail="Model not yet loaded")
    return {"status": "ready"}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None, description="ISO-639-1 code, e.g. 'en'. Auto-detected if omitted."),
    task: str = Form("transcribe", description="'transcribe' or 'translate' (→ English)"),
    temperature: float = Form(0.0),
    word_timestamps: bool = Form(False),
    beam_size: int = Form(5, description="Beam search width. Lower = faster, less accurate."),
):
    if not model_loaded:
        raise HTTPException(status_code=503, detail="Model not yet loaded")

    validate_upload(file)

    audio_bytes = await file.read()
    if len(audio_bytes) > MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_FILE_MB} MB limit",
        )

    suffix = Path(file.filename or "audio").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(audio_bytes)
        tmp.flush()

        t0 = time.perf_counter()
        try:
            segments_gen, info = model.transcribe(
                tmp.name,
                language=language,
                task=task,
                temperature=temperature,
                word_timestamps=word_timestamps,
                beam_size=beam_size,
            )
            segments = list(segments_gen)   # consume the generator while tmp file is open
        except Exception as exc:
            logger.exception("Transcription failed")
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    elapsed = time.perf_counter() - t0
    full_text = " ".join(s.text.strip() for s in segments)

    logger.info(
        f"Transcribed '{file.filename}' ({len(audio_bytes) / 1024:.1f} KB) "
        f"in {elapsed:.2f}s | lang={info.language} ({info.language_probability:.0%})"
    )

    out_segments = [
        {
            "id": i,
            "start": round(s.start, 3),
            "end": round(s.end, 3),
            "text": s.text.strip(),
            **({"words": [
                {"word": w.word, "start": round(w.start, 3), "end": round(w.end, 3), "probability": round(w.probability, 3)}
                for w in (s.words or [])
            ]} if word_timestamps else {}),
        }
        for i, s in enumerate(segments)
    ]

    return JSONResponse({
        "text": full_text,
        "language": info.language,
        "language_probability": round(info.language_probability, 3),
        "duration_seconds": round(elapsed, 3),
        "audio_duration": round(info.duration, 3),
        "segments": out_segments,
        "model": MODEL_NAME,
        "task": task,
    })