@echo off
title Subir Liga Chaquito F8 a GitHub
cd /d "%~dp0"
where git >nul 2>nul
if errorlevel 1 (
  echo No se encontro Git. Instalalo desde https://git-scm.com/download/win y volve a abrir este archivo.
  pause
  exit /b 1
)
echo Primero creá un repositorio VACIO en github.com ^(sin README^) y copia su URL.
set /p URL=Pega la URL del repositorio (https://github.com/USUARIO/REPO.git): 
if not exist .git git init
git add .
git commit -m "Liga Chaquito F8"
git branch -M main
git remote remove origin >nul 2>nul
git remote add origin %URL%
git push -u origin main
echo.
echo Si pide usuario y contrasena, la contrasena es un Token de GitHub (Settings ^> Developer settings ^> Tokens, con permiso repo y workflow).
pause
