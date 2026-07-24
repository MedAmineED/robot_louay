/**
 * Declarative mapping between the Google Sheet columns and their origin.
 *
 * This is the single place that encodes the business rules. To add, rename, or
 * recompute a column, edit only this file. Each entry maps a sheet header to one of:
 *
 *   { source, field }  -> copy `field` from the named source file (see config.sources)
 *   { compute }        -> derive the value from a source row: compute(row, helpers)
 *   { empty: true }    -> always write an empty cell (placeholder columns)
 *
 * Add `format: 'percent'` to any entry whose value is a ratio that should DISPLAY as a
 * percentage with two decimals (e.g. 0.268 -> 26.80%). The underlying value stays exact.
 *
 * The `agent_eloquant` key column is handled separately by the aggregator.
 *
 * Column NAMES and ORDER are taken from the live sheet header at runtime, not from this
 * file — so this mapping only needs to know *where each column's value comes from*.
 */

/** Sum several percentage fields of a row, treating non-numeric cells as 0. */
const sumFields = (fields) => ({
  source: 'production',
  format: 'percent',
  compute: (row, { toNumber }) =>
    fields.reduce((total, field) => total + toNumber(row[field]), 0),
});

export const columnMapping = {
  Worked_Hours: { source: 'quick_look', field: 'Worked_Hours' },
  TR_e_Ops: { source: 'quick_look', field: 'TR_e_Ops', format: 'percent' },
  Presented_Prospects: { source: 'quick_look', field: 'Presented_Prospects' },
  C_R: { source: 'quick_look', field: 'C_R' },
  TR_C_Ops: { source: 'quick_look', field: 'TR_C_Ops', format: 'percent' },
  TR_R_Ops: { source: 'quick_look', field: 'TR_R_Ops', format: 'percent' },
  TR_N_Ops: { source: 'quick_look', field: 'TR_N_Ops', format: 'percent' },
  'C_R / Client': { source: 'quick_look', field: 'C_R / Client' },
  'C_N / Client': { source: 'quick_look', field: 'C_N / Client' },
  '% Comm. Position': { source: 'quick_look', field: '% Comm. Position', format: 'percent' },
  '% Coach Callbacks': { source: 'quick_look', field: '% Coach Callbacks', format: 'percent' },
  'SPH_R_Profitability': { source: 'quick_look', field: 'SPH_R_Profitability' },
  '% HS_R': { source: 'quick_look', field: '% HS_R', format: 'percent' },

  '% Carbon_Comp_NRJ_R': { source: 'others_focus', field: '% Carbon_Comp_NRJ_R', format: 'percent' },
  '% Proxiserve_R': { source: 'others_focus', field: '% Proxiserve_R', format: 'percent' },

  '%Training': { source: 'production', field: '% Train', format: 'percent' },

  // % AUX = wrapup_bo + break + coaching + on_hold (from the production export).
  '% AUX': sumFields(['% Wrapup_BO', '% Break', '% Coach.', '% On hold']),

  // Placeholder — intentionally left empty for now.
  '% Carbon Comp pitch / analysed': { empty: true },
};

/** Sheet headers whose cells should be formatted as a two-decimal percentage. */
export const percentColumns = Object.entries(columnMapping)
  .filter(([, rule]) => rule.format === 'percent')
  .map(([header]) => header);
