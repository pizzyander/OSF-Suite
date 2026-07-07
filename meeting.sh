#!/bin/bash

# Stop on errors
set -e

# Default parameters
BASE_URL="http://localhost:80"
POLL_INTERVAL_SECONDS=15
MAX_POLL_ATTEMPTS=60

# Parse named arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -AudioFile) AUDIO_FILE="$2"; shift ;;
        -Email) EMAIL="$2"; shift ;;
        -Password) PASSWORD="$2"; shift ;;
        -BaseUrl) BASE_URL="$2"; shift ;;
        -PollIntervalSeconds) POLL_INTERVAL_SECONDS="$2"; shift ;;
        -MaxPollAttempts) MAX_POLL_ATTEMPTS="$2"; shift ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

if [[ -z "$AUDIO_FILE" || -z "$EMAIL" || -z "$PASSWORD" ]]; then
    echo "Usage: ./meeting.sh -AudioFile \"/path/to/audio.ogg\" -Email \"user@company.com\" -Password \"pass\""
    exit 1
fi

# Check for dependencies
if ! command -v jq &> /dev/null; then
    echo -e "\e[31mFAILED\e[0m jq is not installed. Run: sudo apt install jq"
    exit 1
fi

# ── Formatting Helpers ────────────────────────────────────────────────────────
STEP_NUM=0
write_step() { ((STEP_NUM++)); echo -e "\n\e[36m[$STEP_NUM] $1\e[0m"; }
write_success() { echo -e "    \e[32mOK\e[0m  $1"; }
write_info() { echo -e "    \e[37m..\e[0m  $1"; }
write_warn() { echo -e "    \e[33m!!\e[0m  $1"; }
write_fail() { echo -e "    \e[31mFAILED\e[0m  $1"; }
write_section() { 
    echo -e "\n\e[35m=================================================="
    echo -e "  $1"
    echo -e "==================================================\e[0m"
}

# ── Auth Helper ───────────────────────────────────────────────────────────────
get_fresh_token() {
    local email=$1
    local password=$2
    local base_url=$3
    
    local response
    response=$(curl -s -X POST "$base_url/agents/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$password\"}")
        
    echo "$response" | jq -r '.access_token // empty'
}

START_TIME=$(date +%s)
echo -e "\n\e[97mOSF-Suite Meeting Test\e[0m"
echo -e "\e[37mAudio  : $AUDIO_FILE\e[0m"
echo -e "\e[37mEmail  : $EMAIL\e[0m"
echo -e "\e[37mAPI    : $BASE_URL\e[0m"
echo -e "\e[37mTime   : $(date +"%Y-%m-%d %H:%M:%S")\e[0m"

# ── Step 1: Validate audio file ───────────────────────────────────────────────
write_step "Validating audio file"

if [[ ! -f "$AUDIO_FILE" ]]; then
    write_fail "File not found: $AUDIO_FILE"
    exit 1
fi

FILE_SIZE_BYTES=$(stat -c%s "$AUDIO_FILE")
FILE_SIZE_MB=$(awk "BEGIN {printf \"%.2f\", $FILE_SIZE_BYTES / 1048576}")
FILE_NAME=$(basename "$AUDIO_FILE")
FILE_EXT="${FILE_NAME##*.}"

write_success "File found: $FILE_NAME"
write_info "Size: $FILE_SIZE_MB MB | Extension: $FILE_EXT"

if (( $(echo "$FILE_SIZE_MB > 50" | bc -l) )); then
    write_warn "File is $FILE_SIZE_MB MB — exceeds 50 MB limit, upload may fail"
fi

# ── Step 2: Login ─────────────────────────────────────────────────────────────
write_step "Authenticating as $EMAIL"

TOKEN=$(get_fresh_token "$EMAIL" "$PASSWORD" "$BASE_URL")

if [[ -z "$TOKEN" ]]; then
    write_fail "Login failed — check email/password and that insights service is running"
    exit 1
fi

# Set token expiry (470 mins in seconds = 28200)
TOKEN_EXPIRY=$(($(date +%s) + 28200))
write_success "Authenticated successfully"
write_info "Token expires at: $(date -d "@$TOKEN_EXPIRY" +"%H:%M:%S")"

