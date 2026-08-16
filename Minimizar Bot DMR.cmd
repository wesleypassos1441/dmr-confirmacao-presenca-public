@echo off
setlocal
title Minimizar - Bot DMR
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\control-bot-window.ps1" -Action minimize
echo.
pause
