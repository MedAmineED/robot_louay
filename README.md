# KPI Automation

Two independent scripts chained into one unattended daily pipeline:

1. **`bpo_scrap/`** — Playwright scraper. Exports CSV tables from a Looker Studio
   report into the shared folder.
2. **`insert_inbound_data/`** — reads those CSVs, aggregates them, and writes to a
   Google Sheet.

`run_all.js` runs script 1, verifies **every** expected CSV was freshly
downloaded, and only then runs script 2. Scheduling is done at the OS level — the
scripts contain no timer or loop.

```
kpi_automation/
  bpo_scrap/                # script 1 (scraper)
  insert_inbound_data/      # script 2 (sync)
  shared/                   # CSV handoff + manifest.json  (git-ignored)
  run_all.js                # orchestrator
  run_all.bat / run_all.sh  # OS scheduler entry points
```

## Data flow

`scraper → shared/*.csv (+ manifest.json) → [gate] → sync → Google Sheet`

The scraper writes each CSV plus `shared/manifest.json` (`expected`, `succeeded`,
`failed`). The orchestrator's gate runs the sync only if the scraper exited 0,
`failed` is empty, and all four expected CSVs exist, are non-empty, and were
written during this run.

## Credentials (not in git)

These are git-ignored and must be provided out-of-band on each machine:

- `bpo_scrap/chrome-profile/` — created by the one-time Google login (below).
- `insert_inbound_data/gen-lang-client-*.json` — Google service-account key,
  shared with the target sheet.

## One-time setup

```bash
# scraper
cd bpo_scrap && npm install && npx playwright install chromium && cd ..
# sync
cd insert_inbound_data && npm install && cd ..
```

**One-time Google login (on the machine that will run the schedule):**

```bash
cd bpo_scrap
node export_looker_studio.js        # NO --unattended
```

A visible Chrome opens under `./chrome-profile`. Log into Google, wait for the
report to load, return to the terminal and press **Enter**. The session persists
in `./chrome-profile` and is reused on every future run.

## Running

```bash
node run_all.js            # scraper -> gate -> sync
```

The scraper can also be run alone: `node bpo_scrap/export_looker_studio.js --unattended --os=windows`
(`--os=windows|linux` selects the Chrome path map; it auto-detects if omitted).

## Scheduling (OS level — pick your platform)

**Windows (Task Scheduler):** daily trigger at your hour → action runs
`run_all.bat` (full path). Use the **same user** that did the one-time login and
"Run only when user is logged on" so Chrome can open a window.

**Linux (cron):** needs a display for headed Chrome.

```
0 7 * * *  /path/to/kpi_automation/run_all.sh >> /path/to/kpi_automation/run.log 2>&1
```

On a headless server, wrap the node call in `xvfb-run`.

## Tests

```bash
node test/orchestrator_gate.test.js   # download-gate logic
```
