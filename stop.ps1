param()

Set-Location $PSScriptRoot

Write-Host "Stopping SMBFlow Local Environment..." -ForegroundColor Cyan

# Helper to stop process by port
function Stop-ProcessByPort {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "Stopping $($proc.ProcessName) (PID: $($proc.Id)) on port $Port..."
                Stop-Process -Id $proc.Id -Force
            }
        }
    } else {
        Write-Host "No process found listening on port $Port." -ForegroundColor DarkGray
    }
}

# 1. Stop Backend on port 8000
Write-Host "Stopping Backend..."
Stop-ProcessByPort -Port 8000

# 2. Stop Frontend on port 5173
Write-Host "Stopping Frontend..."
Stop-ProcessByPort -Port 5173

# 3. Stop Docker Infrastructure
Write-Host "Stopping Docker infrastructure safely (docker-compose stop)..."
docker-compose stop

Write-Host "SMBFlow has been stopped." -ForegroundColor Green
