# Deploy step: copies settings that are stored as GitHub secrets (environment "production") into the
# server's .env, so a secret can be set without signing in to the server. Only settings named below,
# and only when the secret has a value; everything else in .env is left as it is.
# deploy.ps1 restarts the app afterwards, so new values take effect on the same deploy.
$ErrorActionPreference = "Stop"
$Names = @("HUB_ADMIN_URL", "HUB_ADMIN_KEY")

$App = Split-Path $PSScriptRoot -Parent
$EnvFile = Join-Path $App ".env"
if (-not (Test-Path $EnvFile)) { throw ".env not found - run deploy\server-setup.ps1 first" }

$lines = [System.Collections.Generic.List[string]]([IO.File]::ReadAllLines($EnvFile))
$changed = $false
foreach ($name in $Names) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if (-not $value) { continue }
  $value = $value.Trim()
  if ($value.Contains('"')) { throw "$name must not contain a double quote" }
  $line = "$name=`"$value`""
  if ($lines.Contains($line)) { Write-Host "=   $name unchanged"; continue }
  $lines.RemoveAll([Predicate[string]]{ param($l) $l -match "^\s*$name\s*=" }) | Out-Null
  $lines.Add($line)
  $changed = $true
  Write-Host "OK  $name set"
}
# Rewrites the same file (keeps its permissions), UTF-8 without BOM.
if ($changed) { [IO.File]::WriteAllLines($EnvFile, $lines) }
