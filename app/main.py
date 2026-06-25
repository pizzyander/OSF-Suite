"""
Whisper transcription microservice (optimized + chunked)
----------------------------------------------------------
Opt 1: faster-whisper (CTranslate2) — no PyTorch, ~2.5 GB lighter, faster inference
Opt 2: model loaded from /models volume or fetched from S3/GCS on first startup
Opt 3: nvidia/cuda:12.4.1-runtime base (no cuDNN layer)
Opt 4: manual uploads are forced through 30s ffmpeg segments before transcription,
       so a single long recording is processed the same way as the live chunked flow.

POST /transcribe          – transcribe uploaded audio file in one pass (existing behavior)
POST /transcribe-chunked  – split into 30s ffmpeg segments, transcribe each chunk,
                             return chunks with GLOBAL timestamps + per-chunk audio refs
GET  /health               – liveness check
GET  /ready                – readiness check (503 until model is loaded)
"""

import logging
import os
import shutil
import subprocess
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

CHUNK_SECONDS = int(os.getenv("CHUNK_SECONDS", "30"))          # forced chunk size for manual uploads

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

    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        logger.warning(
            "ffmpeg/ffprobe not found on PATH — /transcribe-chunked will fail. "
            "Make sure the image installs ffmpeg."
        )

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


app = FastAPI(title="Whisper Transcription Service", version="3.0.0", lifespan=lifespan)

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


def split_into_chunks(source_path: str, out_dir: str, chunk_seconds: int) -> list[str]:
    """
    Force-split an audio file into fixed-duration segments using ffmpeg's
    segment muxer. Re-encodes to mono 16kHz PCM WAV per chunk — this avoids
    keyframe-alignment issues you'd get trying to stream-copy compressed
    formats like mp3/m4a at arbitrary cut points, and gives Whisper a
    consistent, fast-to-decode input regardless of the original codec.

    Returns chunk file paths in order (chunk_0000.wav, chunk_0001.wav, ...).
    The final chunk may be shorter than chunk_seconds (the remainder).
    """
    out_pattern = str(Path(out_dir) / "chunk_%04d.wav")

    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-i", source_path,
        "-f", "segment",
        "-segment_time", str(chunk_seconds),
        "-reset_timestamps", "1",   # each chunk's internal clock starts at 0
        "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
        out_pattern, "-y",
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg segment split failed: {result.stderr.strip()}")

    chunks = sorted(Path(out_dir).glob("chunk_*.wav"))
    if not chunks:
        raise RuntimeError("ffmpeg produced no chunks — check input file integrity")

    return [str(c) for c in chunks]


