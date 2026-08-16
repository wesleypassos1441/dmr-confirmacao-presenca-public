$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Set-Location (Join-Path $PSScriptRoot "..")

function Invoke-Checked([string]$Description, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Description falhou com exit code $LASTEXITCODE."
  }
}

try {
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw "Docker indisponivel." }
} catch {
  throw "Abra o Docker Desktop e espere aparecer que ele esta rodando. Depois rode novamente."
}

Write-Host "Iniciando Supabase local com Docker..."
Invoke-Checked "Supabase local" { npx supabase start --ignore-health-check }

Write-Host "Aplicando reset apenas no banco local..."
Invoke-Checked "reset do banco local" { npx supabase db reset }

Write-Host "Banco local recriado com as migrations do projeto. Nenhum banco remoto foi resetado."
