$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'SpaceArena.lnk'))
$link.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$link.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'WatchdogHost.ps1') + '"'
$link.Description = 'Space Arena Banner Watchdog'
$link.WorkingDirectory = $PSScriptRoot
$link.Save()
