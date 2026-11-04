# Update the Portal after new code is in place (first install: deploy\server-setup.ps1). Run on the server:
#   powershell -ExecutionPolicy Bypass -File "C:\Program Files\iisnode\www\portal\deploy\deploy.ps1"
$ErrorActionPreference = "Stop"
$App = Split-Path $PSScriptRoot -Parent
Set-Location $App
if (-not (Test-Path ".env")) { throw ".env not found - run deploy\server-setup.ps1 first" }

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
