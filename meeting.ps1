# meeting.ps1 — end-to-end test of the live transcription architecture, for
# running locally on Windows against your docker-compose stack. Exercises:
# auth, context upload (embeddings), meeting creation, live WebSocket
# streaming (transcription + diarization), Redis state (before/during/after),
# and the final LLM analysis (inference).
#
# Usage:
#   .\meeting.ps1 -AudioFile "C:\path\to\sample_call.mp3"
#
# Optional overrides:
#   -BaseUrl   (default: http://localhost)
#   -Email     (default: test@example.com)
#   -Password  (default: TestPassword123)
#   -RedisCmd  (default: "docker compose exec -T redis redis-cli")
#
# Requires on this machine (your host, not inside the containers):
#   python (`pip install websockets`), ffmpeg — both must be on PATH

param(
    [Parameter(Mandatory = $true)]
    [string]$AudioFile,

    [string]$BaseUrl  = "http://localhost",
    [string]$Email    = "test@example.com",
    [string]$Password = "TestPassword123",
    [string]$RedisCmd = "docker compose exec -T redis redis-cli"
)

$ErrorActionPreference = "Stop"

function Write-Section($title) {
    Write-Host ""
    Write-Host "=== $title ===" -ForegroundColor Cyan
}

# ── Preflight checks ─────────────────────────────────────────────────────────
if (-not (Test-Path $AudioFile)) {
    Write-Host "ERROR: audio file not found: $AudioFile" -ForegroundColor Red
    exit 1
}
foreach ($tool in @("python", "ffmpeg")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: required tool '$tool' not found on PATH." -ForegroundColor Red
        exit 1
    }
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ── 1. Authenticate ───────────────────────────────────────────────────────────
Write-Section "Authenticating"

function Invoke-Login {
    Invoke-RestMethod -Method Post -Uri "$BaseUrl/agents/login" `
        -ContentType "application/json" `
        -Body (@{ email = $Email; password = $Password } | ConvertTo-Json)
}

$AccessToken = $null
try {
    $loginResp = Invoke-Login
    $AccessToken = $loginResp.access_token
} catch {
    Write-Host "Login failed — attempting to register a new test account..."
    try {
        Invoke-RestMethod -Method Post -Uri "$BaseUrl/agents/register" `
            -ContentType "application/json" `
            -Body (@{ name = "Test Agent"; email = $Email; password = $Password } | ConvertTo-Json) | Out-Null
        $loginResp = Invoke-Login
        $AccessToken = $loginResp.access_token
    } catch {
        Write-Host "ERROR: could not authenticate. $_" -ForegroundColor Red
        exit 1
    }
}

if (-not $AccessToken) {
    Write-Host "ERROR: no access token returned." -ForegroundColor Red
    exit 1
}
Write-Host "Access token acquired"
$AuthHeaders = @{ Authorization = "Bearer $AccessToken" }

# ── 2. Upload sample company context (exercises extraction + embeddings) ─────
Write-Section "Uploading sample company context (RAG/embedding test)"
$ContextText = "Our product, OSF-Suite, is an AI sales coaching platform priced at `$99/month per seat with a 14-day free trial. Our main competitor is Gong.io. We emphasize our self-hosted, privacy-first architecture as a key differentiator."
$ContextResp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/agents/context/text" `
    -Headers $AuthHeaders -ContentType "application/json" `
    -Body (@{ text = $ContextText } | ConvertTo-Json)
$ContextResp | ConvertTo-Json -Depth 5

# ── 3. Start a meeting ─────────────────────────────────────────────────────────
Write-Section "Starting meeting"
$StartResp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/meetings/start" -Headers $AuthHeaders
$MeetingId = $StartResp.meeting_id
if (-not $MeetingId) {
    Write-Host "ERROR: could not start meeting." -ForegroundColor Red
    exit 1
}
Write-Host "Meeting ID: $MeetingId"

# ── 4. Redis state at meeting start ───────────────────────────────────────────
Write-Section "Redis state at meeting start"
Invoke-Expression "$RedisCmd HGETALL meeting:$MeetingId"

# ── 5. Stream audio over the live WebSocket ───────────────────────────────────
Write-Section "Streaming audio over live WebSocket ($AudioFile)"
$WsBase = $BaseUrl -replace '^https', 'wss' -replace '^http', 'ws'
$EncodedToken = [uri]::EscapeDataString($AccessToken)
$WsUrl = "$WsBase/meetings/$MeetingId/live?token=$EncodedToken"

python "$ScriptDir\test_live_meeting.py" --ws-url "$WsUrl" --audio-file "$AudioFile"

# ── 6. Poll for analysis (inference) results ──────────────────────────────────
Write-Section "Polling for analysis results"
$Result = $null
for ($i = 1; $i -le 30; $i++) {
    $Result = Invoke-RestMethod -Uri "$BaseUrl/meetings/$MeetingId/results" -Headers $AuthHeaders
    Write-Host "  [poll $i] status=$($Result.status)"
    if ($Result.status -eq "done" -or $Result.status -eq "failed") { break }
    Start-Sleep -Seconds 5
}

Write-Section "Final transcript"
Write-Host $Result.transcript

Write-Section "Inference output (meeting_intelligence + coaching)"
$Result.insights | ConvertTo-Json -Depth 10

# ── 7. Redis state after finalize (segments/heartbeat should be gone) ────────
Write-Section "Redis state after finalize"
Write-Host "-- meeting hash --"
Invoke-Expression "$RedisCmd HGETALL meeting:$MeetingId"
Write-Host "-- live_segments (should be empty — proves cleanup ran) --"
Invoke-Expression "$RedisCmd LRANGE meeting:$MeetingId`:live_segments 0 -1"
Write-Host "-- live_heartbeat exists? (should print 0) --"
Invoke-Expression "$RedisCmd EXISTS meeting:$MeetingId`:live_heartbeat"

# ── 8. Confirm stored context (proves extraction + embedding ingestion ran) ──
Write-Section "Stored company context"
$Ctx = Invoke-RestMethod -Uri "$BaseUrl/agents/context" -Headers $AuthHeaders
$Ctx | ConvertTo-Json -Depth 5

Write-Section "Test complete"