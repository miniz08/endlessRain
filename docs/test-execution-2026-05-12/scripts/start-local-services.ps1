param(
  [string]$Root = (Resolve-Path "$PSScriptRoot\..\..\..").Path,
  [string]$OutDir = (Resolve-Path "$PSScriptRoot\..").Path,
  [string]$DatabaseUrl = ""
)

$ErrorActionPreference = "Stop"

function Read-DotEnv($path) {
  $map = @{}
  if (-not (Test-Path -LiteralPath $path)) { return $map }
  foreach ($line in Get-Content -LiteralPath $path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $idx = $trimmed.IndexOf("=")
    if ($idx -lt 1) { continue }
    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $map[$key] = $value
  }
  return $map
}

function Quote-Ps($value) {
  return "'" + ($value -replace "'", "''") + "'"
}

$rawDir = Join-Path $OutDir "raw"
New-Item -ItemType Directory -Force -Path $rawDir | Out-Null

$envFile = Join-Path $Root ".env"
$shared = Read-DotEnv $envFile
if ($DatabaseUrl) {
  $shared["DATABASE_URL"] = $DatabaseUrl
} else {
  $shared["DATABASE_URL"] = $shared["DATABASE_URL"]
}
$shared["ACCESS_TOKEN_SECRET"] = $shared["ACCESS_TOKEN_SECRET"]
$shared["JWT_SECRET"] = $shared["JWT_SECRET"]
$shared["AI_INTERNAL_TOKEN"] = $shared["AI_INTERNAL_TOKEN"]
$shared["AI_PROVIDER"] = "mock"
$shared["AI_SERVICE_TIMEOUT_MS"] = "30000"
$shared["CORS_ORIGIN"] = "true"
$shared["RATE_LIMIT_MAX"] = "5000"
$shared["USER_SERVICE_URL"] = "http://127.0.0.1:3003"
$shared["BLOG_SERVICE_URL"] = "http://127.0.0.1:3002"
$shared["AI_SERVICE_URL"] = "http://127.0.0.1:3004"
$shared["CHAT_SERVICE_URL"] = "http://127.0.0.1:3005"
$shared["NUXT_PUBLIC_API_BASE"] = "/api"
$shared["NUXT_API_PROXY_TARGET"] = "http://127.0.0.1:3001"

$services = @(
  @{ Name = "user_service"; Dir = "user_service"; Port = "3003"; Command = "npm run dev" },
  @{ Name = "ai_service"; Dir = "ai_service"; Port = "3004"; Command = "npm run dev" },
  @{ Name = "blog_service"; Dir = "blog_service"; Port = "3002"; Command = "npm run dev" },
  @{ Name = "chat_service"; Dir = "chat_service"; Port = "3005"; Command = "npm run dev" },
  @{ Name = "api_gateway"; Dir = "api_gateway"; Port = "3001"; Command = "npm run dev" },
  @{ Name = "frontend"; Dir = "mofukaze"; Port = "3000"; Command = "npm run dev -- --host 0.0.0.0 --port 3000" }
)

$started = @()

foreach ($svc in $services) {
  $workdir = Join-Path $Root $svc.Dir
  $stdout = Join-Path $rawDir "$($svc.Name).stdout.log"
  $stderr = Join-Path $rawDir "$($svc.Name).stderr.log"
  $envLines = @()
  foreach ($key in $shared.Keys) {
    if ($null -ne $shared[$key] -and $shared[$key] -ne "") {
      $envLines += "`$env:$key = $(Quote-Ps $shared[$key])"
    }
  }
  $envLines += "`$env:PORT = $(Quote-Ps $svc.Port)"
  $command = @"
`$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $(Quote-Ps $workdir)
$($envLines -join "`n")
$($svc.Command)
"@

  $process = Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) `
    -WorkingDirectory $workdir `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -WindowStyle Hidden `
    -PassThru

  $started += [pscustomobject]@{
    name = $svc.Name
    pid = $process.Id
    port = [int]$svc.Port
    stdout = $stdout
    stderr = $stderr
    startedAt = (Get-Date).ToString("o")
  }
}

$pidFile = Join-Path $rawDir "service-pids.json"
$started | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding UTF8
$started | Format-Table -AutoSize
