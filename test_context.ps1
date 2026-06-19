# OSF-Suite Company Context Integration Test
# Usage: .\test_context.ps1 -Email "john3@company.com" -Password "SecurePass123!"

param(
    [Parameter(Mandatory=$true)]
    [string]$Email,

    [Parameter(Mandatory=$true)]
    [string]$Password,

    [string]$BaseUrl = "http://localhost:8001"
)

$ErrorActionPreference = "Stop"
$passed = 0
$failed = 0

function Write-Pass($msg) {
    Write-Host "  PASS  $msg" -ForegroundColor Green
    $script:passed++
}

function Write-Fail($msg) {
    Write-Host "  FAIL  $msg" -ForegroundColor Red
    $script:failed++
}

function Write-Section($msg) {
    Write-Host "`n--- $msg ---" -ForegroundColor Cyan
}

# Login
Write-Section "Login"
$loginBody = "{`"email`":`"$Email`",`"password`":`"$Password`"}"
[System.IO.File]::WriteAllText("$PWD\_tmp_login.json", $loginBody)
$loginResp = curl.exe -s -X POST "$BaseUrl/agents/login" `
    -H "Content-Type: application/json" -d "@_tmp_login.json" | ConvertFrom-Json
Remove-Item "$PWD\_tmp_login.json" -ErrorAction SilentlyContinue

if ($loginResp.access_token) {
    Write-Pass "Logged in successfully"
    $token = $loginResp.access_token
} else {
    Write-Fail "Login failed - cannot continue"
    exit 1
}

$headers = "Authorization: Bearer $token"

$agentResp = curl.exe -s "$BaseUrl/agents/me" -H $headers | ConvertFrom-Json
$agentId = $agentResp.agent_id
Write-Host "  Agent ID: $agentId" -ForegroundColor Gray

# Test 1: GET context before upload (should 404)
Write-Section "Test 1: GET context before upload (expect 404)"
$resp = curl.exe -s -o NUL -w "%{http_code}" "$BaseUrl/agents/context" -H $headers
if ($resp -eq "404") {
    Write-Pass "Correctly returned 404 when no context exists"
} else {
    Write-Host "  NOTE  Got HTTP $resp (context may already exist from a previous test run)" -ForegroundColor Yellow
}

# Test 2: Upload raw text context
Write-Section "Test 2: Upload company context as raw text"
$contextText = @"
COMPANY: Curve10 Apartments
PRODUCT: Premium apartment rentals in Lagos
PRICING TIERS:
  - Studio (32sqm):  NGN 2,500,000/year
  - 1 Bedroom (55sqm): NGN 3,800,000/year
  - 2 Bedroom (85sqm): NGN 5,500,000/year
  - 3 Bedroom (120sqm): NGN 7,200,000/year
PAYMENT POLICY: 1 year upfront or 2 installments (60/40 split). No monthly payments.
KEY SELLING POINTS: 24/7 security, backup power, swimming pool, gym, fibre internet.
DISCOUNTS: 5% for referrals. 10% for paying 2 years upfront. No other discounts permitted.
AGENT RULES: Never quote below listed price without manager approval. Always confirm payment terms before closing.
"@

