@echo off
REM ============================================================================
REM  PCTG LICENCE ISSUER - desktop launcher
REM
REM  Wraps scripts\issue-free-keys.php so the Boss does not have to remember flags.
REM  Every prompt is validated here and passed as a properly quoted argument, because
REM  this project has been bitten by shell quoting before: PowerShell strips the double
REM  quotes out of a JSON body passed to a native exe, so the server received malformed
REM  input and the failure looked like a server bug. This file uses cmd.exe with
REM  %~dp1-style absolute paths and quotes every value it forwards.
REM
REM  IT WRITES TO REAL PRODUCTION DATA. The script itself is dry-run by default; this
REM  launcher asks for explicit confirmation before it passes --commit.
REM ============================================================================
setlocal EnableDelayedExpansion

set "REPO=C:\Users\simon\WebStormProjects\pctg-system optimizer"
set "ISSUER=%REPO%\scripts\issue-free-keys.php"
set "BUNDLE=%REPO%\scripts\issue-bundle-keys.php"

if not exist "%ISSUER%" (
  echo.
  echo   Cannot find the issuer script:
  echo     %ISSUER%
  echo.
  echo   The repo may have moved. This shortcut points at a fixed path.
  echo.
  pause
  exit /b 1
)

where php >nul 2>&1
if errorlevel 1 (
  echo.
  echo   php is not on the PATH, so no licence can be issued.
  echo.
  pause
  exit /b 1
)

:MENU
cls
echo ===========================================================================
echo   PCTG LICENCE ISSUER
echo   Free Pro keys for testing, giveaways and PCs you have sold.
echo ----------------------------------------------------------------------------
echo.
echo   These are REAL keys in the live store. They work exactly like a paid
echo   licence and cannot be told apart by the app.
echo.
echo   [1] One key        - a single giveaway or test licence
echo   [2] A batch        - several identical keys (e.g. 10 giveaway keys)
echo   [3] For sold PCs   - one key per customer, from a list file
echo   [4] Show existing  - list the licences already in the store
echo   [Q] Quit
echo.
set /p "choice=Choose: "

if /i "%choice%"=="1" goto ONE
if /i "%choice%"=="2" goto BATCH
if /i "%choice%"=="3" goto BUNDLE
if /i "%choice%"=="4" goto LIST
if /i "%choice%"=="Q" goto DONE
goto MENU

:ONE
echo.
set "tier=pro"
set "count=1"
set /p "tier=Tier [pro]: "
if "%tier%"=="" set "tier=pro"
goto REASON

:BATCH
echo.
set /p "tier=Tier [pro]: "
if "%tier%"=="" set "tier=pro"
echo.
set /p "count=How many [10]: "
if "%count%"=="" set "count=10"
goto REASON

:BUNDLE
echo.
echo   This issues ONE key per customer listed in a text file, so you can
echo   print them onto cards. One line per customer; a # line is ignored.
echo.
set /p "list=Path to the customer list file: "
if not exist "%list%" (
  echo.
  echo   That file does not exist: %list%
  goto MENU
)
echo.
set /p "reason=Reason (e.g. PC run October): "
if "%reason%"=="" (
  echo.
  echo   A reason is REQUIRED - every free key records who issued it and why.
  goto MENU
)
echo.
echo   Customer machines you SOLD should not be HWID-locked, or a reinstall
echo   locks the customer out of software you gave them.
echo.
set /p "nohwid=Allow the key to move to a new machine? [Y/n]: "
set "NOHWID="
if /i "%nohwid%"=="Y" set "NOHWID=--no-hwid"
echo.
echo   Dry run first - this shows what WOULD be created and writes nothing.
echo.
php "%BUNDLE%" --list="%list%" --reason="%reason%" %NOHWID%
echo.
pause
echo.
set /p "go=Type YES to actually issue these keys: "
if /i "%go%"=="YES" (
  php "%BUNDLE%" --list="%list%" --reason="%reason%" %NOHWID% --commit
) else (
  echo   Nothing was written.
)
echo.
pause
goto MENU

:LIST
echo.
php "%ISSUER%" --list
echo.
pause
goto MENU

:REASON
echo.
set /p "reason=Reason (e.g. October giveaway) - REQUIRED: "
if "%reason%"=="" (
  echo.
  echo   A reason is REQUIRED. A free key with no reason cannot be told apart
  echo   from a sale later, which is the question you will eventually be asked.
  goto MENU
)
echo.
echo   HWID locks the key to the first machine that activates it. That is the
echo   right default for a giveaway - it stops one key being won twice.
echo   For a PC you have SOLD, unlock it so the customer is not locked out.
echo.
set /p "nohwid=Allow the key to move to a new machine? [y/N]: "
set "NOHWID="
if /i "%nohwid%"=="y" set "NOHWID=--no-hwid"
echo.
echo   DRY RUN - shows what would be created, writes nothing:
echo.
php "%ISSUER%" --tier=%tier% --count=%count% --reason="%reason%" %NOHWID%
echo.
pause
echo.
set /p "go=Type YES to actually issue: "
if /i "%go%"=="YES" (
  php "%ISSUER%" --tier=%tier% --count=%count% --reason="%reason%" %NOHWID% --commit
) else (
  echo   Nothing was written.
)
echo.
pause
goto MENU

:DONE
endlocal
exit /b 0