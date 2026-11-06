// Money for people: "$1,500", "€300.50". Values are stored in cents. Client-safe.

export function formatCents(cents: number, currency = "USD") {
  const whole = cents % 100 === 0;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(whole ? 0 : 2)} ${currency}`;
  }
}

/** Per-currency totals as one line: "$4,500 · €300". */
export function formatTotals(totals: Record<string, number>, fallbackCurrency = "USD") {
  const entries = Object.entries(totals).filter(([, v]) => v !== 0);
  if (entries.length === 0) return formatCents(0, fallbackCurrency);
  return entries.map(([c, v]) => formatCents(v, c)).join(" · ");
}

/** "1,500.50" / "1500" / "$1,500" typed into a form -> cents (never negative). */
export function centsFromInput(raw: string): number {
  const s = raw.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return 0;
  const m = s.match(/^(.*?)[.,](\d{1,2})$/);
  const whole = (m ? m[1] : s).replace(/[.,]/g, "");
  const cents = Number(whole || "0") * 100 + Number(m ? m[2].padEnd(2, "0") : "0");
  return Number.isFinite(cents) ? Math.min(Math.round(cents), 1e13) : 0;
}
