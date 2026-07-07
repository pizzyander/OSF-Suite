# OSF-Suite Meeting Automation Script
# Usage: .\meeting.ps1 -AudioFile "C:\path\to\audio.ogg" -Email "john@company.com" -Password "pass"

param(
    [Parameter(Mandatory=$true)]
    [string]$AudioFile,

    [Parameter(Mandatory=$true)]
    [string]$Email,

    [Parameter(Mandatory=$true)]
    [string]$Password,

    [string]$BaseUrl = "http://localhost:80",
    [int]$PollIntervalSeconds = 15,
    [int]$MaxPollAttempts = 60
)

$ErrorActionPreference = "Stop"
$StepNum = 0 

function Write-Step($msg) {
    $script:StepNum++
    Write-Host "`n[$script:StepNum] $msg" -ForegroundColor Cyan
}

function Write-Success($msg) {
    Write-Host "    OK  $msg" -ForegroundColor Green
}

function Write-Info($msg) {
    Write-Host "    ..  $msg" -ForegroundColor Gray
}

function Write-Warn($msg) {
    Write-Host "    !!  $msg" -ForegroundColor Yellow
}

function Write-Fail($msg) {
    Write-Host "    FAILED  $msg" -ForegroundColor Red
}

function Write-Section($msg) {
    Write-Host "`n$('=' * 50)" -ForegroundColor Magenta
    Write-Host "  $msg" -ForegroundColor Magenta
    Write-Host "$('=' * 50)" -ForegroundColor Magenta
}

