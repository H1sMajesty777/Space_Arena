$server = Join-Path $PSScriptRoot 'server.py'
$address = 'http://127.0.0.1:8766/desktop.html'
try {
    Invoke-WebRequest -Uri $address -TimeoutSec 1 -UseBasicParsing | Out-Null
} catch {
    Start-Process -FilePath 'py' -ArgumentList @('-3', ('"' + $server + '"')) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
    Start-Sleep -Seconds 2
}
Start-Process $address
