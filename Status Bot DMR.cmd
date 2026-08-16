@echo off
setlocal
title Status - Bot DMR
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\status-bot.ps1"
echo.
pause

