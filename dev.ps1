#!/usr/bin/env pwsh
#  Local dev launcher 
# Usage:
#   .\dev.ps1           # start postgres + next.js + ws server
#   .\dev.ps1 -Stop     # stop postgres docker container
# --------------------------------------------------------------------------
param([switch]$Stop)

if ($Stop) {
    Write-Host "[stop] Stopping dev postgres..." -ForegroundColor Yellow
    docker compose -f docker-compose.dev.yml down 2>$null
    exit 0
}

# --- Helper: parse host/port from DATABASE_URL in .env ----------------------
$envFile = Join-Path $PSScriptRoot ".env"
$dbUrl = (Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL' }) -replace '.*=(.*)', '$1' -replace '"', ''
# e.g. postgresql://user:pass@host:port/db
if ($dbUrl -match '@([^:/]+):([0-9]+)/') {
    $dbHost = $Matches[1]
    $dbPort = [int]$Matches[2]
} else {
    $dbHost = 'localhost'
    $dbPort = 5432
}

# --- Check if postgres is already reachable (local service) -----------------
Write-Host "[db] Checking postgres at ${dbHost}:${dbPort}..." -ForegroundColor Cyan
$tcpClient = New-Object System.Net.Sockets.TcpClient
try {
    $tcpClient.Connect($dbHost, $dbPort)
    $localPostgres = $true
    $tcpClient.Close()
} catch {
    $localPostgres = $false
}

if ($localPostgres) {
    Write-Host "[db] Local postgres is already running, skipping Docker." -ForegroundColor Green
} else {
    # Check Docker daemon
    docker info > $null 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[error] No local postgres found and Docker is not running." -ForegroundColor Red
        Write-Host "        Either start your local PostgreSQL service, or start Docker Desktop." -ForegroundColor Yellow
        exit 1
    }

    # Start Docker postgres
    Write-Host "[db] Starting postgres via Docker..." -ForegroundColor Cyan
    docker compose -f docker-compose.dev.yml up -d

    Write-Host "[db] Waiting for postgres to be ready..." -ForegroundColor Cyan
    $tries = 0
    do {
        Start-Sleep -Seconds 1
        $tries++
        if ($tries -gt 30) {
            Write-Host "[error] Postgres did not become ready in time." -ForegroundColor Red
            exit 1
        }
        docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U messme -d messme_dev 2>&1 | Out-Null
    } while ($LASTEXITCODE -ne 0)
    Write-Host "[db] Postgres is ready." -ForegroundColor Green
}

Write-Host "[db] Postgres is healthy" -ForegroundColor Green

# 3. Run migrations + generate client
Write-Host "[db] Running prisma migrations..." -ForegroundColor Cyan
npx prisma migrate dev --skip-generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "[error] Migration failed. Check your DATABASE_URL in .env" -ForegroundColor Red
    Write-Host "        Current value: $dbUrl" -ForegroundColor Yellow
    exit 1
}
Write-Host "[db] Generating Prisma client..." -ForegroundColor Cyan
npx prisma generate

# 4. Start services in parallel
Write-Host ""
Write-Host "[info] Starting services..." -ForegroundColor Green
Write-Host "  Next.js   -> http://localhost:3000" -ForegroundColor White
Write-Host "  WS server -> ws://localhost:3003" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

# Launch WS server in background job
$wsJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    npm run dev --prefix mini-services/messenger-server
} -Name "ws-server"

Write-Host "[ws] WS server started (job id: $($wsJob.Id))" -ForegroundColor Magenta

# Launch Next.js in foreground (Ctrl+C terminates it)
try {
    npm run dev
} finally {
    Write-Host ""
    Write-Host "[stop] Stopping WS server..." -ForegroundColor Yellow
    Stop-Job  $wsJob -ErrorAction SilentlyContinue
    Remove-Job $wsJob -ErrorAction SilentlyContinue
}
