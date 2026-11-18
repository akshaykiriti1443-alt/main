import { cache } from "react";
import { and, asc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, agencyMembers, aiGenerations, apiTokens, automations, contacts, emailSequences, emailSequenceSteps, sites, skoolCheckins, unlockClaims, unlocks } from "@/lib/db/schema";
import type { Journey, WorkspaceSettings } from "@/lib/db/types";
import { env } from "@/lib/env";
import { AI_CONNECTOR_WIN, AI_RUNS_WIN, CARRIED_WIN, DAY_REWARDS, fill, postLinkPlaceholder, HELLO_STEP, JOURNEY_COPY, JOURNEY_SINCE, POST_KEYS, REVIEW_WAITING_WIN, WEEK, WEEK_STEPS, withCarriedTicks, withLegacyTicks, type HrefKind, type WeekStepDef, type Where } from "@/lib/week";
import { reelVaultConfigured } from "@/lib/reelvault";
import { isAdSource, skoolAdVisits } from "./growth";
import { pixelStatus, type TrackingSettings } from "./meta/capi";
import { hasFeature } from "./plans";
import { siteBaseUrl } from "./sites";
import { getWorkspaceContext } from "./tenancy";
import { getEntryTicket } from "./unlocks";
import { courseGroup, getCourseUnlocks, inCourse, postCountsBeforeSwitch } from "./courseUnlocks";

// "Your path": the seven days of The Anti-Pete Week as a checklist. The course itself is text in
// Skool; this is the doing. Each step ticks from what the app can see, or from the member's own
// word for things it can't (Skool, Ads Manager, a text). One rule picks the single next step,
// and the calendar never picks, locks or skips anything.

/** After the week: outcomes and optional extras. They tick themselves; none is ever the next step. */
export type PathStep = { key: string; title: string; why: string; lesson: string; href: string; done: boolean; kind?: "optional" | "outcome" };
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
/** The Skool Loop: Skool link clicks and leads (last 30 days), and new customers from the latest check-in. */
export type LoopCounts = { clicks: number; leads: number; customers: number };

/** app: the app saw it. you: the member ticked it. waiting: someone else's turn (a clock). */
export type Tick = "app" | "you" | "waiting" | null;

export type WeekStep = {
  key: string;
  day: number;
  /** Position in its day, and the day's step count: "step 3 of 9". */
  n: number;
  count: number;
  title: string;
  why: string;
  verb: string;
  where: Where;
  /** null: nothing to open (the button hides). */
  href: string | null;
  external: boolean;
  tick: Tick;
  done: boolean;
  canLater: boolean;
  later: boolean;
  selfLabel?: string;
  reviewLabel?: string;
  waitingLabel?: string;
  section?: string;
  win: string;
  proof?: { text: string; href?: string };
  note?: string;
  /** Post steps: each half of "post yours, review the one before". Done needs both. */
  halves?: { posted: boolean; reviewed: boolean };
  /**
   * Post steps while course unlocks are on: the posted half is the pasted link, not a tick.
   * saved: the link that's in (flagged ones wait for the owner). reward: what the link opened.
   */
  /** catchUp: posted only on a pre-switch tick with no link saved. It counts, but the link form still shows (with this line). */
  postLink?: { saved?: { url: string; flagged: boolean; reason: string }; next: string; reward?: string; placeholder: string; catchUp?: string };
};
/** opens: course unlocks only, a quiet line on a day whose lesson opens after an earlier post. Never a lock in the app. */
export type WeekDay = { day: number; title: string; section?: string; steps: WeekStep[]; done: number; total: number; complete: boolean; opens?: string };

type Ws = { id: string; plan: "starter" | "growth" | "owner"; accessSource: string; settings: WorkspaceSettings; createdAt: Date };

/** Workspace day: the day it was made is Day 1. Only the admin table and a few tool hints use it. */
export function launchDay(createdAt: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000) + 1;
}

/** One line of the shelf: a fact the app really has. `have: false` is a kind zero state, never a red mark. */
export type ShelfItem = { key: string; label: string; note: string; have: boolean };
export type Shelf = { items: ShelfItem[]; empty: boolean };

