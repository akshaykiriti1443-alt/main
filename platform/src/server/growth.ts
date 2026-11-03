import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, sites, skoolCheckins, workspaces } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { safeUrl } from "@/lib/html";

// The Skool growth ladder, in the words of Skool's help center (help.skool.com/article/245-growth-tab-and-skool-ads)
// and its Growth tab. Every requirement is the last 30 days, so a level can drop as well as rise.
//   L1  Carousel ads          Paid communities (subscription or tiers) appear in Skool's carousel ads.
//                             Skool runs no ads for free or freemium communities.
//   L2  Custom ads            100 About-page visitors · 1 new customer · subscription or tiers pricing
//                             → Skool generates custom ads (up to 10 variations). Spend isn't guaranteed.
//   L3  Dedicated campaign    3,000 visitors · consistent organic promo · 10 Skool Network sign-ups
//   L4  Partnership campaign  10,000 visitors · consistent organic promo · 30 Skool Network sign-ups
// Skool makes the ads (you can't upload your own) and decides the spend; it names no amounts.
// Running your own ads counts as organic promotion. A skool.com link in your bios is a tip, not a requirement.

export type LevelReq = { visitors: number; newPaid: number; networkSignups: number; linkInBio: boolean; organic: boolean; paidPricing: boolean };
const req = (r: Partial<LevelReq>): LevelReq => ({ visitors: 0, newPaid: 0, networkSignups: 0, linkInBio: false, organic: false, paidPricing: false, ...r });
export const LEVELS: { level: 1 | 2 | 3 | 4; name: string; reward: string; req: LevelReq }[] = [
  { level: 1, name: "Carousel ads", reward: "Paid communities (subscription or tiers) appear in Skool's carousel ads. Free and freemium communities get no Skool ads.", req: req({}) },
  {
    level: 2,
    name: "Custom ads",
    reward: "Skool generates custom ads for you (up to 10 variations). Spend isn't guaranteed; it depends on how the ads perform.",
    req: req({ visitors: 100, newPaid: 1, paidPricing: true }),
  },
  { level: 3, name: "Dedicated campaign", reward: "A dedicated ad campaign with more creatives and meaningful daily spend.", req: req({ visitors: 3000, networkSignups: 10, organic: true }) },
  { level: 4, name: "Partnership campaign", reward: "A partnership-level campaign with the highest spend and custom video ads.", req: req({ visitors: 10000, networkSignups: 30, organic: true }) },
];

/** The requirement lines for a level card, in Skool's own words. */
export function requirementLines(r: LevelReq): string[] {
  return [
    r.visitors ? `${r.visitors.toLocaleString()} About-page visitors` : "",
    r.newPaid ? `${r.newPaid} new customer` : "",
    r.paidPricing ? "Subscription or tiers" : "",
    r.linkInBio ? "Skool link in bio on socials" : "",
    r.organic ? "Consistent organic promo" : "",
    r.networkSignups ? `${r.networkSignups} Skool Network sign-ups` : "",
  ].filter(Boolean);
}

export type Checkin = typeof skoolCheckins.$inferSelect;
export type CheckinInput = Omit<Checkin, "id" | "workspaceId" | "createdAt">;

export type Gap = { label: string; have: number; need: number; done: boolean; toggle?: boolean };
export type Ladder = {
  /** The level these numbers qualify for (our calculation from the check-in). */
  qualifies: 1 | 2 | 3 | 4;
  /** What Skool's Growth tab says, as reported in the check-in. */
  reported: number;
  next: (typeof LEVELS)[number] | null;
  gaps: Gap[];
  moves: string[];
};

/** "Consistent organic promo": regular posting, or your own ads (which Skool counts as promotion). */
export function organicOn(c: Pick<CheckinInput, "postsPerWeek" | "adSpendPerDay">) {
  return c.postsPerWeek >= 3 || c.adSpendPerDay > 0;
}

