import { config } from './config.js';
import { loadSources } from './sources.js';
import { buildRecords } from './aggregate.js';
import { percentColumns } from './columnMapping.js';
import { createSheetsClient } from './sheetsClient.js';
import { loadAllowedAgents } from './whitelist.js';
import { syncSheet } from './sheetsWriter.js';

async function main() {
  console.log('Loading source CSV files...');
  const sources = await loadSources();
  for (const [key, byAgent] of sources) {
    console.log(`  ${key}: ${byAgent.size} agents`);
  }

  console.log(`Connecting to Google Sheet (tab "${config.tabName}")...`);
  const sheets = await createSheetsClient();

  console.log(`Loading allowed agents from "${config.whitelist.tab}"...`);
  const allowedAgents = await loadAllowedAgents(sheets);
  console.log(`  ${allowedAgents.size} allowed agents`);

  console.log('Syncing agent rows...');
  const result = await syncSheet(
    sheets,
    (headers) => buildRecords(headers, sources, allowedAgents),
    { percentColumns }
  );

  console.log(
    `Done. Wrote ${result.written} agents (was ${result.previous}) across ` +
      `${result.headers.length} columns.`
  );

  if (result.skipped.length > 0) {
    console.log(
      `Skipped ${result.skipped.length} agent(s) not in "${config.whitelist.tab}": ` +
        result.skipped.join(', ')
    );
  }

  if (result.unmappedColumns.length > 0) {
    console.warn(
      `Warning: no mapping for column(s): ${result.unmappedColumns.join(', ')} — left blank.`
    );
  }
}

main().catch((error) => {
  console.error('Sync failed:', error.message);
  process.exitCode = 1;
});
