#!/usr/bin/env bash
# ------------------------------------------------------------
# Linux entry point for the KPI automation pipeline.
# Runs the scraper, verifies all CSVs downloaded, then runs the sync.
# Runs once and exits — cron owns the daily cadence.
#
# Example crontab (daily at 07:00), needs a display for headed Chrome:
#   0 7 * * *  /path/to/kpi_automation/run_all.sh >> /path/to/kpi_automation/run.log 2>&1
# On a headless server, wrap the node call with xvfb-run.
# ------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"
exec node run_all.js
