# Update the Portal after new code is in place (first install: deploy\server-setup.ps1). Run on the server:
#   powershell -ExecutionPolicy Bypass -File "C:\Program Files\iisnode\www\portal\deploy\deploy.ps1"
$ErrorActionPreference = "Stop"
$App = Split-Path $PSScriptRoot -Parent
Set-Location $App
if (-not (Test-Path ".env")) { throw ".env not found - run deploy\server-setup.ps1 first" }

# Notification Hub (LINE / Telegram) settings in .env, so no one has to type them in:
# - HUB_BASE_URL: the Hub runs on this server (added only when missing, so a hand-set value wins)
# - HUB_API_KEY: copied from the Machine environment variable NOTIFYHUB_PORTAL_API_KEY that the Hub
#   team keeps on this server (refreshed on every deploy, so a key they rotate is picked up)
# Values are never printed.
$EnvFile = Join-Path $App ".env"
$envLines = [System.Collections.Generic.List[string]]([IO.File]::ReadAllLines($EnvFile))
$envChanged = $false
function Set-EnvLine([string]$Name, [string]$Value, [bool]$OnlyIfMissing) {
  $has = $envLines.FindIndex([Predicate[string]]{ param($l) $l -match "^\s*$Name\s*=" }) -ge 0
  if ($has -and $OnlyIfMissing) { return }
  $line = "$Name=`"$Value`""
  if ($has -and $envLines.Contains($line)) { return }
  $envLines.RemoveAll([Predicate[string]]{ param($l) $l -match "^\s*$Name\s*=" }) | Out-Null
  $envLines.Add($line)
  $script:envChanged = $true
  Write-Host "OK  $Name set in .env"
}
Set-EnvLine "HUB_BASE_URL" "http://127.0.0.1:4100" $true
$hubKey = [Environment]::GetEnvironmentVariable("NOTIFYHUB_PORTAL_API_KEY", "Machine")
if ($hubKey -and -not $hubKey.Contains('"')) { Set-EnvLine "HUB_API_KEY" $hubKey.Trim() $false }
elseif (-not $hubKey) { Write-Host "NOTE NOTIFYHUB_PORTAL_API_KEY is not set on this server; LINE / Telegram stay off unless HUB_API_KEY is in .env" }
if ($envChanged) { [IO.File]::WriteAllLines($EnvFile, $envLines) }

Import-Module WebAdministration
$pool = (Get-Website portal).applicationPool
# Stop the site's node process so it releases files in node_modules / .next before rebuilding.
Stop-WebAppPool $pool
try {
  npm ci --no-audit --no-fund
  if ($LASTEXITCODE) { throw "npm ci failed" }
  npx prisma migrate deploy
  if ($LASTEXITCODE) { throw "prisma migrate deploy failed" }
  npm run build
  if ($LASTEXITCODE) { throw "build failed" }
  Copy-Item deploy\web.config web.config -Force
  icacls .next /grant "IIS AppPool\${pool}:(OI)(CI)M" | Out-Null
} finally {
  Start-WebAppPool $pool
}

Start-Sleep -Seconds 8
$r = Invoke-WebRequest -Uri "https://portal.iexcellence.cloud/api/portal/jwks.json" -UseBasicParsing
if ($r.StatusCode -ne 200) { throw "Smoke test failed: $($r.StatusCode)" }
Write-Host "Done. https://portal.iexcellence.cloud/"
