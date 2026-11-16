param(
    [switch]$Enable,
    [switch]$Stop,
    [switch]$Configure
)

$ErrorActionPreference = 'Stop'
$stateDirectory = Join-Path $env:LOCALAPPDATA 'SpaceArena'
$disabled = Join-Path $stateDirectory 'banner-disabled'

if ($Stop) {
    [IO.Directory]::CreateDirectory($stateDirectory) | Out-Null
    [IO.File]::WriteAllText($disabled, '')
    return
}
if ($Enable -and [IO.File]::Exists($disabled)) {
    [IO.File]::Delete($disabled)
}

# Keep the host outside the Python process group in Task Manager.
$mutex = [Threading.Mutex]::new($false, 'Local\SpaceArenaBannerHost')
$ownsMutex = $false
try {
    try {
        $ownsMutex = $mutex.WaitOne(3000)
    } catch [Threading.AbandonedMutexException] {
        $ownsMutex = $true
    }
    if (-not $ownsMutex) {
        return
    }

    $python = Join-Path $PSScriptRoot '.venv\Scripts\pythonw.exe'
    $watchdog = Join-Path $PSScriptRoot 'watchdog.py'
    $arguments = '"' + $watchdog + '"'
    if ($Configure) {
        $arguments += ' --configure'
    }
    while (-not [IO.File]::Exists($disabled)) {
        $process = Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
        try {
            $process.WaitForExit()
            if ($process.ExitCode -eq 78) {
                return # Setup was cancelled or another agent already has the mutex.
            }
        } finally {
            $process.Dispose()
        }
        $arguments = '"' + $watchdog + '"'
        Start-Sleep -Milliseconds 1000
    }
} finally {
    if ($ownsMutex) {
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
}
