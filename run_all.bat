@echo off
REM ------------------------------------------------------------
REM Windows Task Scheduler entry point for the KPI automation pipeline.
REM Runs the scraper, verifies all CSVs downloaded, then runs the sync.
REM Runs once and exits — Task Scheduler owns the daily cadence.
REM
REM Task Scheduler action:
REM   Program/script:  run_all.bat   (full path)
REM Run it under the same user that performed the one-time Google login,
REM with "Run only when user is logged on" so Chrome can open a window.
REM ------------------------------------------------------------
cd /d "%~dp0"
node "%~dp0run_all.js"
exit /b %ERRORLEVEL%
