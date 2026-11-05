# Set (or replace) settings in the Portal's .env, then restart the site. Run on the server as Administrator:
#   powershell -ExecutionPolicy Bypass -File "C:\Program Files\iisnode\www\portal\deploy\set-env.ps1" AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET
# Each value is asked for on the console, so secrets never go through chat, git or the command line history.
param([Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)][string[]]$Names)
$ErrorActionPreference = "Stop"
$App = Split-Path $PSScriptRoot -Parent
$EnvFile = Join-Path $App ".env"
if (-not (Test-Path $EnvFile)) { throw ".env not found - run deploy\server-setup.ps1 first" }

$lines = [System.Collections.Generic.List[string]]([IO.File]::ReadAllLines($EnvFile))
foreach ($name in $Names) {
  if ($name -notmatch '^[A-Z][A-Z0-9_]*$') { throw "Not a setting name: $name" }
  $secure = Read-Host "$name" -AsSecureString
  $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
  if (-not $value) { throw "$name is empty - nothing changed" }
  if ($value.Contains('"')) { throw "$name must not contain a double quote" }
  $lines.RemoveAll([Predicate[string]]{ param($l) $l -match "^\s*$name\s*=" }) | Out-Null
  $lines.Add("$name=`"$value`"")
  Write-Host "OK  $name set"
}
# Rewrites the same file (keeps its permissions), UTF-8 without BOM.
[IO.File]::WriteAllLines($EnvFile, $lines)

Import-Module WebAdministration
$pool = (Get-Website portal).applicationPool
# A deploy stops the pool while it builds; start it then instead of failing.
if ((Get-WebAppPoolState $pool).Value -eq "Stopped") { Start-WebAppPool $pool } else { Restart-WebAppPool $pool }
Start-Sleep -Seconds 8
$r = Invoke-WebRequest -Uri "https://portal.iexcellence.cloud/api/portal/jwks.json" -UseBasicParsing
if ($r.StatusCode -ne 200) { throw "Portal did not come back: $($r.StatusCode)" }
Write-Host "Done. Portal restarted with the new settings."
