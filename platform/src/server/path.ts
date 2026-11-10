import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, agencyMembers, aiGenerations, automations, contacts, emailSequences, emailSequenceSteps, sites, skoolCheckins, unlockClaims, unlocks } from "@/lib/db/schema";
import type { WorkspaceSettings } from "@/lib/db/types";
import { canBeUpNext } from "@/lib/guides";
import { isAdSource, skoolAdVisits } from "./growth";
import { hasFeature } from "./plans";

// "Your path": the course (The Anti-Pete Week) as a guided flow inside the app. Every step checks
// itself off from what the member has actually done, so the dashboard always knows the one next
// thing to do. The days match the classroom, Day 1 to Day 7, so the two point at each other.

/**
 * kind:
 *   "optional"  nice to have (the lead follow-ups, the agency). Never Up next.
 *   "outcome"   a result that waits on Skool's numbers (first customer, levels). Never Up next.
 * Both still tick themselves off when they happen. A step with `locked` (needs another plan, or
 * a day Skool hasn't opened yet) is never Up next either, but stays on Your path with its lock
 * (see canBeUpNext).
 * lesson: the classroom's own label, "Day 1" to "Day 7", then "Season 2" or "Bonus".
 */
export type PathStep = { key: string; title: string; why: string; lesson: string; href: string; done: boolean; locked?: string; kind?: "optional" | "outcome" };
export type PathStage = { key: string; tag: string; title: string; steps: PathStep[] };

/**
 * The stage's badge on Your path. One number in its tag shows as that number ("Day 3" → 3).
 * Season 2 gets a flag so it never reads as Level 2, and stages with no number ("Bonus") get a flag.
 */
export function stageBadge(stage: Pick<PathStage, "key" | "tag">): { num?: string; icon?: "calendar" | "flag" } {
  if (stage.key === "season2") return { icon: "flag" };
  const nums = stage.tag.match(/\d+/g);
  return nums?.length === 1 ? { num: nums[0] } : { icon: nums ? "calendar" : "flag" };
}
/** The Skool Loop: Skool link clicks and leads (last 30 days), and new customers from the latest Monday check-in. */
export type LoopCounts = { clicks: number; leads: number; customers: number };

type Ws = { id: string; plan: "starter" | "growth" | "owner"; accessSource: string; settings: WorkspaceSettings; createdAt: Date };

/**
 * "Today in your free week": on Days 2 to 7 the big Up next card shows today's lesson, so a member
 * on Day 2 isn't sent straight to the Day 6 review. Read-only on purpose: it isn't a step, so it is
 * never counted in "N of T" and never ticks. Progress can't be self-reported.
 *
 * The app's Day is the workspace's age, from sign-up. It can't see a Skool trial, a charge or a
 * cancel, so no card ever prints a billing date or a countdown, or says the trial has ended.
 */
export type TodayCard = { day: number; lesson: string; eyebrow: string; title: string; body: string; href: string; stage: string; stageTag: string };

/** Workspace day: the day it was made is Day 1. Each course day is the same day number here. */
export function launchDay(createdAt: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000) + 1;
}

// `always`: shown even before the shop is open. Day 7 is about the member's money, so it says to
// read it whichever day you're on.
// `noAds`: the body when no ad lead or ad click has been recorded. Ads may be rejected, in review or
// held back until the member decides, so these never assume ads are running.
const TODAY_LESSONS: Record<number, { title: string; body: string; noAds?: string; to: "ai" | "leads" | "unlocks" | "growth" | "ads"; always?: true }> = {
  2: { title: "Five more ads, straight to Skool", body: "If your Day 1 ads are up, leave them alone. Today is a free AI key, 5 new statics at $5 a day, and their own Traffic campaign to your Skool link, up to $15 a day across the two.", to: "ai" },
  3: { title: "Walk through your own machine", body: "Your ads are learning to walk, so hands off. Walk through your website instead: sign up with a different email, press Join, then check Events Manager, Leads and Your Skool link.", noAds: "No ads live yet? Today still counts, because none of it needs them. Walk through your website: sign up with a different email, press Join, then check Events Manager, Leads and Your Skool link.", to: "leads" },
  4: { title: "Furnish the room", body: "An empty group is a restaurant at 8pm with no diners. Pin a welcome post with one easy question, make your first Unlock and add one quick win to your Classroom.", to: "unlocks" },
  5: { title: "Text five people", body: "Your fastest first member probably knows your name already. List 20 people, text five by hand, and copy your Skool link from here for anyone who asks, with ?src=text on the end.", to: "growth" },
  6: { title: "Your real numbers", body: "Copy each ad's numbers into Ad review, only the ones with 1,000 impressions or more. Switch off the ones marked Kill, leave Too early running and change nothing else.", noAds: "No ads live yet? Then there's nothing to judge today, and that's OK. Ad review waits until one has 1,000 impressions or more. Read today's lesson anyway, so the numbers make sense when they come.", to: "ads" },
  7: { title: "The scoreboard, and your decision", body: "Copy four numbers from Skool › Settings › Growth into your check-in, whatever day it is. Then count what you built and decide what happens next. Behind, or no ads live? Read this one anyway. Skool's free week runs from the day you joined, which the app can't see, so go by your own count.", to: "growth", always: true },
};

