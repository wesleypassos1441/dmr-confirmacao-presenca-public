$script:BotScheduleRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))

function Import-BotScheduleEnvironment {
  [CmdletBinding()]
  param(
    [string]$EnvPath = (Join-Path $script:BotScheduleRoot ".env")
  )

  if (-not (Test-Path -LiteralPath $EnvPath)) {
    throw "Arquivo .env do bot nao encontrado."
  }

  $settings = @{}
  foreach ($line in Get-Content -LiteralPath $EnvPath) {
    $trimmedLine = $line.Trim()
    if (-not $trimmedLine -or $trimmedLine.StartsWith("#")) {
      continue
    }

    $separatorIndex = $trimmedLine.IndexOf("=")
    if ($separatorIndex -le 0) {
      continue
    }

    $name = $trimmedLine.Substring(0, $separatorIndex).Trim()
    if ($name -notin @("EDGE_FUNCTIONS_BASE_URL", "DMR_BOT_TOKEN")) {
      continue
    }

    $value = $trimmedLine.Substring($separatorIndex + 1).Trim()
    if ($value.Length -ge 2) {
      $startsWithDoubleQuote = $value.StartsWith('"') -and $value.EndsWith('"')
      $startsWithSingleQuote = $value.StartsWith("'") -and $value.EndsWith("'")
      if ($startsWithDoubleQuote -or $startsWithSingleQuote) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }

    $settings[$name] = $value
  }

  return $settings
}

function Get-BotOperationalStatus {
  [CmdletBinding()]
  param(
    [ValidateRange(5, 120)]
    [int]$TimeoutSeconds = 20,
    [string]$EnvPath = (Join-Path $script:BotScheduleRoot ".env")
  )

  $settings = Import-BotScheduleEnvironment -EnvPath $EnvPath
  $baseUrl = [string]$settings["EDGE_FUNCTIONS_BASE_URL"]
  $botToken = [string]$settings["DMR_BOT_TOKEN"]
  if ([string]::IsNullOrWhiteSpace($baseUrl) -or [string]::IsNullOrWhiteSpace($botToken)) {
    throw "EDGE_FUNCTIONS_BASE_URL e DMR_BOT_TOKEN sao obrigatorios no .env."
  }

  $validatedBaseUrl = Assert-BotEdgeFunctionsBaseUrl -BaseUrl $baseUrl
  $uri = "$validatedBaseUrl/bot-operational-status"
  $headers = @{ "x-dmr-bot-token" = $botToken }

  try {
    $response = Invoke-RestMethod `
      -Uri $uri `
      -Method Post `
      -Headers $headers `
      -ContentType "application/json" `
      -Body "{}" `
      -TimeoutSec $TimeoutSeconds
  } catch {
    throw "Nao foi possivel consultar o estado operacional do bot."
  }

  $successProperty = $response.PSObject.Properties["sucesso"]
  $operationalProperty = $response.PSObject.Properties["operacional"]
  if ($null -eq $successProperty -or $response.sucesso -ne $true -or $null -eq $operationalProperty -or $null -eq $response.operacional) {
    throw "Resposta operacional do bot invalida."
  }

  $workProperty = $response.operacional.PSObject.Properties["tem_trabalho"]
  if ($null -eq $workProperty -or $response.operacional.tem_trabalho -isnot [bool]) {
    throw "Resposta operacional do bot invalida."
  }

  return $response.operacional
}

function Assert-BotEdgeFunctionsBaseUrl {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl
  )

  $parsedUri = $null
  if (-not [uri]::TryCreate($BaseUrl, [System.UriKind]::Absolute, [ref]$parsedUri)) {
    throw "URL de Edge Functions invalida."
  }

  $trustedSuffix = ".functions.supabase.co"
  $uriHost = $parsedUri.DnsSafeHost
  $hasTrustedSuffix = $uriHost.EndsWith($trustedSuffix, [System.StringComparison]::OrdinalIgnoreCase)
  $projectPart = if ($hasTrustedSuffix) { $uriHost.Substring(0, $uriHost.Length - $trustedSuffix.Length) } else { "" }
  $hasTrustedProject = $projectPart -match '^[a-z0-9-]+$'
  $hasUnsafeComponents = -not [string]::IsNullOrEmpty($parsedUri.UserInfo) -or
    -not [string]::IsNullOrEmpty($parsedUri.Query) -or
    -not [string]::IsNullOrEmpty($parsedUri.Fragment)

  if ($parsedUri.Scheme -cne "https" -or -not $parsedUri.IsDefaultPort -or -not $hasTrustedSuffix -or -not $hasTrustedProject -or $hasUnsafeComponents) {
    throw "URL de Edge Functions invalida."
  }

  return $parsedUri.GetLeftPart([System.UriPartial]::Path).TrimEnd('/')
}

