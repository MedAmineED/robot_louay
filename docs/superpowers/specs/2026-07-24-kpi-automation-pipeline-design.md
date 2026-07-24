# KPI Automation Pipeline — Design

**Date:** 2026-07-24
**Status:** Approved (pending spec review)

## Goal

Chain two existing, separately-maintained scripts into one unattended daily
pipeline:

1. **Script 1 — scraper** (`bpo_scrap/export_looker_studio.js`): Playwright job
   that exports CSV tables from a Looker Studio report.
2. **Script 2 — sync** (`insert_inbound_data/`): pure Node job that reads those
   CSVs, aggregates them, and writes to a Google Sheet.

The two scripts stay separate. A global runner executes script 1, verifies every
expected CSV was freshly downloaded, and only then runs script 2. Scheduling is
done at the OS level (Windows Task Scheduler / cron) — no timer or loop lives in
the code.

## Constraints & decisions

- **Two scripts remain independent.** They communicate only through a shared
  folder of CSV files plus a small manifest — a well-defined interface, not
  shared code.
- **No manual file transfer.** Script 1 writes CSVs to a shared folder; script 2
  reads from the same folder.
- **Script 1 runs on Linux and Windows.** A `--os` parameter selects the Chrome
  executable path per OS; everything else is identical. Chrome runs **headed** on
  both.
- **Script 2 is already cross-platform** (pure Node + `googleapis`, no external
  system tools). Only its CSV source path changes.
- **Unattended auth.** The operator logs into Google once on the Windows server;
  the persistent `./chrome-profile` keeps the session for every future run.
- **No scheduling in code.** The OS scheduler owns cadence.

## Directory layout

```
kpi_automation/
  bpo_scrap/export_looker_studio.js   # script 1 — edited
  insert_inbound_data/                # script 2 — config.js edited only
  shared/                             # NEW — CSV handoff + manifest.json
  run_all.js                          # NEW — orchestrator (no timer)
  run_all.bat                         # NEW — Windows launcher
  run_all.sh                          # NEW — Linux launcher
```

## Component 1 — Shared folder (CSV handoff)

- New directory `kpi_automation/shared/` holds the exported CSVs and a
  `manifest.json`.
- **Path resolution:** both scripts default to a path computed relative to their
  own location (`<repo>/shared`) and honor a `KPI_SHARED_DIR` environment
  variable override. The orchestrator sets `KPI_SHARED_DIR` so all three
  components resolve to the same absolute folder regardless of CWD.
  - Script 1: `EXPORT_DIR` → `KPI_SHARED_DIR` or `path.join(__dirname, '..', 'shared')`.
  - Script 2 (`config.js`): the `fromRoot(...)` base for `sources` → `KPI_SHARED_DIR`
    or `path.join(projectRoot, '..', 'shared')`.
- The stale CSV copies currently in `insert_inbound_data/` are removed; the shared
  folder becomes the single source of truth.

## Component 2 — Script 1 changes (scraper)

### Cross-platform Chrome path (`--os`)
- New flag `--os=windows|linux`. Default: auto-detect from `process.platform`
  (`win32` → `windows`, else `linux`).
- A small map holds an optional Chrome executable path per OS. When a path is set,
  launch with `executablePath`; when empty, fall back to the current
  `channel: 'chrome'`. Chrome stays **headed** on both platforms.
- Default map values: `linux` empty (use channel), `windows` empty (use channel).
  Operator can fill in an explicit path if the default lookup fails.

### Unattended mode
- New flag `--unattended`. When present (or when `process.stdin.isTTY` is falsy,
  e.g. under a scheduler), the script **skips the "press Enter" wait** and
  proceeds straight to the export after the report loads.
- **One-time login:** operator runs `node export_looker_studio.js` *without*
  `--unattended` once on the Windows server, logs into Google, and the persistent
  `./chrome-profile` reuses that session on every subsequent run.

### Success signal
- After the export loop, the script:
  - Sets `process.exitCode = 1` if **any** configured table failed.
  - Writes `shared/manifest.json`:
    ```json
    {
      "runAt": "<ISO timestamp when the run started>",
      "expected": ["<all configured outputName values>"],
      "succeeded": ["<outputName values that exported OK>"],
      "failed": ["<outputName values that failed>"]
    }
    ```
