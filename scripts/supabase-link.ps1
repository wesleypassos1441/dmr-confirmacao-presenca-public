param(
  [string]$ProjectRef
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Set-Location (Join-Path $PSScriptRoot "..")

function Invoke-Checked([string]$Description, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Description falhou com exit code $LASTEXITCODE."
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Instale Node.js 20 ou superior." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "Instale npm." }

Write-Host "Vou fazer uma checagem rapida do Supabase CLI."
$projectsOutput = (& npx supabase projects list 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or $projectsOutput -match "Unauthorized|Invalid access token|not logged in") {
  throw "Login da Supabase CLI invalido. Rode scripts/supabase-login.ps1."
}
Write-Host $projectsOutput
Write-Host "Listagem de projetos OK."

if (-not $ProjectRef) {
  Write-Host ""
  Write-Host "Abra o Supabase, entre no projeto, va em Project Settings e copie o Project Ref."
  $ProjectRef = Read-Host "Cole aqui o Project Ref"
}

if (-not $ProjectRef -or $ProjectRef.Trim().Length -lt 10) {
  throw "Project Ref invalido."
}

Write-Host ""
Write-Host "Vou linkar este projeto ao Supabase remoto."
Write-Host "Se pedir senha do banco, digite a senha que voce criou no Supabase. Ela nao aparece enquanto digita. Isso e normal."
Invoke-Checked "link do projeto Supabase" { npx supabase link --project-ref $ProjectRef.Trim() }

Write-Host ""
Write-Host "Projeto linkado. Proximo passo:"
Write-Host "powershell -ExecutionPolicy Bypass -File scripts/supabase-secrets-set.ps1"
