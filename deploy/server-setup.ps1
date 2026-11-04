# One-time production setup for the Portal, run ON the server as Administrator:
#   powershell -ExecutionPolicy Bypass -File "C:\Program Files\iisnode\www\portal\deploy\server-setup.ps1"
#
# Prompts for the MariaDB root password and the SES (AWS) key, so no secret ever leaves the server.
# Creates: database + user "portal", .env (fresh AUTH_SECRET, signing key, DB password), runs
# migrations, installs web.config and restarts the IIS site.

$ErrorActionPreference = "Stop"
$App = Split-Path $PSScriptRoot -Parent
$Mysql = "C:\Program Files\MariaDB 10.5\bin\mysql.exe"
$EnvFile = Join-Path $App ".env"
Set-Location $App

if (Test-Path $EnvFile) { throw ".env already exists - setup was already done. Delete it first if you really want to start over." }

function Read-Secret([string]$prompt) {
  $s = Read-Host -Prompt $prompt -AsSecureString
  [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}
function New-Random([int]$bytes) {
  $b = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  [Convert]::ToBase64String($b).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

# 1. Database + dedicated user (only the "portal" database)
$rootPw = Read-Secret "MariaDB root password"
if (-not $rootPw) { throw "MariaDB root password is required" }
$dbPw = New-Random 24
$env:MYSQL_PWD = $rootPw
@"
CREATE DATABASE IF NOT EXISTS portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'portal'@'localhost' IDENTIFIED BY '$dbPw';
CREATE USER IF NOT EXISTS 'portal'@'127.0.0.1' IDENTIFIED BY '$dbPw';
ALTER USER 'portal'@'localhost' IDENTIFIED BY '$dbPw';
ALTER USER 'portal'@'127.0.0.1' IDENTIFIED BY '$dbPw';
GRANT ALL PRIVILEGES ON portal.* TO 'portal'@'localhost', 'portal'@'127.0.0.1';
FLUSH PRIVILEGES;
"@ | & $Mysql -h 127.0.0.1 -P 3307 -u root
$failed = $LASTEXITCODE
Remove-Item Env:MYSQL_PWD
if ($failed) { throw "Creating the database failed (wrong root password?)" }
Write-Host "OK  database 'portal' and user 'portal'"

# 2. Email via Amazon SES
$awsKey = Read-Host -Prompt "AWS access key id for SES (AKIA...)"
$awsSecret = Read-Secret "AWS secret access key for SES"

# 3. .env
$signing = node scripts/gen-signing-key.mjs
if ($LASTEXITCODE) { throw "Generating the signing key failed" }
$content = @"
DATABASE_URL="mysql://portal:$dbPw@127.0.0.1:3307/portal"
SHADOW_DATABASE_URL="mysql://unused:unused@127.0.0.1:1/unused"
AUTH_URL="https://portal.iexcellence.cloud"
AUTH_TRUST_HOST="true"
AUTH_SECRET="$(New-Random 32)"
$($signing -join "`n")
MAIL_TRANSPORT="ses"
AWS_REGION="ap-southeast-2"
AWS_ACCESS_KEY_ID="$awsKey"
AWS_SECRET_ACCESS_KEY="$awsSecret"
MAIL_FROM="iExcellence Workspace <HR@iexcellence.cloud>"
"@
# UTF-8 without BOM: a BOM would corrupt the first variable name.
[IO.File]::WriteAllText($EnvFile, $content.Replace("`r`n", "`n") + "`n", (New-Object Text.UTF8Encoding $false))

Import-Module WebAdministration
$pool = (Get-Website portal).applicationPool
# .env readable only by admins, SYSTEM and the site's app pool.
icacls $EnvFile /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F" /grant "IIS AppPool\${pool}:R" | Out-Null
Write-Host "OK  .env written (readable by Administrators, SYSTEM, IIS AppPool\$pool)"

# 4. Schema
npx prisma migrate deploy
if ($LASTEXITCODE) { throw "prisma migrate deploy failed" }
Write-Host "OK  database migrated"

# 5. IIS: web.config, write access for Next.js cache + iisnode logs, restart
Copy-Item (Join-Path $App "deploy\web.config") (Join-Path $App "web.config") -Force
icacls (Join-Path $App ".next") /grant "IIS AppPool\${pool}:(OI)(CI)M" | Out-Null
New-Item -ItemType Directory -Force (Join-Path $App "iisnode") | Out-Null
icacls (Join-Path $App "iisnode") /grant "IIS AppPool\${pool}:(OI)(CI)M" | Out-Null
Restart-WebAppPool $pool
Write-Host "OK  IIS site restarted"

# 6. Smoke test
Start-Sleep -Seconds 8
$r = Invoke-WebRequest -Uri "https://portal.iexcellence.cloud/api/portal/jwks.json" -UseBasicParsing
if ($r.StatusCode -ne 200 -or $r.Content -notmatch '"keys"') { throw "Smoke test failed: $($r.StatusCode)" }
Write-Host ""
Write-Host "DONE. Open https://portal.iexcellence.cloud/"
