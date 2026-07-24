import { readFile } from 'node:fs/promises';

/**
 * Parse a single CSV line into fields, honoring double-quoted values that may
 * contain commas or escaped quotes ("").
 */
function parseLine(line) {
  const fields = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          value += '"';
          i += 1; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        value += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(value);
      value = '';
    } else {
      value += char;
    }
  }

  fields.push(value);
  return fields;
}

/**
 * Read a CSV file and return its rows as objects keyed by header name.
 * The first non-empty line is treated as the header row.
 */
export async function parseCsv(filePath) {
  const raw = await readFile(filePath, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });

  return { headers, rows };
}
