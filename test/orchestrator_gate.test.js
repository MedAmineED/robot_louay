/**
 * Tests for the orchestrator download gate (run_all.js verifyDownloads).
 * Plain Node + assert — no framework. Run: node test/orchestrator_gate.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { verifyDownloads } = require('../run_all.js');

let passed = 0;
function test(name, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpi-gate-'));
  try {
    fn(dir);
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    process.exitCode = 1;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const FILES = ['a.csv', 'b.csv', 'c.csv', 'd.csv'];

/** Write a manifest + fresh, non-empty CSVs for all expected files. */
function seedHealthy(dir, runStart) {
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ runAt: new Date().toISOString(), expected: FILES, succeeded: FILES, failed: [] })
  );
  for (const f of FILES) fs.writeFileSync(path.join(dir, f), 'agent,val\nx,1\n');
  // Ensure mtimes are clearly after runStart.
  const future = new Date(runStart + 5000);
  for (const f of FILES) fs.utimesSync(path.join(dir, f), future, future);
}

console.log('orchestrator gate:');

test('all present, non-empty, fresh -> ok', (dir) => {
  const runStart = Date.now();
  seedHealthy(dir, runStart);
  const r = verifyDownloads(dir, runStart);
  assert.strictEqual(r.ok, true, `expected ok, got problems: ${r.problems}`);
  assert.strictEqual(r.expected.length, 4);
});

test('missing file -> fails with "missing"', (dir) => {
  const runStart = Date.now();
  seedHealthy(dir, runStart);
  fs.rmSync(path.join(dir, 'c.csv'));
  const r = verifyDownloads(dir, runStart);
  assert.strictEqual(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('c.csv') && p.includes('missing')), r.problems.join('; '));
});

test('empty file -> fails with "empty"', (dir) => {
  const runStart = Date.now();
  seedHealthy(dir, runStart);
  fs.writeFileSync(path.join(dir, 'b.csv'), '');
  const r = verifyDownloads(dir, runStart);
  assert.strictEqual(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('b.csv') && p.includes('empty')), r.problems.join('; '));
});

test('stale file (old mtime) -> fails with "stale"', (dir) => {
  const runStart = Date.now();
  seedHealthy(dir, runStart);
  const old = new Date(runStart - 60_000); // a minute before the run started
  fs.utimesSync(path.join(dir, 'a.csv'), old, old);
  const r = verifyDownloads(dir, runStart);
  assert.strictEqual(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('a.csv') && p.includes('stale')), r.problems.join('; '));
});

test('manifest.failed non-empty -> fails', (dir) => {
  const runStart = Date.now();
  seedHealthy(dir, runStart);
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ runAt: new Date().toISOString(), expected: FILES, succeeded: FILES.slice(1), failed: ['a.csv'] })
  );
  const r = verifyDownloads(dir, runStart);
  assert.strictEqual(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('failed tables')), r.problems.join('; '));
});

test('missing manifest -> fails', (dir) => {
  const r = verifyDownloads(dir, Date.now());
  assert.strictEqual(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('manifest.json missing')), r.problems.join('; '));
});

test('corrupt manifest -> fails with parse error', (dir) => {
  fs.writeFileSync(path.join(dir, 'manifest.json'), '{ not json');
  const r = verifyDownloads(dir, Date.now());
  assert.strictEqual(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('parse error')), r.problems.join('; '));
});

console.log(`\n${passed} passed`);
