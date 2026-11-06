import type { OpportunityStatus, StageKind } from "@/lib/db/schema";
import { formatTotals } from "@/lib/money";

// The board's client-side shapes: plain JSON the server page builds from getBoard(), so nothing
// server-only (or a Date) crosses into the browser. Shared by every file in this folder.

/** Mirrors CURRENCIES in src/server/pipelines.ts (a server file, so it's copied, not imported). */
export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "NZD", "INR", "SGD", "AED", "ZAR", "CHF", "SEK", "NOK", "DKK", "BRL", "MXN", "JPY"] as const;

export type Stage = { id: string; name: string; kind: StageKind };
export type DealContact = { id: string; name: string; email: string | null; phone: string | null };
export type Deal = {
  id: string;
  title: string;
  stageId: string;
  status: OpportunityStatus;
  valueCents: number;
  currency: string;
  source: string;
  notes: string;
  /** Epoch ms. */
  stageChangedAt: number;
  createdAt: number;
  contact: DealContact | null;
};
export type Column = Stage & { deals: Deal[] };
export type PipelineSummary = { id: string; name: string; isDefault: boolean; stageCount: number };
export type BoardData = {
  pipeline: { id: string; name: string; currency: string; isDefault: boolean; stages: Stage[] };
  pipelines: PipelineSummary[];
  columns: Column[];
  /** The server's clock when the page rendered, so "4 days in stage" matches on server and client. */
  now: number;
};

export const STATUS_LABEL: Record<OpportunityStatus, string> = { open: "Open", won: "Won", lost: "Lost", abandoned: "Abandoned" };
export const KIND_LABEL: Record<StageKind, string> = { open: "Open", won: "Won", lost: "Lost" };

/** "Closed won" / "Won" -> won, "Lost" -> lost, anything else open (same rule as the server). */
export function kindForStageName(name: string): StageKind {
  const s = name.trim().toLowerCase();
  if (/^(closed[ -]?)?won\b|\bwon$/.test(s)) return "won";
  if (/^(closed[ -]?)?lost\b|\blost$/.test(s)) return "lost";
  return "open";
}

/** What a deal's status becomes when it lands in a stage (same rule as the server). */
export function statusForKind(kind: StageKind, current: OpportunityStatus): OpportunityStatus {
  if (kind === "won") return "won";
  if (kind === "lost") return "lost";
  return current === "won" || current === "lost" ? "open" : current;
}

/** Per-currency sums, in cents. */
export function sumByCurrency(deals: Deal[], keep: (d: Deal) => boolean = () => true) {
  const out: Record<string, number> = {};
  for (const d of deals) if (keep(d)) out[d.currency] = (out[d.currency] ?? 0) + d.valueCents;
  return out;
}

export const totalsLabel = (deals: Deal[], fallback: string, keep?: (d: Deal) => boolean) => formatTotals(sumByCurrency(deals, keep), fallback);

export function daysSince(ms: number, now: number) {
  return Math.max(0, Math.floor((now - ms) / 86_400_000));
}

/** "Today", "1 day", "12 days". */
export function daysLabel(days: number) {
  if (days === 0) return "Today";
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** "1500" or "1500.50" for the value field. */
export function valueForInput(cents: number) {
  if (!cents) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