export function computeLadder(c: CheckinInput | null): Ladder {
  const v = c ?? { aboutVisitors: 0, newPaid: 0, networkSignups: 0, linkInBio: false, postsPerWeek: 0, adSpendPerDay: 0, skoolLevel: 1, members: 0, boostPercent: 30, note: "" };
  const organic = organicOn(v);
  // A new customer can only come from a paid group, so pricing is implied by newPaid.
  const meets = (r: LevelReq) =>
    v.aboutVisitors >= r.visitors && v.newPaid >= r.newPaid && v.networkSignups >= r.networkSignups && (!r.linkInBio || v.linkInBio) && (!r.organic || organic);
  let qualifies: 1 | 2 | 3 | 4 = 1;
  // Cumulative: each level needs the ones below it (Level 3 still needs Level 2's paid pricing and
  // a new customer), so stop at the first level that isn't met.
  for (const l of LEVELS) {
    if (!meets(l.req)) break;
    qualifies = l.level;
  }
  const next = LEVELS.find((l) => l.level === qualifies + 1) ?? null;

  const gaps: Gap[] = [];
  if (next) {
    gaps.push({ label: "About-page visitors (30 days)", have: v.aboutVisitors, need: next.req.visitors, done: v.aboutVisitors >= next.req.visitors });
    if (next.req.newPaid) gaps.push({ label: "New customers (30 days)", have: v.newPaid, need: next.req.newPaid, done: v.newPaid >= next.req.newPaid });
    if (next.req.linkInBio) gaps.push({ label: "Skool link in bio on socials", have: v.linkInBio ? 1 : 0, need: 1, done: v.linkInBio, toggle: true });
    if (next.req.organic) gaps.push({ label: "Consistent organic promo (3+ posts a week or your own ads)", have: organic ? 1 : 0, need: 1, done: organic, toggle: true });
    if (next.req.networkSignups) gaps.push({ label: "Skool Network sign-ups (30 days)", have: v.networkSignups, need: next.req.networkSignups, done: v.networkSignups >= next.req.networkSignups });
  }

  const moves: string[] = [];
  const missingVisitors = next ? Math.max(0, next.req.visitors - v.aboutVisitors) : 0;
  if (missingVisitors > 0) {
    const perDay = Math.ceil(missingVisitors / 30);
    moves.push(`Add about ${missingVisitors.toLocaleString()} About-page visitors this month. At ~$1 a visit that's about $${perDay}/day more in ads pointed at your Skool link, or the same from organic posts.`);
  }
  if (next?.req.paidPricing && v.newPaid < 1) moves.push("Turn on subscription or tiers pricing in Skool, then get one new customer: message your hot leads today and invite the ones who replied.");
  else if (next?.req.newPaid && v.newPaid < next.req.newPaid) moves.push("Get one new customer: message your hot leads today and invite the ones who replied.");
  if (next?.req.linkInBio && !v.linkInBio) moves.push("Put your plain skool.com link in your Instagram, TikTok and YouTube bios. Skool checks this one directly.");
  else if (next && next.level >= 3 && !v.linkInBio) moves.push("Tip: put your plain skool.com link in your Instagram, TikTok and YouTube bios. It sends more people to your About page.");
  if (next?.req.organic && !organic) moves.push("Post at least 3 times a week, or keep your own ad running. Both count as consistent organic promo.");
  if (next?.req.networkSignups && v.networkSignups < next.req.networkSignups) {
    moves.push("Skool Network sign-ups come from Discovery, Skool's ads, the recommended communities sidebar and other members' profiles. Raise them with a sharper cover and About page, daily posts (engagement), keeping members (retention), and a higher Growth Boost %.");
  }
  if (next?.level === 3) moves.push("At Level 3 Skool runs a dedicated campaign for you. Skool makes the ads and decides the spend, so make your About page and cover as sharp as they can be.");
  if (!next) moves.push("You're at the top level. Protect it: retention and engagement keep you there.");
  return { qualifies, reported: v.skoolLevel, next, gaps, moves };
}

export async function latestCheckins(workspaceId: string, limit = 8) {
  const db = await getDb();
  return db.select().from(skoolCheckins).where(eq(skoolCheckins.workspaceId, workspaceId)).orderBy(desc(skoolCheckins.createdAt)).limit(limit);
}