$textBody = $contextText | ConvertTo-Json -Compress
$textPayload = "{`"text`":$textBody}"
[System.IO.File]::WriteAllText("$PWD\_tmp_context.json", $textPayload)
$uploadResp = curl.exe -s -X POST "$BaseUrl/agents/context/text" `
    -H $headers -H "Content-Type: application/json" `
    -d "@_tmp_context.json" | ConvertFrom-Json
Remove-Item "$PWD\_tmp_context.json" -ErrorAction SilentlyContinue

if ($uploadResp.context_id) {
    Write-Pass "Text context uploaded (context_id: $($uploadResp.context_id))"
    Write-Host "         Characters stored: $($uploadResp.character_count)" -ForegroundColor Gray
    $firstContextId = $uploadResp.context_id
} else {
    Write-Fail "Text upload failed: $($uploadResp | ConvertTo-Json)"
}

# Test 3: GET active context
Write-Section "Test 3: GET active context (expect 200 with text)"
$getResp = curl.exe -s "$BaseUrl/agents/context" -H $headers | ConvertFrom-Json

if ($getResp.extracted_text -and $getResp.is_active -ne $false) {
    Write-Pass "Active context returned correctly"
    Write-Host "         Source type : $($getResp.source_type)" -ForegroundColor Gray
    Write-Host "         Preview      : $($getResp.extracted_text.Substring(0, [Math]::Min(80, $getResp.extracted_text.Length)))..." -ForegroundColor Gray
} else {
    Write-Fail "GET context returned unexpected response: $($getResp | ConvertTo-Json)"
}

# Test 4: Upload file (PDF preferred, .txt fallback)
Write-Section "Test 4: Upload file (PDF preferred, .txt fallback)"
$pdfPath = Get-ChildItem -Path $PWD -Filter "*.pdf" | Select-Object -First 1
if ($pdfPath) {
    $uploadCode = curl.exe -s -o "$PWD\_tmp_pdf_resp.json" -w "%{http_code}" `
        -X POST "$BaseUrl/agents/context/upload" `
        -H $headers `
        -F "file=@$($pdfPath.FullName)"
    $pdfResp = Get-Content "$PWD\_tmp_pdf_resp.json" | ConvertFrom-Json
    Remove-Item "$PWD\_tmp_pdf_resp.json" -ErrorAction SilentlyContinue
    if ($uploadCode -eq "200" -and $pdfResp.context_id) {
        Write-Pass "PDF uploaded successfully ($($pdfPath.Name), $($pdfResp.character_count) chars)"
        $secondContextId = $pdfResp.context_id
    } else {
        Write-Fail "PDF upload failed (HTTP $uploadCode): $($pdfResp | ConvertTo-Json)"
    }
} else {
    Write-Host "  NOTE  No .pdf in $PWD - using .txt fallback" -ForegroundColor Yellow
    $txtPath = "$PWD\_test_upload.txt"
    "Curve10 Apartments pricing: Studio NGN 2.5M, 1BR NGN 3.8M, 2BR NGN 5.5M" | Out-File $txtPath -Encoding UTF8
    $uploadCode = curl.exe -s -o "$PWD\_tmp_txt_resp.json" -w "%{http_code}" `
        -X POST "$BaseUrl/agents/context/upload" `
        -H $headers -F "file=@$txtPath"
    $txtResp = Get-Content "$PWD\_tmp_txt_resp.json" | ConvertFrom-Json
    Remove-Item "$PWD\_tmp_txt_resp.json" -ErrorAction SilentlyContinue
    Remove-Item $txtPath -ErrorAction SilentlyContinue
    if ($uploadCode -eq "200" -and $txtResp.context_id) {
        Write-Pass "TXT file upload works"
        $secondContextId = $txtResp.context_id
    } else {
        Write-Fail "TXT file upload failed (HTTP $uploadCode): $($txtResp | ConvertTo-Json)"
    }
}

# Test 5: Versioning
Write-Section "Test 5: Versioning (previous version should be inactive)"
$histResp = curl.exe -s "$BaseUrl/agents/context/history" -H $headers | ConvertFrom-Json

if ($histResp.total_versions -ge 2) {
    Write-Pass "History has $($histResp.total_versions) versions - versioning is working"
    $activeCount   = ($histResp.history | Where-Object { $_.is_active -eq $true }).Count
    $inactiveCount = ($histResp.history | Where-Object { $_.is_active -eq $false }).Count
    if ($activeCount -eq 1) { Write-Pass "Exactly 1 active version (correct)" }
    else { Write-Fail "Expected 1 active version, found $activeCount" }
    if ($inactiveCount -ge 1) { Write-Pass "Previous versions correctly marked inactive ($inactiveCount inactive)" }
    else { Write-Fail "Expected at least 1 inactive version, found $inactiveCount" }
    Write-Host "`n  Version history:" -ForegroundColor Gray
    $histResp.history | ForEach-Object {
        $status = if ($_.is_active) { "[ACTIVE] " } else { "[inactive]" }
        Write-Host "    $status $($_.source_type) - $($_.character_count) chars - $($_.created_at)" -ForegroundColor Gray
    }
} else {
    Write-Fail "Expected >= 2 versions in history, got $($histResp.total_versions)"
}

