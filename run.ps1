[CmdletBinding()]
param(
  [int]$Port = 3000,
  [switch]$NoBrowser,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $Root

function Write-Step($msg) {
  Write-Host "[OmniTradePro] $msg" -ForegroundColor Cyan
}

function Write-Ok($msg) {
  Write-Host "[OK] $msg" -ForegroundColor Green
}

function Write-Alert($msg) {
  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Red
  Write-Host "  ERROR: $msg" -ForegroundColor Red
  Write-Host "============================================================" -ForegroundColor Red
  Write-Host ""
}

function Test-LocalPortOpen([int]$CheckPort) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect("127.0.0.1", $CheckPort, $null, $null)
    if ($iar.AsyncWaitHandle.WaitOne(300, $false)) {
      $client.EndConnect($iar)
      return $true
    }
    return $false
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

Write-Host ""
Write-Host "  OmniTradePro Apex Terminal - Zero-Config Desktop Launcher" -ForegroundColor Cyan
Write-Host "  Workspace: $Root" -ForegroundColor DarkGray
Write-Host ""

# 1. Check Node.js & npm
Write-Step "Checking Node.js runtime..."
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $nodeCmd -or -not $npmCmd) {
  Write-Alert "Node.js (v20+) is not installed or not in PATH.`n  Install Node.js LTS from https://nodejs.org/ and re-run run.bat."
  exit 1
}
$nodeVer = (& node -v).Trim()
Write-Ok "Node.js $nodeVer detected"

# 2. Install node_modules if missing
$nodeModulesPath = Join-Path $Root "node_modules"
if (-not (Test-Path -LiteralPath $nodeModulesPath)) {
  Write-Step "node_modules not found - installing dependencies silently..."
  & npm install --no-fund --no-audit --loglevel=error
  if ($LASTEXITCODE -ne 0) {
    Write-Alert "npm install failed with exit code $LASTEXITCODE."
    exit 1
  }
  Write-Ok "Dependencies installed"
} else {
  Write-Ok "Dependencies verified (node_modules present)"
}

# 3. Verify / auto-generate .env and .env.local
Write-Step "Verifying local environment configuration..."
$envPath = Join-Path $Root ".env"
$envLocalPath = Join-Path $Root ".env.local"

function Ensure-EnvFile([string]$Path, [string]$DefaultDb, [string]$DefaultKey) {
  $lines = @()
  if (Test-Path -LiteralPath $Path) {
    $lines = @(Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue)
  }
  $hasDb = ($lines | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' }).Count -gt 0
  $hasKey = ($lines | Where-Object { $_ -match '^\s*VAULT_KEY\s*=' }).Count -gt 0
  $changed = -not (Test-Path -LiteralPath $Path)

  if (-not $hasDb) {
    $lines += "DATABASE_URL=$DefaultDb"
    $changed = $true
  }
  if (-not $hasKey) {
    $lines += "VAULT_KEY=$DefaultKey"
    $changed = $true
  }
  if ($changed) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, ($lines -join "`r`n") + "`r`n", $utf8NoBom)
  }
  return $changed
}

$genKey = (& node -e "console.log(require('crypto').randomBytes(32).toString('hex'))").Trim()
$defaultDbUrl = "pglite://./data/omnitrade-pg"
$c1 = Ensure-EnvFile $envPath $defaultDbUrl $genKey
# Reuse VAULT_KEY from .env if it already existed so .env and .env.local always match
$envKeyMatch = (Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^\s*VAULT_KEY\s*=' } | Select-Object -First 1)
$sharedKey = if ($envKeyMatch) { ($envKeyMatch -split '=', 2)[1].Trim() } else { $genKey }
$envDbMatch = (Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1)
$sharedDb = if ($envDbMatch) { ($envDbMatch -split '=', 2)[1].Trim() } else { $defaultDbUrl }
$c2 = Ensure-EnvFile $envLocalPath $sharedDb $sharedKey

if ($c1 -or $c2) {
  Write-Ok "Auto-generated .env / .env.local with embedded PGlite DB & 32-byte VAULT_KEY"
} else {
  Write-Ok "Environment files (.env & .env.local) verified"
}

# 4. Ensure data dir and push Drizzle schema if server not already running
$dataDir = Join-Path $Root "data"
if (-not (Test-Path -LiteralPath $dataDir)) {
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
}

$alreadyRunning = Test-LocalPortOpen $Port
if ($alreadyRunning) {
  Write-Ok "Server already listening on http://localhost:$Port (skipping schema lock & relaunch)"
} else {
  Write-Step "Synchronizing Drizzle database schema..."
  & npx --no-install drizzle-kit push --force
  if ($LASTEXITCODE -ne 0) {
    Write-Alert "Drizzle schema push failed (exit code $LASTEXITCODE)."
    exit 1
  }
  Write-Ok "Embedded database schema synchronized"

  # 5. Launch Next.js server in a clean PowerShell window
  Write-Step "Launching OmniTradePro server on port $Port..."
  $escapedRoot = $Root.Replace("'", "''")
  $serverCmd = "`$Host.UI.RawUI.WindowTitle = 'OmniTradePro Server (Port $Port)'; Set-Location -LiteralPath '$escapedRoot'; Write-Host '[OmniTradePro] Starting Next.js on http://localhost:$Port ...' -ForegroundColor Cyan; npx --no-install next dev -p $Port"
  $encodedCmd = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($serverCmd))
  Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encodedCmd) -WorkingDirectory $Root | Out-Null
}

# 6. Poll http://localhost:$Port until HTTP 200 is returned
Write-Step "Waiting for http://localhost:$Port to respond HTTP 200..."
$ready = $false
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
  try {
    $health = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 3
    $homeRes = Invoke-WebRequest -Uri "http://localhost:$Port/" -UseBasicParsing -TimeoutSec 5
    if ($health.StatusCode -eq 200 -and $homeRes.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Milliseconds 600
  }
}

if (-not $ready) {
  Write-Alert "Server on http://localhost:$Port did not return HTTP 200 within 60 seconds. Check the OmniTradePro Server window for logs."
  exit 1
}

Write-Ok "http://localhost:$Port is LIVE and returning HTTP 200!"

if (-not $NoBrowser) {
  Write-Step "Opening default browser to http://localhost:$Port ..."
  Start-Process "http://localhost:$Port" | Out-Null
}

Write-Ok "OmniTradePro launched cleanly."
if (-not $NoPause) {
  Start-Sleep -Seconds 2
}
