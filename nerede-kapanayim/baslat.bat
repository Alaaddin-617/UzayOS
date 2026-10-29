@echo off
chcp 65001 >nul
title Nerede Kapansin?
cd /d "%~dp0"
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8090"
node server.js
pause
