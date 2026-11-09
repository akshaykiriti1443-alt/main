import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, agencyMembers, aiGenerations, automations, emailSequences, emailSequenceSteps, sites, skoolCheckins, unlockClaims, unlocks } from "@/lib/db/schema";
import type { WorkspaceSettings } from "@/lib/db/types";
import { env } from "@/lib/env";
import { canBeUpNext } from "@/lib/guides";
import { isAdSource, skoolAdVisits } from "./growth";
import { hasFeature } from "./plans";

// "Your path": the course (The Skool Growth Ladder) as a guided flow inside the app. Every step
// checks itself off from what the member has actually done, so the dashboard always knows the one
// next thing to do. Lesson numbers match the course so the classroom and the app point at each other.

/**
 * kind:
 *   "optional"  nice to have (your own AI, the Pixel, the agency). Never Up next.
 *   "outcome"   a result that waits on Skool's numbers (first customer, levels). Never Up next.
 * Both still tick themselves off when they happen. A step with `locked` (needs another plan, or
 * a lesson Skool hasn't opened yet) is never Up next either, but stays on Your path with its lock
 * (see canBeUpNext).
 */
export type PathStep = { key: string; title: string; why: string; lesson: string; href: string; done: boolean; locked?: string; kind?: "optional" | "outcome" };
export type PathStage = { key: string; tag: string; title: string; steps: PathStep[] };

/**
 * The stage's badge on Your path. One number in its tag shows as that number ("Day 1" → 1,
 * "Level 2" → 2). Launch Week ("Days 2–7") is a calendar, so it never reads as Level 2, and
 * Season 2 gets a flag so it never reads as Level 2 either. Stages with no number ("Talk",
 * "Rhythm") get a flag.
 */
export function stageBadge(stage: Pick<PathStage, "key" | "tag">): { num?: string; icon?: "calendar" | "flag" } {
  if (stage.key === "launch") return { icon: "calendar" };
  if (stage.key === "upper") return { icon: "flag" };
  const nums = stage.tag.match(/\d+/g);
  return nums?.length === 1 ? { num: nums[0] } : { icon: nums ? "calendar" : "flag" };
}
/** The Skool Loop: Skool link clicks and leads (last 30 days), and new customers from the latest Monday check-in. */
export type LoopCounts = { clicks: number; leads: number; customers: number };

type Ws = { id: string; plan: "starter" | "growth" | "owner"; accessSource: string; settings: WorkspaceSettings; createdAt: Date };

/**
 * "Today in Launch Week": on Days 2 to 8 the big Up next card shows today's lesson, so a member on
 * Day 2 isn't sent straight to the Day 7 check-in. Read-only on purpose: it isn't a step, so it is
 * never counted in "N of T" and never ticks. Progress can't be self-reported.
 *
 * The app's Day is the workspace's age, from sign-up. It can't see a Skool trial, a charge or a
 * cancel, so no card ever prints a billing date or a countdown, or says the trial has ended.
 */
export type TodayCard = { day: number; lesson: string; eyebrow: string; title: string; body: string; href: string; stage: "launch" | "day8"; stageTag: string };