# ── Step 3: Start meeting ─────────────────────────────────────────────────────
write_step "Creating meeting"

START_RESPONSE=$(curl -s -X POST "$BASE_URL/meetings/start" \
    -H "Authorization: Bearer $TOKEN")

MEETING_ID=$(echo "$START_RESPONSE" | jq -r '.meeting_id // empty')

if [[ -z "$MEETING_ID" ]]; then
    write_fail "Failed to start meeting: $START_RESPONSE"
    exit 1
fi

write_success "Meeting created"
write_info "Meeting ID: $MEETING_ID"

# ── Step 4: Get presigned S3 URL ──────────────────────────────────────────────
write_step "Getting S3 presigned upload URL"

if [[ $(date +%s) -gt $TOKEN_EXPIRY ]]; then
    write_warn "Token expired — refreshing"
    TOKEN=$(get_fresh_token "$EMAIL" "$PASSWORD" "$BASE_URL")
    TOKEN_EXPIRY=$(($(date +%s) + 28200))
fi

# URL Encode the filename using jq
ENCODED_FILENAME=$(jq -rn --arg x "$FILE_NAME" '$x|@uri')

UPLOAD_RESPONSE=$(curl -s "$BASE_URL/meetings/$MEETING_ID/upload-url?filename=$ENCODED_FILENAME" \
    -H "Authorization: Bearer $TOKEN")

UPLOAD_URL=$(echo "$UPLOAD_RESPONSE" | jq -r '.upload_url // empty')
S3_KEY=$(echo "$UPLOAD_RESPONSE" | jq -r '.s3_key // empty')

if [[ -z "$UPLOAD_URL" ]]; then
    write_fail "Failed to get upload URL: $UPLOAD_RESPONSE"
    exit 1
fi

write_success "Presigned URL obtained"
write_info "S3 key: $S3_KEY"

# ── Step 5: Upload audio to S3 ────────────────────────────────────────────────
write_step "Uploading audio to S3"

UPLOAD_START=$(date +%s)
# Grab http code at the end
UPLOAD_RESULT=$(curl -s -w "\n%{http_code}" -X PUT -T "$AUDIO_FILE" "$UPLOAD_URL")
UPLOAD_STATUS=$(echo "$UPLOAD_RESULT" | tail -n1 | tr -d '\r')
UPLOAD_ELAPSED=$(($(date +%s) - UPLOAD_START))

if [[ "$UPLOAD_STATUS" != "200" ]]; then
    write_fail "S3 upload failed (HTTP $UPLOAD_STATUS)"
    write_info "Response: $(echo "$UPLOAD_RESULT" | sed '$d')"
    exit 1
fi

write_success "Audio uploaded to S3"
write_info "Upload time: ${UPLOAD_ELAPSED}s | Size: $FILE_SIZE_MB MB | HTTP $UPLOAD_STATUS"

# ── Step 6: Enqueue chunk ─────────────────────────────────────────────────────
write_step "Enqueuing chunk for transcription (SQS)"

if [[ $(date +%s) -gt $TOKEN_EXPIRY ]]; then
    write_warn "Token expired — refreshing"
    TOKEN=$(get_fresh_token "$EMAIL" "$PASSWORD" "$BASE_URL")
    TOKEN_EXPIRY=$(($(date +%s) + 28200))
fi

CHUNK_RESPONSE=$(curl -s -X POST "$BASE_URL/meetings/$MEETING_ID/chunk" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "s3_key=$S3_KEY")

CHUNK_INDEX=$(echo "$CHUNK_RESPONSE" | jq -r '.chunk_index // empty')

if [[ -z "$CHUNK_INDEX" ]]; then
    write_fail "Chunk enqueue failed: $CHUNK_RESPONSE"
    exit 1
fi

STATUS=$(echo "$CHUNK_RESPONSE" | jq -r '.status')
write_success "Chunk enqueued successfully"
write_info "Chunk index: $CHUNK_INDEX | Status: $STATUS"
write_info "Worker will: fetch from S3 → Whisper transcribe → diarize → store in Redis"

