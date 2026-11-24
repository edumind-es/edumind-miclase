@echo off
rem EDUmind MiClase: abre la app en el navegador desde esta carpeta, sin internet.
rem Deja la ventana abierta mientras la uses.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
if errorlevel 1 pause