- `expected` is derived from the scraper's `TABLES_TO_EXPORT` config so the
  orchestrator's file list never drifts from what the scraper produces.

## Component 3 — Script 2 changes (sync)

- **Only `config.js` changes:** the `sources` file paths resolve against the
  shared folder (`KPI_SHARED_DIR` or the computed `<repo>/shared`) instead of the
  project root.
- No changes to parsing, aggregation, or the Sheets writer. Behavior is otherwise
  identical.

## Component 4 — run_all.js (orchestrator, no timer)

Single sequential pass:

1. Resolve and export `KPI_SHARED_DIR` (absolute `<repo>/shared`), creating the
   folder if needed.
2. Record `runStart = Date.now()`.
3. Spawn `node bpo_scrap/export_looker_studio.js --unattended [--os=<detected>]`
   as a child process; inherit stdio; wait for exit.
4. **Gate — proceed only if ALL of:**
   - script 1 exit code === 0, **and**
   - `shared/manifest.json` exists and `failed` is empty, **and**
   - every filename in `manifest.expected` (all 4 CSVs) exists in the shared
     folder, is non-empty, and has `mtime >= runStart` (freshly written this run).
5. If the gate passes → spawn `node insert_inbound_data/src/index.js`; wait;
   propagate its exit code as the orchestrator's exit code.
6. If the gate fails → log exactly which check/file failed, set a non-zero exit
   code, and **never** run script 2.

The gate deliberately checks **all 4** exported CSVs (not just the 3 script 2
consumes): a missing 4th table means the scrape was incomplete, which should
block the sync.

No loops, timers, or retries. Cadence belongs to the OS scheduler.

## Component 5 — OS launchers & scheduling

- `run_all.bat` (Windows): `node "%~dp0run_all.js"` — the Task Scheduler action
  target. `%~dp0` makes it path-independent.
- `run_all.sh` (Linux): `#!/usr/bin/env bash` + `cd` to its own dir + `node run_all.js`.
- Scheduling instructions (documented, not coded):
  - **Windows:** Task Scheduler → daily trigger at the chosen hour → action runs
    `run_all.bat`. Must run under the same user account that performed the
    one-time Google login (so `./chrome-profile` is available) and with the
    session able to open a visible Chrome window.
  - **Linux:** cron entry invoking `run_all.sh` (needs a display for headed Chrome,
    e.g. a real desktop session or `xvfb-run`).

## Error handling summary

| Failure | Behavior |
|---|---|
| A table fails to export | Script 1 logs ❌, continues other tables, exits non-zero, records it in `manifest.failed`. |
| Any expected CSV missing/empty/stale | Orchestrator gate fails; script 2 not run; non-zero exit. |
| Google session expired | Script 1 finds no charts, exports nothing → files not fresh → gate fails safely. |
| Script 2 (Sheets) error | Script 2 exits non-zero (existing behavior); orchestrator propagates it. |

## Testing strategy

Logic-level (no live scrape / no Google login required in CI):

1. **Shared-path resolution** — both scripts resolve to the same folder given
   `KPI_SHARED_DIR`, and to `<repo>/shared` without it.
2. **Unattended skip** — script 1 with `--unattended` (or no TTY) does not block
   on Enter.
3. **Failure signal** — simulate a failed table → script 1 exits non-zero and
   `manifest.failed` is populated.
4. **Manifest written** — `shared/manifest.json` has the expected shape.
5. **Orchestrator gate** — with a hand-written manifest + fixture CSVs:
   - all present & fresh → script 2 is invoked;
   - one file missing / empty / stale (old mtime) → script 2 is NOT invoked and
     exit is non-zero.

The full end-to-end live run (real Looker login + real Sheet write) is verified
once manually on the Windows server.

## Out of scope

- Retrying failed exports.
- Notifications/alerting on failure (could be a later addition).
- Any change to script 2's aggregation or Sheets logic.
- Scheduling logic inside the code.