# ── Step 7: End meeting ───────────────────────────────────────────────────────
write_step "Ending meeting (sets total_chunks=1, triggers analysis gate)"

if [[ $(date +%s) -gt $TOKEN_EXPIRY ]]; then
    write_warn "Token expired — refreshing"
    TOKEN=$(get_fresh_token "$EMAIL" "$PASSWORD" "$BASE_URL")
    TOKEN_EXPIRY=$(($(date +%s) + 28200))
fi

END_RESPONSE=$(curl -s -X POST "$BASE_URL/meetings/$MEETING_ID/end" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"total_chunks":1}')

END_STATUS=$(echo "$END_RESPONSE" | jq -r '.status')
TOTAL_CHUNKS=$(echo "$END_RESPONSE" | jq -r '.total_chunks')

write_success "Meeting ended"
write_info "Status: $END_STATUS | Total chunks declared: $TOTAL_CHUNKS"
write_info "Worker will: wait for chunk transcription → assemble → queue LLM analysis"

# ── Step 8: Poll for results ──────────────────────────────────────────────────
write_step "Polling for insights"

MAX_MINS=$(awk "BEGIN {printf \"%.1f\", ($MAX_POLL_ATTEMPTS * $POLL_INTERVAL_SECONDS) / 60}")
write_info "Checking every ${POLL_INTERVAL_SECONDS}s (max $MAX_POLL_ATTEMPTS attempts = $MAX_MINS min)"
write_info "Worker pipeline: Pass 1 (tinyllama keywords) → RAG (pgvector) → Pass 2 (phi3:mini analysis)"

ATTEMPT=0
ANALYSIS_START=$(date +%s)