def get_audio_duration(path: str) -> float:
    """Read duration in seconds via ffprobe."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr.strip()}")
    return float(result.stdout.strip())


def transcribe_file(path: str, language, task, temperature, word_timestamps, beam_size):
    """Run faster-whisper on a single audio file path. Shared by both endpoints."""
    segments_gen, info = model.transcribe(
        path,
        language=language,
        task=task,
        temperature=temperature,
        word_timestamps=word_timestamps,
        beam_size=beam_size,
    )
    segments = list(segments_gen)  # consume generator while file handle context is alive
    return segments, info


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "model_loaded": model_loaded,
        "chunk_seconds": CHUNK_SECONDS,
        "ffmpeg_available": shutil.which("ffmpeg") is not None,
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
    """
    Single-pass transcription of a whole file. Used by the live recording flow,
    where the caller already sends short chunks as they're recorded.
    """
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
            segments, info = transcribe_file(
                tmp.name, language, task, temperature, word_timestamps, beam_size
            )
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


@app.post("/transcribe-chunked")
async def transcribe_chunked(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None, description="ISO-639-1 code, e.g. 'en'. Auto-detected if omitted."),
    task: str = Form("transcribe", description="'transcribe' or 'translate' (→ English)"),
    temperature: float = Form(0.0),
    word_timestamps: bool = Form(False),
    beam_size: int = Form(5, description="Beam search width. Lower = faster, less accurate."),
    chunk_seconds: int = Form(CHUNK_SECONDS, description="Override default chunk duration in seconds."),
):
    """
    Manual-upload path: a full meeting recording is force-split into
    fixed-duration chunks via ffmpeg BEFORE transcription, so a single long
    file never gets transcribed in one giant pass — it's processed
    chunk-by-chunk, in order, with the same chunk_seconds window every time.

    Each chunk is transcribed independently with faster-whisper. Segment
    timestamps from each chunk are offset by the chunk's position in the
    original file, so the returned segments use GLOBAL timestamps relative
    to the start of the original recording (not the start of each chunk).

    No diarization happens here — this endpoint only does split + transcribe.
    The caller (main.py) is responsible for concatenating chunks[].text (or
    using the flattened top-level text) into the meeting's transcript and
    handing it off to the usual SQS -> worker -> LLM analysis pipeline.

    Chunk audio files are temporary and deleted after the response is built;
    only transcribed text and timestamps are returned, never raw audio.
    """
    if not model_loaded:
        raise HTTPException(status_code=503, detail="Model not yet loaded")

    validate_upload(file)

    audio_bytes = await file.read()
    if len(audio_bytes) > MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_FILE_MB} MB limit",
        )
    if chunk_seconds <= 0:
        raise HTTPException(status_code=400, detail="chunk_seconds must be positive")

    suffix = Path(file.filename or "audio").suffix or ".wav"
    work_dir = tempfile.mkdtemp(prefix="osf_chunked_")

    try:
        source_path = str(Path(work_dir) / f"source{suffix}")
        with open(source_path, "wb") as f:
            f.write(audio_bytes)

        try:
            total_duration = get_audio_duration(source_path)
        except RuntimeError as exc:
            raise HTTPException(status_code=422, detail=f"Could not read audio file: {exc}")

        chunks_dir = str(Path(work_dir) / "chunks")
        Path(chunks_dir).mkdir(exist_ok=True)

        t_split0 = time.perf_counter()
        try:
            chunk_paths = split_into_chunks(source_path, chunks_dir, chunk_seconds)
        except RuntimeError as exc:
            raise HTTPException(status_code=422, detail=f"Audio splitting failed: {exc}")
        split_elapsed = time.perf_counter() - t_split0

        logger.info(
            f"Split '{file.filename}' ({total_duration:.1f}s) into "
            f"{len(chunk_paths)} chunks of {chunk_seconds}s in {split_elapsed:.2f}s"
        )

        out_chunks = []
        full_text_parts = []
        t_transcribe0 = time.perf_counter()

        for idx, chunk_path in enumerate(chunk_paths):
            chunk_offset = idx * chunk_seconds  # global start time of this chunk

            try:
                segments, info = transcribe_file(
                    chunk_path, language, task, temperature, word_timestamps, beam_size
                )
            except Exception as exc:
                logger.exception(f"Chunk {idx} transcription failed")
                raise HTTPException(
                    status_code=500,
                    detail=f"Transcription failed on chunk {idx} ({chunk_path}): {exc}",
                ) from exc

            chunk_text = " ".join(s.text.strip() for s in segments)
            full_text_parts.append(chunk_text)

            # Offset every segment timestamp by this chunk's position in the
            # original recording, so downstream consumers (diarization merge,
            # UI playback scrubbing) can treat the whole response as one
            # continuous timeline.
            global_segments = [
                {
                    "id": s_idx,
                    "start": round(chunk_offset + s.start, 3),
                    "end": round(chunk_offset + s.end, 3),
                    "text": s.text.strip(),
                    **({"words": [
                        {
                            "word": w.word,
                            "start": round(chunk_offset + w.start, 3),
                            "end": round(chunk_offset + w.end, 3),
                            "probability": round(w.probability, 3),
                        }
                        for w in (s.words or [])
                    ]} if word_timestamps else {}),
                }
                for s_idx, s in enumerate(segments)
            ]

            chunk_end = min(chunk_offset + chunk_seconds, total_duration)

            out_chunks.append({
                "chunk_index": idx,
                "chunk_start": round(chunk_offset, 3),
                "chunk_end": round(chunk_end, 3),
                "text": chunk_text,
                "language": info.language,
                "language_probability": round(info.language_probability, 3),
                "segments": global_segments,
            })

            logger.info(f"  chunk {idx} [{chunk_offset:.0f}s-{chunk_end:.0f}s] transcribed ({len(chunk_text)} chars)")

        transcribe_elapsed = time.perf_counter() - t_transcribe0

        return JSONResponse({
            "text": " ".join(full_text_parts).strip(),
            "audio_duration": round(total_duration, 3),
            "chunk_seconds": chunk_seconds,
            "chunk_count": len(out_chunks),
            "split_duration_seconds": round(split_elapsed, 3),
            "transcribe_duration_seconds": round(transcribe_elapsed, 3),
            "chunks": out_chunks,
            "model": MODEL_NAME,
            "task": task,
        })

    finally:
        # Always clean up temp files, even on error
        shutil.rmtree(work_dir, ignore_errors=True)