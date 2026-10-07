param([string]$NodePath)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$healthUrl = 'http://127.0.0.1:43127/api/health'
try {
  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
  if ($health.service -eq 'smart-chatgpt-diagnostics') { Write-Output 'Diagnostics collector already running.'; exit 0 }
  throw 'Port 43127 belongs to another service.'
} catch {
  if ($_.Exception.Message -eq 'Port 43127 belongs to another service.') { throw }
}
if (-not $NodePath) {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCommand) { $NodePath = $nodeCommand.Source }
  else { $NodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
}
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'Node.js is required.' }
$localPath = Join-Path $projectPath '.local'
New-Item -ItemType Directory -Path $localPath -Force | Out-Null
$collectorPath = Join-Path $PSScriptRoot 'diagnostic-collector.js'
$collectorProcess = Start-Process -FilePath $NodePath -ArgumentList ('"' + $collectorPath + '"') -WorkingDirectory $projectPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localPath 'collector.stdout.log') -RedirectStandardError (Join-Path $localPath 'collector.stderr.log')
for ($attempt = 0; $attempt -lt 10; $attempt++) {
  Start-Sleep -Milliseconds 200
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    if ($health.service -eq 'smart-chatgpt-diagnostics') { Write-Output ('Diagnostics collector ready. PID ' + $collectorProcess.Id); exit 0 }
  } catch { }
}
throw 'Diagnostics collector did not start. Check .local/collector.stderr.log.'
