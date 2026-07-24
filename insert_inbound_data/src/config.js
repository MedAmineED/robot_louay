import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

/** Absolute path helper relative to the project root. */
const fromRoot = (...parts) => path.join(projectRoot, ...parts);

export const config = {
  // Google Sheet target.
  spreadsheetId: '12NncDaUkv19J51JCXYLD7Iw9-a7AZ3wi-y_SPnHGNXU',
  tabName: 'inbound_kpi',

  // Service-account credentials shared with the sheet.
  credentialsPath: fromRoot('gen-lang-client-0853188287-4ba6689de090.json'),

  // Logical name -> CSV file. Referenced by columnMapping.js via these keys.
  sources: {
    quick_look: fromRoot('quick_look__experts_point_of_view.csv'),
    others_focus: fromRoot('deep_dive__others_focus__your_point_of_view_experts.csv'),
    production: fromRoot('table_view__production.csv'),
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
