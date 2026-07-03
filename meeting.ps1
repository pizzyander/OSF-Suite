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

if ((Get-Date) -gt $tokenExpiry) {
    Write-Host "  Refreshing token..." -ForegroundColor Yellow
    $token = Get-FreshToken $Email $Password $BaseUrl
    $tokenExpiry = (Get-Date).AddMinutes(470)
}

$filename = Split-Path $AudioFile -Leaf
$encodedFilename = [System.Uri]::EscapeDataString($filename)
$uploadResponse = curl.exe -s "$BaseUrl/meetings/$meetingId/upload-url?filename=$encodedFilename" `
    -H "Authorization: Bearer $token" | ConvertFrom-Json

if (-not $uploadResponse.upload_url) {
    Write-Host "  Debug response: $($uploadResponse | ConvertTo-Json)" -ForegroundColor Yellow
    Write-Fail "Failed to get upload URL"
    exit 1
}

$uploadUrl  = $uploadResponse.upload_url
$s3Key      = $uploadResponse.s3_key
Write-Success "Got presigned URL (s3_key: $s3Key)"


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

if (-not $chunkResponse.chunk_index -and $chunkResponse.chunk_index -ne 0) {
    Write-Fail "Chunk upload failed: $($chunkResponse | ConvertTo-Json)"
    exit 1
}

Write-Success "Chunk $($chunkResponse.chunk_index) queued for transcription"
Write-Host "  Status: $($chunkResponse.status)" -ForegroundColor Gray

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

    $rawResults = curl.exe -s "$BaseUrl/meetings/$meetingId/results" `
        -H "Authorization: Bearer $token"

    try {
        $results = $rawResults | ConvertFrom-Json
    } catch {
        Write-Host "  Attempt $attempt/$MaxPollAttempts - Bad response, retrying..." -ForegroundColor Yellow
        continue
    }

    Write-Host "  Attempt $attempt/$MaxPollAttempts - Status: $($results.status)" -ForegroundColor Yellow
    if ($results.status -eq "done") {
        Write-Success "Insights ready!"

        # Insights are nested: results.insights.meeting_intelligence / results.insights.coaching
        $mi = $results.insights.meeting_intelligence
        $coaching = $results.insights.coaching

        # ===================== MEETING INTELLIGENCE =====================
        Write-Host "`n========== MEETING INSIGHTS ==========" -ForegroundColor Magenta
        Write-Host "Meeting ID  : $meetingId"
        Write-Host "Summary     : $($mi.summary)"

        if ($mi.deal_health) {
            Write-Host "`nDeal Health : $($mi.deal_health.score.ToUpper()) - $($mi.deal_health.reasoning)"
        }

        if ($mi.client_personality) {
            Write-Host "`nClient Personality:"
            Write-Host "  Communication Style : $($mi.client_personality.communication_style)"
            Write-Host "  Decision Making     : $($mi.client_personality.decision_making)"
            Write-Host "  Key Motivators      :"
            $mi.client_personality.key_motivators | ForEach-Object { Write-Host "    - $_" }
        }

        Write-Host "`nBuying Signals:"
        $mi.buying_signals | ForEach-Object { Write-Host "  - $_" }

        Write-Host "`nClient Pain Points:"
        $mi.client_pain_points | ForEach-Object { Write-Host "  - $_" }

        Write-Host "`nObjections Raised:"
        $mi.objections_raised | ForEach-Object {
            Write-Host "  - $($_.objection)"
            if ($_.how_handled) { Write-Host "      Handled: $($_.how_handled)" }
        }

        Write-Host "`nAction Items:"
        $mi.action_items | ForEach-Object {
            $deadline = if ($_.deadline) { " (due: $($_.deadline))" } else { "" }
            Write-Host "  - [$($_.owner)] $($_.task)$deadline"
        }

        if ($mi.deal_health) {
            Write-Host "`nNext Steps:"
            $mi.deal_health.next_steps | ForEach-Object { Write-Host "  - $_" }
        }

        Write-Host "`nCalendar Schedule:"
        $mi.calendar_schedule | ForEach-Object {
            $date = if ($_.suggested_date) { $_.suggested_date } else { "TBD" }
            Write-Host "  - $($_.event) ($date)"
        }

        Write-Host "`nIntelligence Insights:"
        $mi.intelligence_insights | ForEach-Object { Write-Host "  - $_" }

        # ============================ COACHING ============================
        if ($coaching) {
            Write-Host "`n========== AGENT COACHING REPORT ==========" -ForegroundColor Magenta

            if ($coaching.overall_grade) {
                Write-Host "`nOverall Grade : $($coaching.overall_grade.score_out_of_100)/100"
                Write-Host "Headline      : $($coaching.overall_grade.headline_summary)"
            }

            if ($coaching.metrics) {
                Write-Host "`nTalk Ratio:"
                Write-Host "  Agent  : $($coaching.metrics.agent_talk_ratio_percentage)%"
                Write-Host "  Client : $($coaching.metrics.client_talk_ratio_percentage)%"
                Write-Host "Questions:"
                Write-Host "  Open-ended : $($coaching.metrics.open_ended_questions_count)"
                Write-Host "  Closed     : $($coaching.metrics.closed_questions_count)"
            }

            if ($coaching.objections_handled -and $coaching.objections_handled.Count -gt 0) {
                Write-Host "`n--- Objection-by-Objection Breakdown ---"
                $i = 1
                $coaching.objections_handled | ForEach-Object {
                    Write-Host "`n  [$i] Client objection : $($_.client_objection)"
                    Write-Host "      Agent response   : $($_.agent_response)"
                    Write-Host "      Effectiveness    : $($_.effectiveness_score_out_of_10)/10"
                    Write-Host "      Critique         : $($_.coaching_critique)"
                    Write-Host "      Better script     -> `"$($_.exact_alternative_script)`""
                    $i++
                }
            }

            if ($coaching.missed_revenue_cues -and $coaching.missed_revenue_cues.Count -gt 0) {
                Write-Host "`n--- Missed Revenue Cues ---"
                $coaching.missed_revenue_cues | ForEach-Object {
                    Write-Host "  - Context  : $($_.timestamp_or_context)"
                    Write-Host "    Signal   : $($_.client_buying_signal)"
                    Write-Host "    Missed   : $($_.agent_missed_action)"
                }
            }

            if ($coaching.top_three_action_items -and $coaching.top_three_action_items.Count -gt 0) {
                Write-Host "`n--- Top 3 Action Items for Agent ---"
                $n = 1
                $coaching.top_three_action_items | ForEach-Object {
                    Write-Host "  $n. $_"
                    $n++
                }
            }

            Write-Host "`n=============================================" -ForegroundColor Magenta
        }

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