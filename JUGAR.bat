@echo off
title Liga Chaquito F8
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org ^(version LTS^) y volve a abrir este archivo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias, esto tarda un minuto la primera vez...
  call npm install --no-audit --no-fund
)
echo.
echo Abriendo el juego en http://127.0.0.1:3001  ^(cerra esta ventana para apagar el servidor^)
start "" "http://127.0.0.1:3001"
call npm start
pause
