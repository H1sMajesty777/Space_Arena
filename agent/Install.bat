@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch.ps1" -InstallAutostart
if errorlevel 1 (
    pause
    exit /b 1
)
