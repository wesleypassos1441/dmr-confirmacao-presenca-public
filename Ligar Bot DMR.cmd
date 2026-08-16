@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-bot-background.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\wait-and-show-bot-window.ps1"
