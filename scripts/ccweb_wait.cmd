@echo off
rem (c) Copyright 2026 Nathaniel Mills
rem Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
rem SPDX-License-Identifier: Apache-2.0
rem ---------------------------------------------------------------------------
rem  ccweb_wait.cmd url URL TRIES - poll URL until it answers (exit 0), or give
rem                                 up after TRIES tries (exit 1).
rem  ccweb_wait.cmd pg TRIES      - poll PostgreSQL at CCWEB_DB_HOST and
rem                                 CCWEB_DB_PORT until it accepts connections
rem                                 (exit 0), or give up (exit 1).
rem
rem  A try that gets no answer takes up to two seconds for a URL, and a
rem  second passes before the next. pg_isready says "rejecting connections"
rem  while crash recovery replays WAL: that is progress, not failure, so pg
rem  waits through it.
rem
rem  Called by ccweb_startup.cmd, ccweb_pgadmin.cmd and ccweb_claude.cmd after
rem  ccweb_env.cmd and ccweb_settings.cmd, which set PGBIN and the database's
rem  host and port.
rem ---------------------------------------------------------------------------
setlocal EnableDelayedExpansion
set /a TRIES=0
if /I "%~1"=="url" goto url
if /I "%~1"=="pg" goto pg
echo ccweb_wait.cmd: unknown mode "%~1" - url or pg 1>&2
exit /b 2

:url
curl -s -o nul --max-time 2 "%~2" >nul 2>&1
if not errorlevel 1 exit /b 0
set /a TRIES+=1
if !TRIES! GEQ %~3 exit /b 1
rem  ping, not timeout: timeout needs a real console and returns at once, with
rem  no pause, when stdin is redirected - as it is for any caller that is not a
rem  person at a keyboard - so the loop would give up almost instantly.
ping -n 2 127.0.0.1 >nul
goto url

:pg
"%PGBIN%\pg_isready.exe" -h %CCWEB_DB_HOST% -p %CCWEB_DB_PORT% >nul 2>&1
if not errorlevel 1 exit /b 0
set /a TRIES+=1
if !TRIES! GEQ %~2 exit /b 1
ping -n 2 127.0.0.1 >nul
goto pg