/**
 * What the app can honestly see of the member's week, for Day 7's decision and the week-done card.
 * Facts only. It can't see posts, Gives, likes or whether an ad went live, so it never mentions
 * them. Nothing to copy, no countdown, no projection, no "you'd lose this".
 */
export function buildShelf(f: { kit: boolean; funnel: boolean; pixel: boolean; research: boolean; statics: boolean; adLeads: number; adClicks: number; verdicts: number; aboutVisitors: number | null }): Shelf {
  const items: ShelfItem[] = [
    { key: "kit", label: "Your launch kit", note: f.kit ? "Built" : "Not yet", have: f.kit },
    { key: "funnel", label: "Your website", note: f.funnel ? "Live" : "Not yet", have: f.funnel },
    // Saved, not "connected": only Meta's answer to a test says it works.
    { key: "pixel", label: "Your Meta Pixel", note: f.pixel ? "Saved" : "Not yet", have: f.pixel },
    { key: "research", label: "Your ad research", note: f.research ? "Saved" : "Not yet", have: f.research },
    { key: "statics", label: "Your first 5 ads", note: f.statics ? "Written. The app can't see if they went live" : "Not yet", have: f.statics },
    { key: "leads", label: "Leads from your ads", note: f.adLeads > 0 ? f.adLeads.toLocaleString() : "0 so far. Meta may still be warming up", have: f.adLeads > 0 },
    { key: "clicks", label: "Ad clicks through your Skool link", note: f.adClicks > 0 ? f.adClicks.toLocaleString() : "0 so far. Meta may still be warming up", have: f.adClicks > 0 },
    { key: "verdicts", label: "Ad review verdicts", note: f.verdicts > 0 ? `${f.verdicts.toLocaleString()}, from the numbers you typed` : "None yet", have: f.verdicts > 0 },
    { key: "checkin", label: "Your check-in", note: f.aboutVisitors === null ? "Not yet. Zeros count" : `${f.aboutVisitors.toLocaleString()} About-page visitors, you typed this`, have: f.aboutVisitors !== null },
  ];
  return { items, empty: !items.some((x) => x.have) };
}

export type Path = {
  mode: "week" | "after";
  state: "first" | "doing" | "dayDone" | "weekDone" | "veteran";
  days: WeekDay[];
  /** The one next step. Home, Your path, Penny and the menu dot all read this. */
  current: WeekStep | null;
  dayNow: number;
  waitingOnMeta: boolean;
  laterKeys: string[];
  doneKeys: string[];
  events: { adLead: boolean; adClick: boolean; claim: boolean };
  links: { skoolGroup: string; referral: string; website?: string; ownGroup?: string };
  after: PathStep[];
  stages: PathStage[];
  next: WeekStep | null;
  done: number;
  total: number;
  level: number;
  loop: LoopCounts;
  shelf: Shelf;
  /** Course unlocks apply to this account: each day's lesson in Skool opens after the post before it. */
  courseUnlocks: boolean;
};

/** Your path's intro line. With course unlocks on, Skool's lessons open one post at a time, so it says that. */
export const pathIntro = (path: Pick<Path, "courseUnlocks">): string => (path.courseUnlocks ? JOURNEY_COPY.path.subUnlocks : JOURNEY_COPY.path.sub);

const count = (rows: { n: number }[]) => rows[0]?.n ?? 0;
const DAY = 86_400_000;
const EVENTS_MANAGER = "https://business.facebook.com/events_manager2";
/** Day 2's Page and Instagram: Meta Business Suite is where both are linked. */
const META_BUSINESS = "https://business.facebook.com/";
/** Day 2's "Plan this week's posts": the free Planner in Meta Business Suite (Facebook and Instagram). */
export const META_PLANNER = "https://business.facebook.com/latest/content_calendar";

