@echo off
setlocal
title Desligar - Bot DMR
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-bot-background.ps1"
echo.
pause

