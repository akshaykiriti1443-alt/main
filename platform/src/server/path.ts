import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, agencyMembers, aiGenerations, apiTokens, automations, sites, skoolCheckins, unlocks } from "@/lib/db/schema";
import type { WorkspaceSettings } from "@/lib/db/types";
import { canBeUpNext } from "@/lib/guides";
import { computeLadder } from "./growth";
import { hasFeature } from "./plans";

// "Your path": the course (The Skool Growth Ladder) as a guided flow inside the app. Every step
// checks itself off from what the member has actually done, so the dashboard always knows the one
// next thing to do. Lesson numbers match the course so the classroom and the app point at each other.

/**
 * kind:
 *   "optional"  nice to have (your own AI, the Pixel, the agency). Never Up next.
 *   "outcome"   a result that waits on Skool's numbers (first customer, levels). Never Up next.
 * Both still tick themselves off when they happen. A step with `locked` (needs another plan) is
 * never Up next either, but stays on Your path with its lock (see canBeUpNext).
 */
export type PathStep = { key: string; title: string; why: string; lesson: string; href: string; done: boolean; locked?: string; kind?: "optional" | "outcome" };
export type PathStage = { key: string; tag: string; title: string; steps: PathStep[] };

/**
 * The stage's badge on Your path. One number in its tag shows as that number ("Day 1" → 1,
 * "Level 2" → 2). Launch Week ("Days 2–7") is a calendar, so it never reads as Level 2. Stages
 * with no number ("Leads", "Rhythm") get a flag.
 */
export function stageBadge(stage: Pick<PathStage, "key" | "tag">): { num?: string; icon?: "calendar" | "flag" } {
  if (stage.key === "launch") return { icon: "calendar" };
  const nums = stage.tag.match(/\d+/g);
  return nums?.length === 1 ? { num: nums[0] } : { icon: nums ? "calendar" : "flag" };
}
/** The Skool Loop: Skool link clicks and leads (last 30 days), and new customers from the latest Monday check-in. */
export type LoopCounts = { clicks: number; leads: number; customers: number };

type Ws = { id: string; plan: "starter" | "growth" | "owner"; accessSource: string; settings: WorkspaceSettings };

const count = (rows: { n: number }[]) => rows[0]?.n ?? 0;

