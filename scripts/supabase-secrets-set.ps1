$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Set-Location (Join-Path $PSScriptRoot "..")

function Invoke-Checked([string]$Description, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Description falhou com exit code $LASTEXITCODE."
  }
}

function New-SafeToken {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function ConvertTo-PlainText([securestring]$SecureValue) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Assert-OriginUrl([string]$Name, [string]$Value) {
  if ($Value -notmatch '^https?://') {
    throw "$Name precisa ser uma URL com http:// ou https://. Exemplo: http://localhost:3000"
  }
}

function Set-DotEnvValue([string]$Name, [string]$Value) {
  $envPath = Join-Path (Get-Location) ".env"
  $content = if (Test-Path $envPath) { [IO.File]::ReadAllText($envPath) } else { "" }
  $line = "$Name=$Value"
  $pattern = "(?m)^$([Regex]::Escape($Name))=.*$"
  if ($content -match $pattern) {
    $content = [Regex]::Replace($content, $pattern, $line)
  } else {
    if ($content -and -not $content.EndsWith("`n")) { $content += [Environment]::NewLine }
    $content += $line + [Environment]::NewLine
  }
  [IO.File]::WriteAllText($envPath, $content, (New-Object Text.UTF8Encoding($false)))
}

Write-Host "Vou configurar secrets nas Edge Functions. O token do bot sera salvo somente no .env local ignorado pelo Git."
$generate = Read-Host "Gerar um DMR_BOT_TOKEN seguro automaticamente? (S/n)"
if ($generate -eq "" -or $generate.ToLowerInvariant().StartsWith("s")) {
  $botToken = New-SafeToken
} else {
  $secure = Read-Host "Digite o DMR_BOT_TOKEN" -AsSecureString
  $botToken = ConvertTo-PlainText $secure
}

if (-not $botToken -or $botToken.Length -lt 24) {
  throw "DMR_BOT_TOKEN precisa ter pelo menos 24 caracteres."
}
Set-DotEnvValue "DMR_BOT_TOKEN" $botToken
Write-Host "DMR_BOT_TOKEN salvo com seguranca no .env local."

$appOrigin = Read-Host "APP_ORIGIN [http://localhost:3000]"
if (-not $appOrigin) { $appOrigin = "http://localhost:3000" }
Assert-OriginUrl "APP_ORIGIN" $appOrigin

$allowedOrigin = Read-Host "DMR_ALLOWED_ORIGIN [$appOrigin]"
if (-not $allowedOrigin) { $allowedOrigin = $appOrigin }
Assert-OriginUrl "DMR_ALLOWED_ORIGIN" $allowedOrigin

$environment = Read-Host "ENVIRONMENT [production]"
if (-not $environment) { $environment = "production" }

Write-Host "Enviando secrets ao Supabase..."
Invoke-Checked "envio de DMR_BOT_TOKEN" { npx supabase secrets set "DMR_BOT_TOKEN=$botToken" }
Invoke-Checked "envio de APP_ORIGIN" { npx supabase secrets set "APP_ORIGIN=$appOrigin" }
Invoke-Checked "envio de DMR_ALLOWED_ORIGIN" { npx supabase secrets set "DMR_ALLOWED_ORIGIN=$allowedOrigin" }
Invoke-Checked "envio de ENVIRONMENT" { npx supabase secrets set "ENVIRONMENT=$environment" }

Write-Host ""
Write-Host "Secrets configurados. O mesmo DMR_BOT_TOKEN ja esta no .env local do bot."
