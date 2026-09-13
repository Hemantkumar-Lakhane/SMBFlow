param()

Set-Location $PSScriptRoot

Write-Host "Starting SMBFlow Local Environment..." -ForegroundColor Cyan

# 1. Start Redis Infrastructure (Optional local pub/sub cache)
Write-Host "Ensuring Redis container is running..." -ForegroundColor Gray
try {
    docker-compose up -d redis 2>$null
} catch {
    Write-Host "Notice: Docker not available or Redis already running natively." -ForegroundColor Yellow
}
# 1b. Ensure the Email Summarizer fixture exists.
#     This is the ONLY seed data startup needs. The legacy multi-industry seeders
#     (SaaS / retail / healthcare / finance / real-estate) are intentionally NOT run
#     here — startup must not regenerate old industry demo data.
$emailFixture = Join-Path $PSScriptRoot "db\seed\data\email_messages.json"
if (-not (Test-Path $emailFixture)) {
    Write-Host "Generating Email Summarizer fixture (email_messages.json)..." -ForegroundColor Cyan
    .\venv\Scripts\python.exe db/seed/email_seed.py
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARNING: Email fixture generation failed. The Email Summarizer workflow may have no data." -ForegroundColor Yellow
        Write-Host "         Retry manually with: .\venv\Scripts\python.exe db/seed/email_seed.py" -ForegroundColor Yellow
    }
} else {
    Write-Host "Email Summarizer fixture already present (email_messages.json) - skipping seed generation." -ForegroundColor Gray
}

# 2. Check and start Backend (Port 8000)
$backendRunning = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($backendRunning) {
    Write-Host "Backend API is already running on port 8000." -ForegroundColor Yellow
} else {
    Write-Host "Starting Backend API in a new window..." -ForegroundColor Green
    Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "& '.\venv\Scripts\python.exe' main.py api" -WorkingDirectory $PWD -WindowStyle Normal
}

# 3. Check and start Frontend (Port 5173)
$frontendRunning = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($frontendRunning) {
    Write-Host "Frontend is already running on port 5173." -ForegroundColor Yellow
} else {
    Write-Host "Starting Frontend in a new window..." -ForegroundColor Green
    Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev" -WorkingDirectory $PWD -WindowStyle Normal
}

# 4. Wait for the backend to actually become healthy before declaring success.
#    The backend runs in a separate window, so this script must poll its health
#    endpoint rather than assume it came up.
$healthUrl = "http://127.0.0.1:8000/api/v1/health"
$maxAttempts = 30   # 30 x 2s = up to 60s for uvicorn (with reload) + DB connection
$backendHealthy = $false

Write-Host ""
Write-Host "Waiting for backend to become healthy at $healthUrl ..." -ForegroundColor Gray
for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
        $resp = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3 -ErrorAction Stop
        if ($resp -and $resp.status -eq "ok") {
            $backendHealthy = $true
            break
        }
    } catch {
        # Backend not accepting connections yet — keep polling.
    }
    Start-Sleep -Seconds 2
    Write-Host "  ...still waiting for backend ($i/$maxAttempts)" -ForegroundColor DarkGray
}

Write-Host ""
if ($backendHealthy) {
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "SMBFlow is running!" -ForegroundColor Green
    Write-Host "Frontend Dashboard:   http://localhost:5173"
    Write-Host "API Base URL:         http://127.0.0.1:8000"
    Write-Host "API Testing (Docs):   http://127.0.0.1:8000/docs"
    Write-Host "API Health Check:     http://127.0.0.1:8000/api/v1/health"
    Write-Host "API ReDoc View:       http://127.0.0.1:8000/redoc"
    Write-Host "==========================================" -ForegroundColor Cyan
} else {
    Write-Host "==========================================" -ForegroundColor Red
    Write-Host "SMBFlow backend did NOT become healthy." -ForegroundColor Red
    Write-Host "The API at $healthUrl did not respond with status 'ok' after $($maxAttempts * 2)s." -ForegroundColor Red
    Write-Host ""
    Write-Host "ACTION: Check the separate 'python main.py api' backend window for the real" -ForegroundColor Yellow
    Write-Host "        error (stack trace, port 8000 conflict, or database connection failure)." -ForegroundColor Yellow
    Write-Host "        The frontend may still be starting on http://localhost:5173, but the app" -ForegroundColor Yellow
    Write-Host "        will not work until the backend is healthy." -ForegroundColor Yellow
    Write-Host "==========================================" -ForegroundColor Red
    exit 1
}
