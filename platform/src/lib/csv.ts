// A small, forgiving CSV reader (RFC 4180 plus the things real exports do): quoted fields with
// commas, quotes ("") and line breaks inside, CRLF or LF, a UTF-8 byte-order mark, and comma,
// semicolon or tab delimiters (Excel in many countries saves with semicolons). Client-safe.

export type ParsedCsv = { headers: string[]; rows: string[][]; delimiter: string };

const DELIMITERS = [",", ";", "\t"] as const;

/** The delimiter used most often on the first line, outside quotes. */
export function detectDelimiter(text: string): string {
  let inQuotes = false;
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  return DELIMITERS.reduce((best, d) => (counts[d] > counts[best] ? d : best), ",");
}

export function parseCsvRows(text: string, delimiter = detectDelimiter(text)): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") inQuotes = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Drop rows that are completely empty (trailing newlines, spacer rows).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** First row is the header. Every row is padded or trimmed to the header's width. */
export function parseCsv(text: string): ParsedCsv {
  const delimiter = detectDelimiter(text);
  const all = parseCsvRows(text, delimiter);
  if (all.length === 0) return { headers: [], rows: [], delimiter };
  const headers = all[0].map((h, i) => h.trim() || `Column ${i + 1}`);
  const rows = all.slice(1).map((r) => headers.map((_, i) => (r[i] ?? "").trim()));
  return { headers, rows, delimiter };
}

/** A bare number or phone ("+44 7700 900123", "-5") can't run as a spreadsheet formula. */
const PLAIN_NUMBER = /^[+-]?[\d\s().-]+$/;

/** One CSV cell. A lead types their own name, so anything a spreadsheet would run as a formula is defused. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Rows to CSV text, with the byte-order mark Excel needs to read names in UTF-8. */
export function toCsv(rows: string[][]): string {
  return `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
