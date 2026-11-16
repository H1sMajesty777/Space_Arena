@echo off
setlocal
pushd "%~dp0"
docker compose up -d --build --wait
if errorlevel 1 (
    echo Start failed. Make sure Docker Desktop is running. See the error above.
    pause
    popd
    exit /b 1
)
start "" "http://localhost:8080/"
start "" "http://localhost:8080/bar.html"
popd