const clampInt = (n: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(n) || 0)));

export async function saveCheckin(workspaceId: string, input: Partial<CheckinInput>) {
  const db = await getDb();
  const [row] = await db
    .insert(skoolCheckins)
    .values({
      workspaceId,
      aboutVisitors: clampInt(input.aboutVisitors, 10_000_000),
      networkSignups: clampInt(input.networkSignups, 1_000_000),
      newPaid: clampInt(input.newPaid, 1_000_000),
      members: clampInt(input.members, 10_000_000),
      skoolLevel: Math.max(1, Math.min(4, clampInt(input.skoolLevel, 4) || 1)),
      boostPercent: Math.min(100, clampInt(input.boostPercent ?? 30, 100)),
      linkInBio: Boolean(input.linkInBio),
      postsPerWeek: clampInt(input.postsPerWeek, 500),
      adSpendPerDay: clampInt(input.adSpendPerDay, 1_000_000),
      note: String(input.note ?? "").slice(0, 1000),
    })
    .returning();
  return row;
}

// ---------------------------------------------------------------------------
// The Skool link: <app>/go/<workspace-slug> → your Skool About page.
// ---------------------------------------------------------------------------

export const skoolLinkFor = (slug: string) => `${env.appUrl}/go/${slug}`;

/** Is this an http(s) link on skool.com? */
export function isSkoolUrl(raw: string): boolean {
  const url = safeUrl(raw);
  return Boolean(url && /(^|\.)skool\.com$/i.test(new URL(url).hostname));
}

/**
 * Normalise a group URL to its About page: https://www.skool.com/<group>/about.
 * Anything not on skool.com gives "", so /go/<slug> can never redirect off Skool.
 */
export function aboutUrl(raw: string): string {
  if (!isSkoolUrl(raw)) return "";
  const u = new URL(safeUrl(raw));
  const group = u.pathname.split("/").filter(Boolean)[0];
  if (!group) return `https://www.skool.com/`;
  return `https://www.skool.com/${group}/about`;
}

export async function skoolTargetFor(workspaceId: string, settingsUrl?: string) {
  const fromSettings = settingsUrl ? aboutUrl(settingsUrl) : "";
  if (fromSettings) return fromSettings;
  const db = await getDb();
  const [site] = await db.select({ skoolUrl: sites.skoolUrl }).from(sites).where(and(eq(sites.workspaceId, workspaceId), sql`${sites.skoolUrl} <> ''`)).limit(1);
  return site ? aboutUrl(site.skoolUrl) : "";
}

const BOT = /bot|crawl|spider|preview|facebookexternalhit|slurp|headless|lighthouse|whatsapp|telegram/i;
export const isBot = (ua: string) => !ua || BOT.test(ua);

/** Where a click came from: an explicit ?src=, the utm_source, or the referrer. */
export function visitSource(params: URLSearchParams, referer: string): string {
  const src = (params.get("src") || params.get("utm_source") || "").toLowerCase().slice(0, 40);
  if (src) return src;
  if (params.get("fbclid")) return "meta-ad";
  try {
    const host = new URL(referer).hostname.replace(/^www\./, "");
    if (/facebook|fb\.|instagram/.test(host)) return "meta";
    if (/youtube|youtu\.be/.test(host)) return "youtube";
    if (/tiktok/.test(host)) return "tiktok";
    return host.slice(0, 40) || "direct";
  } catch {
    return "direct";
  }
}

export async function workspaceBySlug(slug: string) {
  const db = await getDb();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, slug.toLowerCase().slice(0, 80))).limit(1);
  return ws ?? null;
}

/** Clicks on the Skool link in the last N days, by source. */
export async function skoolVisits(workspaceId: string, days = 30) {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({ source: sql<string>`coalesce(${activities.data}->>'source', 'direct')`, count: sql<number>`count(*)::int` })
    .from(activities)
    .where(and(eq(activities.workspaceId, workspaceId), eq(activities.type, "skool_visit"), gte(activities.createdAt, since)))
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`);
  return { total: rows.reduce((n, r) => n + r.count, 0), bySource: rows };
}
