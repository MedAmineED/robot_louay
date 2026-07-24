import { config } from './config.js';
import { parseCsv } from './csvParser.js';

/** Normalize an agent identifier so the same person matches across files. */
export function normalizeAgent(name) {
  return String(name ?? '').trim();
}

/**
 * Canonical form used for loose matching (e.g. against the whitelist): lower-cased and
 * with diacritics stripped, so "hédi_gaies" matches "hedi_gaies". Not used for display.
 */
export function canonicalAgent(name) {
  return normalizeAgent(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/**
 * Load every configured source CSV.
 *
 * Returns a map: sourceKey -> Map<agentKey, row>. Rows are keyed by the
 * normalized agent identifier so values can be linked to the right agent.
 */
export async function loadSources() {
  const entries = await Promise.all(
    Object.entries(config.sources).map(async ([key, filePath]) => {
      const { rows } = await parseCsv(filePath);
      const byAgent = new Map();

      for (const row of rows) {
        const agent = normalizeAgent(row[config.agentKey]);
        if (agent === '') continue;
        byAgent.set(agent, row);
      }

      return [key, byAgent];
    })
  );

  return new Map(entries);
}
