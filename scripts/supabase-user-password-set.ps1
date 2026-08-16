param(
  [string]$Email
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Set-Location (Join-Path $PSScriptRoot "..")

function ConvertFrom-SecureStringPlainText {
  param([Security.SecureString]$SecureValue)

  $credential = New-Object System.Net.NetworkCredential("", $SecureValue)
  return $credential.Password
}

function Read-EnvFileValue {
  param(
    [string]$Path,
    [string]$Name
  )

  if (-not (Test-Path $Path)) {
    return $null
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match "^\s*$Name\s*=\s*(.+?)\s*$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }

  return $null
}

$supabaseUrl = Read-EnvFileValue ".env.local" "NEXT_PUBLIC_SUPABASE_URL"
if (-not $supabaseUrl) {
  $supabaseUrl = Read-EnvFileValue "apps/dashboard/.env.local" "NEXT_PUBLIC_SUPABASE_URL"
}
if (-not $supabaseUrl) {
  $supabaseUrl = Read-Host "Cole a NEXT_PUBLIC_SUPABASE_URL do projeto"
}

if (-not $Email) {
  $Email = Read-Host "Digite o e-mail do usuario que tera a senha alterada"
}
if (-not $Email -or $Email -notmatch "@") {
  throw "E-mail invalido."
}

$passwordSecure = Read-Host "Digite a nova senha temporaria" -AsSecureString
$serviceRoleSecure = Read-Host "Cole a SUPABASE_SERVICE_ROLE_KEY do projeto" -AsSecureString

$password = ConvertFrom-SecureStringPlainText $passwordSecure
$serviceRoleKey = ConvertFrom-SecureStringPlainText $serviceRoleSecure

try {
  $env:DMR_ADMIN_SUPABASE_URL = $supabaseUrl
  $env:DMR_ADMIN_SERVICE_ROLE_KEY = $serviceRoleKey
  $env:DMR_ADMIN_USER_EMAIL = $Email
  $env:DMR_ADMIN_NEW_PASSWORD = $password

  & node scripts/supabase-user-password-set.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel alterar a senha. Exit code: $LASTEXITCODE."
  }
} finally {
  Remove-Item Env:DMR_ADMIN_SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:DMR_ADMIN_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:DMR_ADMIN_USER_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:DMR_ADMIN_NEW_PASSWORD -ErrorAction SilentlyContinue
  Remove-Variable password, serviceRoleKey, passwordSecure, serviceRoleSecure -ErrorAction SilentlyContinue
}

Write-Host "Agora acesse o dashboard e entre com o e-mail e a nova senha."
