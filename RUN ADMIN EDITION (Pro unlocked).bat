@echo off
REM ===========================================================================
REM PCTG Optimizer - ADMIN EDITION launcher (for Simon and the dev team)
REM
REM Launches the build that is Pro with NO licence and NO password. It is a
REM separate build from anything a customer receives:
REM   - window title says "ADMIN BUILD (not for customer distribution)"
REM   - separate app id and folder, so it cannot overwrite a customer install
REM   - built by scripts/build-and-verify-admin.mjs
REM
REM If the app does not open, rebuild first:
REM   node scripts\build-and-verify-admin.mjs
REM ===========================================================================

setlocal

set "HERE=%~dp0"
set "APPDIR=%HERE%pctg-optimizer\dist\admin\PCTG Optimizer Pro-win32-x64"
set "APPEXE=%APPDIR%\PCTG Optimizer Pro.exe"

if not exist "%APPEXE%" (
  echo.
  echo   Admin build not found at:
  echo   %APPEXE%
  echo.
  echo   Build it with:  node scripts\build-and-verify-admin.mjs
  echo.
  pause
  exit /b 1
)

REM Close any running copy first. The app relaunches itself elevated, so a leftover
REM instance can hold the files - killing by name also catches the elevated child.
taskkill /IM "PCTG Optimizer Pro.exe" /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo.
echo   Starting PCTG Optimizer - ADMIN EDITION ^(Pro unlocked, no password^).
echo   Close the window to stop it.
echo.

start "" "%APPEXE%"

endlocal