# OSF-Suite Meeting Automation Script
# Usage: .\meeting.ps1 -AudioFile "C:\path\to\audio.ogg" -Email "john@company.com" -Password "pass"

param(
    [Parameter(Mandatory=$true)]
    [string]$AudioFile,

    [Parameter(Mandatory=$true)]
    [string]$Email,

    [Parameter(Mandatory=$true)]
    [string]$Password,

    [string]$BaseUrl = "http://localhost:8001",
    [int]$PollIntervalSeconds = 15,
    [int]$MaxPollAttempts = 40
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
    Write-Host "`n>> $msg" -ForegroundColor Cyan
}

function Write-Success($msg) {
    Write-Host "OK $msg" -ForegroundColor Green
}

function Write-Fail($msg) {
    Write-Host "FAILED $msg" -ForegroundColor Red
}

function Get-FreshToken($email, $password, $baseUrl) {
    $loginBody = "{`"email`":`"$email`",`"password`":`"$password`"}"
    [System.IO.File]::WriteAllText("$PWD\_tmp_login.json", $loginBody)
    $response = curl.exe -s -X POST "$baseUrl/agents/login" -H "Content-Type: application/json" -d "@_tmp_login.json" | ConvertFrom-Json
    Remove-Item "$PWD\_tmp_login.json" -ErrorAction SilentlyContinue
    return $response.access_token
}

# -- Step 1: Login ------------------------------------------------------------
Write-Step "Logging in as $Email..."
$token = Get-FreshToken $Email $Password $BaseUrl

if (-not $token) {
    Write-Fail "Login failed"
    exit 1
}

$tokenExpiry = (Get-Date).AddMinutes(470)
Write-Success "Logged in successfully"

# -- Step 2: Start meeting ----------------------------------------------------
Write-Step "Starting meeting..."
$startResponse = curl.exe -s -X POST "$BaseUrl/meetings/start" -H "Authorization: Bearer $token" | ConvertFrom-Json

if (-not $startResponse.meeting_id) {
    Write-Fail "Failed to start meeting"
    exit 1
}

$meetingId = $startResponse.meeting_id
Write-Success "Meeting started: $meetingId"

# -- Step 3: Get presigned S3 URL ---------------------------------------------
Write-Step "Getting S3 upload URL..."

# Refresh token if needed
if ((Get-Date) -gt $tokenExpiry) {
    Write-Host "  Refreshing token..." -ForegroundColor Yellow
    $token = Get-FreshToken $Email $Password $BaseUrl
    $tokenExpiry = (Get-Date).AddMinutes(470)
}

$filename = Split-Path $AudioFile -Leaf
$uploadResponse = curl.exe -s "$BaseUrl/meetings/$meetingId/upload-url?filename=$filename" -H "Authorization: Bearer $token" | ConvertFrom-Json

if (-not $uploadResponse.upload_url) {
    Write-Fail "Failed to get upload URL"
    exit 1
}

$uploadUrl = $uploadResponse.upload_url
$s3Key = $uploadResponse.s3_key
Write-Success "Got presigned URL"

# -- Step 4: Upload audio to S3 -----------------------------------------------
Write-Step "Uploading audio to S3..."
curl.exe -s -X PUT -T $AudioFile $uploadUrl | Out-Null
Write-Success "Audio uploaded to S3"

# -- Step 5: Notify API of chunk ----------------------------------------------
Write-Step "Sending chunk to API for transcription..."

if ((Get-Date) -gt $tokenExpiry) {
    Write-Host "  Refreshing token..." -ForegroundColor Yellow
    $token = Get-FreshToken $Email $Password $BaseUrl
    $tokenExpiry = (Get-Date).AddMinutes(470)
}

$chunkResponse = curl.exe -s -X POST "$BaseUrl/meetings/$meetingId/chunk" `
    -H "Authorization: Bearer $token" `
    -H "Content-Type: application/x-www-form-urlencoded" `
    -d "s3_key=$s3Key" | ConvertFrom-Json

if (-not $chunkResponse.chunk) {
    Write-Fail "Chunk upload failed"
    exit 1
}

Write-Success "Chunk $($chunkResponse.chunk) transcribed"
Write-Host "  Preview: $($chunkResponse.chunk_text.Substring(0, [Math]::Min(100, $chunkResponse.chunk_text.Length)))..." -ForegroundColor Gray

# -- Step 6: End meeting ------------------------------------------------------
Write-Step "Ending meeting and triggering insights..."

if ((Get-Date) -gt $tokenExpiry) {
    Write-Host "  Refreshing token..." -ForegroundColor Yellow
    $token = Get-FreshToken $Email $Password $BaseUrl
    $tokenExpiry = (Get-Date).AddMinutes(470)
}

$endResponse = curl.exe -s -X POST "$BaseUrl/meetings/$meetingId/end" -H "Authorization: Bearer $token" | ConvertFrom-Json
Write-Success "Meeting ended - status: $($endResponse.status)"

# -- Step 7: Poll for results -------------------------------------------------
Write-Step "Polling for insights (this may take a few minutes on CPU)..."
$attempt = 0

while ($attempt -lt $MaxPollAttempts) {
    $attempt++
    Start-Sleep -Seconds $PollIntervalSeconds

    if ((Get-Date) -gt $tokenExpiry) {
        Write-Host "  Refreshing token..." -ForegroundColor Yellow
        $token = Get-FreshToken $Email $Password $BaseUrl
        $tokenExpiry = (Get-Date).AddMinutes(470)
    }

    $results = curl.exe -s "$BaseUrl/meetings/$meetingId/results" -H "Authorization: Bearer $token" | ConvertFrom-Json
    Write-Host "  Attempt $attempt/$MaxPollAttempts - Status: $($results.status)" -ForegroundColor Yellow

    if ($results.status -eq "done") {
        Write-Success "Insights ready!"
        Write-Host "`n========== MEETING INSIGHTS ==========" -ForegroundColor Magenta
        Write-Host "Meeting ID  : $meetingId"
        Write-Host "Summary     : $($results.insights.summary)"
        Write-Host "`nDeal Health : $($results.insights.deal_health.score.ToUpper()) - $($results.insights.deal_health.reasoning)"
        Write-Host "`nBuying Signals:"
        $results.insights.buying_signals | ForEach-Object { Write-Host "  - $_" }
        Write-Host "`nClient Pain Points:"
        $results.insights.client_pain_points | ForEach-Object { Write-Host "  - $_" }
        Write-Host "`nObjections Raised:"
        $results.insights.objections_raised | ForEach-Object { Write-Host "  - $($_.objection)" }
        Write-Host "`nAction Items:"
        $results.insights.action_items | ForEach-Object { Write-Host "  - [$($_.owner)] $($_.task)" }
        Write-Host "`nNext Steps:"
        $results.insights.deal_health.next_steps | ForEach-Object { Write-Host "  - $_" }
        Write-Host "`nCalendar Schedule:"
        $results.insights.calendar_schedule | ForEach-Object { Write-Host "  - $($_.event) ($($_.suggested_date))" }
        Write-Host "`nIntelligence Insights:"
        $results.insights.intelligence_insights | ForEach-Object { Write-Host "  - $_" }
        Write-Host "======================================" -ForegroundColor Magenta

        $outputFile = "meeting_$meetingId.json"
        $results | ConvertTo-Json -Depth 10 | Out-File $outputFile -Encoding UTF8
        Write-Host "`nFull results saved to: $outputFile" -ForegroundColor Green
        exit 0
    }

    if ($results.status -eq "failed") {
        Write-Fail "Insights generation failed"
        exit 1
    }
}

Write-Fail "Timed out after $($MaxPollAttempts * $PollIntervalSeconds) seconds"
exit 1