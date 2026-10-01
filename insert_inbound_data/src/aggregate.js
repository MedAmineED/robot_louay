import { config } from './config.js';
import { columnMapping } from './columnMapping.js';
import { canonicalAgent, normalizeAgent } from './sources.js';

/** Parse a raw CSV cell to a numeric fraction; handles "26,09%", "0.2609", "-", etc. */
function toNumber(cell) {
  const str = String(cell ?? '').trim();
  if (!str || str === '-') return 0;

  const isPercent = str.endsWith('%');
  const cleanStr = isPercent ? str.slice(0, -1) : str;
  const num = Number(cleanStr.replace(',', '.'));

  if (!Number.isFinite(num)) return 0;
  return isPercent ? num / 100 : num;
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

  let raw;
  if (rule.compute) {
    raw = rule.compute(row, { toNumber });
  } else {
    raw = row[rule.field];
    if (raw === undefined || raw === '') return { value: config.missingValue };
  }

  if (raw === config.missingValue || raw === '-') return { value: config.missingValue };

  let parsedValue;

  if (rule.format === 'percent') {
    const parsed = toNumber(raw);
    // Round consistently to 4 decimal places (e.g. 0.2609)
    parsedValue = Math.round(parsed * 10000) / 10000;
  } else {
    // Attempt to parse other numeric columns
    const str = String(raw).trim();
    const asNum = Number(str.replace(',', '.'));
    if (str !== '' && Number.isFinite(asNum)) {
      // Round to at most 2 decimals (0.673076… -> 0.67, 46 -> 46, 24.5 -> 24.5) and
      // use a comma decimal separator so Sheets (FR locale) doesn't read "1.5" as May 1st.
      const rounded = Math.round(asNum * 100) / 100;
      parsedValue = String(rounded).replace('.', ',');
    } else {
      parsedValue = raw;
    }
  }

  return { value: parsedValue };
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
