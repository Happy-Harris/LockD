/**
 * Minimal RFC 4180 CSV reader and writer (plan PR 7).
 *
 * Handles quoted fields with commas, quoted newlines, doubled quotes, CRLF and LF, a leading
 * UTF-8 BOM and blank lines. The delimiter (comma, semicolon or tab) is read from the header row,
 * so a European export that uses `;` and writes `110,5` for a weight is not cut apart on the
 * decimal comma.
 */

export interface ParsedCsv {
  header: string[];
  rows: string[][];
  delimiter: string;
}

const MAX_CELL_LENGTH = 10_000;

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let inQuotes = false;
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (const char of firstLine) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && char in counts) counts[char] = (counts[char] ?? 0) + 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : ",";
}

export function parseCsv(input: string, delimiterOverride?: string): ParsedCsv {
  const text = input.replace(/^\uFEFF/, "");
  const delimiter = delimiterOverride ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell.length > MAX_CELL_LENGTH ? cell.slice(0, MAX_CELL_LENGTH) : cell);
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    // A row that is entirely empty (a trailing newline, a blank separator) is not data.
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell.length === 0) inQuotes = true;
    else if (char === delimiter) pushCell();
    else if (char === "\r") {
      if (text[i + 1] === "\n") i += 1;
      pushRow();
    } else if (char === "\n") pushRow();
    else cell += char;
  }
  if (cell.length > 0 || row.length > 0) pushRow();

  const header = rows.shift() ?? [];
  return { header: header.map((value) => value.trim()), rows, delimiter };
}

/**
 * Escapes a value for CSV output. Beyond RFC 4180 quoting, a value that starts with `=`, `+`, `-`,
 * `@`, a tab or a carriage return gets a leading `'`: spreadsheets read those as formulas, and the
 * prefix stops a workout note from running as one when the file is opened in Excel or Sheets.
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/["\n\r,;]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(header: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  const lines = [header.map(escapeCsvValue).join(",")];
  for (const row of rows) lines.push(row.map(escapeCsvValue).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

/** Case, accent and punctuation-insensitive header key, for matching column names. */
export function normaliseHeader(value: string): string {
  return (
    value
      .toLowerCase()
      // Strip accents so localised headers ("Übung", "Répétitions") match their aliases.
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\(.*?\)/g, " ")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/(^_|_$)/g, "")
  );
}
