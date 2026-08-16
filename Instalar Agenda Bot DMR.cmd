@echo off
setlocal
title DMR - Instalar Agenda do Bot
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-bot-schedule.ps1"
set "DMR_EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%DMR_EXIT_CODE%"=="0" echo Nao foi possivel instalar a agenda. Leia a mensagem acima.
pause
exit /b %DMR_EXIT_CODE%
