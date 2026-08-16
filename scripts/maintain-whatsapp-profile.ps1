param(
  [Parameter(Mandatory = $true)]
  [string]$SessionPath
)

$ErrorActionPreference = "Stop"

function Test-PathWithinRoot {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Root
  )

  $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
  $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
  return $fullPath.StartsWith("$fullRoot\", [System.StringComparison]::OrdinalIgnoreCase)
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$authRoot = Join-Path $projectRoot "apps\whatsapp-bot\.wwebjs_auth"
$fullSessionPath = [System.IO.Path]::GetFullPath($SessionPath).TrimEnd('\')

if (-not (Test-PathWithinRoot -Path $fullSessionPath -Root $authRoot)) {
  throw "A manutencao foi bloqueada porque a sessao informada esta fora do perfil do Bot DMR."
}

if (-not (Test-Path -LiteralPath $fullSessionPath -PathType Container)) {
  exit 0
}

# Somente dados descartaveis do navegador. IndexedDB, Cookies, Local Storage,
# Session Storage, Preferences e demais dados de autenticacao nao entram aqui.
$relativeCachePaths = @(
  "Default\Cache",
  "Default\Code Cache",
  "Default\GPUCache",
  "Default\DawnCache",
  "Default\GrShaderCache",
  "Default\ShaderCache",
  "Default\Service Worker\CacheStorage",
  "Crashpad\reports",
  "component_crx_cache",
  "ProvenanceData",
  "Edge Entity Extraction",
  "BrowserMetrics"
)

$releasedBytes = 0L
foreach ($relativePath in $relativeCachePaths) {
  $target = Join-Path $fullSessionPath $relativePath
  if (-not (Test-PathWithinRoot -Path $target -Root $fullSessionPath)) {
    throw "A manutencao recusou um caminho fora da sessao local."
  }
  if (-not (Test-Path -LiteralPath $target)) {
    continue
  }

  try {
    $releasedBytes += [long](Get-ChildItem -LiteralPath $target -Recurse -Force -File -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
    Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
  } catch {
    Write-Host "Aviso: um cache do Edge ainda estava em uso e sera limpo na proxima inicializacao."
  }
}

if ($releasedBytes -gt 0) {
  $releasedMb = [math]::Round($releasedBytes / 1MB, 1)
  Write-Host "Manutencao do Edge concluida: $releasedMb MB de cache descartavel removidos; login preservado."
}
