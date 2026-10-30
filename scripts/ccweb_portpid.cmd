@echo off
rem (c) Copyright 2026 Nathaniel Mills
rem Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
rem SPDX-License-Identifier: Apache-2.0
rem ---------------------------------------------------------------------------
rem  ccweb_portpid.cmd PORT VAR [ADDRESS] - set VAR to the PID listening on
rem  PORT (on ADDRESS alone, if given), or leave it empty if none does.
rem
rem  backend\app\portpid.py, not netstat's LISTENING rows: on Windows
rem  26300.9818 a listener's state reads wrong and netstat leaves the row out
rem  (portpid.py's docstring says how a listener is told instead).
rem
rem  Called by ccweb_startup.cmd, ccweb_shutdown.cmd, ccweb_status.cmd,
rem  ccweb_pgadmin.cmd and ccweb_sonar_start.cmd after ccweb_env.cmd and
rem  ccweb_settings.cmd, which set ENVDIR and CCWEB_REPO. No setlocal:
rem  setting the caller's VAR is the point.
rem ---------------------------------------------------------------------------
set "%~2="
for /f %%A in ('call "%ENVDIR%\python.exe" "%CCWEB_REPO%\backend\app\portpid.py" %~1 %~3') do set "%~2=%%A"
exit /b 0
