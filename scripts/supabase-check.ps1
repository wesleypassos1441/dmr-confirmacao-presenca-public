$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step($Message) {
  Write-Host ""
  Write-Host "== $Message =="
}

function Test-CommandExists($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Nao encontrei '$Name'. Instale antes de continuar."
  }
}

function Invoke-Supabase($Arguments) {
  & npx supabase @Arguments
}

Set-Location (Join-Path $PSScriptRoot "..")

Write-Step "Verificando Node.js"
Test-CommandExists "node"
$nodeVersion = (& node -p "process.versions.node").Trim()
$nodeMajor = [int]($nodeVersion.Split(".")[0])
Write-Host "Node.js: $nodeVersion"
if ($nodeMajor -lt 20) {
  throw "Este projeto precisa de Node.js 20 ou superior. Instale Node 20+ e rode novamente."
}

Write-Step "Verificando npm"
Test-CommandExists "npm"
& npm -v

Write-Step "Verificando Docker Desktop"
$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCommand) {
  Write-Host "Docker nao foi encontrado. A validacao local sera ignorada; o deploy remoto pode continuar."
} else {
  & docker --version

  $dockerInfo = New-Object System.Diagnostics.ProcessStartInfo
  $dockerInfo.FileName = $dockerCommand.Source
  $dockerInfo.Arguments = "info --format {{.ServerVersion}}"
  $dockerInfo.UseShellExecute = $false
  $dockerInfo.CreateNoWindow = $true
  $dockerInfo.RedirectStandardOutput = $true
  $dockerInfo.RedirectStandardError = $true
  $dockerProcess = [System.Diagnostics.Process]::Start($dockerInfo)
  $dockerResponded = $dockerProcess.WaitForExit(8000)

  if (-not $dockerResponded) {
    try { $dockerProcess.Kill() } catch { }
    Write-Host "Docker Engine nao respondeu em 8 segundos. A validacao local sera ignorada; o deploy remoto pode continuar."
  } elseif ($dockerProcess.ExitCode -eq 0) {
    Write-Host "Docker Desktop esta rodando."
  } else {
    Write-Host "Docker Engine nao esta disponivel. A validacao local sera ignorada; o deploy remoto pode continuar."
  }

  $dockerProcess.Dispose()
}

Write-Step "Verificando Supabase CLI local"
if (-not (Test-Path "node_modules/.bin/supabase.cmd")) {
  Write-Host "Supabase CLI local ainda nao esta instalado neste projeto."
  Write-Host "Rode: npm install"
} else {
  Invoke-Supabase @("--version")
}

Write-Step "Verificando estrutura Supabase"
foreach ($path in @("supabase/config.toml", "supabase/migrations", "supabase/functions")) {
  if (-not (Test-Path $path)) { throw "Faltando: $path" }
  Write-Host "OK: $path"
}

Write-Step "Verificando arquivos de ambiente"
if (Test-Path ".env") {
  Write-Host "Existe .env local. Nao vou exibir conteudo."
} else {
  Write-Host "Nao existe .env local. Use .env.example quando for rodar dashboard/bot."
}
if (-not (Test-Path ".env.supabase.example")) { throw "Faltando .env.supabase.example" }

Write-Step "Verificando .gitignore"
$gitignore = Get-Content ".gitignore" -Raw
foreach ($item in @(".env", ".env.local", ".env.production", ".env.supabase", ".env.supabase.local", ".wwebjs_auth", ".wwebjs_cache", "*.log")) {
  if ($gitignore -notmatch [regex]::Escape($item)) { throw ".gitignore nao contem $item" }
}
Write-Host ".gitignore cobre envs, sessoes WhatsApp e logs."

Write-Step "Verificando login Supabase"
try {
  $projectsOutput = (& npx supabase projects list 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0 -or $projectsOutput -match "Unauthorized|Error|not logged in") {
    throw $projectsOutput
  }
  Write-Host $projectsOutput
  Write-Host "Login Supabase OK."
} catch {
  Write-Host "Nao consegui confirmar o login pela listagem de projetos."
  Write-Host "Se voce acabou de ver 'You are now logged in', pode seguir para scripts/supabase-link.ps1."
  Write-Host "Se o link falhar por autenticacao, rode: npx supabase login"
}

Write-Step "Verificando link remoto"
if (Test-Path "supabase/.temp/project-ref") {
  $projectRef = (Get-Content "supabase/.temp/project-ref" -Raw).Trim()
  Write-Host "Projeto linkado: $projectRef"
} else {
  Write-Host "Projeto remoto ainda nao esta linkado."
  Write-Host "Rode: powershell -ExecutionPolicy Bypass -File scripts/supabase-link.ps1"
}

Write-Step "Verificacao concluida"
Write-Host "Se login e link estiverem OK, rode scripts/supabase-secrets-set.ps1 e depois scripts/supabase-deploy.ps1."