/** The Academy's Classroom on Skool, from its group link (any /about or query string is dropped). */
export function academyClassroomUrl(groupUrl: string): string {
  const root = (groupUrl || "https://www.skool.com/0-to-1x-academy-9129/about").split(/[?#]/)[0].replace(/\/+$/, "").replace(/\/about$/, "");
  return `${root}/classroom`;
}

/** Workspace day: the day it was made is Day 1. Lesson 2.N is always Day N+1. */
export function launchDay(createdAt: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000) + 1;
}

// `always`: shown even before the shop is open. Day 7 is about the member's money, so lesson 2.6
// says to read it whichever lesson you're on.
// `noAds`: the body when no ad click has been recorded. Ads may be rejected, in review or held
// back until the member decides (the course's 30-minute route), so these never assume ads are running.
const TODAY_LESSONS: Record<number, { lesson: string; title: string; body: string; noAds?: string; to: "launch" | "growth" | "classroom" | "leads"; always?: true }> = {
  2: { lesson: "2.1", title: "Polish your About page", body: "Every click lands on your About page, still in yesterday's kit. Rewrite the first line so it sounds like you, then post it in today's thread.", to: "launch" },
  3: { lesson: "2.2", title: "Text five people", body: "Your ads are learning to walk, so hands off. List 20 people, text five by hand, and copy your Skool link from here for anyone who asks.", noAds: "No ads live yet? Today matters more, because nothing in it needs Meta. List 20 people, text five by hand, and copy your Skool link from here for anyone who asks.", to: "growth" },
  4: { lesson: "2.3", title: "Pin your Start here post", body: "An empty feed is a restaurant at 8pm with no diners. Today your Day 2 one-liner becomes the post you pin, with one question anyone can answer in a line.", to: "classroom" },
  5: { lesson: "2.4", title: "Switch on your welcome", body: "Divya said hi and met silence. Today's lesson sets up what your first member gets instead: a question, a welcome and a job they can finish tonight.", to: "classroom" },
  6: { lesson: "2.5", title: "Send your first Ask", body: "One question. No link, no price. Get it checked in today's thread, then send it by hand to everyone who replied.", to: "leads" },
  7: { lesson: "2.6", title: "Count your shelf, do one sum", body: "One list, one sum, one decision. Your ads have had about five days at most, so expect thin numbers. They still count. Behind, or no ads live? Read this one anyway. Skool's free week runs from the day you joined, which the app can't see, so go by your own count.", to: "classroom", always: true },
  8: { lesson: "3.1", title: "The Teardown Room is open", body: "Two minutes for a free AI key, then, if you stayed on, watch the video nearest your worst verdict. Stay out of Ads Manager today.", noAds: "No ads live yet? If you stayed on, today is lessons 1.5 to 1.7, or bring your laptop to Thursday's Launch Night. Out of AI runs? A free key takes two minutes. Meta said no? Use the review button it shows you.", to: "classroom" },
};

/** Today's lesson card, or null: outside Days 2 to 8, or until the shop is open (Day 7 shows regardless). */
export function todayInLaunchWeek(opts: { createdAt: Date; shopOpen: boolean; adClicked: boolean; base: string; classroomUrl: string; now?: Date }): TodayCard | null {
  const day = launchDay(opts.createdAt, opts.now);
  const t = TODAY_LESSONS[day];
  if (!t || (!t.always && !opts.shopOpen)) return null;
  const href = t.to === "classroom" ? opts.classroomUrl : `${opts.base}/${t.to}`;
  const stage = day === 8 ? ("day8" as const) : ("launch" as const);
  return { day, lesson: t.lesson, eyebrow: `Today · Lesson ${t.lesson}`, title: t.title, body: !opts.adClicked && t.noAds ? t.noAds : t.body, href, stage, stageTag: stage === "day8" ? "Day 8" : "Days 2–7" };
}

/** One line of the Your shelf card: a fact the app really has. `have: false` is a kind zero state, never a red mark. */
export type ShelfItem = { key: string; label: string; note: string; have: boolean };
export type Shelf = { items: ShelfItem[]; empty: boolean };

/**
 * "Your shelf", Days 6 to 8: what the app can honestly see of the member's week, ahead of lesson
 * 2.6's count. Facts only. It can't see posts, Gives, buddies, likes or whether an ad went live,
 * so it never mentions them. Nothing to copy, no countdown, no projection, no "you'd lose this".
 */
export function buildShelf(f: { kit: boolean; funnel: boolean; research: boolean; statics: boolean; adClicks: number; verdicts: number; aboutVisitors: number | null }): Shelf {
  const items: ShelfItem[] = [
    { key: "kit", label: "Your launch kit", note: f.kit ? "Built" : "Not yet", have: f.kit },
    { key: "funnel", label: "Your funnel", note: f.funnel ? "Live" : "Not yet", have: f.funnel },
    { key: "research", label: "Your ad research", note: f.research ? "Saved" : "Not yet", have: f.research },
    { key: "statics", label: "Your 5 statics", note: f.statics ? "Written. The app can't see if they went live" : "Not yet", have: f.statics },
    { key: "clicks", label: "Ad clicks through your Skool link", note: f.adClicks > 0 ? f.adClicks.toLocaleString() : "0 so far. Meta may still be warming up", have: f.adClicks > 0 },
    { key: "verdicts", label: "Ad review verdicts", note: f.verdicts > 0 ? `${f.verdicts.toLocaleString()}, from the numbers you typed` : "None yet", have: f.verdicts > 0 },
    { key: "checkin", label: "Your check-in", note: f.aboutVisitors === null ? "Not yet. Zeros count" : `${f.aboutVisitors.toLocaleString()} About-page visitors, you typed this`, have: f.aboutVisitors !== null },
  ];
  return { items, empty: !items.some((x) => x.have) };
}

const count = (rows: { n: number }[]) => rows[0]?.n ?? 0;

export async function computePath(ws: Ws, userId: string, opts: { entryTicketOn?: boolean } = {}) {
  const db = await getDb();
  const wid = ws.id;
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const n = sql<number>`count(*)::int`;
  const [kits, research, studio, reviews, published, skoolSite, clicks, realClicks, leads30, leadsEver, checkins, checkinCount, paidCheckins, liveAutomations, myUnlocks, unlockClaimCount, longSequences, agencies] = await Promise.all([
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "launch_kit"))),
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_research"))),
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_studio"))),
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_review"))),
    db.select({ n }).from(sites).where(and(eq(sites.workspaceId, wid), eq(sites.published, true))),
    db.select({ n }).from(sites).where(and(eq(sites.workspaceId, wid), sql`${sites.skoolUrl} <> ''`)),
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "skool_visit"), gte(activities.createdAt, since30))),
    // A member clicking their own link to try it is a "direct" visit, so it doesn't count as
    // sending traffic (lesson 1.7). Only a real ad click ticks it.
    db.selectDistinct({ source: sql<string>`${activities.data}->>'source'` }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "skool_visit"), sql`${activities.data}->>'source' is not null`)),
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "lead"), gte(activities.createdAt, since30))),
    // "Be your own lead #1": any opt-in ever logged (a "lead" activity), not contacts in general,
    // since Unlock claims and imports create contacts too.
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "lead"))),
    db.select().from(skoolCheckins).where(eq(skoolCheckins.workspaceId, wid)).orderBy(sql`${skoolCheckins.createdAt} desc`).limit(1),
    db.select({ n }).from(skoolCheckins).where(eq(skoolCheckins.workspaceId, wid)),
    // A first paying member is a one-time tick: a later week with 0 new customers doesn't undo it.
    db.select({ n }).from(skoolCheckins).where(and(eq(skoolCheckins.workspaceId, wid), gte(skoolCheckins.newPaid, 1))),
    db.select({ n }).from(automations).where(and(eq(automations.workspaceId, wid), eq(automations.active, true))),
    db.select({ n }).from(unlocks).where(eq(unlocks.workspaceId, wid)),
    db.select({ n }).from(unlockClaims).where(eq(unlockClaims.workspaceId, wid)),
    // "Add email 4": any sequence with four or more emails. One row per such sequence.
    db
      .select({ n })
      .from(emailSequenceSteps)
      .innerJoin(emailSequences, eq(emailSequenceSteps.sequenceId, emailSequences.id))
      .where(eq(emailSequences.workspaceId, wid))
      .groupBy(emailSequenceSteps.sequenceId)
      .having(sql`count(*) >= 4`),
    db.select({ n }).from(agencyMembers).where(eq(agencyMembers.userId, userId)),
  ]);

  const s = ws.settings;
  const base = `/app/w/${wid}`;
  const last = checkins[0] ?? null;
  // Skool decides the level, not the member's numbers (lesson 4.1): only what they type from Settings › Growth counts.
  const level = last?.skoolLevel ?? 1;
  const growthPlan = hasFeature(ws.plan, "automations");
  // Only a saved key lifts the 3-run cap (lesson 3.1). A connector works through the member's own AI app.
  const aiOn = Boolean(s.aiKeyEnc);
  // A lesson Skool hasn't opened yet can't be Up next: these match the course's Time unlocks.
  // Launch Week and Day 8 need no lock, because the Today card leads them.
  const appDay = launchDay(ws.createdAt);
  const opensOn = (day: number) => (appDay < day ? `Opens Day ${day}` : undefined);

  // Lesson numbers and stage names match the course (The Skool Growth Ladder, v6). If a lesson is
  // renumbered there, change it here too. Stage titles mirror the Skool course names.
  const stages: PathStage[] = [
    // Day 1, first sitting: the shop open, with you as lead #1.
    {
      key: "start",
      tag: "Day 1",
      title: "Open the shop",
      steps: [
        // Only trackable when the entry ticket is on (then the intro post is how they got in).
        ...(opts.entryTicketOn && ws.accessSource === "member"
          ? [{ key: "hello", title: "Say hi in the community", why: "Your intro is your first post. The owner answers it with a question, usually the same day.", lesson: "1.1", href: `${base}/hello`, done: Boolean(s.entryClaimedAt) }]
          : []),
        { key: "app", title: "Open your app", why: "You're in. No codes, ever.", lesson: "1.3", href: base, done: true },
        { key: "kit", title: "Build your launch kit", why: "AI writes your page, free guide, emails and Skool About page. Press it once.", lesson: "1.3", href: `${base}/launch`, done: count(kits) > 0 },
        { key: "skool", title: "Add your Skool group link", why: "Every Join button and your Skool link point here.", lesson: "1.3", href: `${base}/settings#business`, done: Boolean(s.skoolUrl) || count(skoolSite) > 0 },
        { key: "publish", title: "Publish your funnel", why: "Edit three lines, then press the scary button.", lesson: "1.4", href: `${base}/sites`, done: count(published) > 0 },
        { key: "lead1", title: "Be your own lead #1", why: "Open your live page on your phone and sign up with your own email. Then find yourself in Leads.", lesson: "1.4", href: `${base}/leads`, done: count(leadsEver) > 0 },
      ],
    },
    // Day 1, second sitting: five statics live, tonight or tomorrow morning.
    {
      key: "ads",
      tag: "Day 1",
      title: "Five ads live",
      steps: [
        // Saved when Ad research's "Analyse with AI" runs (or your connected AI saves one).
        { key: "research", title: "Find ads that already work", why: "Search your niche, look at the 🔥 30+ day ads, then Analyse with AI: what's working and the gaps nobody uses yet.", lesson: "1.5", href: `${base}/ads/research`, done: count(research) > 0 },
        // Saved when the Ad studio's "Make my 5 statics" runs (or your connected AI makes a pack).
        { key: "statics", title: "Make your 5 statics", why: "Five different image ads, your numbers and the exact clicks to launch them in Ads Manager.", lesson: "1.6", href: `${base}/ads/studio`, done: count(studio) > 0 },
        { key: "clicks", title: "Send traffic through your Skool link", why: "Your 5 statics, live at $5 to $10 a day, pointed at your Skool link. Ticks at the first ad click (your own test click doesn't count).", lesson: "1.7", href: `${base}/growth`, done: realClicks.some((r) => isAdSource(r.source)) },
        // Optional: the course's Traffic campaign needs no Pixel, so Day 1 never waits on it.
        { key: "pixel", title: "Connect your Meta Pixel (optional)", why: "Your Day 1 ads don't need it. Add it later so Meta sees who lands on your About page.", lesson: "1.7", href: `${base}/settings#tracking`, done: Boolean(s.metaPixelId), kind: "optional" },
      ],
    },
    {
      key: "launch",
      tag: "Days 2–7",
      title: "Launch Week",
      steps: [
        { key: "checkin", title: "Do your first Monday check-in", why: "Day 7: four numbers from Skool › Settings › Growth.", lesson: "2.6", href: `${base}/growth`, done: Boolean(last) },
        { key: "review", title: "Keep, fix or kill", why: "Day 7: a verdict on every ad Meta really spent on. Fix one room only: Hook, Door or About page.", lesson: "2.6", href: `${base}/ads`, done: count(reviews) > 0 },
      ],
    },
    // After the trial. Both Day 8 steps are optional: lesson 3.1 tells many members to make no new
    // statics, so a required step would sit on Up next for good.
    {
      key: "day8",
      tag: "Day 8",
      title: "Keep, fix or kill",
      steps: [
        { key: "ai", title: "Connect your AI (optional)", why: "Day 1 used your 3 runs. A free Gemini key means you stop counting.", lesson: "3.1", href: `${base}/ai`, done: aiOn, kind: "optional" },
        // Day 1's pack is the first; a second means the fresh set got made.
        { key: "refresh", title: "Make your fresh ads", why: "Fresh statics and your first video, ready for tomorrow's one tidy edit.", lesson: "3.1", href: `${base}/ads/studio`, done: count(studio) >= 2, kind: "optional" },
      ],
    },
    // Skool's growth engine, and the first paying member.
    {
      key: "level2",
      tag: "Level 2",
      title: "Wake up Printy",
      steps: [
        { key: "l2", title: "Reach Level 2", why: "100 About-page visitors, 1 new customer and paid pricing. Then Skool can start running 6 ads for you.", lesson: "4.1", href: `${base}/growth`, done: level >= 2, kind: "outcome" },
        // Counted from the Monday check-in (Skool's Growth tab). Reaching Level 2 also means one landed.
        { key: "customer", title: "Land your first paying member", why: "Level 2 needs one new customer. They're usually in your phone, not your ads. Ticks at your check-in.", lesson: "4.2", href: `${base}/leads`, done: count(paidCheckins) > 0 || level >= 2, kind: "outcome" },
      ],
    },
    {
      key: "talk",
      tag: "Talk",
      title: "Give them a reason to post",
      steps: [
        { key: "unlock", title: "Create your first Unlock", why: "A small reward for a real post or a helpful reply. Skool ranks groups on who joins, who talks and who stays.", lesson: "5.2", href: `${base}/unlocks`, done: count(myUnlocks) > 0, locked: opensOn(12) },
        { key: "claim1", title: "Get your first Unlock claim", why: "Someone in your group posted something real. Thank them by name.", lesson: "5.2", href: `${base}/unlocks`, done: count(unlockClaimCount) > 0, kind: "outcome" },
      ],
    },
    {
      key: "rhythm",
      tag: "Rhythm",
      title: "Half a boring hour a week",
      steps: [
        { key: "email4", title: "Add email 4", why: "One more email, for the people who said not yet.", lesson: "6.1", href: `${base}/emails`, done: longSequences.length > 0, locked: opensOn(15) },
        {
          key: "automations",
          title: "Switch on your lead follow-ups",
          why: "New leads get a hello and hot ones get flagged to you, all by themselves.",
          lesson: "6.1",
          href: `${base}/automations`,
          done: count(liveAutomations) > 0,
          locked: growthPlan ? undefined : "Growth plan",
          kind: "optional",
        },
        { key: "weeks", title: "Do four Monday check-ins", why: "Boring on purpose. Four Mondays and it's a habit, not a heroic effort.", lesson: "6.2", href: `${base}/growth`, done: count(checkinCount) >= 4, locked: opensOn(15) },
      ],
    },
    {
      key: "upper",
      tag: "Season 2",
      title: "The upper rungs",
      steps: [
        { key: "bio", title: "Put your Skool link in your bios", why: "The laziest requirement you'll ever meet: your skool.com link in your bio (Instagram, TikTok or YouTube).", lesson: "7.1", href: `${base}/growth`, done: Boolean(last?.linkInBio), locked: opensOn(18) },
        { key: "visitors", title: "Reach 3,000 About-page visitors", why: "Last 30 days, so pace matters. Base camp is $30 to $50 a day, and only once members pay for it. The rest comes from Skool's side, if it comes.", lesson: "7.1", href: `${base}/growth`, done: (last?.aboutVisitors ?? 0) >= 3000 || level >= 3, kind: "outcome" },
        { key: "network", title: "Earn 10 Skool Network sign-ups", why: "People Skool sends you. Hellos and real replies on Skool earn them.", lesson: "7.2", href: `${base}/growth`, done: (last?.networkSignups ?? 0) >= 10 || level >= 3, kind: "outcome" },
        { key: "l3", title: "Reach Level 3", why: "Upload your own ads. Skool spends up to $1,000 a day on them.", lesson: "7.2", href: `${base}/growth`, done: level >= 3, kind: "outcome" },
        { key: "l4", title: "Reach Level 4", why: "Partnership ads, up to about $10,000 a day of Skool's money.", lesson: "7.2", href: `${base}/growth`, done: level >= 4, kind: "outcome" },
      ],
    },
    // Last on purpose, and optional: lesson B.1 says to wait until someone asks to buy it.
    {
      key: "second",
      tag: "Bonus",
      title: "Agency or software",
      steps: [{ key: "agency", title: "Grow into an agency or software (optional)", why: "Your brand, your domain, your markup, once someone asks to buy it.", lesson: "B.1", href: "/app/agency/new", done: count(agencies) > 0, kind: "optional" }],
    },
  ];

  const all = stages.flatMap((st) => st.steps);
  const done = all.filter((x) => x.done).length;
  // Up next: the first step still to do. Optional steps, outcomes and plan-locked steps (lead
  // follow-ups on the Member plan) never hold it up; they stay listed and tick themselves off.
  const next = all.find(canBeUpNext) ?? null;
  const ticked = (key: string) => all.some((x) => x.key === key && x.done);
  // Days 2 to 8 only, once the shop is open (Day 7 regardless). A card beside the steps, never one of them.
  const today = todayInLaunchWeek({
    createdAt: ws.createdAt,
    // Day 1's first sitting only. The ads (1.5 to 1.7) can wait until someone has decided to stay, so
    // they stay on Your path and come back as Up next after Day 8.
    shopOpen: !stages.find((st) => st.key === "start")?.steps.some(canBeUpNext),
    adClicked: ticked("clicks"),
    base,
    classroomUrl: academyClassroomUrl(env.skoolGroupUrl),
  });
  const shelf =
    appDay >= 6 && appDay <= 8
      ? buildShelf({ kit: ticked("kit"), funnel: ticked("publish"), research: ticked("research"), statics: ticked("statics"), adClicks: await skoolAdVisits(wid, 30), verdicts: count(reviews), aboutVisitors: last?.aboutVisitors ?? null })
      : null;
  const counts: LoopCounts = {
    clicks: count(clicks),
    leads: count(leads30),
    customers: last?.newPaid ?? 0,
  };
  return { stages, done, total: all.length, next, today, shelf, level, loop: counts };
}
