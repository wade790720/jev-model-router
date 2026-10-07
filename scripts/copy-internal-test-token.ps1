param([switch]$Clear)
$ErrorActionPreference = 'Stop'
if ($Clear) { Set-Clipboard -Value ''; Write-Host 'Clipboard cleared.'; exit }
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskEncrypted = Get-Content -LiteralPath (Join-Path $taskRoot '.local/hosted-test-token.dpapi') -Raw
$taskSecure = ConvertTo-SecureString $taskEncrypted.Trim()
$taskCredential = [System.Net.NetworkCredential]::new('', $taskSecure)
Set-Clipboard -Value $taskCredential.Password
Write-Host 'Internal test token copied. Paste into extension advanced settings, then run this script with -Clear.'
