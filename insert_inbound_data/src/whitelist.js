import { config } from './config.js';
import { canonicalAgent } from './sources.js';

/**
 * Load the set of allowed agents from the whitelist tab (config.whitelist).
 *
 * The agent-identifier column is located by its header, so the tab layout (title row,
 * extra columns) can change without touching this code. Returns a Set of canonical
 * agent ids (accent/case-insensitive); only these agents are eligible to be synced.
 */
export async function loadAllowedAgents(sheets) {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: config.whitelist.tab,
  });
  const grid = data.values ?? [];
  const target = config.whitelist.agentHeader.trim().toLowerCase();

  let headerRow = -1;
  let column = -1;
  for (let r = 0; r < grid.length; r += 1) {
    const c = (grid[r] ?? []).findIndex(
      (cell) => String(cell ?? '').trim().toLowerCase() === target
    );
    if (c !== -1) {
      headerRow = r;
      column = c;
      break;
    }
  }

  if (headerRow === -1) {
    throw new Error(
      `Column "${config.whitelist.agentHeader}" not found in tab "${config.whitelist.tab}".`
    );
  }

  const allowed = new Set();
  for (let r = headerRow + 1; r < grid.length; r += 1) {
    const agent = canonicalAgent((grid[r] ?? [])[column]);
    if (agent !== '') allowed.add(agent);
  }
  return allowed;
}
