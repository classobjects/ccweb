@echo off
rem ---------------------------------------------------------------------------
rem  ccweb_api.cmd - run the API in the foreground, as a production host does.
rem
rem    .\scripts\ccweb_api.cmd
rem
rem  What the scheduled task "ccwebdb api" runs at start-up on a Windows host
rem  (docs\deployment-windows.md, step 6). It returns only when the API
rem  stops. A development machine uses ccweb_startup.cmd instead, which also
rem  starts PostgreSQL and the frontend, each in a console of its own.
rem
rem  The API listens on CCWEB_API_HOST and CCWEB_API_PORT, behind Caddy:
rem  --proxy-headers with --forwarded-allow-ips set to that address makes it
rem  see each visitor's address and https from Caddy's headers, and believe
rem  no one else's. python -m uvicorn rather than uvicorn.exe: Smart App
rem  Control blocks unsigned .exe wrappers on some machines. Its output goes
rem  through logpipe.py into backend.log in the log folder, which starts
rem  afresh each time the API starts and never grows past
rem  CCWEB_LOG_MAX_BYTES (logs\README.md).
rem
rem  It lives in the repository, so an update to how the API starts arrives
rem  with the code; every value it uses comes from the settings.
rem
rem  Exit 2, saying why, when the environment or a setting is refused;
rem  otherwise the log writer's exit code, once the API has stopped.
rem ---------------------------------------------------------------------------
setlocal EnableExtensions

if not "%~1"=="" (
    echo ERROR: unknown argument %1
    echo        .\scripts\ccweb_api.cmd
    exit /b 2
)

call "%~dp0ccweb_env.cmd"
if errorlevel 1 (
    echo api FAILED - the ccwebdb environment could not be put in play; the API was not started
    exit /b 2
)
call "%~dp0ccweb_settings.cmd"
if errorlevel 1 (
    echo api FAILED - a setting in .env was refused; the API was not started
    exit /b 2
)
call "%~dp0ccweb_logdir.cmd"
if not exist "%LOGS%\" mkdir "%LOGS%"
set "PYTHONUNBUFFERED=1"

cd /d "%CCWEB_REPO%\backend"
"%ENVDIR%\python.exe" -m uvicorn app.main:app --host %CCWEB_API_HOST% --port %CCWEB_API_PORT% --proxy-headers --forwarded-allow-ips %CCWEB_API_HOST% 2>&1 | "%ENVDIR%\python.exe" "%CCWEB_REPO%\backend\app\logpipe.py" "%LOGS%\backend.log"
exit /b %errorlevel%
