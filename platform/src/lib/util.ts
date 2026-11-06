export function slugify(input: string, max = 40): string {
  const s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return s || "site";
}

export const shortId = (len = 6) =>
  Array.from(crypto.getRandomValues(new Uint8Array(len)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * One key per mailbox, for once-per-person checks: drops "+tags", and for Gmail the dots too
 * (me+1@gmail.com, m.e@googlemail.com and me@gmail.com all land in the same inbox).
 */
export function canonicalEmail(email: string): string {
  const clean = normalizeEmail(email);
  const at = clean.lastIndexOf("@");
  if (at < 1) return clean;
  let local = clean.slice(0, at).split("+")[0] || clean.slice(0, at);
  let domain = clean.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? `+${digits.slice(1).replace(/\+/g, "")}` : digits;
}

export const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

export function formatMoney(micros: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 4 })
    .format(micros / 1_000_000)
    .replace(/(\.\d\d)00$/, "$1");
}

export function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [86_400_000, "d"],
    [3_600_000, "h"],
    [60_000, "m"],
  ];
  for (const [ms, label] of units) {
    if (abs >= ms) return diff >= 0 ? `${Math.floor(abs / ms)}${label} ago` : `in ${Math.floor(abs / ms)}${label}`;
  }
  return diff >= 0 ? "just now" : "soon";
}

export function fillTemplate(text: string, vars: Record<string, string | undefined>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key: string, offset: number) => {
    const value = vars[key] ?? "";
    // "Here's your {{lead_magnet_name}}" with "your free guide" or "The 5-Minute Script" must not
    // read "your your free guide" / "your The 5-Minute Script": drop the value's own leading word.
    if (/\byour\s+$/i.test(text.slice(Math.max(0, offset - 6), offset))) return value.replace(/^(?:your|the|a|an)\s+/i, "");
    return value;
  });
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
