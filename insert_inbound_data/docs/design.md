# Inbound KPI Sync — Design

Aggregate agent KPI data from three CSV exports and sync it into the Google Sheet
`agents_inbound_kpi`, tab `inbound_kpi`.

## Principles
- **Sheet header is the source of truth** for column names and order — read at runtime,
  never hard-coded.
- **One declarative mapping** (`src/columnMapping.js`) connects each sheet column to its
  origin (a source file + field, a computed value, or "empty"). Changing a column is a
  one-line edit.
- **Raw values, no filters** — write each value exactly as it appears in the CSV
  (`-`, `0.259`, `1.36`, ...). The sheet's existing cell formatting renders it as
  %/rounded numbers.

## Column → source mapping
| Sheet column | Source | Source field |
|---|---|---|
| Worked_Hours, TR_e_Ops, Presented_Prospects, C_R, TR_C_Ops, TR_R_Ops, TR_N_Ops, C_R / Client, C_N / Client, % Comm. Position, % Coach Callbacks, SPH_R_Profitability, % HS_R | quick_look | same name |
| % Carbon_Comp_NRJ_R, % Proxiserve_R | deep_dive others_focus | same name |
| %Training | table_view production | `% Train` |
| % AUX | table_view production | computed: `% Wrapup_BO` + `% Break` + `% Coach.` + `% On hold` |
| % Carbon Comp pitch / analysed | — | empty (placeholder) |

## Flow
1. Load the 3 CSVs, key each row by normalized (trimmed) `agent_eloquant`.
2. Build the roster = union of agents across all files, sorted A→Z.
3. For each agent, build a record following the sheet's header order via the mapping.
   Missing source value → `-`.
4. Sync: read the tab, locate the header row (`agent_eloquant`) and the `GLOBAL EQUIPE`
   marker row. The agent block sits between them. Insert/delete rows (inheriting format)
   so the block matches the roster size, then write values with `USER_ENTERED`.
   `GLOBAL EQUIPE` and the legend table below are never touched.

## Modules
- `config.js` — sheet id, tab name, credential path, file paths, constants.
- `columnMapping.js` — declarative column rules.
- `csvParser.js` — generic CSV → row objects.
- `sources.js` — load each CSV into a `Map` keyed by agent.
- `aggregate.js` — roster + per-agent records.
- `sheetsClient.js` — service-account auth + Sheets client.
- `sheetsWriter.js` — locate rows, resize block, write values.
- `index.js` — orchestrator.
