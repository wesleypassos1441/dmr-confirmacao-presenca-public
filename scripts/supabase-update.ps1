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
    throw "$Description falhou com exit code $LASTEXITCODE."
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
Write-Host "ATUALIZACAO GUIADA DO SUPABASE"
Write-Host "Gere um Access Token novo em:"
Write-Host "https://supabase.com/dashboard/account/tokens"
Write-Host ""
Write-Host "Cole somente os valores solicitados. Eles nao aparecerao na tela."

$secureToken = Read-Host "Access Token (sbp_...)" -AsSecureString
$token = ConvertTo-PlainText $secureToken
$securePassword = $null

try {
  if ($token -notmatch '^sbp_[A-Za-z0-9_-]{20,}$') {
    throw "Token invalido. Gere um token novo que comece com sbp_."
  }

  # Usa exatamente o token informado nesta execucao e ignora credenciais antigas da CLI.
  $env:SUPABASE_ACCESS_TOKEN = $token

  Write-Host ""
  Write-Host "Autenticando a Supabase CLI..."
  Invoke-Checked "login da Supabase CLI" {
    npx supabase login --token $token --name "dmr-deploy"
  }

  Write-Host "Confirmando acesso ao projeto..."
  $projectsOutput = (& npx supabase projects list 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0 -or $projectsOutput -match "Unauthorized|Invalid access token|not logged in") {
    throw "A Supabase recusou o login. Revogue o token e gere outro."
  }
  if ($projectsOutput -notmatch [regex]::Escape($ProjectRef)) {
    throw "O projeto $ProjectRef nao apareceu na conta autenticada."
  }

  Write-Host ""
  $securePassword = Read-Host "Digite a senha do banco Supabase" -AsSecureString
  $env:SUPABASE_DB_PASSWORD = ConvertTo-PlainText $securePassword
  if (-not $env:SUPABASE_DB_PASSWORD) {
    throw "A senha do banco nao foi informada."
  }

  $linkedProjectPath = "supabase/.temp/project-ref"
  $linkedProjectRef = if (Test-Path $linkedProjectPath) {
    (Get-Content $linkedProjectPath -Raw).Trim()
  } else {
    ""
  }

  if ($linkedProjectRef -eq $ProjectRef) {
    Write-Host "Projeto ja vinculado a $ProjectRef. Mantendo o vinculo existente."
  } else {
    Write-Host "Vinculando o projeto..."
    Invoke-Checked "link do projeto Supabase" {
      npx supabase link --project-ref $ProjectRef
    }
  }

  Write-Host ""
  Write-Host "Iniciando migrations e Edge Functions..."
  & (Join-Path $PSScriptRoot "supabase-deploy.ps1")

  Write-Host ""
  Write-Host "ATUALIZACAO CONCLUIDA COM SUCESSO."
} finally {
  if ($hadSupabaseProfile) {
    $env:SUPABASE_PROFILE = $previousSupabaseProfile
  } else {
    Remove-Item Env:SUPABASE_PROFILE -ErrorAction SilentlyContinue
  }
  Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:SUPABASE_DB_PASSWORD -ErrorAction SilentlyContinue
  $token = $null
  $secureToken = $null
  $securePassword = $null
}
