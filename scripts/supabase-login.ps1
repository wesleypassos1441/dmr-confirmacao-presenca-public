param(
  [string]$ProjectRef = "example-project-ref"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Set-Location (Join-Path $PSScriptRoot "..")

function ConvertTo-PlainText([securestring]$SecureValue) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Invoke-Checked([string]$Description, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Description falhou. Confira os dados informados e tente novamente."
  }
}

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  throw "Node.js/npm nao foi encontrado. Instale o Node.js antes de continuar."
}

Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
$hadSupabaseProfile = Test-Path Env:SUPABASE_PROFILE
$previousSupabaseProfile = $env:SUPABASE_PROFILE
$env:SUPABASE_PROFILE = "supabase"

Write-Host ""
Write-Host "LOGIN GUIADO DO SUPABASE"
Write-Host "Gere um Access Token novo em:"
Write-Host "https://supabase.com/dashboard/account/tokens"
Write-Host ""
Write-Host "Quando o terminal pedir, cole somente o token que comeca com sbp_."
Write-Host "Nao cole comandos junto com o token."
Write-Host ""

$secureToken = Read-Host "Cole o novo Access Token (sbp_...)" -AsSecureString
$token = ConvertTo-PlainText $secureToken

try {
  if ($token -notmatch '^sbp_[A-Za-z0-9_-]{20,}$') {
    throw "Token invalido. Ele precisa comecar com sbp_. Gere outro token e execute o script novamente."
  }

  Write-Host ""
  Write-Host "Autenticando a Supabase CLI..."
  Invoke-Checked "login da Supabase CLI" { npx supabase login --token $token --name "dmr-cli" }

  Write-Host "Confirmando acesso ao projeto..."
  $projectsOutput = (& npx supabase projects list 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0 -or $projectsOutput -match "Unauthorized|Invalid access token|not logged in") {
    throw "A Supabase recusou o login. Revogue o token, gere outro e execute este script novamente."
  }
  if ($projectsOutput -notmatch [regex]::Escape($ProjectRef)) {
    throw "O projeto $ProjectRef nao apareceu na sua conta Supabase."
  }

  Write-Host ""
  $securePassword = Read-Host "Digite a senha do banco Supabase" -AsSecureString
  $env:SUPABASE_DB_PASSWORD = ConvertTo-PlainText $securePassword
  if (-not $env:SUPABASE_DB_PASSWORD) {
    throw "A senha do banco nao foi informada."
  }

  Write-Host "Vinculando o projeto..."
  Invoke-Checked "link do projeto Supabase" {
    npx supabase link --project-ref $ProjectRef
  }

  Write-Host ""
  Write-Host "Login e link concluidos."
  Write-Host "Agora execute:"
  Write-Host "powershell -ExecutionPolicy Bypass -File scripts/supabase-deploy.ps1"
} finally {
  if ($hadSupabaseProfile) {
    $env:SUPABASE_PROFILE = $previousSupabaseProfile
  } else {
    Remove-Item Env:SUPABASE_PROFILE -ErrorAction SilentlyContinue
  }
  $token = $null
  $secureToken = $null
}