/** Today's lesson card, or null: outside Days 2 to 7, or until the shop is open (Day 7 shows regardless). */
export function todayInLaunchWeek(opts: { createdAt: Date; shopOpen: boolean; adClicked: boolean; base: string; aiOn?: boolean; now?: Date }): TodayCard | null {
  const day = launchDay(opts.createdAt, opts.now);
  const t = TODAY_LESSONS[day];
  if (!t || (!t.always && !opts.shopOpen)) return null;
  // Day 2 starts with the free key. Already got one? Then it's straight to Ad studio.
  const href = day === 2 && opts.aiOn ? `${opts.base}/ads/studio` : `${opts.base}/${t.to}`;
  const tag = `Day ${day}`;
  return { day, lesson: tag, eyebrow: `Today · ${tag}`, title: t.title, body: !opts.adClicked && t.noAds ? t.noAds : t.body, href, stage: `day${day}`, stageTag: tag };
}

/** One line of the Your shelf card: a fact the app really has. `have: false` is a kind zero state, never a red mark. */
export type ShelfItem = { key: string; label: string; note: string; have: boolean };
export type Shelf = { items: ShelfItem[]; empty: boolean };

/**
 * "Your shelf", Days 6 to 8: what the app can honestly see of the member's week, ahead of Day 7's
 * count. Facts only. It can't see posts, Gives, buddies, likes or whether an ad went live,
 * so it never mentions them. Nothing to copy, no countdown, no projection, no "you'd lose this".
 */
