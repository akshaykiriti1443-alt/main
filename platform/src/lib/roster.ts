import { isEmail, normalizeEmail } from "@/lib/util";
import type { SkoolStatus } from "@/server/skool";

// Pure Skool-export parsing, shared by the server and the admin's browser (which trims a big
// export to just names and emails before upload, so it fits the server-action body limit).

// Map a free-text status cell from any Skool export/paste onto our four states.
export function normalizeStatus(raw: string): SkoolStatus {
  const s = raw.toLowerCase();
  if (/\b(trial|trialing|trialling)\b/.test(s)) return "trial";
  if (/\b(cancel|cancelling|canceling|leaving|expiring|past.?due|declin)/.test(s)) return "cancelling";
  if (/\b(churn|churned|left|lost|inactive|expired|removed|gone)\b/.test(s)) return "churned";
  return "active";
}

export function splitRow(line: string, delim: string): string[] {
  // Minimal CSV: handles quoted fields with embedded delimiters and "" escapes.
  if (delim !== ",") return line.split(delim).map((c) => c.trim());
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export type RosterRow = { emails: string[]; name: string };

/**
 * Parse a Skool member export. Every email in a row counts, so the answer to a membership
 * question like "What email will you use for the app?" works as well as the Skool email.
 * Rows whose status says churned/left are ignored. A plain list of emails also works.
 */
export function parseRoster(raw: string): { rows: RosterRow[]; skipped: number } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], skipped: 0 };
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const header = splitRow(lines[0], delim).map((c) => c.toLowerCase());
  const hasHeader = header.some((c) => /e-?mail|name|status/.test(c)) && !header.some((c) => isEmail(c));
  const statusCol = hasHeader ? header.findIndex((h) => /status|segment|state|membership/.test(h)) : -1;
  const firstCol = hasHeader ? header.findIndex((h) => h.includes("first")) : -1;
  const lastCol = hasHeader ? header.findIndex((h) => h.includes("last") && !h.includes("active")) : -1;
  const nameCol = hasHeader ? header.findIndex((h) => h === "name" || h === "full name" || h === "member") : -1;

  const rows: RosterRow[] = [];
  let skipped = 0;
  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    const cells = splitRow(lines[i], delim);
    if (statusCol >= 0 && normalizeStatus(cells[statusCol] ?? "") === "churned") continue;
    const emails = [...new Set(cells.flatMap((c) => c.split(/[\s;]+/)).map((c) => c.replace(/^mailto:/i, "").trim()).filter(isEmail).map(normalizeEmail))];
    if (emails.length === 0) {
      skipped++;
      continue;
    }
    const name = [firstCol >= 0 ? cells[firstCol] : "", lastCol >= 0 ? cells[lastCol] : ""].filter(Boolean).join(" ") || (nameCol >= 0 ? cells[nameCol] : "") || "";
    rows.push({ emails, name: name.slice(0, 120) });
  }
  return { rows, skipped };
}

/** Server actions accept 2 MB bodies (next.config.mjs); a roster upload must stay under this. */
export const ROSTER_MAX_CHARS = 1_900_000;

const csvCell = (v: string) => (/[",\s]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * The same roster as a small "Name,Email" CSV: one row per member, emails space-separated,
 * churned rows dropped and empty rows kept (so the skipped count is unchanged).
 * parseRoster(compactRoster(raw)) gives the same rows as parseRoster(raw).
 */
export function compactRoster(raw: string): string {
  const { rows, skipped } = parseRoster(raw);
  const out = ["Name,Email", ...rows.map((r) => `${csvCell(r.name)},${csvCell(r.emails.join(" "))}`)];
  for (let i = 0; i < skipped; i++) out.push("-,");
  return out.join("\n");
}