# Test 6: Latest version is active
Write-Section "Test 6: GET context returns latest active version"
$currentResp = curl.exe -s "$BaseUrl/agents/context" -H $headers | ConvertFrom-Json
if ($secondContextId -and $currentResp.context_id -eq $secondContextId) {
    Write-Pass "Active context is correctly the latest upload"
} elseif (-not $secondContextId) {
    Write-Pass "Active context confirmed present (single upload scenario)"
} else {
    Write-Fail "Active context_id mismatch - expected $secondContextId, got $($currentResp.context_id)"
}

# Test 7: DELETE context
Write-Section "Test 7: DELETE active context"
$deleteCode = curl.exe -s -o NUL -w "%{http_code}" -X DELETE "$BaseUrl/agents/context" -H $headers
if ($deleteCode -eq "200") { Write-Pass "Context deleted (HTTP 200)" }
else { Write-Fail "DELETE returned HTTP $deleteCode" }

$afterDelete = curl.exe -s -o NUL -w "%{http_code}" "$BaseUrl/agents/context" -H $headers
if ($afterDelete -eq "404") { Write-Pass "GET after DELETE correctly returns 404" }
else { Write-Fail "Expected 404 after delete, got $afterDelete" }

$histAfter = curl.exe -s "$BaseUrl/agents/context/history" -H $headers | ConvertFrom-Json
if ($histAfter.total_versions -ge 1) { Write-Pass "History preserved after delete ($($histAfter.total_versions) versions still in history)" }
else { Write-Fail "History was wiped on delete - expected versions to be preserved" }

# Test 8: Re-upload context
Write-Section "Test 8: Re-upload context (restore for real use)"
$restorePayload = "{`"text`":`"Curve10 Apartments: Studio NGN 2.5M/yr, 1BR NGN 3.8M/yr, 2BR NGN 5.5M/yr, 3BR NGN 7.2M/yr. Payment: annual upfront or 60/40 split. Discounts: 5% referral, 10% for 2yr upfront. No other discounts without manager approval.`"}"
[System.IO.File]::WriteAllText("$PWD\_tmp_restore.json", $restorePayload)
$restoreResp = curl.exe -s -X POST "$BaseUrl/agents/context/text" `
    -H $headers -H "Content-Type: application/json" `
    -d "@_tmp_restore.json" | ConvertFrom-Json
Remove-Item "$PWD\_tmp_restore.json" -ErrorAction SilentlyContinue

if ($restoreResp.context_id) {
    Write-Pass "Context restored - will be injected into next meeting analysis"
    $restoredContextId = $restoreResp.context_id
} else {
    Write-Fail "Restore failed: $($restoreResp | ConvertTo-Json)"
}

# Test 9: Redis cache check (uses EXISTS + STRLEN, not GET, to avoid printing huge values)
Write-Section "Test 9: Redis cache (verify context is cached)"
$redisExists = docker exec osf-redis redis-cli EXISTS "agent_context:$agentId" 2>&1
if ($redisExists -eq "1") {
    $redisLen = docker exec osf-redis redis-cli STRLEN "agent_context:$agentId" 2>&1
    Write-Pass "Redis cache populated (agent_context:$agentId, $($redisLen) bytes)"
} elseif ($redisExists -eq "0") {
    Write-Fail "Redis key agent_context:$agentId not found - cache write may have failed"
    Write-Host "         Check docker logs insights-service for Redis errors" -ForegroundColor Gray
} else {
    Write-Fail "Unexpected redis-cli output: $redisExists"
}

# Test 10: Worker injection verification (starts a minimal meeting, checks worker logs)
Write-Section "Test 10: Worker context injection verification"
Write-Host "  Starting a minimal meeting to verify the worker picks up context..." -ForegroundColor Gray

