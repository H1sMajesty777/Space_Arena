@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0WatchdogHost.ps1" -Stop
