$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Set-Location (Join-Path $PSScriptRoot "..")

function Invoke-Checked([string]$Description, [scriptblock]$Command) {
  $output = & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Description falhou com exit code $LASTEXITCODE."
  }
  return $output
}

$output = "apps/dashboard/src/types/supabase.ts"
New-Item -ItemType Directory -Force -Path (Split-Path $output) | Out-Null

if (Test-Path "supabase/.temp/project-ref") {
  $projectRef = (Get-Content "supabase/.temp/project-ref" -Raw).Trim()
  Write-Host "Gerando tipos pelo projeto remoto $projectRef..."
  $types = Invoke-Checked "geracao de tipos remotos" { npx supabase gen types typescript --project-id $projectRef }
} else {
  Write-Host "Projeto remoto nao linkado. Tentando gerar tipos pelo Supabase local..."
  $types = Invoke-Checked "geracao de tipos locais" { npx supabase gen types typescript --local }
}

$types | Set-Content -Encoding utf8 $output
Write-Host "Tipos salvos em $output"
