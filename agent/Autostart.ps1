$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'SpaceArena.lnk'))
$link.TargetPath = Join-Path $PSScriptRoot '.venv\Scripts\pythonw.exe'
$link.Arguments = '"' + (Join-Path $PSScriptRoot 'agent.py') + '"'
$link.WorkingDirectory = $PSScriptRoot
$link.Save()
