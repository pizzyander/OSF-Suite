#!/usr/bin/env bash
#
# test_whisper_chunking.sh
#
# Smoke-tests the Whisper service's new chunked-transcription endpoint in
# isolation — no main.py, no S3, no SQS, no auth. Confirms that:
#
#   1. The service is reachable and the model is loaded (/health, /ready)
#   2. A test audio file gets force-split into the expected number of
#      fixed-duration chunks
#   3. Each chunk is transcribed and returned with correctly offset,
#      continuous global timestamps (no gaps, no overlaps, no resets)
#   4. /transcribe (the original single-pass endpoint) still works,
#      as a regression check that nothing broke
#
# Usage:
#   ./test_whisper_chunking.sh                       # generates synthetic audio
#   ./test_whisper_chunking.sh /path/to/real_audio.mp3   # uses your own file
#
# Env vars (all optional):
#   WHISPER_URL      http://localhost:8000
#   AUDIO_FILE        (alternative to passing a path as $1)
#   TEST_DURATION    75      (seconds of SYNTHETIC audio to generate, ignored if AUDIO_FILE/$1 is set)
#   CHUNK_SECONDS    30      (chunk size to request)
#
set -uo pipefail

WHISPER_URL="${WHISPER_URL:-http://localhost:8000}"
TEST_DURATION="${TEST_DURATION:-75}"
CHUNK_SECONDS="${CHUNK_SECONDS:-30}"
USER_AUDIO_FILE="${AUDIO_FILE:-${1:-}}"

WORK_DIR="$(mktemp -d)"
CHUNKED_RESPONSE="${WORK_DIR}/chunked_response.json"
SINGLE_RESPONSE="${WORK_DIR}/single_response.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PASS_COUNT=0
FAIL_COUNT=0

cleanup() {
    rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

# ── Helpers ──────────────────────────────────────────────────────────────────

step() {
    echo ""
    echo "── $1"
}

pass() {
    echo "  PASS: $1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
    echo "  FAIL: $1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}

require_tool() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Required tool '$1' not found on PATH. Install it and re-run."
        exit 1
    fi
}

# Uploads a file via curl -F, reading it through stdin redirection instead of
# curl's native @path resolution. This sidesteps a Git Bash / MSYS bug where
# curl's -F "file=@/some/path;type=..." can fail with
# "curl: (26) Failed to open/read local data from file/application" even
# though the exact same path opens fine with plain shell redirection — MSYS's
# path-rewriting layer and curl's own @-path handling don't always agree on
# mixed POSIX/Windows paths. Reading via `< file` is a plain fd, which both
# Git Bash and native Linux handle identically, avoiding the mismatch.
curl_upload_file() {
    local url="$1" out_file="$2" filepath="$3" content_type="$4"
    shift 4
    local extra_fields=("$@")

    local filename
    filename="$(basename "${filepath}")"
    curl -s -o "${out_file}" -w "%{http_code}" \
        -X POST "${url}" \
        -F "file=@-;filename=${filename};type=${content_type}" \
        "${extra_fields[@]}" \
        < "${filepath}"
}

# ── Preflight ────────────────────────────────────────────────────────────────

echo "=========================================================="
echo " Whisper chunked-transcription integration test"
echo "=========================================================="
echo "  WHISPER_URL    = ${WHISPER_URL}"
echo "  CHUNK_SECONDS  = ${CHUNK_SECONDS}s"
echo "  WORK_DIR       = ${WORK_DIR}"

require_tool curl
require_tool ffmpeg
require_tool ffprobe

# Auto-detect a working Python interpreter. We can't just check for the
# existence of "python3" on PATH — on Windows, "python3" commonly resolves
# to the Microsoft Store's execution-alias stub, which exists as a command
# but errors out instead of running anything. We confirm an interpreter
# actually WORKS by running --version, not just that the name resolves.
PYTHON_BIN=""
for candidate in python3 python; do
    if command -v "${candidate}" >/dev/null 2>&1; then
        if "${candidate}" --version >/dev/null 2>&1; then
            PYTHON_BIN="${candidate}"
            break
        fi
    fi
done
if [ -z "${PYTHON_BIN}" ]; then
    echo "No working Python interpreter found (tried: python3, python)."
    echo "On Windows, 'python3' may resolve to the Microsoft Store stub instead"
    echo "of a real interpreter. Install Python from python.org, or disable the"
    echo "stub at Settings > Apps > Advanced app settings > App execution aliases."
    exit 1
fi

if [ -n "${USER_AUDIO_FILE}" ]; then
    step "0. Using your provided audio file"
    if [ ! -f "${USER_AUDIO_FILE}" ]; then
        fail "File not found: ${USER_AUDIO_FILE}"
        exit 1
    fi
    TEST_AUDIO="${USER_AUDIO_FILE}"
    TEST_DURATION="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${TEST_AUDIO}" 2>/dev/null)"
    if [ -z "${TEST_DURATION}" ]; then
        fail "Could not read duration from ${TEST_AUDIO} — is this a valid audio file?"
        exit 1
    fi
    pass "Using ${TEST_AUDIO} (duration: ${TEST_DURATION}s)"
else
    step "0. Generating synthetic test audio (${TEST_DURATION}s sine tone)"
    TEST_AUDIO="${WORK_DIR}/test_audio.wav"
    if ffmpeg -hide_banner -loglevel error \
        -f lavfi -i "sine=frequency=440:duration=${TEST_DURATION}" \
        -ar 16000 -ac 1 "${TEST_AUDIO}" -y; then
        pass "Generated ${TEST_AUDIO}"
    else
        fail "ffmpeg failed to generate test audio — aborting"
        exit 1
    fi
