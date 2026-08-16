@echo off
setlocal
title DMR - Remover Agenda do Bot
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\remove-bot-schedule.ps1"
set "DMR_EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%DMR_EXIT_CODE%"=="0" echo Nao foi possivel remover a agenda. Leia a mensagem acima.
pause
exit /b %DMR_EXIT_CODE%