while [[ $ATTEMPT -lt $MAX_POLL_ATTEMPTS ]]; do
    ((ATTEMPT++))
    sleep "$POLL_INTERVAL_SECONDS"

    if [[ $(date +%s) -gt $TOKEN_EXPIRY ]]; then
        write_warn "Token expired — refreshing"
        TOKEN=$(get_fresh_token "$EMAIL" "$PASSWORD" "$BASE_URL")
        TOKEN_EXPIRY=$(($(date +%s) + 28200))
    fi

    RAW_RESULTS=$(curl -s "$BASE_URL/meetings/$MEETING_ID/results" \
        -H "Authorization: Bearer $TOKEN")

    # Check if raw results are valid JSON
    if ! echo "$RAW_RESULTS" | jq -e . >/dev/null 2>&1; then
        write_warn "Attempt $ATTEMPT/$MAX_POLL_ATTEMPTS — Bad response (nginx/token issue), retrying..."
        continue
    fi

    STATUS=$(echo "$RAW_RESULTS" | jq -r '.status')
    ELAPSED=$(($(date +%s) - ANALYSIS_START))
    
    echo -e "    \e[37m..\e[0m  Attempt $ATTEMPT/$MAX_POLL_ATTEMPTS — Status: $STATUS (${ELAPSED}s elapsed)"

    if [[ "$STATUS" == "done" ]]; then
        TOTAL_ELAPSED=$(($(date +%s) - START_TIME))
        write_success "Analysis complete in ${ELAPSED}s"
        write_info "Total script runtime: ${TOTAL_ELAPSED}s"

        # ── Meeting Intelligence ──────────────────────────────────────────────
        write_section "MEETING INTELLIGENCE"

        SUMMARY=$(echo "$RAW_RESULTS" | jq -r '.insights.meeting_intelligence.summary // empty')
        if [[ -n "$SUMMARY" ]]; then
            echo -e "\n  \e[97mSummary\e[0m"
            echo -e "  \e[37m$SUMMARY\e[0m"
        fi

        DEAL_SCORE=$(echo "$RAW_RESULTS" | jq -r '.insights.meeting_intelligence.deal_health.score // empty')
        DEAL_REASON=$(echo "$RAW_RESULTS" | jq -r '.insights.meeting_intelligence.deal_health.reasoning // empty')
        if [[ -n "$DEAL_SCORE" ]]; then
            case "$DEAL_SCORE" in
                hot) DEAL_COLOR="\e[31m" ;;  # Red
                warm) DEAL_COLOR="\e[33m" ;; # Yellow
                *) DEAL_COLOR="\e[36m" ;;    # Cyan
            esac
            echo -e "\n  \e[97mDeal Health\e[0m"
            echo -e "  $DEAL_COLOR${DEAL_SCORE^^}\e[0m"
            echo -e "  \e[37m$DEAL_REASON\e[0m"
        fi

        BUYING_SIGNALS_COUNT=$(echo "$RAW_RESULTS" | jq -r '.insights.meeting_intelligence.buying_signals | length')
        if [[ "$BUYING_SIGNALS_COUNT" -gt 0 ]]; then
            echo -e "\n  \e[97mBuying Signals ($BUYING_SIGNALS_COUNT)\e[0m"
            echo "$RAW_RESULTS" | jq -r '.insights.meeting_intelligence.buying_signals[]' | while read -r sig; do
                echo -e "    \e[32m+ $sig\e[0m"
            done
        fi

        PAIN_POINTS_COUNT=$(echo "$RAW_RESULTS" | jq -r '.insights.meeting_intelligence.client_pain_points | length')
        if [[ "$PAIN_POINTS_COUNT" -gt 0 ]]; then
            echo -e "\n  \e[97mClient Pain Points ($PAIN_POINTS_COUNT)\e[0m"
            echo "$RAW_RESULTS" | jq -r '.insights.meeting_intelligence.client_pain_points[]' | while read -r point; do
                echo -e "    \e[37m- $point\e[0m"
            done
        fi

        ACTION_ITEMS_COUNT=$(echo "$RAW_RESULTS" | jq -r '.insights.meeting_intelligence.action_items | length')
        if [[ "$ACTION_ITEMS_COUNT" -gt 0 ]]; then
            echo -e "\n  \e[97mAction Items ($ACTION_ITEMS_COUNT)\e[0m"
            echo "$RAW_RESULTS" | jq -c '.insights.meeting_intelligence.action_items[]' | while read -r item; do
                OWNER=$(echo "$item" | jq -r '.owner' | tr '[:lower:]' '[:upper:]')
                TASK=$(echo "$item" | jq -r '.task')
                DEADLINE=$(echo "$item" | jq -r '.deadline // empty')
                if [[ "$DEADLINE" != "null" && -n "$DEADLINE" ]]; then DEADLINE_STR=" [due: $DEADLINE]"; else DEADLINE_STR=""; fi
                echo -e "    \e[37m[$OWNER] $TASK$DEADLINE_STR\e[0m"
            done
        fi

        NEXT_STEPS_COUNT=$(echo "$RAW_RESULTS" | jq -r '.insights.meeting_intelligence.deal_health.next_steps | length')
        if [[ "$NEXT_STEPS_COUNT" -gt 0 ]]; then
            echo -e "\n  \e[97mNext Steps\e[0m"
            echo "$RAW_RESULTS" | jq -r '.insights.meeting_intelligence.deal_health.next_steps[]' | while read -r step; do
                echo -e "    \e[36m→ $step\e[0m"
            done
        fi

        # ── Coaching Report ───────────────────────────────────────────────────
        COACHING_EXISTS=$(echo "$RAW_RESULTS" | jq -e '.insights.coaching != null' > /dev/null && echo "yes" || echo "no")
        if [[ "$COACHING_EXISTS" == "yes" ]]; then
            write_section "AGENT COACHING REPORT"

            SCORE=$(echo "$RAW_RESULTS" | jq -r '.insights.coaching.overall_grade.score_out_of_100 // empty')
            if [[ -n "$SCORE" && "$SCORE" != "null" ]]; then
                if (( SCORE >= 80 )); then GRADE_COLOR="\e[32m"
                elif (( SCORE >= 60 )); then GRADE_COLOR="\e[33m"
                else GRADE_COLOR="\e[31m"; fi
                
                HEADLINE=$(echo "$RAW_RESULTS" | jq -r '.insights.coaching.overall_grade.headline_summary // empty')
                echo -e "\n  \e[97mOverall Grade\e[0m"
                echo -e "  $GRADE_COLOR$SCORE/100\e[0m"
                echo -e "  \e[37m$HEADLINE\e[0m"
            fi

            AGENT_TALK=$(echo "$RAW_RESULTS" | jq -r '.insights.coaching.metrics.agent_talk_ratio_percentage // 0')
            CLIENT_TALK=$(echo "$RAW_RESULTS" | jq -r '.insights.coaching.metrics.client_talk_ratio_percentage // 0')
            OPEN_Q=$(echo "$RAW_RESULTS" | jq -r '.insights.coaching.metrics.open_ended_questions_count // 0')
            CLOSED_Q=$(echo "$RAW_RESULTS" | jq -r '.insights.coaching.metrics.closed_questions_count // 0')

            echo -e "\n  \e[97mTalk Ratio\e[0m"
            echo -e "  \e[37mAgent : $AGENT_TALK% | Client: $CLIENT_TALK%\e[0m"
            echo -e "  \e[37mOpen-ended Qs: $OPEN_Q | Closed Qs: $CLOSED_Q\e[0m"

            OBJ_COUNT=$(echo "$RAW_RESULTS" | jq -r '.insights.coaching.objections_handled | length')
            if [[ "$OBJ_COUNT" -gt 0 ]]; then
                echo -e "\n  \e[97mObjection Breakdown ($OBJ_COUNT)\e[0m"
                I=1
                echo "$RAW_RESULTS" | jq -c '.insights.coaching.objections_handled[]' | while read -r obj; do
                    CLIENT_OBJ=$(echo "$obj" | jq -r '.client_objection')
                    EFF_SCORE=$(echo "$obj" | jq -r '.effectiveness_score_out_of_10')
                    CRITIQUE=$(echo "$obj" | jq -r '.coaching_critique')
                    SCRIPT=$(echo "$obj" | jq -r '.exact_alternative_script')
                    
                    if (( EFF_SCORE >= 7 )); then EFF_COLOR="\e[32m"
                    elif (( EFF_SCORE >= 4 )); then EFF_COLOR="\e[33m"
                    else EFF_COLOR="\e[31m"; fi

                    echo -e "\n  \e[97m[$I] $CLIENT_OBJ\e[0m"
                    echo -e "      \e[37mScore    :\e[0m $EFF_COLOR$EFF_SCORE/10\e[0m"
                    echo -e "      \e[37mCritique : $CRITIQUE\e[0m"
                    echo -e "      \e[36mBetter   : \"$SCRIPT\"\e[0m"
                    ((I++))
                done
            fi

            TOP_ACTIONS_COUNT=$(echo "$RAW_RESULTS" | jq -r '.insights.coaching.top_three_action_items | length')
            if [[ "$TOP_ACTIONS_COUNT" -gt 0 ]]; then
                echo -e "\n  \e[97mTop Coaching Actions\e[0m"
                N=1
                echo "$RAW_RESULTS" | jq -r '.insights.coaching.top_three_action_items[]' | while read -r action; do
                    echo -e "  \e[36m$N. $action\e[0m"
                    ((N++))
                done
            fi
        fi

        # ── Save output ───────────────────────────────────────────────────────
        write_section "OUTPUT"
        OUTPUT_FILE="meeting_$MEETING_ID.json"
        # Pretty print directly into the file
        echo "$RAW_RESULTS" | jq . > "$OUTPUT_FILE"
        echo ""
        write_success "Full results saved to: $OUTPUT_FILE"
        write_info "Meeting ID : $MEETING_ID"
        write_info "Runtime    : ${TOTAL_ELAPSED}s"
        write_info "Chunks     : $(echo "$RAW_RESULTS" | jq -r '.chunks // empty')"
        echo ""
        exit 0
    fi

    if [[ "$STATUS" == "failed" ]]; then
        write_fail "Analysis failed — check docker logs osf-worker"
        write_info "Meeting ID: $MEETING_ID"
        exit 1
    fi
done

write_fail "Timed out after $(($MAX_POLL_ATTEMPTS * $POLL_INTERVAL_SECONDS))s waiting for insights"
write_info "Meeting ID: $MEETING_ID — check docker logs osf-worker"
exit 1