export function buildShelf(f: { kit: boolean; funnel: boolean; pixel: boolean; research: boolean; statics: boolean; adLeads: number; adClicks: number; verdicts: number; aboutVisitors: number | null }): Shelf {
  const items: ShelfItem[] = [
    { key: "kit", label: "Your launch kit", note: f.kit ? "Built" : "Not yet", have: f.kit },
    { key: "funnel", label: "Your funnel", note: f.funnel ? "Live" : "Not yet", have: f.funnel },
    { key: "pixel", label: "Your Meta Pixel", note: f.pixel ? "Connected" : "Not yet", have: f.pixel },
    { key: "research", label: "Your ad research", note: f.research ? "Saved" : "Not yet", have: f.research },
    { key: "statics", label: "Your 5 statics", note: f.statics ? "Written. The app can't see if they went live" : "Not yet", have: f.statics },
    { key: "leads", label: "Leads from your ads", note: f.adLeads > 0 ? f.adLeads.toLocaleString() : "0 so far. Meta may still be warming up", have: f.adLeads > 0 },
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
  const [kits, research, studio, reviews, published, skoolSite, clicks, realClicks, leads30, leadsEver, adLeads, checkins, checkinCount, paidCheckins, liveAutomations, myUnlocks, unlockClaimCount, longSequences, agencies, handAdded] = await Promise.all([
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "launch_kit"))),
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_research"))),
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_studio"))),
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_review"))),
    db.select({ n }).from(sites).where(and(eq(sites.workspaceId, wid), eq(sites.published, true))),
    db.select({ n }).from(sites).where(and(eq(sites.workspaceId, wid), sql`${sites.skoolUrl} <> ''`)),
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "skool_visit"), gte(activities.createdAt, since30))),
    // Every source the Skool link has ever counted. A member clicking their own link to try it is a
    // "direct" visit: fine for Day 3's check, but it isn't an ad click.
    db.selectDistinct({ source: sql<string>`${activities.data}->>'source'` }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "skool_visit"), sql`${activities.data}->>'source' is not null`)),
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "lead"), gte(activities.createdAt, since30))),
    // "Be your own lead #1": any opt-in ever logged (a "lead" activity), not contacts in general,
    // since Unlock claims and imports create contacts too.
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "lead"))),
    // A lead from an ad: Meta adds fbclid to the page address, and the opt-in form keeps it.
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "lead"), sql`${activities.data}->'utm'->>'fbclid' is not null`)),
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
    // Day 5's "Add contact". Sign-ups, imports and Unlock claims all carry a different source.
    db.select({ n }).from(contacts).where(and(eq(contacts.workspaceId, wid), eq(contacts.source, "manual"))),
  ]);

  const s = ws.settings;
  const base = `/app/w/${wid}`;
  const last = checkins[0] ?? null;
  // Skool decides the level, not the member's numbers: only what they type from Settings › Growth counts.
  const level = last?.skoolLevel ?? 1;
  const growthPlan = hasFeature(ws.plan, "automations");
  // Only a saved key lifts the 3-run cap. A connector works through the member's own AI app instead,
  // so either one means they've stopped counting runs.
  const aiOn = Boolean(s.aiKeyEnc);
  const sources = realClicks.map((r) => r.source);
  const adVisited = sources.some(isAdSource);
  // A day Skool hasn't opened yet can't be Up next: these match the course's one lesson a day, and
  // the Season 2 courses that open 8 days after joining.
  const appDay = launchDay(ws.createdAt);
  const opensOn = (day: number) => (appDay < day ? `Opens Day ${day}` : undefined);

  // Days and stage names match the course (The Anti-Pete Week). If a day moves there, move it here too.
  const stages: PathStage[] = [
    // Day 1, first sitting: the machine goes live, with you as lead #1.
    {
      key: "start",
      tag: "Day 1",
      title: "Your whole machine goes live",
      steps: [
        // Only trackable when the entry ticket is on (then the intro post is how they got in).
        ...(opts.entryTicketOn && ws.accessSource === "member"
          ? [{ key: "hello", title: "Say hi in the community", why: "Your intro is your first post. The owner answers it with a question, usually the same day.", lesson: "Day 1", href: `${base}/hello`, done: Boolean(s.entryClaimedAt) }]
          : []),
        { key: "app", title: "Open your app", why: "You're in. No codes, ever.", lesson: "Day 1", href: base, done: true },
        { key: "kit", title: "Build your launch kit", why: "AI writes your website, free guide, emails and Skool About page. Press it once.", lesson: "Day 1", href: `${base}/launch`, done: count(kits) > 0 },
        { key: "skool", title: "Add your Skool group link", why: "Every Join button and your Skool link point here.", lesson: "Day 1", href: `${base}/settings#business`, done: Boolean(s.skoolUrl) || count(skoolSite) > 0 },
        { key: "publish", title: "Publish your funnel", why: "Edit three lines, check your thank-you page states the deal, then press the scary button.", lesson: "Day 1", href: `${base}/sites`, done: count(published) > 0 },
        // Right after publish, so "be your own lead" fires a Lead that Meta can see.
        { key: "pixel", title: "Connect your Meta Pixel", why: "It tells Meta who gave you their email, so Meta can go and find more people like them. Your Day 1 ads need it.", lesson: "Day 1", href: `${base}/settings#tracking`, done: Boolean(s.metaPixelId) },
        { key: "lead1", title: "Be your own lead #1", why: "Open your live page on your phone and sign up with your own email. Then find yourself in Leads, and your Lead in Events Manager.", lesson: "Day 1", href: `${base}/leads`, done: count(leadsEver) > 0 },
      ],
    },
    // Day 1, second sitting: five statics to the website. Later days don't wait on these (see shopOpen).
    {
      key: "ads",
      tag: "Day 1",
      title: "Your first 5 ads",
      steps: [
        // Saved when Ad research's "Analyse with AI" runs (or your connected AI saves one).
        { key: "research", title: "Find ads that already work", why: "Search your niche, look at the 🔥 30+ day ads, then Analyse with AI: what's working and the gaps nobody uses yet.", lesson: "Day 1", href: `${base}/ads/research`, done: count(research) > 0 },
        // Saved when the Ad studio's "Make my 5 statics" runs (or your connected AI makes a pack).
        { key: "statics", title: "Make your 5 statics", why: "Five different image ads selling your free checklist, your numbers and the exact clicks to launch them in Ads Manager.", lesson: "Day 1", href: `${base}/ads/studio`, done: count(studio) > 0 },
        // Day 1's ads go to the website, so a lead from an ad counts. So does a Skool-link ad click,
        // for anyone who started there. Your own test sign-up or test click counts as neither.
        { key: "clicks", title: "Put your first ads live", why: "Your 5 statics at $10 a day, in a Leads campaign to your website. Ticks at your first lead from an ad, or your first ad click on your Skool link. Your own test doesn't count.", lesson: "Day 1", href: `${base}/ads/studio`, done: count(adLeads) > 0 || adVisited },
      ],
    },
    {
      key: "day2",
      tag: "Day 2",
      title: "Five more ads, straight to Skool",
      steps: [
        { key: "ai", title: "Get your free AI key", why: "Day 1 used your 3 runs. A free Gemini key means you stop counting.", lesson: "Day 2", href: `${base}/ai`, done: aiOn, locked: opensOn(2) },
        // Day 1's pack is the first; a second means the Skool-link set got made.
        { key: "refresh", title: "Make your second 5 statics", why: "Fresh ideas from Gaps nobody uses yet, at $5 a day, in their own Traffic campaign to your Skool link. Ticks at your second pack.", lesson: "Day 2", href: `${base}/ads/studio`, done: count(studio) >= 2, locked: opensOn(2) },
      ],
    },
    {
      key: "day3",
      tag: "Day 3",
      title: "Walk through your own machine",
      steps: [
        // Three things the app can really see: the Pixel saved, a second sign-up, the Skool link counting.
        { key: "tracking", title: "Check your tracking", why: "Sign up again with a different email and open Your Skool link once. Ticks when your Pixel is saved, you've got 2 sign-ups and the link has counted a click.", lesson: "Day 3", href: `${base}/leads`, done: Boolean(s.metaPixelId) && count(leadsEver) >= 2 && sources.length > 0, locked: opensOn(3) },
      ],
    },
    {
      key: "day4",
      tag: "Day 4",
      title: "Furnish the room before guests arrive",
      steps: [
        { key: "unlock", title: "Create your first Unlock", why: "A small reward for a real post. Your free guide is already sitting there. Skool ranks groups on who joins, who talks and who stays.", lesson: "Day 4", href: `${base}/unlocks`, done: count(myUnlocks) > 0, locked: opensOn(4) },
      ],
    },
    {
      key: "day5",
      tag: "Day 5",
      title: "Your first 20 already know your name",
      steps: [
        // The app can't see a text. It can see who they added by hand, or a click tagged ?src=text.
        { key: "warm", title: "Text five people you know", why: "List 20, text five by hand, and send a link only when they ask. Ticks when you add someone with Add contact, or your Skool link counts a ?src=text click.", lesson: "Day 5", href: `${base}/leads`, done: count(handAdded) > 0 || sources.some((src) => /^text\b/.test(src)), locked: opensOn(5) },
      ],
    },
    {
      key: "day6",
      tag: "Day 6",
      title: "Your real numbers",
      steps: [
        { key: "review", title: "Keep, fix or kill", why: "A verdict on every ad with 1,000 impressions or more, whichever way it points. Ads marked Kill go off today, and nothing else changes.", lesson: "Day 6", href: `${base}/ads`, done: count(reviews) > 0, locked: opensOn(6) },
      ],
    },
    {
      key: "day7",
      tag: "Day 7",
      title: "The scoreboard, and your decision",
      steps: [
        { key: "checkin", title: "Do your first check-in", why: "Four numbers from Skool › Settings › Growth, whatever day it is. Zeros count.", lesson: "Day 7", href: `${base}/growth`, done: Boolean(last), locked: opensOn(7) },
      ],
    },
    // What remains once the free week is over, in the order it tends to happen.
    {
      key: "season2",
      tag: "Season 2",
      title: "After your free week",
      steps: [
        { key: "l2", title: "Reach Level 2", why: "100 About-page visitors, 1 new customer and paid pricing. Then Skool can start running 6 ads for you.", lesson: "Season 2", href: `${base}/growth`, done: level >= 2, kind: "outcome" },
        // Counted from the check-in (Skool's Growth tab). Reaching Level 2 also means one landed.
        { key: "customer", title: "Land your first paying member", why: "Level 2 needs one new customer. They're usually in your phone, not your ads. Ticks at your check-in.", lesson: "Season 2", href: `${base}/leads`, done: count(paidCheckins) > 0 || level >= 2, kind: "outcome" },
        { key: "claim1", title: "Get your first Unlock claim", why: "Someone in your group posted something real. Thank them by name.", lesson: "Season 2", href: `${base}/unlocks`, done: count(unlockClaimCount) > 0, kind: "outcome" },
        { key: "email4", title: "Add email 4", why: "One more email, for the people who said not yet.", lesson: "Season 2", href: `${base}/emails`, done: longSequences.length > 0, locked: opensOn(8) },
        {
          key: "automations",
          title: "Switch on your lead follow-ups",
          why: "New leads get a hello and hot ones get flagged to you, all by themselves.",
          lesson: "Season 2",
          href: `${base}/automations`,
          done: count(liveAutomations) > 0,
          locked: growthPlan ? undefined : "Growth plan",
          kind: "optional",
        },
        { key: "weeks", title: "Do four Monday check-ins", why: "Boring on purpose. Four Mondays and it's a habit, not a heroic effort.", lesson: "Season 2", href: `${base}/growth`, done: count(checkinCount) >= 4, locked: opensOn(8) },
        { key: "bio", title: "Put your Skool link in your bios", why: "The laziest requirement you'll ever meet: your skool.com link in your bio (Instagram, TikTok or YouTube).", lesson: "Season 2", href: `${base}/growth`, done: Boolean(last?.linkInBio), locked: opensOn(8) },
        { key: "visitors", title: "Reach 3,000 About-page visitors", why: "Last 30 days, so pace matters. Base camp is $30 to $50 a day, and only once members pay for it. The rest comes from Skool's side, if it comes.", lesson: "Season 2", href: `${base}/growth`, done: (last?.aboutVisitors ?? 0) >= 3000 || level >= 3, kind: "outcome" },
        { key: "network", title: "Earn 10 Skool Network sign-ups", why: "People Skool sends you. Hellos and real replies on Skool earn them.", lesson: "Season 2", href: `${base}/growth`, done: (last?.networkSignups ?? 0) >= 10 || level >= 3, kind: "outcome" },
        { key: "l3", title: "Reach Level 3", why: "Upload your own ads. Skool spends up to $1,000 a day on them.", lesson: "Season 2", href: `${base}/growth`, done: level >= 3, kind: "outcome" },
        { key: "l4", title: "Reach Level 4", why: "Partnership ads, up to about $10,000 a day of Skool's money.", lesson: "Season 2", href: `${base}/growth`, done: level >= 4, kind: "outcome" },
      ],
    },
    // Last on purpose, and optional: wait until someone asks to buy it.
    {
      key: "second",
      tag: "Bonus",
      title: "Agency or software",
      steps: [{ key: "agency", title: "Grow into an agency or software (optional)", why: "Your brand, your domain, your markup, once someone asks to buy it.", lesson: "Bonus", href: "/app/agency/new", done: count(agencies) > 0, kind: "optional" }],
    },
  ];

  const all = stages.flatMap((st) => st.steps);
  const done = all.filter((x) => x.done).length;
  // Up next: the first step still to do. Optional steps, outcomes and plan-locked steps (lead
  // follow-ups on the Member plan) never hold it up; they stay listed and tick themselves off.
  const next = all.find(canBeUpNext) ?? null;
  const ticked = (key: string) => all.some((x) => x.key === key && x.done);
  // Days 2 to 7 only, once the shop is open (Day 7 regardless). A card beside the steps, never one of them.
  const today = todayInLaunchWeek({
    createdAt: ws.createdAt,
    // Day 1's first sitting only. The ads can take a day or two (Meta reviews them, and some people
    // split Day 1), so they stay on Your path as Up next while the Today cards carry on.
    shopOpen: !stages.find((st) => st.key === "start")?.steps.some(canBeUpNext),
    adClicked: ticked("clicks"),
    base,
    aiOn,
  });
  const shelf =
    appDay >= 6 && appDay <= 8
      ? buildShelf({ kit: ticked("kit"), funnel: ticked("publish"), pixel: ticked("pixel"), research: ticked("research"), statics: ticked("statics"), adLeads: count(adLeads), adClicks: await skoolAdVisits(wid, 30), verdicts: count(reviews), aboutVisitors: last?.aboutVisitors ?? null })
      : null;
  const counts: LoopCounts = {
    clicks: count(clicks),
    leads: count(leads30),
    customers: last?.newPaid ?? 0,
  };
  return { stages, done, total: all.length, next, today, shelf, level, loop: counts };
}
