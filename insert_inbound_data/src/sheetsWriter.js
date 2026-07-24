import { config } from './config.js';

/** Convert a 0-based column index to its A1 letter (0 -> A, 26 -> AA). */
function columnLetter(index) {
  let letter = '';
  let n = index;
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}

/** Fetch the numeric sheetId (gid) for the configured tab. */
async function getSheetId(sheets) {
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId: config.spreadsheetId,
    fields: 'sheets.properties(sheetId,title)',
  });

  const sheet = data.sheets.find((s) => s.properties.title === config.tabName);
  if (!sheet) {
    throw new Error(`Tab "${config.tabName}" not found in the spreadsheet.`);
  }
  return sheet.properties.sheetId;
}

/**
 * Locate the agent data block inside the tab's grid.
 *
 * @returns {{ headers, headerRowIndex, headerColIndex, blockStartRowIndex, currentCount }}
 * All indexes are 0-based grid coordinates.
 */
function locateBlock(grid) {
  let headerRowIndex = -1;
  let headerColIndex = -1;

  for (let r = 0; r < grid.length; r += 1) {
    const col = (grid[r] ?? []).findIndex((cell) => cell === config.agentKey);
    if (col !== -1) {
      headerRowIndex = r;
      headerColIndex = col;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error(`Header cell "${config.agentKey}" not found in tab "${config.tabName}".`);
  }

  // Contiguous non-empty headers from the agent-key column onward.
  const headers = [];
  for (let c = headerColIndex; c < grid[headerRowIndex].length; c += 1) {
    const value = grid[headerRowIndex][c];
    if (value === undefined || value === '') break;
    headers.push(value);
  }

  // The marker row that ends the agent block (same column as the agent key).
  let markerRowIndex = -1;
  for (let r = headerRowIndex + 1; r < grid.length; r += 1) {
    if ((grid[r] ?? [])[headerColIndex] === config.blockEndMarker) {
      markerRowIndex = r;
      break;
    }
  }

  if (markerRowIndex === -1) {
    throw new Error(`Block-end marker "${config.blockEndMarker}" not found below the header.`);
  }

  const blockStartRowIndex = headerRowIndex + 1;
  return {
    headers,
    headerColIndex,
    blockStartRowIndex,
    currentCount: markerRowIndex - blockStartRowIndex,
  };
}

/**
 * Apply a two-decimal percentage number format to the given columns across the agent
 * block. Exact underlying values are unaffected — only the display changes.
 */
async function applyPercentFormat(
  sheets,
  sheetId,
  headers,
  headerColIndex,
  blockStartRowIndex,
  rowCount,
  percentColumns
) {
  const requests = headers
    .map((header, position) => ({ header, position }))
    .filter(({ header }) => percentColumns.includes(header))
    .map(({ position }) => ({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: blockStartRowIndex,
          endRowIndex: blockStartRowIndex + rowCount,
          startColumnIndex: headerColIndex + position,
          endColumnIndex: headerColIndex + position + 1,
        },
        cell: {
          userEnteredFormat: { numberFormat: { type: 'PERCENT', pattern: '0.00%' } },
        },
        fields: 'userEnteredFormat.numberFormat',
      },
    }));

  if (requests.length === 0) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.spreadsheetId,
    requestBody: { requests },
  });
}

/** Insert or delete rows so the agent block holds exactly `targetCount` rows. */
async function resizeBlock(sheets, sheetId, blockStartRowIndex, currentCount, targetCount) {
  const diff = targetCount - currentCount;
  if (diff === 0) return;

  const request =
    diff > 0
      ? {
          insertDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: blockStartRowIndex + currentCount,
              endIndex: blockStartRowIndex + targetCount,
            },
            inheritFromBefore: true, // copy formatting from the last agent row
          },
        }
      : {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: blockStartRowIndex + targetCount,
              endIndex: blockStartRowIndex + currentCount,
            },
          },
        };

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.spreadsheetId,
    requestBody: { requests: [request] },
  });
}

/**
 * Sync the aggregated records into the sheet.
 *
 * Reads the live grid, aligns the agent block size to the records, and writes the
 * values — leaving the block-end marker row and everything below it untouched.
 *
 * @param {object} sheets - authenticated Sheets client.
 * @param {(headers: string[]) => { rows: Array<Array>, unmappedColumns: string[] }} buildRows
 *   builds the records once the live header order is known.
 * @param {object} [options]
 * @param {string[]} [options.percentColumns] - headers to format as two-decimal percent.
 */
export async function syncSheet(sheets, buildRows, { percentColumns = [] } = {}) {
  const sheetId = await getSheetId(sheets);

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: config.tabName,
  });
  const grid = data.values ?? [];

  const { headers, headerColIndex, blockStartRowIndex, currentCount } = locateBlock(grid);
  const { rows, unmappedColumns, skipped = [] } = buildRows(headers);

  await resizeBlock(sheets, sheetId, blockStartRowIndex, currentCount, rows.length);

  const startCol = columnLetter(headerColIndex);
  const endCol = columnLetter(headerColIndex + headers.length - 1);
  const firstRow = blockStartRowIndex + 1; // 0-based grid -> 1-based A1
  const lastRow = blockStartRowIndex + rows.length;

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${config.tabName}!${startCol}${firstRow}:${endCol}${lastRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  await applyPercentFormat(
    sheets,
    sheetId,
    headers,
    headerColIndex,
    blockStartRowIndex,
    rows.length,
    percentColumns
  );

  return { headers, written: rows.length, previous: currentCount, unmappedColumns, skipped };
}
