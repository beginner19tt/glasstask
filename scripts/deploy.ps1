<#
.SYNOPSIS
  Provisions and deploys GlassTask to Cloudflare. Safe to re-run.

.DESCRIPTION
  Creates the D1 database if it does not exist, writes its id into
  wrangler.jsonc, applies migrations, deploys the Worker and generates a
  SESSION_SECRET if one is not set yet.

  Authenticate first, either with `npx wrangler login` or by setting
  CLOUDFLARE_API_TOKEN in this shell:

      $env:CLOUDFLARE_API_TOKEN = '<token>'
      .\scripts\deploy.ps1

  The generated SESSION_SECRET is piped straight into wrangler and is never
  printed or written to disk.
#>

[CmdletBinding()]
param(
    [string] $DatabaseName = 'glasstask-db'
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Note($text) { Write-Host "    $text" -ForegroundColor DarkGray }

# --- 0. authentication ------------------------------------------------------
Step 'Checking Cloudflare authentication'
$whoami = npx wrangler whoami 2>&1 | Out-String
if ($whoami -match 'not authenticated') {
    Write-Host $whoami
    throw 'Not authenticated. Run `npx wrangler login`, or set $env:CLOUDFLARE_API_TOKEN in this shell, then re-run.'
}
Note 'authenticated'

# --- 1. D1 database ---------------------------------------------------------
Step "Resolving D1 database '$DatabaseName'"
$list = npx wrangler d1 list --json 2>$null | Out-String
$databases = if ($list.Trim()) { $list | ConvertFrom-Json } else { @() }
$database = $databases | Where-Object { $_.name -eq $DatabaseName } | Select-Object -First 1

if ($null -eq $database) {
    Note 'not found, creating'
    npx wrangler d1 create $DatabaseName | Write-Host
    if ($LASTEXITCODE -ne 0) { throw "wrangler d1 create failed ($LASTEXITCODE)" }
    $list = npx wrangler d1 list --json 2>$null | Out-String
    $database = ($list | ConvertFrom-Json) | Where-Object { $_.name -eq $DatabaseName } | Select-Object -First 1
}
if ($null -eq $database) { throw "Could not resolve the id of '$DatabaseName'." }

$databaseId = $database.uuid
Note "database_id = $databaseId"

# --- 2. write the id into wrangler.jsonc ------------------------------------
Step 'Updating wrangler.jsonc'
$configPath = 'wrangler.jsonc'
$config = Get-Content $configPath -Raw
$pattern = '("database_id"\s*:\s*")[0-9a-fA-F-]{36}(")'
if ($config -notmatch $pattern) { throw "Could not find a database_id to replace in $configPath." }
$updated = [regex]::Replace($config, $pattern, "`${1}$databaseId`${2}")
if ($updated -ne $config) {
    Set-Content $configPath $updated -Encoding utf8 -NoNewline
    Note 'written'
} else {
    Note 'already up to date'
}

# --- 3. migrations ----------------------------------------------------------
Step 'Applying migrations to the remote database'
npx wrangler d1 migrations apply $DatabaseName --remote | Write-Host
if ($LASTEXITCODE -ne 0) { throw "Migrations failed ($LASTEXITCODE)" }

# --- 4. build and deploy ----------------------------------------------------
Step 'Building'
npm run build | Write-Host
if ($LASTEXITCODE -ne 0) { throw "Build failed ($LASTEXITCODE)" }

Step 'Deploying'
$deployOutput = npx wrangler deploy 2>&1 | Out-String
Write-Host $deployOutput
if ($LASTEXITCODE -ne 0) { throw "Deploy failed ($LASTEXITCODE)" }

$deployedUrl = ([regex]::Match($deployOutput, 'https://[a-z0-9.\-]+\.workers\.dev')).Value

# --- 5. session secret ------------------------------------------------------
Step 'Checking SESSION_SECRET'
$secrets = npx wrangler secret list --json 2>$null | Out-String
$hasSecret = $secrets -match '"name"\s*:\s*"SESSION_SECRET"'

if ($hasSecret) {
    Note 'already set (re-run with `npx wrangler secret put SESSION_SECRET` to rotate)'
} else {
    Note 'generating a 256-bit secret'
    $bytes = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
    $secret | npx wrangler secret put SESSION_SECRET | Write-Host
    Remove-Variable secret
    if ($LASTEXITCODE -ne 0) { throw "Setting SESSION_SECRET failed ($LASTEXITCODE)" }
    Note 'set (the value was never printed or saved)'
}

# --- done -------------------------------------------------------------------
Write-Host "`nDeployed." -ForegroundColor Green
if ($deployedUrl) {
    Write-Host "  $deployedUrl"
    Write-Host "`nTo finish Google sign-in, register this redirect URI in the Google Cloud Console:"
    Write-Host "  $deployedUrl/api/auth/callback"
    Write-Host 'then set the two secrets:'
    Write-Host '  npx wrangler secret put GOOGLE_CLIENT_ID'
    Write-Host '  npx wrangler secret put GOOGLE_CLIENT_SECRET'
}