function Get-BotScheduleSettings {
  [CmdletBinding()]
  param(
    [string]$EnvPath = (Join-Path $script:BotScheduleRoot ".env")
  )

  # Valores padrao usados se a variavel nao estiver definida no .env.
  $defaults = @{
    BOT_SCHEDULE_START          = "05:50"
    BOT_SCHEDULE_GUARDIAN_START = "16:00"
    BOT_SCHEDULE_GUARDIAN_END   = "05:45"
    BOT_SCHEDULE_POLL_SECONDS   = "300"
  }

  $overrides = @{}
  if (Test-Path -LiteralPath $EnvPath) {
    foreach ($line in Get-Content -LiteralPath $EnvPath) {
      $trimmedLine = $line.Trim()
      if (-not $trimmedLine -or $trimmedLine.StartsWith("#")) { continue }
      $separatorIndex = $trimmedLine.IndexOf("=")
      if ($separatorIndex -le 0) { continue }
      $name = $trimmedLine.Substring(0, $separatorIndex).Trim()
      if ($name -notin $defaults.Keys) { continue }
      $value = $trimmedLine.Substring($separatorIndex + 1).Trim()
      if ($value.Length -ge 2) {
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))) {
          $value = $value.Substring(1, $value.Length - 2)
        }
      }
      $overrides[$name] = $value
    }
  }

  $settings = @{}
  foreach ($key in $defaults.Keys) {
    $settings[$key] = if ($overrides.ContainsKey($key) -and $overrides[$key]) { $overrides[$key] } else { $defaults[$key] }
  }

  # Validar formato HH:mm para horários e inteiro para poll
  foreach ($key in @("BOT_SCHEDULE_START", "BOT_SCHEDULE_GUARDIAN_START", "BOT_SCHEDULE_GUARDIAN_END")) {
    if ($settings[$key] -notmatch '^\d{1,2}:\d{2}$') {
      Write-Warning "$key tem formato invalido ('$($settings[$key])'). Usando valor padrao '$($defaults[$key])'."
      $settings[$key] = $defaults[$key]
    }
  }
  $pollInt = 0
  if (-not [int]::TryParse($settings["BOT_SCHEDULE_POLL_SECONDS"], [ref]$pollInt) -or $pollInt -lt 1 -or $pollInt -gt 86400) {
    Write-Warning "BOT_SCHEDULE_POLL_SECONDS invalido. Usando 300."
    $settings["BOT_SCHEDULE_POLL_SECONDS"] = "300"
  }

  return [pscustomobject]$settings
}

function ConvertTo-BotTimeOfDay {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$HHmm
  )
  # Converte "HH:mm" para [TimeSpan]
  $parts = $HHmm -split ":"
  return New-TimeSpan -Hours ([int]$parts[0]) -Minutes ([int]$parts[1])
}

function Get-BotGuardianWindow {
  # A janela pode terminar no dia seguinte, como 16:00 ate 05:45.
  [CmdletBinding()]
  param(
    [datetime]$Now = (Get-Date),
    [string]$GuardianStart = "16:00",
    [string]$GuardianEnd   = "05:45"
  )

  $startTs = ConvertTo-BotTimeOfDay -HHmm $GuardianStart
  $endTs   = ConvertTo-BotTimeOfDay -HHmm $GuardianEnd

  $crossesMidnight = $endTs -le $startTs
  if ($crossesMidnight -and $Now.TimeOfDay -le $endTs.Add([timespan]::FromSeconds(59))) {
    $windowStart = $Now.Date.AddDays(-1).Add($startTs)
    $windowEnd = $Now.Date.Add($endTs).AddSeconds(59)
  } else {
    $windowStart = $Now.Date.Add($startTs)
    $windowEnd = $Now.Date.Add($endTs).AddSeconds(59)
    if ($crossesMidnight) {
      $windowEnd = $windowEnd.AddDays(1)
    }
  }

  if ($Now -ge $windowStart -and $Now -le $windowEnd) {
    return [pscustomobject]@{
      ativa  = $true
      inicio = $windowStart
      limite = $windowEnd
    }
  }

  return [pscustomobject]@{
    ativa  = $false
    inicio = $null
    limite = $null
  }
}

function Test-BotGuardianWindow {
  [CmdletBinding()]
  param(
    [datetime]$Now = (Get-Date),
    [string]$GuardianStart = "16:00",
    [string]$GuardianEnd   = "05:45"
  )

  $window = Get-BotGuardianWindow -Now $Now -GuardianStart $GuardianStart -GuardianEnd $GuardianEnd
  return [bool]$window.ativa
}

function Get-BotGuardianDeadline {
  [CmdletBinding()]
  param(
    [datetime]$Now = (Get-Date),
    [string]$GuardianStart = "16:00",
    [string]$GuardianEnd   = "05:45"
  )

  $window = Get-BotGuardianWindow -Now $Now -GuardianStart $GuardianStart -GuardianEnd $GuardianEnd
  return $window.limite
}
