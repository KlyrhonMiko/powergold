@echo off
setlocal

set "ROOT=%~dp0"
set "PS=powershell.exe -NoProfile -ExecutionPolicy Bypass"
title PowerGold Enterprises

if /I "%~1"=="install" goto install
if /I "%~1"=="start" goto start
if /I "%~1"=="start-kiosk" goto startkiosk
if /I "%~1"=="stop" goto stop
if /I "%~1"=="stop-all" goto stopall
if /I "%~1"=="restart" goto restart
if /I "%~1"=="status" goto status
if /I "%~1"=="logs" goto logs
if /I "%~1"=="verify" goto verify
if /I "%~1"=="backup" goto backup
if /I "%~1"=="restore" goto restore
if /I "%~1"=="update" goto update
if /I "%~1"=="cert" goto cert
if /I "%~1"=="secrets" goto secrets
if /I "%~1"=="enable-startup" goto enablestartup
if /I "%~1"=="disable-startup" goto disablestartup
if not "%~1"=="" goto usage

:menu
cls
echo ========================================
echo   PowerGold Enterprises
echo ========================================
echo.
echo   1. Install
echo   2. Start Application
echo   3. Start Application (Kiosk Mode)
echo   4. Stop App
echo   5. Stop App + DB
echo   6. Restart
echo   7. Status
echo   8. Logs
echo   9. Verify
echo  10. Backup DB
echo  11. Restore DB
echo  12. Update
echo  13. Generate Certificate
echo  14. Generate Secrets
echo  15. Enable Kiosk Auto-Run on Startup
echo  16. Disable Kiosk Auto-Run
echo  17. Exit
echo.
set /p choice=Choose an option: 

if "%choice%"=="1" goto install
if "%choice%"=="2" goto start
if "%choice%"=="3" goto startkiosk
if "%choice%"=="4" goto stop
if "%choice%"=="5" goto stopall
if "%choice%"=="6" goto restart
if "%choice%"=="7" goto status
if "%choice%"=="8" goto logs
if "%choice%"=="9" goto verify
if "%choice%"=="10" goto backup
if "%choice%"=="11" goto restore
if "%choice%"=="12" goto update
if "%choice%"=="13" goto cert
if "%choice%"=="14" goto secrets
if "%choice%"=="15" goto enablestartup
if "%choice%"=="16" goto disablestartup
if "%choice%"=="17" goto end
goto menu

:install
%PS% -File "%ROOT%scripts\install.ps1"
goto done

:start
%PS% -File "%ROOT%scripts\start.ps1"
goto done

:startkiosk
%PS% -File "%ROOT%scripts\start.ps1" -Kiosk
goto done

:stop
%PS% -File "%ROOT%scripts\stop.ps1"
goto done

:stopall
%PS% -File "%ROOT%scripts\stop.ps1" -IncludeDb
goto done

:restart
%PS% -File "%ROOT%scripts\restart.ps1"
goto done

:status
%PS% -File "%ROOT%scripts\status.ps1"
goto done

:logs
echo.
set /p service=Optional service name (leave blank for all): 
if "%service%"=="" (
  %PS% -File "%ROOT%scripts\logs.ps1"
) else (
  %PS% -File "%ROOT%scripts\logs.ps1" -Service "%service%"
)
goto done

:verify
%PS% -File "%ROOT%scripts\verify.ps1"
goto done

:backup
%PS% -File "%ROOT%scripts\backup-db.ps1"
goto done

:restore
echo.
set /p inputfile=Enter backup file path: 
if "%inputfile%"=="" goto menu
%PS% -File "%ROOT%scripts\restore-db.ps1" -InputFile "%inputfile%"
goto done

:update
%PS% -File "%ROOT%scripts\update.ps1"
goto done

:cert
%PS% -File "%ROOT%scripts\generate-cert.ps1"
goto done

:secrets
%PS% -File "%ROOT%scripts\generate-secrets.ps1"
goto done

:enablestartup
%PS% -File "%ROOT%scripts\enable-startup.ps1"
goto done

:disablestartup
%PS% -File "%ROOT%scripts\disable-startup.ps1"
goto done

:usage
echo Usage:
echo   powergold.bat [install^|start^|start-kiosk^|stop^|stop-all^|restart^|status^|logs^|verify^|backup^|restore^|update^|cert^|secrets^|enable-startup^|disable-startup]
echo.
echo Run without arguments to open the menu.
goto end

:done
echo.
pause
if "%~1"=="" goto menu

:end
endlocal
