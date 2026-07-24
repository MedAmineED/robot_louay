# Inbound KPI Sync

Aggregates agent KPI data from the CSV exports and syncs it into the
`agents_inbound_kpi` Google Sheet (tab `inbound_kpi`).

## Run

```bash
npm install
npm run sync
```

## How it works

- The **sheet's own header row** defines column names and order (read at runtime).
- [`src/columnMapping.js`](src/columnMapping.js) is the single place that says where each
  column's value comes from. Edit only this file to add/rename/recompute a column.
- Values are written **exactly as they appear in the CSV** (`-`, `0.259`, `1.36`, …).
  Percentage columns display with a `0.00%` format (see `format: 'percent'` in the mapping).
- Agents are the **union** of all source files, sorted A→Z. Missing values become `-`.
- **Whitelist:** an agent is only synced if it also exists in the `Stats_Experts` tab
  (`Agent Eloquant` column). Matching ignores case and accents (`hédi_gaies` = `hedi_gaies`).
  Agents absent from that tab are skipped and reported. Configure via `config.whitelist`.
- The `GLOBAL EQUIPE` row and the legend table below it are never touched; agent rows are
  inserted/deleted so the block matches the roster.

## Configuration

All settings live in [`src/config.js`](src/config.js): spreadsheet id, tab name,
credentials path, source file paths, and the missing-value placeholder.

## Column sources

| Sheet column | Source |
|---|---|
| Worked_Hours, TR_e_Ops, Presented_Prospects, C_R, TR_C_Ops, TR_R_Ops, TR_N_Ops, C_R / Client, C_N / Client, % Comm. Position, % Coach Callbacks, SPH_R_Profitability, % HS_R | `quick_look__experts_point_of_view.csv` |
| % Carbon_Comp_NRJ_R, % Proxiserve_R | `deep_dive__others_focus__…csv` |
| %Training (`% Train`) | `table_view__production.csv` |
| % AUX = `% Wrapup_BO` + `% Break` + `% Coach.` + `% On hold` | `table_view__production.csv` |
| % Carbon Comp pitch / analysed | empty (placeholder) |
