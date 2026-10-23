@echo off
rem Starts the KaleidoSage dev app in its own window. Run it from Explorer or
rem your own terminal, not from Claude, so it does not stop when Claude quits.
title KaleidoSage dev
cd /d "%~dp0"
call npm run tauri dev -- --no-watch
echo.
echo The dev app has stopped.
pause