fi

# ── 1. Health checks ─────────────────────────────────────────────────────────

step "1. Checking service health"

HEALTH_HTTP_CODE=$(curl -s -o "${WORK_DIR}/health.json" -w "%{http_code}" "${WHISPER_URL}/health")
if [ "${HEALTH_HTTP_CODE}" = "200" ]; then
    pass "GET /health returned 200"
    cat "${WORK_DIR}/health.json"
    echo ""
else
    fail "GET /health returned ${HEALTH_HTTP_CODE} (expected 200) — is the Whisper container running and is WHISPER_URL correct?"
    echo ""
    echo "Aborting: cannot continue without a reachable service."
    exit 1
fi

READY_HTTP_CODE=$(curl -s -o "${WORK_DIR}/ready.json" -w "%{http_code}" "${WHISPER_URL}/ready")
if [ "${READY_HTTP_CODE}" = "200" ]; then
    pass "GET /ready returned 200 (model loaded)"
else
    fail "GET /ready returned ${READY_HTTP_CODE} (expected 200) — model may still be loading. Wait and retry."
    exit 1
fi

# ── 2. Chunked transcription ─────────────────────────────────────────────────

step "2. POST /transcribe-chunked (${TEST_DURATION}s audio, ${CHUNK_SECONDS}s chunks)"

T0=$(date +%s)
HTTP_CODE=$(curl_upload_file \
    "${WHISPER_URL}/transcribe-chunked" \
    "${CHUNKED_RESPONSE}" \
    "${TEST_AUDIO}" \
    "audio/wav" \
    --max-time 600 \
    -F "language=en" \
    -F "word_timestamps=false" \
    -F "chunk_seconds=${CHUNK_SECONDS}")
T1=$(date +%s)
ELAPSED=$((T1 - T0))

if [ "${HTTP_CODE}" = "200" ]; then
    pass "POST /transcribe-chunked returned 200 in ${ELAPSED}s"
else
    fail "POST /transcribe-chunked returned ${HTTP_CODE} (expected 200)"
    echo "  Response body:"
    cat "${CHUNKED_RESPONSE}"
    echo ""
fi

if [ "${HTTP_CODE}" = "200" ]; then
    step "3. Validating chunk math and timestamp continuity"
    if "${PYTHON_BIN}" "${SCRIPT_DIR}/_assert_chunks.py" "${CHUNKED_RESPONSE}" "${TEST_DURATION}" "${CHUNK_SECONDS}"; then
        pass "Chunk count, boundaries, and global timestamp offsets are all correct"
    else
        fail "Chunk validation failed — see output above"
    fi

    step "4. Spot-checking response contents"
    "${PYTHON_BIN}" - "${CHUNKED_RESPONSE}" <<'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
print(f"  text length        : {len(data.get('text', ''))} chars")
print(f"  chunk_count         : {data.get('chunk_count')}")
print(f"  audio_duration      : {data.get('audio_duration')}s")
print(f"  split_duration      : {data.get('split_duration_seconds')}s")
print(f"  transcribe_duration : {data.get('transcribe_duration_seconds')}s")
print(f"  model               : {data.get('model')}")
for c in data.get("chunks", []):
    print(f"    chunk {c['chunk_index']}: [{c['chunk_start']}s - {c['chunk_end']}s]  text_len={len(c.get('text',''))}")
PYEOF
else
    echo "  Skipping chunk validation — endpoint did not return 200"
fi

# ── 3. Regression check: original /transcribe still works ──────────────────

step "5. POST /transcribe (regression check — single-pass endpoint unaffected)"

HTTP_CODE_SINGLE=$(curl_upload_file \
    "${WHISPER_URL}/transcribe" \
    "${SINGLE_RESPONSE}" \
    "${TEST_AUDIO}" \
    "audio/wav" \
    --max-time 600 \
    -F "language=en")

if [ "${HTTP_CODE_SINGLE}" = "200" ]; then
    pass "POST /transcribe still returns 200 (existing live-recording flow unaffected)"
else
    fail "POST /transcribe returned ${HTTP_CODE_SINGLE} (expected 200) — possible regression"
    cat "${SINGLE_RESPONSE}"
    echo ""
fi

# ── 4. Edge case: malformed/empty file should fail gracefully, not hang ────

step "6. Edge case — corrupt file should be rejected with 4xx, not hang or 500-crash"

echo "this is not real audio data" > "${WORK_DIR}/garbage.wav"
HTTP_CODE_GARBAGE=$(curl_upload_file \
    "${WHISPER_URL}/transcribe-chunked" \
    "${WORK_DIR}/garbage_response.json" \
    "${WORK_DIR}/garbage.wav" \
    "audio/wav" \
    --max-time 30 \
    -F "chunk_seconds=${CHUNK_SECONDS}")

if [ "${HTTP_CODE_GARBAGE}" = "422" ] || [ "${HTTP_CODE_GARBAGE}" = "400" ]; then
    pass "Corrupt file correctly rejected with ${HTTP_CODE_GARBAGE}"
elif [ "${HTTP_CODE_GARBAGE}" = "000" ]; then
    fail "Request timed out or connection failed — service may have hung on bad input"
else
    fail "Corrupt file returned unexpected status ${HTTP_CODE_GARBAGE} (expected 400 or 422)"
    cat "${WORK_DIR}/garbage_response.json"
    echo ""
fi

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "=========================================================="
echo " RESULTS: ${PASS_COUNT} passed, ${FAIL_COUNT} failed"
echo "=========================================================="

if [ "${FAIL_COUNT}" -gt 0 ]; then
    exit 1
fi
exit 0