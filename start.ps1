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

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "SMBFlow is running!" -ForegroundColor Green
Write-Host "Frontend Dashboard:   http://localhost:5173"
Write-Host "API Base URL:         http://127.0.0.1:8000"
Write-Host "API Testing (Docs):   http://127.0.0.1:8000/docs"
Write-Host "API Health Check:     http://127.0.0.1:8000/api/v1/health"
Write-Host "API ReDoc View:       http://127.0.0.1:8000/redoc"
Write-Host "==========================================" -ForegroundColor Cyan
