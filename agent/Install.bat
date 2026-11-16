@echo off
cd /d "%~dp0"
py -3 -m venv .venv
if errorlevel 1 goto fail
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto fail
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Autostart.ps1"
if errorlevel 1 goto fail
start "" "%~dp0.venv\Scripts\pythonw.exe" "%~dp0agent.py"
exit /b
:fail
echo Install failed. Install Python 3.12 with tkinter and retry.
pause
