$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"')
    exit
}
$ErrorActionPreference = 'Stop'
if (-not (Get-NetFirewallRule -DisplayName 'Space Arena local testing 8080' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'Space Arena local testing 8080' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 -RemoteAddress LocalSubnet -Profile Private
}
Write-Host 'Local Wi-Fi access to port 8080 is enabled.'
Read-Host 'Press Enter to close'