export async function computePath(ws: Ws, userId: string, opts: { entryTicketOn?: boolean } = {}) {
  const db = await getDb();
  const wid = ws.id;
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const n = sql<number>`count(*)::int`;
  const [kits, research, studio, reviews, published, skoolSite, clicks, realClicks, leads30, leadsEver, checkins, checkinCount, liveAutomations, myUnlocks, connectors, agencies] = await Promise.all([
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "launch_kit"))),
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_research"))),
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_studio"))),
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_review"))),
    db.select({ n }).from(sites).where(and(eq(sites.workspaceId, wid), eq(sites.published, true))),
    db.select({ n }).from(sites).where(and(eq(sites.workspaceId, wid), sql`${sites.skoolUrl} <> ''`)),
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "skool_visit"), gte(activities.createdAt, since30))),
    // A member clicking their own link to try it is a "direct" visit, so it doesn't count as
    // sending traffic (lesson 1.4). Ads, bios and posts do.
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "skool_visit"), sql`coalesce(${activities.data}->>'source', 'direct') <> 'direct'`)),
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "lead"), gte(activities.createdAt, since30))),
    // "Be your own lead #1": any opt-in ever logged (a "lead" activity), not contacts in general,
    // since Unlock claims and imports create contacts too.
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "lead"))),
    db.select().from(skoolCheckins).where(eq(skoolCheckins.workspaceId, wid)).orderBy(sql`${skoolCheckins.createdAt} desc`).limit(1),
    db.select({ n }).from(skoolCheckins).where(eq(skoolCheckins.workspaceId, wid)),
    db.select({ n }).from(automations).where(and(eq(automations.workspaceId, wid), eq(automations.active, true))),
    db.select({ n }).from(unlocks).where(eq(unlocks.workspaceId, wid)),
    db.select({ n }).from(apiTokens).where(and(eq(apiTokens.workspaceId, wid), isNull(apiTokens.revokedAt))),
    db.select({ n }).from(agencyMembers).where(eq(agencyMembers.userId, userId)),
  ]);

  const s = ws.settings;
  const base = `/app/w/${wid}`;
  const last = checkins[0] ?? null;
  const ladder = computeLadder(last);
  const level = Math.max(ladder.qualifies, last?.skoolLevel ?? 1);
  const growthPlan = hasFeature(ws.plan, "automations");
  const aiOn = count(connectors) > 0 || Boolean(s.aiKeyEnc);

  // Lesson numbers and stage names match the course (The Skool Growth Ladder, v5). If a lesson is
  // renumbered there, change it here too.
  const stages: PathStage[] = [
    // Day 1 (Quick Start): the shop open, you as lead #1 and five statics live, in one evening.
    {
      key: "start",
      tag: "Day 1",
      title: "Open the shop tonight",
      steps: [
        { key: "app", title: "Open your app", why: "You're in. No codes, ever.", lesson: "1.2", href: base, done: true },
        // Only trackable when the entry ticket is on (then the intro post is how they got in).
        ...(opts.entryTicketOn && ws.accessSource === "member"
          ? [{ key: "hello", title: "Say hi in the community", why: "Your intro is your first post. Likes on it unlock your first bonus.", lesson: "1.2", href: `${base}/hello`, done: Boolean(s.entryClaimedAt) }]
          : []),
        // Optional: Day 1 runs on the plan's AI runs. Lesson 3.2 asks for it again.
        {
          key: "ai",
          title: "Connect your AI (optional)",
          why: "Want more AI than your plan includes? Link the AI you already use: your Claude or ChatGPT subscription, or a free Gemini key.",
          lesson: "1.2",
          href: `${base}/ai`,
          done: aiOn,
          kind: "optional",
        },
        { key: "kit", title: "Build your launch kit", why: "AI writes your page, free guide, emails and Skool About page. Press it once.", lesson: "1.2", href: `${base}/launch`, done: count(kits) > 0 },
        { key: "skool", title: "Add your Skool group link", why: "Every Join button and your Skool link point here.", lesson: "1.2", href: `${base}/settings#business`, done: Boolean(s.skoolUrl) || count(skoolSite) > 0 },
        { key: "publish", title: "Publish your funnel", why: "Edit three lines, then press the scary button.", lesson: "1.2", href: `${base}/sites`, done: count(published) > 0 },
        { key: "lead1", title: "Be your own lead #1", why: "Open your live page on your phone and sign up with your own email. Then find yourself in Leads.", lesson: "1.2", href: `${base}/leads`, done: count(leadsEver) > 0 },
        // Saved when Ad research's "Analyse with AI" runs (or your connected AI saves one).
        { key: "research", title: "Find ads that already work", why: "Search your niche, look at the 🔥 30+ day ads, then Analyse with AI: what's working and the gaps nobody uses yet.", lesson: "1.3", href: `${base}/ads/research`, done: count(research) > 0 },
        // Saved when the Ad studio's "Make my 5 statics" runs (or your connected AI makes a pack).
        { key: "statics", title: "Make your 5 statics", why: "Five different image ads, your numbers and the exact clicks to launch them in Ads Manager.", lesson: "1.4", href: `${base}/ads/studio`, done: count(studio) > 0 },
        { key: "clicks", title: "Send traffic through your Skool link", why: "Your 5 statics, live at $5 to $10 a day, pointed at your Skool link. Ticks at the first ad click (your own test click doesn't count).", lesson: "1.4", href: `${base}/growth`, done: count(realClicks) > 0 },
        // Optional: the course's Traffic campaign needs no Pixel, so Day 1 never waits on it.
        { key: "pixel", title: "Connect your Meta Pixel (optional)", why: "Your Day 1 ads don't need it. Add it later so Meta sees who lands on your About page.", lesson: "1.4", href: `${base}/settings#tracking`, done: Boolean(s.metaPixelId), kind: "optional" },
      ],
    },
    {
      key: "launch",
      tag: "Days 2–7",
      title: "Launch Week",
      steps: [
        { key: "checkin", title: "Do your first Monday check-in", why: "Day 7: four numbers from Skool › Settings › Growth.", lesson: "2.6", href: `${base}/growth`, done: Boolean(last) },
        { key: "review", title: "Keep, fix or kill", why: "Day 7: a verdict on every ad. Fix one room only: Hook, Door or About page.", lesson: "2.6", href: `${base}/ads`, done: count(reviews) > 0 },
        // Counted from the Monday check-in (Skool's Growth tab). Reaching Level 2 also means one landed.
        { key: "customer", title: "Land your first paying member", why: "Level 2 needs one new customer. They're usually in your phone, not your ads. Ticks at your check-in.", lesson: "2.5", href: `${base}/leads`, done: (last?.newPaid ?? 0) >= 1 || level >= 2, kind: "outcome" },
      ],
    },
    // After the trial: make Skool's growth engine pay for more visitors, and turn leads into members.
    {
      key: "level2",
      tag: "Level 2",
      title: "Wake up Printy",
      steps: [{ key: "l2", title: "Reach Level 2", why: "100 About-page visitors + 1 new customer. Skool starts running 6 ads for you.", lesson: "4.2", href: `${base}/growth`, done: level >= 2, kind: "outcome" }],
    },
    {
      key: "level3",
      tag: "Level 3",
      title: "The 3,000 club",
      steps: [
        { key: "bio", title: "Put your Skool link in your bios", why: "The laziest requirement you'll ever meet: your skool.com link in your bio (Instagram, TikTok or YouTube).", lesson: "5.1", href: `${base}/growth`, done: Boolean(last?.linkInBio) },
        { key: "visitors", title: "Reach 3,000 About-page visitors", why: "Last 30 days, so it's a pace, not a pile. Your $30–$50 base camp plus the repost covers it.", lesson: "5.2", href: `${base}/growth`, done: (last?.aboutVisitors ?? 0) >= 3000 || level >= 3, kind: "outcome" },
        { key: "network", title: "Earn 10 Skool Network sign-ups", why: "People Skool sends you. Hellos and real replies on Skool earn them.", lesson: "5.3", href: `${base}/growth`, done: (last?.networkSignups ?? 0) >= 10 || level >= 3, kind: "outcome" },
        { key: "l3", title: "Reach Level 3", why: "Upload your own ads. Skool spends up to $1,000 a day on them.", lesson: "5.3", href: `${base}/growth`, done: level >= 3, kind: "outcome" },
      ],
    },
    {
      key: "level4",
      tag: "Boost & Level 4",
      title: "Spending Sam's money",
      steps: [{ key: "l4", title: "Reach Level 4", why: "Partnership ads, up to about $10,000 a day of Skool's money.", lesson: "6.2", href: `${base}/growth`, done: level >= 4, kind: "outcome" }],
    },
    {
      key: "leads",
      tag: "Leads",
      title: "Plug the leaky bucket",
      steps: [
        {
          key: "automations",
          title: "Switch on your lead follow-ups",
          why: "New leads get a hello and hot ones get flagged to you, all by themselves.",
          lesson: "7.1",
          href: `${base}/automations`,
          done: count(liveAutomations) > 0,
          locked: growthPlan ? undefined : "Growth plan",
        },
        { key: "unlock", title: "Create your first Unlock", why: "A small reward for a post or comment. Engagement is what Skool ranks.", lesson: "7.2", href: `${base}/unlocks`, done: count(myUnlocks) > 0 },
      ],
    },
    {
      key: "rhythm",
      tag: "Rhythm",
      title: "Half a boring hour a week",
      steps: [{ key: "weeks", title: "Do four Monday check-ins", why: "Boring on purpose. Four Mondays and it's a habit, not a heroic effort.", lesson: "8.1", href: `${base}/growth`, done: count(checkinCount) >= 4 }],
    },
    // Last on purpose, and optional: lesson 8.2 says to wait until someone asks to buy it.
    {
      key: "second",
      tag: "Optional",
      title: "Agency or software",
      steps: [{ key: "agency", title: "Grow into an agency or software (optional)", why: "Your brand, your domain, your markup, once someone asks to buy it.", lesson: "8.2", href: "/app/agency/new", done: count(agencies) > 0, kind: "optional" }],
    },
  ];

  const all = stages.flatMap((st) => st.steps);
  const done = all.filter((x) => x.done).length;
  // Up next: the first step still to do. Optional steps, outcomes and plan-locked steps (lead
  // follow-ups on the Member plan) never hold it up; they stay listed and tick themselves off.
  const next = all.find(canBeUpNext) ?? null;
  const counts: LoopCounts = {
    clicks: count(clicks),
    leads: count(leads30),
    customers: last?.newPaid ?? 0,
  };
  return { stages, done, total: all.length, next, level, loop: counts };
}
