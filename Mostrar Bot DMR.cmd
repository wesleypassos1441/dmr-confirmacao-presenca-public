@echo off
setlocal
title Mostrar - Bot DMR
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\control-bot-window.ps1" -Action restore
echo.
pause