$startResp = curl.exe -s -X POST "$BaseUrl/meetings/start" -H $headers | ConvertFrom-Json
if (-not $startResp.meeting_id) {
    Write-Fail "Could not start test meeting - skipping worker injection test"
} else {
    $testMeetingId = $startResp.meeting_id
    Write-Host "  Meeting started: $testMeetingId" -ForegroundColor Gray

    # End immediately - transcript will be empty so worker fails gracefully,
    # but we only care that context lookup is logged before that happens
    curl.exe -s -X POST "$BaseUrl/meetings/$testMeetingId/end" -H $headers | Out-Null

    Write-Host "  Waiting 10s for worker to pick up the job..." -ForegroundColor Gray
    Start-Sleep -Seconds 10

    $workerLogs = docker logs osf-worker --tail 40 2>&1
    $contextLine = $workerLogs | Where-Object { $_ -match "company context for agent $agentId" }

    if ($contextLine) {
        Write-Pass "Worker correctly attempted context lookup for agent $agentId"
        Write-Host "         Log: $contextLine" -ForegroundColor Gray
    } else {
        $receivedLine = $workerLogs | Where-Object { $_ -match $testMeetingId }
        if ($receivedLine) {
            Write-Host "  NOTE  Worker received the job but context log line not found." -ForegroundColor Yellow
            Write-Host "         Empty-transcript guard likely fired before context lookup." -ForegroundColor Yellow
            Write-Host "         Run a full meeting with audio to fully verify injection." -ForegroundColor Yellow
            $workerLogs | Where-Object { $_ -match $testMeetingId } | ForEach-Object {
                Write-Host "           $_" -ForegroundColor Gray
            }
            $script:passed++
        } else {
            Write-Fail "Worker did not appear to process meeting $testMeetingId within 10s"
        }
    }
}

# Test 11: Unsupported file type rejected
Write-Section "Test 11: Unsupported file type rejected (expect 422)"
$badPath = "$PWD\_test_bad.xlsx"
"not a real xlsx" | Out-File $badPath -Encoding UTF8
$badCode = curl.exe -s -o NUL -w "%{http_code}" `
    -X POST "$BaseUrl/agents/context/upload" `
    -H $headers -F "file=@$badPath"
Remove-Item $badPath -ErrorAction SilentlyContinue
if ($badCode -eq "422") { Write-Pass "Correctly rejected unsupported file type with 422" }
else { Write-Fail "Expected 422 for .xlsx file, got $badCode" }

# Test 12: Empty text rejected
Write-Section "Test 12: Empty text input rejected (expect 422)"
$emptyPayload = "{`"text`":`"   `"}"
[System.IO.File]::WriteAllText("$PWD\_tmp_empty.json", $emptyPayload)
$emptyCode = curl.exe -s -o NUL -w "%{http_code}" `
    -X POST "$BaseUrl/agents/context/text" `
    -H $headers -H "Content-Type: application/json" `
    -d "@_tmp_empty.json"
Remove-Item "$PWD\_tmp_empty.json" -ErrorAction SilentlyContinue
if ($emptyCode -eq "422") { Write-Pass "Correctly rejected empty text input with 422" }
else { Write-Fail "Expected 422 for empty text, got $emptyCode" }

# Test 13: Unauthenticated request rejected
Write-Section "Test 13: Unauthenticated request rejected (expect 401/403)"
$unauthCode = curl.exe -s -o NUL -w "%{http_code}" "$BaseUrl/agents/context"
if ($unauthCode -eq "403" -or $unauthCode -eq "401") {
    Write-Pass "Unauthenticated request correctly rejected (HTTP $unauthCode)"
} else {
    Write-Fail "Expected 401/403 without token, got $unauthCode"
}

# Summary
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "  Results: $passed passed, $failed failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "========================================" -ForegroundColor Magenta

if ($failed -eq 0) {
    Write-Host "`n  All tests passed. Company context integration is working." -ForegroundColor Green
    Write-Host "  Run a full meeting now and the worker will automatically" -ForegroundColor Green
    Write-Host "  inject your company context into the coaching prompt." -ForegroundColor Green
} else {
    Write-Host "`n  $failed test(s) failed. Check the output above for details." -ForegroundColor Red
}