param(
    [switch]$InstallAutostart,
    [switch]$Configure
)

$ErrorActionPreference = 'Stop'
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'SpaceArena\python314'
$environment = Join-Path $PSScriptRoot '.venv'
$environmentPython = Join-Path $environment 'Scripts\python.exe'
$requirements = Join-Path $PSScriptRoot 'requirements.txt'

function Test-Python($Executable, $LauncherArgs = @()) {
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
        return $false
    }
    try {
        & $Executable @LauncherArgs -c 'import sys, tkinter; sys.exit(not ((3, 12) <= sys.version_info[:2] < (3, 16) and sys.maxsize > 2**32))' 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Find-Python {
    $privatePython = Join-Path $runtimeRoot 'python.exe'
    if (Test-Python $privatePython) {
        return @{ Executable = $privatePython; LauncherArgs = @() }
    }
    $launcher = Get-Command py.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($launcher) {
        foreach ($version in @('-3.14', '-3.13', '-3.12')) {
            if (Test-Python $launcher.Source @($version)) {
                return @{ Executable = $launcher.Source; LauncherArgs = @($version) }
            }
        }
    }
    $python = Get-Command python.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($python -and $python.Source -notlike '*\Microsoft\WindowsApps\*' -and (Test-Python $python.Source)) {
        return @{ Executable = $python.Source; LauncherArgs = @() }
    }
    return $null
}

function Install-Python {
    # Python Software Foundation Windows x64 installer, pinned with its published SHA-256.
    $url = 'https://www.python.org/ftp/python/3.14.10/python-3.14.10-amd64.exe'
    $sha256 = '92480239264744fe0386a1bd8275786fefa126e3129e56a68e22b52c73329965'
    $installer = Join-Path ([IO.Path]::GetTempPath()) ('space-arena-python-' + [guid]::NewGuid().ToString('N') + '.exe')
    Write-Host 'Downloading Python for Space Arena...'
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $installer -TimeoutSec 120
        if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $sha256) {
            throw 'Python installer checksum does not match.'
        }
        $arguments = '/quiet InstallAllUsers=0 Include_launcher=0 Include_pip=1 Include_tcltk=1 PrependPath=0 TargetDir="' + $runtimeRoot + '"'
        $process = Start-Process -FilePath $installer -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
        if ($process.ExitCode -ne 0) {
            throw "Python installer exited with code $($process.ExitCode)."
        }
    } finally {
        [IO.File]::Delete($installer)
    }
    $privatePython = Join-Path $runtimeRoot 'python.exe'
    if (-not (Test-Python $privatePython)) {
        throw 'Python was installed but the required runtime could not be started.'
    }
    return $privatePython
}

$mutex = [Threading.Mutex]::new($false, 'Local\SpaceArenaRuntimeSetup')
try {
    try {
        $null = $mutex.WaitOne()
    } catch [Threading.AbandonedMutexException] {
        # The previous setup exited. This process now owns the mutex.
    }
    if (-not (Test-Python $environmentPython)) {
        $python = Find-Python
        if (-not $python) {
            $python = @{ Executable = (Install-Python); LauncherArgs = @() }
        }
        if (Test-Path -LiteralPath $environment) {
            $backupName = '.venv.old-' + [guid]::NewGuid().ToString('N')
            Rename-Item -LiteralPath $environment -NewName $backupName
        }
        $launcherArgs = $python.LauncherArgs
        & $python.Executable @launcherArgs -m venv $environment
        if ($LASTEXITCODE -ne 0) {
            throw 'Could not create the Space Arena Python environment.'
        }
    }

    & $environmentPython -m pip install --disable-pip-version-check -r $requirements
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not install the Space Arena dependencies.'
    }
    if ($InstallAutostart) {
        & (Join-Path $PSScriptRoot 'Autostart.ps1')
    }
    $hostScript = Join-Path $PSScriptRoot 'WatchdogHost.ps1'
    $arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $hostScript + '" -Enable'
    if ($Configure) {
        $arguments += ' -Configure'
    }
    Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WindowStyle Hidden
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