/** The calendar date in the member's timezone (en-CA prints YYYY-MM-DD). A bad zone falls back to UTC. */
function localDate(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export async function computePath(ws: Ws, userId: string, opts: { entryTicketOn?: boolean; courseUnlocksOn?: boolean; courseUnlocksSince?: string | null; now?: Date } = {}): Promise<Path> {
  const db = await getDb();
  const wid = ws.id;
  const now = opts.now ?? new Date();
  const since30 = new Date(now.getTime() - 30 * DAY);
  const n = sql<number>`count(*)::int`;
  const [kits, research, studio, reviews, carousels, published, skoolSite, clicks, realClicks, leads30, leadsEver, adLeads, checkins, checkinCount, paidCheckins, liveAutomations, myUnlocks, unlockClaimCount, longSequences, agencies, handAdded, firstSite, studioDest, connectors] = await Promise.all([
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "launch_kit"))),
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_research"))),
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_studio"))),
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_review"))),
    // Day 1's "Make your first post": a carousel saved in Make my carousel (one ai_generations row each,
    // kind "carousel", see src/server/carousel/store.ts).
    db.select({ n }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "carousel"))),
    db.select({ n }).from(sites).where(and(eq(sites.workspaceId, wid), eq(sites.published, true))),
    db.select({ n }).from(sites).where(and(eq(sites.workspaceId, wid), sql`${sites.skoolUrl} <> ''`)),
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "skool_visit"), gte(activities.createdAt, since30))),
    // Every source the Skool link has ever counted. A member clicking their own link to try it is a
    // "direct" visit: fine for Day 3's check, but it isn't an ad click.
    db.selectDistinct({ source: sql<string>`${activities.data}->>'source'` }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "skool_visit"), sql`${activities.data}->>'source' is not null`)),
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, wid), eq(activities.type, "lead"), gte(activities.createdAt, since30))),
    // "Sign up on your own website": any opt-in ever logged (a "lead" activity), not contacts in
    // general, since Unlock claims and imports create contacts too. Ad leads are taken off below.
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
    // The member's real website address, for the post layouts and "Open it".
    db.select({ slug: sites.slug, customDomain: sites.customDomain, domainStatus: sites.domainStatus }).from(sites).where(and(eq(sites.workspaceId, wid), eq(sites.published, true))).orderBy(asc(sites.createdAt)).limit(1),
    // Day 3's pack goes to the Skool link. Packs from before destinations were saved have none.
    db
      .select({
        skool: sql<number>`count(*) filter (where ${aiGenerations.input}->>'destination' = 'skool')::int`,
        none: sql<number>`count(*) filter (where ${aiGenerations.input}->>'destination' is null)::int`,
      })
      .from(aiGenerations)
      .where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_studio"))),
    // Day 1's AI step: a connector link (their own Claude) that hasn't been revoked and that Claude has
    // used at least once. A link that was only made isn't a connected Claude.
    db.select({ n }).from(apiTokens).where(and(eq(apiTokens.workspaceId, wid), isNull(apiTokens.revokedAt), isNotNull(apiTokens.lastUsedAt))),
  ]);

  const s = ws.settings;
  const journey: Journey = s.journey ?? {};
  // Ticks saved under steps the week no longer has count for the steps that replaced them (video1, the
  // old Day 2 post, counts for Day 1's carousel and firstpost). Keys with no step now are simply ignored.
  // Then carry-over: a member who posted a day on the old day order (before WEEK_V5_SINCE) has every
  // step of that day and the days before it counted ("carried"), so they land on the first day they
  // haven't posted, not back on Day 1. Carried steps read as the member's word, never as app-seen.
  const ticks = withCarriedTicks(withLegacyTicks(journey.ticks), journey.posts, journey.uncarried);
  const carried = (key: string) => ticks[key]?.as === "carried";
  const laterAt = journey.later ?? {};
  const started = journey.started ?? {};
  const base = `/app/w/${wid}`;
  const last = checkins[0] ?? null;
  // Skool decides the level, not the member's numbers: only what they type from Settings › Growth counts.
  const level = last?.skoolLevel ?? 1;
  const sources = realClicks.map((r) => r.source);
  const adVisited = sources.some(isAdSource);
  const packs = count(studio);
  const dest = studioDest[0] ?? { skool: 0, none: 0 };
  const websiteUrl = firstSite[0] ? siteBaseUrl(firstSite[0]) : undefined;
  const ownGroup = s.skoolUrl || undefined;

  // What the app can see. A "you-upgrades" step turns solid here as soon as the proof arrives.
  const seen: Record<string, boolean> = {
    hello: Boolean(s.entryClaimedAt),
    // A saved key, or their own Claude connected through a connector link it has used. (Only a key lifts the
    // 3-run cap; the connector does the AI work from their chat, at their cost.)
    ai: Boolean(s.aiKeyEnc) || count(connectors) > 0,
    skool: Boolean(s.skoolUrl) || count(skoolSite) > 0,
    kit: count(kits) > 0,
    carousel: count(carousels) > 0,
    publish: count(published) > 0,
    pixel: Boolean(s.metaPixelId),
    research: count(research) > 0,
    statics: packs > 0,
    clicks: count(adLeads) > 0,
    refresh: dest.skool > 0 || (packs >= 2 && dest.none === packs),
    live2: adVisited,
    // A lead from an ad is a stranger, not the member's own sign-up.
    lead1: count(leadsEver) > count(adLeads),
    skoolvisit: sources.length > 0,
    unlock: count(myUnlocks) > 0,
    // The app can't see a text. It can see who they added by hand, or a click tagged ?src=text.
    warm: count(handAdded) > 0 || sources.some((src) => /^text\b/.test(src)),
    review: count(reviews) > 0,
    checkin: Boolean(last),
  };

  const rvOn = reelVaultConfigured();
  const hrefOf = (kind: HrefKind): string | null => {
    switch (kind) {
      case "ai": return `${base}/ai`;
      case "referral": return env.skoolReferralUrl || null;
      case "launch": return `${base}/launch`;
      case "sites": return `${base}/sites`;
      case "settingsTracking": return `${base}/settings#tracking`;
      case "research": return `${base}/ads/research`;
      case "studio": return `${base}/ads/studio`;
      case "studioPlan": return `${base}/ads/studio#plan`;
      case "skool": return env.skoolGroupUrl || null;
      case "ownGroup": return ownGroup ?? null;
      case "website": return websiteUrl ?? `${base}/sites`;
      case "growth": return `${base}/growth`;
      case "events": return EVENTS_MANAGER;
      case "unlocks": return `${base}/unlocks`;
      case "ads": return `${base}/ads`;
      // Only once ReelVault is switched on: without it the step is done by hand (see whyOf).
      case "reelvault": return rvOn ? `${base}/reelvault` : null;
      case "carousel": return `${base}/carousel`;
      case "metaPages": return META_BUSINESS;
      case "metaPlanner": return META_PLANNER;
      case "none": return null;
    }
  };

  const P = JOURNEY_COPY.proof;
  const proofOf: Record<string, WeekStep["proof"]> = {
    kit: { text: P.kit, href: `${base}/launch` },
    publish: websiteUrl ? { text: P.publish, href: websiteUrl } : undefined,
    pixel: { text: pixelStatus(s as TrackingSettings).state === "accepted" ? P.pixelAccepted : P.pixelUntested, href: `${base}/settings#tracking` },
    research: { text: P.research, href: `${base}/ads/research` },
    carousel: seen.carousel ? { text: P.carousel, href: `${base}/carousel` } : undefined,
    statics: { text: P.statics, href: `${base}/ads/studio#plan` },
    lead1: { text: P.lead1, href: `${base}/leads` },
    unlock: { text: P.unlock, href: `${base}/unlocks` },
    review: { text: P.review, href: `${base}/ads` },
  };

  // Course unlocks: the posted half of a day's post is its pasted link (ticked "as link"). A post ticked
  // before the switch went on still counts, so turning it on never moves anyone backwards. Every member
  // account is in the course (manual grants too); only agency workspaces aren't.
  const linkMode = Boolean(opts.courseUnlocksOn) && inCourse(ws);
  const posts = journey.posts ?? {};
  const postedOf = (key: string) =>
    linkMode ? ticks[key]?.as === "link" || carried(key) || postCountsBeforeSwitch(ticks[key], opts.courseUnlocksSince) : Boolean(ticks[key]);

  const tickOf = (def: WeekStepDef): Tick => {
    if (POST_KEYS.includes(def.key)) return postedOf(def.key) && ticks[`${def.key}r`] ? "you" : null;
    // A carried step the app hasn't seen reads as the member's word: it never claims the app saw it.
    if (def.tick === "app") return seen[def.key] ? "app" : carried(def.key) ? "you" : null;
    if (def.tick === "you") return ticks[def.key] ? "you" : null;
    if (seen[def.key]) return "app";
    const t = ticks[def.key];
    if (!t) return null;
    if (t.as === "carried") return "you";
    // The verdicts step only ever takes the member's word as "nothing to judge yet".
    return def.key === "review" || t.as === "waiting" ? "waiting" : "you";
  };

  // Only ever shown already ticked. A member still owing the intro is held on /hello by the gate,
  // and members the gate lets through without it (older accounts, direct buyers) never post one.
  const showHello = Boolean(opts.entryTicketOn) && ws.accessSource === "member" && Boolean(s.entryClaimedAt);
  // Agency workspaces aren't in the community, so there's no Skool post to make.
  const defs = ws.accessSource === "agency" ? WEEK_STEPS.filter((d) => !POST_KEYS.includes(d.key)) : WEEK_STEPS;

  const postLinkOf = (day: number): WeekStep["postLink"] => {
    const p = posts[String(day)];
    const C = JOURNEY_COPY.post;
    const key = `post${day}`;
    // Posted on a tick from before the switch, with no link in: no post record, no Zapier send, so the
    // next lesson in Skool never opened. It keeps counting; the form stays up so the paste can open it.
    const catchUp = !p?.url && ticks[key]?.as !== "link" && postCountsBeforeSwitch(ticks[key], opts.courseUnlocksSince);
    return {
      saved: p?.url ? { url: p.url, flagged: Boolean(p.flagged), reason: p.reason ?? "" } : undefined,
      next: day < WEEK.length ? C.linkNext : C.linkLast,
      reward: DAY_REWARDS[day],
      placeholder: postLinkPlaceholder(courseGroup()),
      ...(catchUp ? { catchUp: fill(day < WEEK.length ? C.linkCatchUp : C.linkCatchUpLast, { day }) } : {}),
    };
  };

  const days: WeekDay[] = WEEK.map((wd) => {
    const list = [...(wd.day === 1 && showHello ? [HELLO_STEP] : []), ...defs.filter((d) => d.day === wd.day)];
    const steps = list.map((def, i): WeekStep => {
      const isPost = POST_KEYS.includes(def.key);
      const tick = tickOf(def);
      const href = def.key === "hello" ? `${base}/hello` : hrefOf(def.hrefKind);
      return {
        key: def.key,
        day: wd.day,
        n: i + 1,
        count: list.length,
        title: def.title,
        why: isPost && linkMode ? `${def.why} ${JOURNEY_COPY.post.linkWhy}` : def.hrefKind === "reelvault" && !rvOn ? JOURNEY_COPY.hero.reelVaultOff : def.why,
        verb: def.verb,
        where: def.where,
        href,
        external: href ? /^https?:/.test(href) : false,
        tick,
        done: tick !== null,
        canLater: def.canLater,
        later: def.canLater && tick === null && Boolean(laterAt[def.key]),
        selfLabel: def.selfLabel,
        reviewLabel: def.reviewLabel,
        waitingLabel: def.waitingLabel,
        section: isPost ? wd.section : undefined,
        // A word-only tick never claims what the app didn't see: Day 6's clock, and Day 1's AI step without a key.
        win:
          def.key === "review" && tick === "waiting"
            ? REVIEW_WAITING_WIN
            : tick === "you" && carried(def.key)
              ? CARRIED_WIN
            : def.key === "ai" && tick === "you"
              ? AI_RUNS_WIN
              : def.key === "ai" && tick === "app" && !s.aiKeyEnc
                ? AI_CONNECTOR_WIN
                : def.win,
        proof: proofOf[def.key],
        note: def.note,
        halves: isPost ? { posted: postedOf(def.key), reviewed: Boolean(ticks[`${def.key}r`]) } : undefined,
        postLink: isPost && linkMode ? postLinkOf(wd.day) : undefined,
      };
    });
    const done = steps.filter((x) => x.done).length;
    return { day: wd.day, title: wd.title, section: wd.section, steps, done, total: steps.length, complete: done === steps.length };
  });

  // The one next step: the first open step of the earliest day that still has one. A step saved
  // for later waits until it's the only one left in its day, and never lets the next day jump it.
  let firstOpen: WeekStep | null = null;
  for (const d of days) {
    const open = d.steps.filter((x) => !x.done);
    if (open.length) {
      firstOpen = open.find((x) => !x.later) ?? open[0];
      break;
    }
  }

  // Course unlocks: each day's lesson in Skool opens after the post before it. A quiet line on the
  // days after the first post still to paste. The app's own tools stay open whatever the line says.
  if (linkMode) {
    const firstUnposted = days.find((d) => d.steps.some((x) => POST_KEYS.includes(x.key) && !x.halves?.posted));
    if (firstUnposted) {
      for (const d of days) {
        if (d.day <= firstUnposted.day) continue;
        d.opens = d.day === firstUnposted.day + 1 && firstOpen?.day === firstUnposted.day ? JOURNEY_COPY.post.opensToday : fill(JOURNEY_COPY.post.opensAfter, { day: d.day - 1 });
      }
    }
  }

  const all = days.flatMap((d) => d.steps);
  const weekSteps = all.filter((x) => x.key !== "hello");
  const tickKeysOf = (day: number) => days[day - 1].steps.flatMap((x) => (POST_KEYS.includes(x.key) ? [x.key, `${x.key}r`] : [x.key]));
  // Only what the member did counts as starting a day. App-seen proof often predates the day
  // (an ad lead from Day 2's ads, a Skool click from Day 3's), so it must not skip the done-for-today card.
  const touched = (day: number) => Boolean(started[String(day)]) || tickKeysOf(day).some((k) => ticks[k] || laterAt[k]);
  const lastTickAt = (day: number) =>
    tickKeysOf(day)
      .map((k) => ticks[k]?.at)
      .filter((at): at is string => Boolean(at))
      .sort()
      .at(-1);
  const tz = s.timezone || "UTC";
  const prevAt = firstOpen && firstOpen.day > 1 ? lastTickAt(firstOpen.day - 1) : undefined;
  // "Done for today": yesterday's day finished today, and the next day not begun. It asks for
  // nothing and blocks nothing: "Start Day N now" and tomorrow's date both move on.
  const dayDone = Boolean(firstOpen && firstOpen.day > 1 && !touched(firstOpen.day) && prevAt && localDate(new Date(prevAt), tz) === localDate(now, tz));
  const veteran = !s.journey && ws.createdAt.getTime() < JOURNEY_SINCE.getTime() - 8 * DAY;
  const state: Path["state"] = veteran ? "veteran" : !firstOpen ? "weekDone" : dayDone ? "dayDone" : weekSteps.some((x) => x.done) ? "doing" : "first";
  // An account older than the checklist owes nothing, so nothing is "next" for it.
  const current = veteran ? null : firstOpen;
  const clicksTick = all.find((x) => x.key === "clicks")?.tick;

  const growthPlan = hasFeature(ws.plan, "automations");
  const season2: PathStep[] = [
    { key: "l2", title: "Reach Level 2", why: "100 About-page visitors, 1 new customer and paid pricing. Then Skool can start running 6 ads for you.", lesson: "Season 2", href: `${base}/growth`, done: level >= 2, kind: "outcome" },
    // Counted from the check-in (Skool's Growth tab). Reaching Level 2 also means one landed.
    { key: "customer", title: "Land your first paying member", why: "Level 2 needs one new customer. They're usually in your phone, not your ads. Ticks at your check-in.", lesson: "Season 2", href: `${base}/leads`, done: count(paidCheckins) > 0 || level >= 2, kind: "outcome" },
    { key: "claim1", title: "Get your first Unlock claim", why: "Someone in your group posted something real. Thank them by name.", lesson: "Season 2", href: `${base}/unlocks`, done: count(unlockClaimCount) > 0, kind: "outcome" },
    { key: "email4", title: "Add email 4", why: "One more email, for the people who said not yet.", lesson: "Season 2", href: `${base}/emails`, done: longSequences.length > 0 },
    // Hidden, not locked, on a plan without automations.
    ...(growthPlan
      ? [{ key: "automations", title: "Switch on your lead follow-ups", why: "New leads get a hello and hot ones get flagged to you, all by themselves.", lesson: "Season 2", href: `${base}/automations`, done: count(liveAutomations) > 0, kind: "optional" as const }]
      : []),
    { key: "weeks", title: "Do four weekly check-ins", why: "Once a week, any day. Four and it's a habit, not a heroic effort.", lesson: "Season 2", href: `${base}/growth`, done: count(checkinCount) >= 4 },
    { key: "bio", title: "Put your Skool link in your bios", why: "The laziest requirement you'll ever meet: your skool.com link in your bio (Instagram, TikTok or YouTube).", lesson: "Season 2", href: `${base}/growth`, done: Boolean(last?.linkInBio) },
    { key: "visitors", title: "Reach 3,000 About-page visitors", why: "Last 30 days, so pace matters. Base camp is $30 to $50 a day, and only once members pay for it. The rest comes from Skool's side, if it comes.", lesson: "Season 2", href: `${base}/growth`, done: (last?.aboutVisitors ?? 0) >= 3000 || level >= 3, kind: "outcome" },
    { key: "network", title: "Earn 10 Skool Network sign-ups", why: "People Skool sends you. Hellos and real replies on Skool earn them.", lesson: "Season 2", href: `${base}/growth`, done: (last?.networkSignups ?? 0) >= 10 || level >= 3, kind: "outcome" },
    { key: "l3", title: "Reach Level 3", why: "Upload your own ads. Skool spends up to $1,000 a day on them.", lesson: "Season 2", href: `${base}/growth`, done: level >= 3, kind: "outcome" },
    { key: "l4", title: "Reach Level 4", why: "Partnership ads, up to about $10,000 a day of Skool's money.", lesson: "Season 2", href: `${base}/growth`, done: level >= 4, kind: "outcome" },
  ];
  // Last on purpose, and optional: wait until someone asks to buy it.
  const second: PathStep[] = [{ key: "agency", title: "Grow into an agency or software (optional)", why: "Your brand, your domain, your markup, once someone asks to buy it.", lesson: "Bonus", href: "/app/agency/new", done: count(agencies) > 0, kind: "optional" }];

  const stages: PathStage[] = [
    ...days.map((d) => ({
      key: `day${d.day}`,
      tag: `Day ${d.day}`,
      title: d.title,
      steps: d.steps.map((x): PathStep => ({ key: x.key, title: x.title, why: x.why, lesson: `Day ${d.day}`, href: x.href ?? base, done: x.done })),
    })),
    { key: "season2", tag: "Season 2", title: "After your free week", steps: season2 },
    { key: "second", tag: "Bonus", title: "Agency or software", steps: second },
  ];

  const shelf = buildShelf({
    kit: seen.kit,
    funnel: seen.publish,
    pixel: seen.pixel,
    research: seen.research,
    statics: seen.statics,
    adLeads: count(adLeads),
    adClicks: await skoolAdVisits(wid, 30),
    verdicts: count(reviews),
    aboutVisitors: last?.aboutVisitors ?? null,
  });

  return {
    mode: state === "weekDone" || state === "veteran" ? "after" : "week",
    state,
    days,
    current,
    dayNow: firstOpen?.day ?? 7,
    waitingOnMeta: clicksTick === "you" && count(adLeads) === 0 && !adVisited && !journey.metaOk,
    laterKeys: all.filter((x) => x.later).map((x) => x.key),
    doneKeys: all.filter((x) => x.done).map((x) => x.key),
    events: { adLead: count(adLeads) > 0, adClick: adVisited, claim: count(unlockClaimCount) > 0 },
    links: { skoolGroup: env.skoolGroupUrl, referral: env.skoolReferralUrl, website: websiteUrl, ownGroup },
    after: [...season2, ...second],
    stages,
    next: current,
    done: all.filter((x) => x.done).length,
    total: all.length,
    level,
    loop: { clicks: count(clicks), leads: count(leads30), customers: last?.newPaid ?? 0 },
    shelf,
    courseUnlocks: linkMode,
  };
}

/**
 * The path for this request. Primitive arguments, so the layout, the page and Penny's snapshot
 * share one computation per request.
 */
export const loadPath = cache(async (wid: string, userId: string) => {
  const { workspace } = await getWorkspaceContext(wid);
  const [ticket, course] = await Promise.all([getEntryTicket(), getCourseUnlocks()]);
  return computePath(workspace, userId, { entryTicketOn: Boolean(ticket?.on), courseUnlocksOn: course.on, courseUnlocksSince: course.since });
});
