import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

/** Absolute path helper relative to the project root. */
const fromRoot = (...parts) => path.join(projectRoot, ...parts);

// Shared handoff folder written by the scraper (bpo_scrap). No manual copying:
// the CSVs are read straight from here. Overridable via KPI_SHARED_DIR (the
// orchestrator sets it); defaults to <repo>/shared, one level up from this project.
const sharedDir = process.env.KPI_SHARED_DIR
  ? path.resolve(process.env.KPI_SHARED_DIR)
  : path.join(projectRoot, '..', 'shared');

/** Absolute path helper relative to the shared handoff folder. */
const fromShared = (...parts) => path.join(sharedDir, ...parts);

export const config = {
  // Google Sheet target.
  spreadsheetId: '1jR6GotUFsgFvPYWbJXCr0htsj6vzO0sk6KwkdvZE6Lg',
  tabName: 'KPI_Inbound_test',

  // Service-account credentials shared with the sheet.
  credentialsPath: fromRoot('gen-lang-client-0853188287-4ba6689de090.json'),

  // Logical name -> CSV file, read from the shared handoff folder.
  // Referenced by columnMapping.js via these keys.
  sources: {
    quick_look: fromShared('quick_look__experts_point_of_view.csv'),
    others_focus: fromShared('deep_dive__others_focus__your_point_of_view_experts.csv'),
    production: fromShared('table_view__production.csv'),
  },

  // Column holding the agent identifier in every source file and in the sheet.
  agentKey: 'agent_eloquant',

  // Whitelist: an agent is only synced if it exists in this tab/column. Agents found
  // in the CSVs but absent here are skipped.
  whitelist: {
    tab: 'Stats_Experts',
    agentHeader: 'Agent Eloquant',
  },

  // Marker row that ends the agent data block (kept untouched, along with anything below).
  blockEndMarker: 'GLOBAL EQUIPE',

  // Value written when an agent has no data for a given source.
  missingValue: '-',
};
