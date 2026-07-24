#!/usr/bin/env node
/**
 * run_all.js — global orchestrator for the KPI automation pipeline.
 * ------------------------------------------------------------
 * 1. Runs the scraper (bpo_scrap/export_looker_studio.js) unattended.
 * 2. Verifies EVERY expected CSV was freshly downloaded this run.
 * 3. Only then runs the sync (insert_inbound_data/src/index.js).
 *
 * There is NO timer or loop here: this runs once and exits. Cadence is owned
 * by the OS scheduler (Windows Task Scheduler / cron), which calls this via
 * run_all.bat / run_all.sh.
 *
 * Exit code: 0 on full success; non-zero if the scraper failed, the gate
 * failed, or the sync failed (the sync's own code is propagated).
 * ------------------------------------------------------------
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = __dirname;
const SHARED_DIR = process.env.KPI_SHARED_DIR
  ? path.resolve(process.env.KPI_SHARED_DIR)
  : path.join(REPO, 'shared');

const SCRAPER = path.join(REPO, 'bpo_scrap', 'export_looker_studio.js');
const SYNC = path.join(REPO, 'insert_inbound_data', 'src', 'index.js');

function log(msg) { console.log(`[run_all] ${msg}`); }

/** Resolve the effective OS to forward to the scraper's --os flag. */
function detectOs() {
  return process.platform === 'win32' ? 'windows' : 'linux';
}

/**
 * The gate. Reads shared/manifest.json and confirms every expected CSV exists,
 * is non-empty, and was written during this run (mtime >= runStart). Pure and
 * side-effect-free so it can be unit-tested with fixtures.
 *
 * Returns { ok, problems, expected }.
 */
function verifyDownloads(sharedDir, runStart) {
  const manifestPath = path.join(sharedDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, problems: [`manifest.json missing at ${manifestPath}`], expected: [] };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    return { ok: false, problems: [`manifest.json parse error: ${e.message}`], expected: [] };
  }

  const problems = [];

  if (Array.isArray(manifest.failed) && manifest.failed.length > 0) {
    problems.push(`scraper reported failed tables: ${manifest.failed.join(', ')}`);
  }

  const expected = Array.isArray(manifest.expected) ? manifest.expected : [];
  if (expected.length === 0) {
    problems.push('manifest.expected is empty');
  }

  for (const name of expected) {
    const p = path.join(sharedDir, name);
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      problems.push(`${name}: missing`);
      continue;
    }
    if (st.size === 0) {
      problems.push(`${name}: empty`);
      continue;
    }
    if (st.mtimeMs < runStart) {
      problems.push(`${name}: stale (not written this run)`);
      continue;
    }
  }

  return { ok: problems.length === 0, problems, expected };
}

/** Run a Node script as a child process, inheriting stdio. Returns exit code. */
function runNode(scriptPath, args, env) {
  const res = spawnSync(process.execPath, [scriptPath, ...args], {
    stdio: 'inherit',
    cwd: path.dirname(scriptPath),
    env: { ...process.env, ...env },
  });
  if (res.error) throw res.error;
  return res.status === null ? 1 : res.status;
}

function main() {
  fs.mkdirSync(SHARED_DIR, { recursive: true });
  const childEnv = { KPI_SHARED_DIR: SHARED_DIR };
  const runStart = Date.now();

  // --- Step 1: scraper ---
  log(`shared dir: ${SHARED_DIR}`);
  log('running scraper (script 1)...');
  const os = detectOs();
  const scraperCode = runNode(SCRAPER, ['--unattended', `--os=${os}`], childEnv);
  log(`scraper exit code: ${scraperCode}`);
  if (scraperCode !== 0) {
    console.error('[run_all] ERROR: scraper exited non-zero — sync will NOT run.');
    process.exit(1);
  }

  // --- Step 2: gate ---
  log('verifying all expected CSVs downloaded this run...');
  const { ok, problems, expected } = verifyDownloads(SHARED_DIR, runStart);
  if (!ok) {
    console.error('[run_all] ERROR: download gate failed — sync will NOT run:');
    for (const p of problems) console.error(`   - ${p}`);
    process.exit(1);
  }
  log(`gate passed: ${expected.length} CSV(s) present, non-empty, and fresh.`);

  // --- Step 3: sync ---
  log('running sync (script 2)...');
  const syncCode = runNode(SYNC, [], childEnv);
  log(`sync exit code: ${syncCode}`);
  process.exit(syncCode);
}

module.exports = { verifyDownloads };

if (require.main === module) {
  main();
}
