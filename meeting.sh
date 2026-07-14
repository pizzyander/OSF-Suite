#!/usr/bin/env bash
#
# meeting.sh — end-to-end test of the live transcription architecture, for
# running directly on the EC2 instance against the local docker-compose stack
# before deploying. Exercises: auth, context upload (embeddings), meeting
# creation, live WebSocket streaming (transcription + diarization), Redis
# state (before/during/after), and the final LLM analysis (inference).
#
# Usage:
#   ./meeting.sh path/to/sample_call.mp3
#
# Optional overrides via environment variables:
#   BASE_URL       (default: http://localhost)
#   TEST_EMAIL     (default: test@example.com)
#   TEST_PASSWORD  (default: TestPassword123)
#   REDIS_CMD      (default: "docker compose exec -T redis redis-cli")
#
# Requires on this machine (the EC2 host, not inside the containers):
#   curl, jq, python3 (`pip3 install websockets --break-system-packages`), ffmpeg

set -uo pipefail
# Deliberately NOT using `set -e` here — several steps (like the login
# attempt) are EXPECTED to fail on a first run and get retried by hand
# below; `-e` would kill the script at the first expected failure instead
# of letting the fallback logic run.

BASE_URL="${BASE_URL:-http://localhost}"
EMAIL="${TEST_EMAIL:-test@example.com}"
PASSWORD="${TEST_PASSWORD:-TestPassword123}"
REDIS_CMD="${REDIS_CMD:-docker compose exec -T redis redis-cli}"
AUDIO_FILE="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

section() { echo -e "\n=== $1 ==="; }

# ── Preflight checks ────────────────────────────────────────────────────────
if [ -z "$AUDIO_FILE" ]; then
  echo "Usage: ./meeting.sh path/to/sample_call.mp3"
  exit 1
fi
if [ ! -f "$AUDIO_FILE" ]; then
  echo "ERROR: audio file not found: $AUDIO_FILE"
  exit 1
fi
for tool in curl jq python3 ffmpeg; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR: required tool '$tool' not found on PATH."
    exit 1
  fi
done

# ── 1. Authenticate ──────────────────────────────────────────────────────────
section "Authenticating"
login() {
  curl -s -X POST "$BASE_URL/agents/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
}

RESPONSE=$(login)
ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token // empty')

if [ -z "$ACCESS_TOKEN" ]; then
  echo "Login failed — attempting to register a new test account..."
  curl -s -X POST "$BASE_URL/agents/register" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Test Agent\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > /dev/null
  RESPONSE=$(login)
  ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token // empty')
fi

if [ -z "$ACCESS_TOKEN" ]; then
  echo "ERROR: could not authenticate. Last response:"
  echo "$RESPONSE"
  exit 1
fi
echo "Access token acquired"

# ── 2. Upload sample company context (exercises extraction + embeddings) ────
section "Uploading sample company context (RAG/embedding test)"
CONTEXT_TEXT="Our product, OSF-Suite, is an AI sales coaching platform priced at \$99/month per seat with a 14-day free trial. Our main competitor is Gong.io. We emphasize our self-hosted, privacy-first architecture as a key differentiator."
curl -s -X POST "$BASE_URL/agents/context/text" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{\"text\":\"$CONTEXT_TEXT\"}" | jq .

# ── 3. Start a meeting ───────────────────────────────────────────────────────
section "Starting meeting"
START_RESPONSE=$(curl -s -X POST "$BASE_URL/meetings/start" -H "Authorization: Bearer $ACCESS_TOKEN")
MEETING_ID=$(echo "$START_RESPONSE" | jq -r '.meeting_id // empty')
if [ -z "$MEETING_ID" ]; then
  echo "ERROR: could not start meeting. Response: $START_RESPONSE"
  exit 1
fi
echo "Meeting ID: $MEETING_ID"

# ── 4. Redis state at meeting start ─────────────────────────────────────────
section "Redis state at meeting start"
$REDIS_CMD HGETALL "meeting:$MEETING_ID"

# ── 5. Stream audio over the live WebSocket ─────────────────────────────────
section "Streaming audio over live WebSocket ($AUDIO_FILE)"
WS_BASE=$(echo "$BASE_URL" | sed -e 's#^https#wss#' -e 's#^http#ws#')
ENCODED_TOKEN=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$ACCESS_TOKEN")
WS_URL="$WS_BASE/meetings/$MEETING_ID/live?token=$ENCODED_TOKEN"

python3 "$SCRIPT_DIR/test_live_meeting.py" --ws-url "$WS_URL" --audio-file "$AUDIO_FILE"

# ── 6. Poll for analysis (inference) results ────────────────────────────────
section "Polling for analysis results"
RESULT=""
for i in $(seq 1 30); do
  RESULT=$(curl -s "$BASE_URL/meetings/$MEETING_ID/results" -H "Authorization: Bearer $ACCESS_TOKEN")
  STATUS=$(echo "$RESULT" | jq -r '.status // "unknown"')
  echo "  [poll $i] status=$STATUS"
  if [ "$STATUS" = "done" ] || [ "$STATUS" = "failed" ]; then
    break
  fi
  sleep 5
done

section "Final transcript"
echo "$RESULT" | jq -r '.transcript // "(no transcript)"'

section "Inference output (meeting_intelligence + coaching)"
echo "$RESULT" | jq '.insights // {}'

# ── 7. Redis state after finalize (segments/heartbeat should be gone) ──────
section "Redis state after finalize"
echo "-- meeting hash --"
$REDIS_CMD HGETALL "meeting:$MEETING_ID"
echo "-- live_segments (should be empty — proves cleanup ran) --"
$REDIS_CMD LRANGE "meeting:$MEETING_ID:live_segments" 0 -1
echo "-- live_heartbeat exists? (should print 0) --"
$REDIS_CMD EXISTS "meeting:$MEETING_ID:live_heartbeat"

# ── 8. Confirm stored context (proves extraction + embedding ingestion ran) ─
section "Stored company context"
curl -s "$BASE_URL/agents/context" -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

section "Test complete"