function Get-FreshToken($email, $password, $baseUrl) {
    $loginBody = "{`"email`":`"$email`",`"password`":`"$password`"}"
    [System.IO.File]::WriteAllText("$PWD\_tmp_login.json", $loginBody)
    $response = curl.exe -s -X POST "$baseUrl/agents/login" `
        -H "Content-Type: application/json" `
        -d "@_tmp_login.json" | ConvertFrom-Json
    Remove-Item "$PWD\_tmp_login.json" -ErrorAction SilentlyContinue
    return $response.access_token
}

$startTime = Get-Date
Write-Host "`nOSF-Suite Meeting Test" -ForegroundColor White
Write-Host "Audio  : $AudioFile" -ForegroundColor Gray
Write-Host "Email  : $Email" -ForegroundColor Gray
Write-Host "API    : $BaseUrl" -ForegroundColor Gray
Write-Host "Time   : $($startTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Gray

# ── Step 1: Validate audio file ───────────────────────────────────────────────
Write-Step "Validating audio file"

if (-not (Test-Path $AudioFile)) {
    Write-Fail "File not found: $AudioFile"
    exit 1
}

$fileInfo = Get-Item $AudioFile
$fileSizeMB = [math]::Round($fileInfo.Length / 1MB, 2)
Write-Success "File found: $($fileInfo.Name)"
Write-Info "Size: $fileSizeMB MB | Extension: $($fileInfo.Extension)"

if ($fileSizeMB -gt 50) {
    Write-Warn "File is $fileSizeMB MB — exceeds 50 MB limit, upload may fail"
}

# ── Step 2: Login ─────────────────────────────────────────────────────────────
Write-Step "Authenticating as $Email"

$token = Get-FreshToken $Email $Password $BaseUrl

if (-not $token) {
    Write-Fail "Login failed — check email/password and that insights service is running"
    exit 1
}

$tokenExpiry = (Get-Date).AddMinutes(470)
Write-Success "Authenticated successfully"
Write-Info "Token expires at: $($tokenExpiry.ToString('HH:mm:ss'))"

# ── Step 3: Start meeting ─────────────────────────────────────────────────────
Write-Step "Creating meeting"

$startResponse = curl.exe -s -X POST "$BaseUrl/meetings/start" `
    -H "Authorization: Bearer $token" | ConvertFrom-Json

if (-not $startResponse.meeting_id) {
    Write-Fail "Failed to start meeting: $($startResponse | ConvertTo-Json)"
    exit 1
}

$meetingId = $startResponse.meeting_id
Write-Success "Meeting created"
Write-Info "Meeting ID: $meetingId"

# ── Step 4: Get presigned S3 URL ──────────────────────────────────────────────
Write-Step "Getting S3 presigned upload URL"

if ((Get-Date) -gt $tokenExpiry) {
    Write-Warn "Token expired — refreshing"
    $token = Get-FreshToken $Email $Password $BaseUrl
    $tokenExpiry = (Get-Date).AddMinutes(470)
}

$filename        = Split-Path $AudioFile -Leaf
$encodedFilename = [System.Uri]::EscapeDataString($filename)
$uploadResponse  = curl.exe -s "$BaseUrl/meetings/$meetingId/upload-url?filename=$encodedFilename" `
    -H "Authorization: Bearer $token" | ConvertFrom-Json

if (-not $uploadResponse.upload_url) {
    Write-Fail "Failed to get upload URL: $($uploadResponse | ConvertTo-Json)"
    exit 1
}

$uploadUrl = $uploadResponse.upload_url
$s3Key     = $uploadResponse.s3_key
Write-Success "Presigned URL obtained"
Write-Info "S3 key: $s3Key"

# ── Step 5: Upload audio to S3 ────────────────────────────────────────────────
Write-Step "Uploading audio to S3"

$uploadStart  = Get-Date
$uploadResult = curl.exe -s -w "`n%{http_code}" -X PUT -T $AudioFile $uploadUrl
$uploadStatus = ($uploadResult -split "`n")[-1].Trim()
$uploadElapsed = [math]::Round(((Get-Date) - $uploadStart).TotalSeconds, 1)

if ($uploadStatus -ne "200") {
    Write-Fail "S3 upload failed (HTTP $uploadStatus)"
    Write-Info "Response: $uploadResult"
    exit 1
}

Write-Success "Audio uploaded to S3"
Write-Info "Upload time: ${uploadElapsed}s | Size: $fileSizeMB MB | HTTP $uploadStatus"

# ── Step 6: Enqueue chunk ─────────────────────────────────────────────────────
Write-Step "Enqueuing chunk for transcription (SQS)"

if ((Get-Date) -gt $tokenExpiry) {
    Write-Warn "Token expired — refreshing"
    $token = Get-FreshToken $Email $Password $BaseUrl
    $tokenExpiry = (Get-Date).AddMinutes(470)
}

$rawChunk = curl.exe -s -X POST "$BaseUrl/meetings/$meetingId/chunk" `
    -H "Authorization: Bearer $token" `
    -H "Content-Type: application/x-www-form-urlencoded" `
    -d "s3_key=$s3Key"

try {
    $chunkResponse = $rawChunk | ConvertFrom-Json
} catch {
    Write-Fail "Chunk response was not valid JSON: $rawChunk"
    exit 1
}

if ($null -eq $chunkResponse.chunk_index -and $chunkResponse.chunk_index -ne 0) {
    Write-Fail "Chunk enqueue failed: $($chunkResponse | ConvertTo-Json)"
    exit 1
}

Write-Success "Chunk enqueued successfully"
Write-Info "Chunk index: $($chunkResponse.chunk_index) | Status: $($chunkResponse.status)"
Write-Info "Worker will: fetch from S3 → Whisper transcribe → diarize → store in Redis"

# ── Step 7: End meeting ───────────────────────────────────────────────────────
Write-Step "Ending meeting (sets total_chunks=1, triggers analysis gate)"

if ((Get-Date) -gt $tokenExpiry) {
    Write-Warn "Token expired — refreshing"
    $token = Get-FreshToken $Email $Password $BaseUrl
    $tokenExpiry = (Get-Date).AddMinutes(470)
}

$endBody = '{"total_chunks":1}'
[System.IO.File]::WriteAllText("$PWD\_tmp_end.json", $endBody)
$endResponse = curl.exe -s -X POST "$BaseUrl/meetings/$meetingId/end" `
    -H "Authorization: Bearer $token" `
    -H "Content-Type: application/json" `
    -d "@_tmp_end.json" | ConvertFrom-Json
Remove-Item "$PWD\_tmp_end.json" -ErrorAction SilentlyContinue

Write-Success "Meeting ended"
Write-Info "Status: $($endResponse.status) | Total chunks declared: $($endResponse.total_chunks)"
Write-Info "Worker will: wait for chunk transcription → assemble → queue LLM analysis"

# ── Step 8: Poll for results ──────────────────────────────────────────────────
Write-Step "Polling for insights"
Write-Info "Checking every ${PollIntervalSeconds}s (max $MaxPollAttempts attempts = $([math]::Round($MaxPollAttempts * $PollIntervalSeconds / 60, 1)) min)"
Write-Info "Worker pipeline: Pass 1 (tinyllama keywords) → RAG (pgvector) → Pass 2 (phi3:mini analysis)"

$attempt      = 0
$analysisStart = Get-Date

while ($attempt -lt $MaxPollAttempts) {
    $attempt++
    Start-Sleep -Seconds $PollIntervalSeconds

    if ((Get-Date) -gt $tokenExpiry) {
        Write-Warn "Token expired — refreshing"
        $token = Get-FreshToken $Email $Password $BaseUrl
        $tokenExpiry = (Get-Date).AddMinutes(470)
    }

    $rawResults = curl.exe -s "$BaseUrl/meetings/$meetingId/results" `
        -H "Authorization: Bearer $token"

    try {
        $results = $rawResults | ConvertFrom-Json
    } catch {
        Write-Warn "Attempt $attempt/$MaxPollAttempts — Bad response (nginx/token issue), retrying..."
        continue
    }

    $elapsed = [math]::Round(((Get-Date) - $analysisStart).TotalSeconds, 0)
    Write-Host "    ..  Attempt $attempt/$MaxPollAttempts — Status: $($results.status) (${elapsed}s elapsed)" -ForegroundColor Gray

    if ($results.status -eq "done") {
        $totalElapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 0)
        Write-Success "Analysis complete in ${elapsed}s"
        Write-Info "Total script runtime: ${totalElapsed}s"

        $mi       = $results.insights.meeting_intelligence
        $coaching = $results.insights.coaching

        # ── Meeting Intelligence ──────────────────────────────────────────────
        Write-Section "MEETING INTELLIGENCE"

        Write-Host "`n  Summary" -ForegroundColor White
        Write-Host "  $($mi.summary)" -ForegroundColor Gray

        if ($mi.deal_health) {
            $dealColor = switch ($mi.deal_health.score) {
                "hot"  { "Red" }
                "warm" { "Yellow" }
                default { "Cyan" }
            }
            Write-Host "`n  Deal Health" -ForegroundColor White
            Write-Host "  $($mi.deal_health.score.ToUpper())" -ForegroundColor $dealColor
            Write-Host "  $($mi.deal_health.reasoning)" -ForegroundColor Gray
        }

        if ($mi.client_personality) {
            Write-Host "`n  Client Personality" -ForegroundColor White
            Write-Host "  Communication : $($mi.client_personality.communication_style)" -ForegroundColor Gray
            Write-Host "  Decision style: $($mi.client_personality.decision_making)" -ForegroundColor Gray
            Write-Host "  Motivators    :" -ForegroundColor Gray
            $mi.client_personality.key_motivators | ForEach-Object {
                Write-Host "    • $_" -ForegroundColor Gray
            }
        }

        if ($mi.buying_signals -and $mi.buying_signals.Count -gt 0) {
            Write-Host "`n  Buying Signals ($($mi.buying_signals.Count))" -ForegroundColor White
            $mi.buying_signals | ForEach-Object { Write-Host "    + $_" -ForegroundColor Green }
        }

        if ($mi.client_pain_points -and $mi.client_pain_points.Count -gt 0) {
            Write-Host "`n  Client Pain Points ($($mi.client_pain_points.Count))" -ForegroundColor White
            $mi.client_pain_points | ForEach-Object { Write-Host "    - $_" -ForegroundColor Gray }
        }

        if ($mi.objections_raised -and $mi.objections_raised.Count -gt 0) {
            Write-Host "`n  Objections Raised ($($mi.objections_raised.Count))" -ForegroundColor White
            $mi.objections_raised | ForEach-Object {
                Write-Host "    ! $($_.objection)" -ForegroundColor Yellow
                if ($_.how_handled) {
                    Write-Host "      → $($_.how_handled)" -ForegroundColor Gray
                }
            }
        }

        if ($mi.action_items -and $mi.action_items.Count -gt 0) {
            Write-Host "`n  Action Items ($($mi.action_items.Count))" -ForegroundColor White
            $mi.action_items | ForEach-Object {
                $deadline = if ($_.deadline) { " [due: $($_.deadline)]" } else { "" }
                Write-Host "    [$($_.owner.ToUpper())] $($_.task)$deadline" -ForegroundColor Gray
            }
        }

        if ($mi.deal_health -and $mi.deal_health.next_steps) {
            Write-Host "`n  Next Steps" -ForegroundColor White
            $mi.deal_health.next_steps | ForEach-Object {
                Write-Host "    → $_" -ForegroundColor Cyan
            }
        }

        if ($mi.calendar_schedule -and $mi.calendar_schedule.Count -gt 0) {
            Write-Host "`n  Calendar" -ForegroundColor White
            $mi.calendar_schedule | ForEach-Object {
                $date = if ($_.suggested_date) { $_.suggested_date } else { "TBD" }
                Write-Host "    📅 $($_.event) ($date)" -ForegroundColor Gray
            }
        }

        if ($mi.intelligence_insights -and $mi.intelligence_insights.Count -gt 0) {
            Write-Host "`n  Intelligence Insights" -ForegroundColor White
            $mi.intelligence_insights | ForEach-Object {
                Write-Host "    › $_" -ForegroundColor Gray
            }
        }

        # ── Coaching Report ───────────────────────────────────────────────────
        if ($coaching) {
            Write-Section "AGENT COACHING REPORT"

            if ($coaching.overall_grade) {
                $score      = $coaching.overall_grade.score_out_of_100
                $gradeColor = if ($score -ge 80) { "Green" } `
                              elseif ($score -ge 60) { "Yellow" } `
                              else { "Red" }
                Write-Host "`n  Overall Grade" -ForegroundColor White
                Write-Host "  $score/100" -ForegroundColor $gradeColor
                Write-Host "  $($coaching.overall_grade.headline_summary)" -ForegroundColor Gray
            }

            if ($coaching.metrics) {
                Write-Host "`n  Talk Ratio" -ForegroundColor White
                Write-Host "  Agent : $($coaching.metrics.agent_talk_ratio_percentage)% | Client: $($coaching.metrics.client_talk_ratio_percentage)%" -ForegroundColor Gray
                Write-Host "  Open-ended Qs: $($coaching.metrics.open_ended_questions_count) | Closed Qs: $($coaching.metrics.closed_questions_count)" -ForegroundColor Gray
            }

            if ($coaching.objections_handled -and $coaching.objections_handled.Count -gt 0) {
                Write-Host "`n  Objection Breakdown ($($coaching.objections_handled.Count))" -ForegroundColor White
                $i = 1
                $coaching.objections_handled | ForEach-Object {
                    $effColor = if ($_.effectiveness_score_out_of_10 -ge 7) { "Green" } `
                                elseif ($_.effectiveness_score_out_of_10 -ge 4) { "Yellow" } `
                                else { "Red" }
                    Write-Host "`n  [$i] $($_.client_objection)" -ForegroundColor White
                    Write-Host "      Score    : $($_.effectiveness_score_out_of_10)/10" -ForegroundColor $effColor
                    Write-Host "      Critique : $($_.coaching_critique)" -ForegroundColor Gray
                    Write-Host "      Better   : `"$($_.exact_alternative_script)`"" -ForegroundColor Cyan
                    $i++
                }
            }

            if ($coaching.missed_revenue_cues -and $coaching.missed_revenue_cues.Count -gt 0) {
                Write-Host "`n  Missed Revenue Cues ($($coaching.missed_revenue_cues.Count))" -ForegroundColor White
                $coaching.missed_revenue_cues | ForEach-Object {
                    Write-Host "    Context : $($_.timestamp_or_context)" -ForegroundColor Gray
                    Write-Host "    Signal  : $($_.client_buying_signal)" -ForegroundColor Yellow
                    Write-Host "    Missed  : $($_.agent_missed_action)" -ForegroundColor Red
                    Write-Host ""
                }
            }

            if ($coaching.top_three_action_items -and $coaching.top_three_action_items.Count -gt 0) {
                Write-Host "`n  Top 3 Coaching Actions" -ForegroundColor White
                $n = 1
                $coaching.top_three_action_items | ForEach-Object {
                    Write-Host "  $n. $_" -ForegroundColor Cyan
                    $n++
                }
            }
        }

        # ── Save output ───────────────────────────────────────────────────────
        Write-Section "OUTPUT"
        $outputFile = "meeting_$meetingId.json"
        $results | ConvertTo-Json -Depth 10 | Out-File $outputFile -Encoding UTF8
        Write-Host ""
        Write-Success "Full results saved to: $outputFile"
        Write-Info "Meeting ID : $meetingId"
        Write-Info "Runtime    : ${totalElapsed}s"
        Write-Info "Chunks     : $($results.chunks)"
        Write-Host ""
        exit 0
    }

    if ($results.status -eq "failed") {
        Write-Fail "Analysis failed — check docker logs osf-worker"
        Write-Info "Meeting ID: $meetingId"
        exit 1
    }
}

Write-Fail "Timed out after $($MaxPollAttempts * $PollIntervalSeconds)s waiting for insights"
Write-Info "Meeting ID: $meetingId — check docker logs osf-worker"
exit 1