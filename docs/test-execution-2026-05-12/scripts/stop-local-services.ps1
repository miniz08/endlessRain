param(
  [string]$OutDir = (Resolve-Path "$PSScriptRoot\..").Path
)

$ErrorActionPreference = "SilentlyContinue"

function Stop-ProcessTree([int]$ProcessId) {
  $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessId }
  foreach ($child in $children) {
    Stop-ProcessTree -ProcessId ([int]$child.ProcessId)
  }
  Stop-Process -Id $ProcessId -Force
}

$pidFile = Join-Path $OutDir "raw/service-pids.json"
if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Host "No service pid file found."
  exit 0
}

$items = Get-Content -LiteralPath $pidFile -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($item in $items) {
  Stop-ProcessTree -ProcessId ([int]$item.pid)
}

Write-Host "Stopped local test services."

