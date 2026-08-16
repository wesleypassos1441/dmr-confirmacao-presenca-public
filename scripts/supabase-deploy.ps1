$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Set-Location (Join-Path $PSScriptRoot "..")

function Invoke-Checked([string]$Description, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Description falhou com exit code $LASTEXITCODE."
  }
}

function ConvertTo-PlainText([securestring]$SecureValue) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

$hadSupabaseProfile = Test-Path Env:SUPABASE_PROFILE
$previousSupabaseProfile = $env:SUPABASE_PROFILE
$env:SUPABASE_PROFILE = "supabase"

try {
  if (-not $env:SUPABASE_DB_PASSWORD) {
    $securePassword = Read-Host "Digite a senha do banco Supabase" -AsSecureString
    $env:SUPABASE_DB_PASSWORD = ConvertTo-PlainText $securePassword
  }
  if (-not $env:SUPABASE_DB_PASSWORD) {
    throw "A senha do banco Supabase e obrigatoria para o deploy."
  }

  Write-Host "Checando ambiente antes do deploy..."
  Invoke-Checked "checagem do ambiente" { powershell -ExecutionPolicy Bypass -File scripts/supabase-check.ps1 }

  if (-not (Test-Path "supabase/.temp/project-ref")) {
    throw "Projeto Supabase ainda nao esta linkado. Rode scripts/supabase-link.ps1 primeiro."
  }

  Write-Host ""
  Write-Host "Rodando testes locais antes do deploy..."
  Invoke-Checked "testes locais" { npm test }
  Invoke-Checked "typecheck" { npm run typecheck }
  Invoke-Checked "scan de segredos" { npm run secrets:scan }

  Write-Host ""
  Write-Host "Validando migrations no banco local, se Docker permitir..."
  try {
    Invoke-Checked "lint do banco local" { npx supabase db lint --local --level warning }
  } catch {
    Write-Host "db lint local nao rodou. Vou continuar com db push dry-run remoto."
  }

  Write-Host ""
  Write-Host "Simulando aplicacao das migrations no remoto..."
  try {
    Invoke-Checked "dry-run remoto" { npx supabase db push --dry-run }
  } catch {
    Write-Host "Dry-run nao esta disponivel ou falhou nesta versao/configuracao. Nenhum dado remoto foi alterado por esta etapa."
  }

  Write-Host ""
  Write-Host "Aplicando migrations no Supabase remoto com db push..."
  Invoke-Checked "db push remoto" { npx supabase db push }

  Write-Host ""
  Write-Host "Conferindo secrets remotos..."
  try {
    Invoke-Checked "listagem de secrets" { npx supabase secrets list }
  } catch {
    Write-Host "Nao consegui listar secrets. Se ainda nao configurou, rode scripts/supabase-secrets-set.ps1."
  }

  Write-Host ""
  Write-Host "Fazendo deploy das Edge Functions..."
  Invoke-Checked "deploy das Edge Functions" { powershell -ExecutionPolicy Bypass -File scripts/supabase-functions-deploy.ps1 }

  Write-Host ""
  Write-Host "Deploy Supabase finalizado."
} finally {
  if ($hadSupabaseProfile) {
    $env:SUPABASE_PROFILE = $previousSupabaseProfile
  } else {
    Remove-Item Env:SUPABASE_PROFILE -ErrorAction SilentlyContinue
  }
}
