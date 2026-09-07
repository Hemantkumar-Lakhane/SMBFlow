param()

Set-Location $PSScriptRoot

Write-Host "Starting SMBFlow Local Environment..." -ForegroundColor Cyan

# 1. Start Docker Infrastructure
Write-Host "Ensuring PostgreSQL and Redis are running..."
docker-compose up -d postgres redis

# Wait for healthy to be safe
$retryCount = 0
while ($retryCount -lt 15) {
    $status = docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{end}}" opsgrid_postgres 2>$null
    if ($status -eq "healthy") { break }
    Start-Sleep -Seconds 2
    $retryCount++
}

# 2. Check and start Backend (Port 8000)
$backendRunning = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($backendRunning) {
    Write-Host "Backend API is already running on port 8000." -ForegroundColor Yellow
} else {
    Write-Host "Starting Backend API in a new window..."
    Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "& '.\venv\Scripts\python.exe' main.py api" -WorkingDirectory $PWD -WindowStyle Normal
}

# 3. Check and start Frontend (Port 5173)
$frontendRunning = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($frontendRunning) {
    Write-Host "Frontend is already running on port 5173." -ForegroundColor Yellow
} else {
    Write-Host "Starting Frontend in a new window..."
    Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev" -WorkingDirectory $PWD -WindowStyle Normal
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "SMBFlow is running!" -ForegroundColor Green
Write-Host "Frontend:   http://localhost:5173"
Write-Host "API:        http://127.0.0.1:8000"
Write-Host "API Docs:   http://127.0.0.1:8000/docs"
Write-Host "==========================================" -ForegroundColor Cyan
