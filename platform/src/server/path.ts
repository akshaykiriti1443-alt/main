import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, agencyMembers, aiGenerations, apiTokens, automations, contacts, sites, skoolCheckins, unlocks } from "@/lib/db/schema";
import type { WorkspaceSettings } from "@/lib/db/types";
import { computeLadder } from "./growth";
import { hasFeature } from "./plans";
import { CANCELLING_TAG, MEMBER_TAG } from "./skool";

// "Your path": the course (The Skool Growth Ladder) as a guided flow inside the app. Every step
// checks itself off from what the member has actually done, so the dashboard always knows the one
// next thing to do. Lesson numbers match the course so the classroom and the app point at each other.

export type PathStep = { key: string; title: string; why: string; lesson: string; href: string; done: boolean; locked?: string };
export type PathStage = { key: string; tag: string; title: string; steps: PathStep[] };
export type LoopCounts = { clicks: number; leads: number; trials: number; paying: number; cancelling: number; churned: number; wonBack: number };

type Ws = { id: string; plan: "starter" | "growth" | "owner"; accessSource: string; settings: WorkspaceSettings };

const count = (rows: { n: number }[]) => rows[0]?.n ?? 0;

export async function computePath(ws: Ws, userId: string, opts: { entryTicketOn?: boolean } = {}) {
  const db = await getDb();
  const wid = ws.id;
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const n = sql<number>`count(*)::int`;
  const [kits, research, reviews, published, skoolSite, clicks, leads30, checkins, skoolMembers, liveAutomations, myUnlocks, connectors, agencies, loop] = await Promise.all([
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "launch_kit"))),
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_research"))),
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_review"))),
    db.select({ n }).from(sites).where(and(eq(sites.workspaceId, wid), eq(sites.published, true))),
    db.select({ n }).from(sites).where(and(eq(sites.workspaceId, wid), sql`${sites.skoolUrl} <> ''`)),
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "skool_visit"), gte(activities.createdAt, since30))),
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "lead"), gte(activities.createdAt, since30))),
    db.select().from(skoolCheckins).where(eq(skoolCheckins.workspaceId, wid)).orderBy(sql`${skoolCheckins.createdAt} desc`).limit(1),
    db.select({ n }).from(contacts).where(and(eq(contacts.workspaceId, wid), sql`${MEMBER_TAG} = any(${contacts.tags})`)),
    db.select({ n }).from(automations).where(and(eq(automations.workspaceId, wid), eq(automations.active, true))),
    db.select({ n }).from(unlocks).where(eq(unlocks.workspaceId, wid)),
    db.select({ n }).from(apiTokens).where(and(eq(apiTokens.workspaceId, wid), isNull(apiTokens.revokedAt))),
    db.select({ n }).from(agencyMembers).where(eq(agencyMembers.userId, userId)),
    db
      .select({
        trials: sql<number>`count(*) filter (where ${contacts.stage} = 'trial')::int`,
        paying: sql<number>`count(*) filter (where ${contacts.stage} = 'member')::int`,
        cancelling: sql<number>`count(*) filter (where ${CANCELLING_TAG} = any(${contacts.tags}))::int`,
        churned: sql<number>`count(*) filter (where ${contacts.stage} = 'lost')::int`,
        wonBack: sql<number>`count(*) filter (where ${contacts.stage} = 'member' and 'skool-churned' = any(${contacts.tags}))::int`,
      })
      .from(contacts)
      .where(and(eq(contacts.workspaceId, wid), sql`${MEMBER_TAG} = any(${contacts.tags})`)),
  ]);

  const s = ws.settings;
  const base = `/app/w/${wid}`;
  const last = checkins[0] ?? null;
  const ladder = computeLadder(last);
  const level = Math.max(ladder.qualifies, last?.skoolLevel ?? 1);
  const growthPlan = hasFeature(ws.plan, "automations");
  const aiOn = count(connectors) > 0 || Boolean(s.aiKeyEnc);

  const stages: PathStage[] = [
    {
      key: "start",
      tag: "Start here",
      title: "Read this first (Pete didn't)",
      steps: [
        { key: "app", title: "Open your app", why: "You're in. No codes, ever.", lesson: "0.4", href: base, done: true },
        // Only trackable when the entry ticket is on (then the intro post is how they got in).
        ...(opts.entryTicketOn && ws.accessSource === "member"
          ? [{ key: "hello", title: "Say hi in the community", why: "Your intro is your first post. Likes on it unlock your first bonus.", lesson: "0.5", href: `${base}/hello`, done: Boolean(s.entryClaimedAt) }]
          : []),
      ],
    },
    {
      key: "shop",
      tag: "Stage 1",
      title: "Open the shop",
      steps: [
        { key: "kit", title: "Build your launch kit", why: "AI writes your page, free guide, emails, 3-Pack and About page.", lesson: "1.2", href: `${base}/launch`, done: count(kits) > 0 },
        { key: "publish", title: "Publish your funnel", why: "Edit three lines, then press the scary button.", lesson: "1.3", href: `${base}/sites`, done: count(published) > 0 },
        { key: "skool", title: "Add your Skool group link", why: "Every Join button and your Skool link point here.", lesson: "1.4", href: `${base}/settings#business`, done: Boolean(s.skoolUrl) || count(skoolSite) > 0 },
        { key: "price", title: "Set your member price", why: "Level 2 needs subscription or tiers pricing. Also sets your Meta Subscribe value.", lesson: "1.5", href: `${base}/skool`, done: Boolean(s.skoolMemberPrice) },
      ],
    },
    {
      key: "ads",
      tag: "Stage 2",
      title: "The ad kitchen",
      steps: [
        { key: "research", title: "Spy on long-running ads", why: "A competitor's 90-day ad is a free lesson they paid for.", lesson: "2.1", href: `${base}/ads/research`, done: count(research) > 0 },
        { key: "pixel", title: "Connect your Meta Pixel", why: "So ads learn who actually lands on your About page.", lesson: "2.5", href: `${base}/settings#tracking`, done: Boolean(s.metaPixelId) },
        { key: "clicks", title: "Send traffic through your Skool link", why: "Your 3-Pack, launched at your budget tier, pointed at your Skool link.", lesson: "2.6", href: `${base}/growth`, done: count(clicks) > 0 },
        { key: "review", title: "Keep, fix or kill", why: "After 72 hours: fix one room only. Hook, Turn or Door.", lesson: "2.8", href: `${base}/ads`, done: count(reviews) > 0 },
      ],
    },
    {
      key: "level2",
      tag: "Stage 3",
      title: "Wake up Printy (Level 2)",
      steps: [
        { key: "checkin", title: "Do your first Monday check-in", why: "Four numbers from Skool › Settings › Growth.", lesson: "3.4", href: `${base}/growth`, done: Boolean(last) },
        { key: "sync", title: "Bring your members into the CRM", why: "Trials, paying, cancelling and churned on one timeline.", lesson: "6.1", href: `${base}/skool`, done: count(skoolMembers) > 0 },
        { key: "l2", title: "Reach Level 2", why: "100 About-page visitors + 1 new customer. Skool starts running 6 ads for you.", lesson: "3.5", href: `${base}/growth`, done: level >= 2 },
      ],
    },
    {
      key: "level3",
      tag: "Stage 4",
      title: "The 3,000 club (Level 3)",
      steps: [
        { key: "bio", title: "Put your Skool link in your bios", why: "The laziest requirement you'll ever meet. Skool checks it.", lesson: "4.3", href: `${base}/growth`, done: Boolean(last?.linkInBio) },
        { key: "l3", title: "Reach Level 3", why: "Upload your own ads. Skool spends up to $1,000 a day on them.", lesson: "4.6", href: `${base}/growth`, done: level >= 3 },
      ],
    },
    {
      key: "level4",
      tag: "Stage 5",
      title: "Spending Sam's money",
      steps: [{ key: "l4", title: "Reach Level 4", why: "Partnership ads, around $10,000 a day of Skool's money.", lesson: "5.4", href: `${base}/growth`, done: level >= 4 }],
    },
    {
      key: "keep",
      tag: "Stage 6",
      title: "Plug the leaky bucket",
      steps: [
        {
          key: "automations",
          title: "Switch on your member automations",
          why: "Welcome, convert, save and win back, running by themselves.",
          lesson: "6.2",
          href: growthPlan ? `${base}/automations` : `${base}/billing`,
          done: count(liveAutomations) > 0,
          locked: growthPlan ? undefined : "Growth plan",
        },
        { key: "unlock", title: "Create your first Unlock", why: "A small reward for a post or comment. Engagement is what Skool ranks.", lesson: "6.4", href: `${base}/unlocks`, done: count(myUnlocks) > 0 },
        { key: "ai", title: "Connect your own AI", why: "Claude, Gemini or ChatGPT does the boring bits, on your plan, not your wallet.", lesson: "6.5", href: `${base}/ai`, done: aiOn },
      ],
    },
    {
      key: "second",
      tag: "Stage 7",
      title: "The second floor",
      steps: [{ key: "agency", title: "Resell this stack as yours", why: "Your brand, your domain, your markup. Optional, and very lucrative.", lesson: "7.3", href: "/app/agency/new", done: count(agencies) > 0 }],
    },
  ];

  const all = stages.flatMap((st) => st.steps);
  const done = all.filter((x) => x.done).length;
  const next = all.find((x) => !x.done) ?? null;
  const l = loop[0];
  const counts: LoopCounts = {
    clicks: count(clicks),
    leads: count(leads30),
    trials: l?.trials ?? 0,
    paying: l?.paying ?? 0,
    cancelling: l?.cancelling ?? 0,
    churned: l?.churned ?? 0,
    wonBack: l?.wonBack ?? 0,
  };
  return { stages, done, total: all.length, next, level, loop: counts };
}
