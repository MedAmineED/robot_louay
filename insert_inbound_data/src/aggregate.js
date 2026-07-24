import { config } from './config.js';
import { columnMapping } from './columnMapping.js';
import { canonicalAgent, normalizeAgent } from './sources.js';

/** Parse a raw CSV cell to a number; non-numeric cells ("-", "") count as 0. */
function toNumber(cell) {
  const value = Number(String(cell ?? '').trim());
  return Number.isFinite(value) ? value : 0;
}

/** Union of every agent seen across all sources, sorted A -> Z (case-insensitive). */
function buildRoster(sources) {
  const roster = new Set();
  for (const byAgent of sources.values()) {
    for (const agent of byAgent.keys()) roster.add(agent);
  }
  return [...roster].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
}

/** Resolve one sheet column's value for one agent, following the mapping rules. */
function resolveCell(header, agent, sources) {
  const rule = columnMapping[header];

  // A sheet column with no mapping entry is left blank rather than filled with
  // wrong data — surfaced as a warning by buildRecords.
  if (!rule) return { value: '', unmapped: true };
  if (rule.empty) return { value: '' };

  const row = sources.get(rule.source)?.get(agent);
  if (!row) return { value: config.missingValue };

  if (rule.compute) return { value: rule.compute(row, { toNumber }) };

  const raw = row[rule.field];
  return { value: raw === undefined || raw === '' ? config.missingValue : raw };
}

/**
 * Build one record per agent, ordered to match the live sheet header.
 *
 * @param {string[]} headers - sheet header row, in its exact order (incl. agent key).
 * @param {Map} sources - output of loadSources().
 * @param {Set<string>|null} [allowedAgents] - if provided, agents absent from this set
 *   are skipped (see loadAllowedAgents).
 * @returns {{ rows: Array<Array>, unmappedColumns: string[], skipped: string[] }}
 */
export function buildRecords(headers, sources, allowedAgents = null) {
  const roster = buildRoster(sources);
  const unmappedColumns = new Set();
  const skipped = [];

  const included = allowedAgents
    ? roster.filter((agent) => {
        const ok = allowedAgents.has(canonicalAgent(agent));
        if (!ok) skipped.push(agent);
        return ok;
      })
    : roster;

  const rows = included.map((agent) =>
    headers.map((header) => {
      if (header === config.agentKey) return agent;
      const { value, unmapped } = resolveCell(normalizeAgent(header), agent, sources);
      if (unmapped) unmappedColumns.add(header);
      return value;
    })
  );

  return { rows, unmappedColumns: [...unmappedColumns], skipped };
}
