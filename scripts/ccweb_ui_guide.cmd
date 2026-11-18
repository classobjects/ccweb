@echo off
rem (c) Copyright 2026 Nathaniel Mills
rem Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
rem SPDX-License-Identifier: Apache-2.0
rem ---------------------------------------------------------------------------
rem  ccweb_ui_guide.cmd - retake the pictures in docs\ui-guide.md.
rem
rem    .\scripts\ccweb_ui_guide.cmd all              rebuild the demo, take all
rem    .\scripts\ccweb_ui_guide.cmd shots NAME ...   take only these pictures
rem    .\scripts\ccweb_ui_guide.cmd seed             only rebuild the demo
rem    .\scripts\ccweb_ui_guide.cmd serve            run the demo stack to look
rem    .\scripts\ccweb_ui_guide.cmd list             name every picture
rem
rem  Starts the test cluster if it is not running, then runs
rem  python -m ui_guide in backend\ with the arguments given. The demo
rem  database lives in the test cluster; the API, frontend and headless
rem  Chrome it starts use the CCWEB_GUIDE_* ports, beside any development
rem  server, and stop when it is done. See backend\ui_guide\README.md.
rem ---------------------------------------------------------------------------
setlocal EnableExtensions

call "%~dp0ccweb_env.cmd" || exit /b 2
if /i "%~1"=="list" goto run
call "%~dp0ccweb_testdb.cmd" start || exit /b 1

:run
pushd "%~dp0..\backend" || exit /b 2
"%ENVDIR%\python.exe" -m ui_guide %*
set "RC=%errorlevel%"
popd
exit /b %RC%
