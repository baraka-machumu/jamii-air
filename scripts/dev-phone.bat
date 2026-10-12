@echo off
rem Runs the local stack for testing on a phone: double-click this file, or run it from a terminal.
rem It calls dev-phone.ps1 (same folder), which finds the current Wi-Fi address and restarts the API,
rem the worker and the Expo dev server on it. Pass -Build to rebuild the API first:
rem   scripts\dev-phone.bat -Build
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-phone.ps1" %*
echo.
pause
