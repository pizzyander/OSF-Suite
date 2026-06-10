# ──────────────────────────────────────────────────────────────────────────────
#  Stage 1: Builder
#  Installs faster-whisper + API deps into a venv.
#  Model is NOT downloaded here — it's pulled at runtime from a mounted volume
#  or object storage, keeping the image lean.
# ──────────────────────────────────────────────────────────────────────────────
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 \
        python3.11-venv \
        python3-pip \
        ffmpeg \
        curl \
    --fix-missing \
    && rm -rf /var/lib/apt/lists/*

RUN python3.11 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# faster-whisper uses CTranslate2 — no PyTorch, ~2.5 GB lighter
# ctranslate2 ships its own CUDA kernels so no torch CUDA build needed
RUN pip install --upgrade pip && \
    pip install --no-cache-dir \
        faster-whisper==1.0.3 \
        fastapi==0.115.0 \
        uvicorn[standard]==0.30.6 \
        python-multipart==0.0.12 \
        boto3==1.34.0 \
        requests

# ──────────────────────────────────────────────────────────────────────────────
#  Stage 2: Runtime
#  Swap cudnn → plain runtime base (opt 3): saves ~500 MB.
#  Model weights come in via volume or MODEL_FETCH_* env vars (opt 2).
# ──────────────────────────────────────────────────────────────────────────────
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 \
        ffmpeg \
        curl \
    --fix-missing \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
COPY app/ ./app/

# Model weights land here — mount a volume or let the app fetch on startup
RUN mkdir -p /models && \
    useradd -m -u 1001 whisper && \
    chown -R whisper:whisper /app /models

USER whisper

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]