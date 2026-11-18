import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { activities, aiGenerations, contacts, sites } from "@/lib/db/schema";
import type { Journey } from "@/lib/db/types";
import { AI_RUNS_WIN, HALF_TIME, JOURNEY_COPY, JOURNEY_SINCE, POST_KEYS, postFor, SELF_TICK_KEYS, stepDef, WEEK_STEPS, WEEK_V5_SINCE, withLegacyTicks } from "@/lib/week";
import { snapshotFromPath } from "@/server/companion";
import { createConnectorToken, resolveConnectorToken } from "@/server/connectors";
import { computePath, launchDay, META_PLANNER } from "@/server/path";
import { makeWorkspace } from "./helpers";

// The week engine: one next step, picked by unfinished work and never by the calendar.

const DAY = 86_400_000;
const at = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
type W = Awaited<ReturnType<typeof makeWorkspace>>["ws"];
const withSettings = (ws: W, extra: Record<string, unknown>) => ({ ...ws, settings: { ...ws.settings, ...extra } });
const journey = (ws: W, j: Journey, extra: Record<string, unknown> = {}) => withSettings(ws, { journey: j, ...extra });
const DAY1_SETTINGS = { aiKeyEnc: "x", metaPixelId: "1234567890" };

/** The app steps of Days 1 and 2, on real data: a carousel, kit, website, research and a website pack. The Pixel and key live in settings. */
async function day1Data(workspaceId: string, opts: { skip?: string[] } = {}) {
  const db = await getDb();
  const skip = new Set(opts.skip);
  if (!skip.has("carousel")) await db.insert(aiGenerations).values({ workspaceId, kind: "carousel", model: "rules" });
  if (!skip.has("kit")) await db.insert(aiGenerations).values({ workspaceId, kind: "launch_kit", model: "rules" });
  if (!skip.has("research")) await db.insert(aiGenerations).values({ workspaceId, kind: "ad_research", model: "rules" });
  if (!skip.has("statics")) await db.insert(aiGenerations).values({ workspaceId, kind: "ad_studio", model: "rules", input: { destination: "website" } });
  if (!skip.has("publish")) await db.insert(sites).values({ workspaceId, name: "Funnel", slug: `funnel-week-${workspaceId}`, theme: {} as never, published: true });
}
/** Day 1's word-only ticks: the script from ReelVault, the Instagram post and the Skool post. */
const day1Ticks = (when: string) => ({ reel1: { at: when }, firstpost: { at: when }, post1: { at: when }, post1r: { at: when } });
/** Day 2's word-only ticks: the Page, Publish, this week's posts and the Skool post. */
const day2Ticks = (when: string) => ({ pages: { at: when }, clicks: { at: when }, planweek: { at: when }, post2: { at: when }, post2r: { at: when } });

describe("the week engine", () => {
  it("counts the day the workspace was made as Day 1 (the admin table still uses it)", () => {
    const now = new Date("2026-11-09T12:00:00Z");
    expect(launchDay(now, now)).toBe(1);
    expect(launchDay(new Date(now.getTime() - DAY + 1000), now)).toBe(1);
    expect(launchDay(new Date(now.getTime() - DAY), now)).toBe(2);
  });

  it("starts a new workspace on connecting Claude, with the free key as the fallback", async () => {
    const { ws, user } = await makeWorkspace();
    const fresh = await computePath(withSettings(ws, { skoolUrl: "" }), user.id);
    expect(fresh.current).toMatchObject({ key: "ai", day: 1, n: 1, count: 7, title: "Connect your Claude", tick: null });
    expect(fresh.state).toBe("first");
    expect(fresh.mode).toBe("week");
    // The helper's Skool link already counts (Day 1's fifth step), so that account is past "first".
    const p = await computePath(ws, user.id);
    expect(p.current).toMatchObject({ key: "ai", day: 1, n: 1, count: 7, title: "Connect your Claude", verb: "Connect my Claude", href: `/app/w/${ws.id}/ai`, external: false, tick: null });
    // One sentence on why, then the free Gemini key as the second way, never the first.
    expect(p.current!.why).toBe("Claude writes your carousel, your website and your emails, and saves them straight into the app. No Claude? A free Gemini key works too.");
    expect(p.current!.why.indexOf("Claude")).toBeLessThan(p.current!.why.indexOf("Gemini"));
    expect(p.current!.selfLabel).toBe("I'll use my 3 included runs");
    expect(p.state).toBe("doing");
    expect(p.days.map((d) => d.total)).toEqual([7, 8, 6, 4, 2, 2, 3]);
    expect(p.total).toBe(32);
  });

  it("keeps a member on Day 1 however old the account is, with nothing locked", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath({ ...ws, createdAt: new Date(Date.now() - 4.5 * DAY) }, user.id);
    expect(p.current).toMatchObject({ key: "ai", day: 1 });
    expect(p.dayNow).toBe(1);
    for (const s of p.days.flatMap((d) => d.steps)) expect(s, s.key).not.toHaveProperty("locked");
    for (const s of p.stages.flatMap((st) => st.steps)) expect(s, s.key).not.toHaveProperty("locked");
    expect(JSON.stringify(p)).not.toMatch(/Opens Day/);
  });

  it("ends Day 1 with a done-for-today state, then opens Day 2 on Start or on a later date", async () => {
    const { ws, user } = await makeWorkspace();
    await day1Data(ws.id);
    const today = await computePath(journey(ws, { ticks: day1Ticks(at()) }, DAY1_SETTINGS), user.id);
    expect(today.days[0].complete).toBe(true);
    expect(today.state).toBe("dayDone");
    expect(today.current?.key).toBe("pages");
    expect(snapshotFromPath(today).state).toBe("dayDone");

    const started = await computePath(journey(ws, { ticks: day1Ticks(at()), started: { "2": at() } }, DAY1_SETTINGS), user.id);
    expect(started.state).toBe("doing");
    expect(started.current?.key).toBe("pages");

    const yesterday = await computePath(journey(ws, { ticks: day1Ticks(at(26 * 3600_000)) }, DAY1_SETTINGS), user.id);
    expect(yesterday.state).toBe("doing");
    expect(yesterday.current).toMatchObject({ key: "pages", day: 2, n: 1, count: 8 });
  });

  it("uses the member's own timezone for 'today', and falls back to UTC", async () => {
    const { ws, user } = await makeWorkspace();
    await day1Data(ws.id);
    const now = new Date("2026-11-20T23:30:00Z"); // still the 20th in UTC, already the 21st in Sydney
    const ticked = "2026-11-20T10:00:00Z";
    const utc = await computePath(journey(ws, { ticks: day1Ticks(ticked) }, DAY1_SETTINGS), user.id, { now });
    expect(utc.state).toBe("dayDone");
    const sydney = await computePath(journey(ws, { ticks: day1Ticks(ticked) }, { ...DAY1_SETTINGS, timezone: "Australia/Sydney" }), user.id, { now });
    expect(sydney.state).toBe("doing");
    const broken = await computePath(journey(ws, { ticks: day1Ticks(ticked) }, { ...DAY1_SETTINGS, timezone: "Not/AZone" }), user.id, { now });
    expect(broken.state).toBe("dayDone");
  });

  it("still ends Day 2 with done-for-today when Day 3's app-seen proof came from the ads", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    await day1Data(ws.id);
    await db.insert(aiGenerations).values({ workspaceId: ws.id, kind: "ad_studio", model: "rules", input: { destination: "skool" } });
    // A stranger from a Day 2 ad, and a click on the Skool link from a Day 3 ad.
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: { utm: { fbclid: "ad-lead" } } });
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "meta-ad" } });
    const ticks = { ...day1Ticks(at(50 * 3600_000)), ...day2Ticks(at()) };
    const p = await computePath(journey(ws, { ticks }, DAY1_SETTINGS), user.id);
    expect(p.days[1].complete).toBe(true);
    expect(p.state).toBe("dayDone");
    expect(p.dayNow).toBe(3);
    // The ad lead isn't the member's own sign-up, so Day 3 still starts there.
    // Day 3's pack and campaign are already seen, from the Skool-link pack and the ad click.
    expect(p.days[2].steps.find((s) => s.key === "refresh")).toMatchObject({ done: true, tick: "app" });
    expect(p.days[2].steps.find((s) => s.key === "live2")).toMatchObject({ done: true, tick: "app" });
    expect(p.days[2].steps.find((s) => s.key === "lead1")).toMatchObject({ done: false, tick: null });
    expect(p.current?.key).toBe("lead1");
    expect((await computePath(journey(ws, { ticks, started: { "3": at() } }, DAY1_SETTINGS), user.id)).state).toBe("doing");
    // The member's own sign-up has no ad click id, and ticks it.
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: { utm: {} } });
    expect((await computePath(journey(ws, { ticks }, DAY1_SETTINGS), user.id)).days[2].steps.find((s) => s.key === "lead1")?.tick).toBe("app");
  });

  it("skips a saved-for-later step until it's the only one left in its day, and never jumps it into Day 2", async () => {
    const { ws, user } = await makeWorkspace();
    await day1Data(ws.id, { skip: ["kit"] });
    const later = { ai: at() };
    const p = await computePath(journey(ws, { later }), user.id);
    expect(p.days[0].steps.find((s) => s.key === "ai")).toMatchObject({ later: true, done: false });
    expect(p.current?.key).toBe("reel1");
    expect((await computePath(journey(ws, { later, ticks: { reel1: { at: at() }, firstpost: { at: at() } } }), user.id)).current?.key).toBe("kit");
    expect(p.laterKeys).toEqual(["ai"]);

    await (await getDb()).insert(aiGenerations).values({ workspaceId: ws.id, kind: "launch_kit", model: "rules" });
    const last = await computePath(journey(ws, { later, ticks: day1Ticks(at()) }), user.id);
    // Everything else in Day 1 is done: the saved step is next, not Day 2.
    expect(last.current).toMatchObject({ key: "ai", day: 1, later: true });
    expect(last.state).toBe("doing");

    // Day 2 works the same way: a saved Pixel waits behind the rest of Day 2.
    const pixel = await computePath(journey(ws, { later: { pixel: at() }, ticks: { ...day1Ticks(at(2 * DAY)), pages: { at: at() } } }, { aiKeyEnc: "x" }), user.id);
    expect(pixel.days[1].steps.find((s) => s.key === "pixel")).toMatchObject({ later: true, done: false });
    expect(pixel.current?.key).toBe("clicks");
  });

  it("refuses 'later' on the steps that make the day", () => {
    const can = WEEK_STEPS.filter((s) => s.canLater).map((s) => s.key);
    // Day 1's whole point is the first post: finding the reel, making it and posting it can't wait.
    for (const k of ["reel1", "carousel", "firstpost", "skool", "kit", "publish", "pages", "statics", "clicks", "checkin", ...POST_KEYS]) expect(can, k).not.toContain(k);
    expect(can).toContain("ai");
    expect(can).toContain("pixel");
    expect(can).toContain("planweek");
  });

  it("turns the 'I pressed Publish' tick solid at the first lead from an ad, and stops waiting on Meta", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    const ticked = journey(ws, { ticks: { clicks: { at: at() } } });
    const before = await computePath(ticked, user.id);
    expect(before.days[1].steps.find((s) => s.key === "clicks")).toMatchObject({ tick: "you", done: true });
    expect(before.waitingOnMeta).toBe(true);
    // Your own test sign-up and your own click don't count.
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: { utm: {} } });
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "direct" } });
    expect((await computePath(ticked, user.id)).waitingOnMeta).toBe(true);

    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: { utm: { fbclid: "abc123" } } });
    const after = await computePath(ticked, user.id);
    expect(after.days[1].steps.find((s) => s.key === "clicks")?.tick).toBe("app");
    expect(after.waitingOnMeta).toBe(false);
    expect(after.events.adLead).toBe(true);
    // "They're live" also ends the wait, without a lead.
    expect((await computePath(journey(ws, { ticks: { clicks: { at: at() } }, metaOk: at() }), user.id)).waitingOnMeta).toBe(false);
  });

  it("lets 'None at 1,000 yet' finish Day 6 as a clock, and a real verdict turns it solid", async () => {
    const { ws, user } = await makeWorkspace();
    const j = { ticks: { review: { at: at(), as: "waiting" as const }, post6: { at: at() }, post6r: { at: at() } } };
    const p = await computePath(journey(ws, j), user.id);
    const day6 = p.days[5];
    expect(day6.steps.find((s) => s.key === "review")).toMatchObject({ tick: "waiting", done: true, win: "Your numbers need more time. That's normal this early." });
    expect(day6.complete).toBe(true);
    await (await getDb()).insert(aiGenerations).values({ workspaceId: ws.id, kind: "ad_review", model: "rules" });
    expect((await computePath(journey(ws, j), user.id)).days[5].steps.find((s) => s.key === "review")?.tick).toBe("app");
  });

  it("needs both halves of a post: yours and the review of the one before", async () => {
    const { ws, user } = await makeWorkspace();
    // Ticked on this day order (after it shipped), so nothing carries over from the old one.
    const v5 = new Date(Math.max(Date.now(), WEEK_V5_SINCE.getTime() + 3_600_000)).toISOString();
    const half = await computePath(journey(ws, { ticks: { post1: { at: v5 } } }), user.id);
    expect(half.days[0].steps.find((s) => s.key === "post1")).toMatchObject({ done: false, halves: { posted: true, reviewed: false }, section: "Day 1: My First Post" });
    const both = await computePath(journey(ws, { ticks: { post1: { at: v5 }, post1r: { at: v5 } } }), user.id);
    expect(both.days[0].steps.find((s) => s.key === "post1")).toMatchObject({ done: true, tick: "you" });
  });

  it("has no Skool posts for an agency workspace", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath({ ...ws, accessSource: "agency" }, user.id);
    const keys = p.days.flatMap((d) => d.steps.map((s) => s.key));
    for (const k of POST_KEYS) expect(keys).not.toContain(k);
    expect(p.total).toBe(25);
  });

  it("adds the intro post to Day 1 only when the entry ticket is on, already ticked", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath(withSettings(ws, { entryClaimedAt: at() }), user.id, { entryTicketOn: true });
    expect(p.days[0].steps[0]).toMatchObject({ key: "hello", tick: "app", n: 1, count: 8 });
    expect(p.total).toBe(33);
    expect(p.current).toMatchObject({ key: "ai", n: 2, count: 8 });
    // Only the intro done still counts as a first visit.
    expect((await computePath(withSettings(ws, { entryClaimedAt: at(), skoolUrl: "" }), user.id, { entryTicketOn: true })).state).toBe("first");
  });

  it("never shows the intro post to a member the gate let in without one", async () => {
    // Older accounts and direct buyers skip the intro, so an open "hello" would never tick.
    const { ws, user } = await makeWorkspace();
    const p = await computePath({ ...ws, accessSource: "member" }, user.id, { entryTicketOn: true });
    expect(p.days[0].steps.map((s) => s.key)).not.toContain("hello");
    expect(p.total).toBe(32);
    expect(p.current).toMatchObject({ key: "ai", n: 1, count: 7 });
  });

  it("gives an account older than the checklist the numbers dashboard, and nothing owed", async () => {
    const { ws, user } = await makeWorkspace();
    const old = { ...ws, createdAt: new Date(JOURNEY_SINCE.getTime() - 9 * DAY) };
    const p = await computePath(old, user.id);
    expect(p).toMatchObject({ state: "veteran", mode: "after", current: null, next: null });
    // "Start the checklist anyway" creates the journey key, and the week is back.
    const back = await computePath(journey(old, { started: { "1": at() } }), user.id);
    expect(back).toMatchObject({ state: "doing", mode: "week" });
    expect(back.current?.key).toBe("ai");
    // Made in the week before the checklist: still gets the week.
    expect((await computePath({ ...ws, createdAt: new Date(JOURNEY_SINCE.getTime() - 7 * DAY) }, user.id)).mode).toBe("week");
  });

  it("finishes the week when every step is done, and Penny reads the same current step throughout", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    await day1Data(ws.id);
    await db.insert(aiGenerations).values({ workspaceId: ws.id, kind: "ad_studio", model: "rules", input: { destination: "skool" } });
    await db.insert(aiGenerations).values({ workspaceId: ws.id, kind: "ad_review", model: "rules" });
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: {} });
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "meta-ad" } });
    await db.insert(contacts).values({ workspaceId: ws.id, email: `mum-${Date.now()}@example.com`, source: "manual" });
    const { createUnlock } = await import("@/server/unlocks");
    const { saveCheckin } = await import("@/server/growth");
    await createUnlock(ws.id, { title: "Hook Vault", reward: "100 hooks", rewardUrl: "https://docs.example.com/hooks", action: "comment", instructions: "Comment your niche.", skoolPostUrl: "", zapierWebhookUrl: "" });
    await saveCheckin(ws.id, { aboutVisitors: 0, newPaid: 0, networkSignups: 0, linkInBio: false, skoolLevel: 1 });
    // Everything the app can see is real. Walk the week by ticking whatever is next, two days ago
    // (so no day pauses on "done for today"): Penny's snapshot names the big card's step every time.
    const ticks: NonNullable<Journey["ticks"]> = {};
    const walked: string[] = [];
    let p = await computePath(journey(ws, { ticks }, DAY1_SETTINGS), user.id);
    while (p.current && walked.length < 40) {
      expect(snapshotFromPath(p).current?.key).toBe(p.current.key);
      const k = p.current.key;
      walked.push(k);
      ticks[k] = { at: at(2 * DAY) };
      if (POST_KEYS.includes(k)) ticks[`${k}r`] = { at: at(2 * DAY) };
      p = await computePath(journey(ws, { ticks: { ...ticks } }, DAY1_SETTINGS), user.id);
    }
    // Only what the app can't see needs the member's word, and every day ends on its post
    // (Day 3's Publish is seen by the app here, from the click on the Skool link).
    expect(walked).toEqual(["reel1", "firstpost", "post1", "pages", "clicks", "planweek", "post2", "events", "post3", "welcome", "lesson", "post4", "post5", "post6", "decide", "post7"]);
    expect(p.state).toBe("weekDone");
    expect(p.mode).toBe("after");
    expect(p.done).toBe(p.total);
    expect(snapshotFromPath(p).current).toBeNull();
  });
});

describe("each step ticks from what the app can really see", () => {
  const step = async (ws: Parameters<typeof computePath>[0], userId: string, key: string) =>
    (await computePath(ws, userId)).days.flatMap((d) => d.steps).find((s) => s.key === key);

  it("the AI step ticks at a saved key or a connected Claude, and only a key says a key is saved", async () => {
    const { ws, user } = await makeWorkspace();
    expect((await step(ws, user.id, "ai"))?.done).toBe(false);
    expect((await step(withSettings(ws, { aiKeyEnc: "x" }), user.id, "ai"))?.tick).toBe("app");
    const { token } = await createConnectorToken(ws.id, user.id, "Claude");
    // A link that was only made isn't a connected Claude yet.
    expect((await step(ws, user.id, "ai"))?.done).toBe(false);
    await resolveConnectorToken(token);
    const connected = await step(ws, user.id, "ai");
    expect(connected).toMatchObject({ done: true, tick: "app" });
    expect(connected?.win).not.toContain("key is saved");
    expect(connected?.win).toContain("Claude is connected");
  });

  it("lets a member with no free key go on with the included runs, without saying a key is saved", async () => {
    const { ws, user } = await makeWorkspace();
    const ticked = journey(ws, { ticks: { ai: { at: at() } } });
    const own = await step(ticked, user.id, "ai");
    expect(own).toMatchObject({ tick: "you", done: true, selfLabel: "I'll use my 3 included runs", win: AI_RUNS_WIN });
    expect(own?.win).not.toContain("key is saved");
    // A key saved later turns it solid, with the key's own win.
    expect(await step(withSettings(ticked, { aiKeyEnc: "x" }), user.id, "ai")).toMatchObject({ tick: "app", win: "Done: your AI key is saved. No more counting runs." });
  });

  it("Day 3's pack ticks at a pack made for the Skool link, or two older packs with no destination saved", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    await db.insert(aiGenerations).values({ workspaceId: ws.id, kind: "ad_studio", model: "rules", input: { destination: "website" } });
    expect((await step(ws, user.id, "statics"))?.done).toBe(true);
    expect((await step(ws, user.id, "refresh"))?.done).toBe(false);
    await db.insert(aiGenerations).values({ workspaceId: ws.id, kind: "ad_studio", model: "rules", input: { destination: "skool" } });
    expect((await step(ws, user.id, "refresh"))?.done).toBe(true);

    const legacy = await makeWorkspace();
    await db.insert(aiGenerations).values({ workspaceId: legacy.ws.id, kind: "ad_studio", model: "rules" });
    expect((await step(legacy.ws, legacy.user.id, "refresh"))?.done).toBe(false);
    await db.insert(aiGenerations).values({ workspaceId: legacy.ws.id, kind: "ad_studio", model: "rules" });
    expect((await step(legacy.ws, legacy.user.id, "refresh"))?.done).toBe(true);
  });

  it("Day 3's campaign tick turns solid at an ad click on the Skool link, never your own click", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "direct" } });
    expect((await step(ws, user.id, "live2"))?.tick).toBeNull();
    // Your own click does tick Day 3's "click your own Skool link once".
    expect((await step(ws, user.id, "skoolvisit"))?.tick).toBe("app");
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "meta-ad" } });
    expect((await step(ws, user.id, "live2"))?.tick).toBe("app");
  });

  it("Day 3's own sign-up ticks at any opt-in ever, and opens the member's real website", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    expect(await step(ws, user.id, "lead1")).toMatchObject({ href: `/app/w/${ws.id}/sites`, done: false });
    await db.insert(sites).values({ workspaceId: ws.id, name: "Funnel", slug: `funnel-own-${ws.id}`, theme: {} as never, published: true });
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: {}, createdAt: new Date(Date.now() - 90 * DAY) });
    const s = await step(ws, user.id, "lead1");
    expect(s).toMatchObject({ done: true, external: true });
    expect(s?.href).toContain(`funnel-own-${ws.id}`);
  });

  it("Day 5 ticks at a contact added by hand or a ?src=text click, not an ordinary sign-up", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    await db.insert(contacts).values({ workspaceId: ws.id, email: `form-${Date.now()}@example.com`, source: "landing_page" });
    expect((await step(ws, user.id, "warm"))?.done).toBe(false);
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "text" } });
    expect((await step(ws, user.id, "warm"))?.tick).toBe("app");

    const other = await makeWorkspace();
    await db.insert(contacts).values({ workspaceId: other.ws.id, email: `mum-${Date.now()}@example.com`, source: "manual" });
    expect((await step(other.ws, other.user.id, "warm"))?.tick).toBe("app");
  });

  it("the Pixel step says saved, and only says Meta accepted it after a real test", async () => {
    const { ws, user } = await makeWorkspace();
    const saved = await step(withSettings(ws, { metaPixelId: "123456789012345" }), user.id, "pixel");
    expect(saved).toMatchObject({ tick: "app", win: "Done: your Pixel is saved.", proof: { text: "Not tested with Meta yet" } });
    const tested = await step(withSettings(ws, { metaPixelId: "123456789012345", metaCapiTokenEnc: "x", metaPixelCheck: { ok: true, at: at(), pixelId: "123456789012345" } }), user.id, "pixel");
    expect(tested?.proof?.text).toBe("Meta accepted a test event");
    expect(JSON.stringify(saved)).not.toMatch(/connected|working/i);
  });
});

describe("Day 1 is the first win, Day 2 the shop window and the ads", () => {
  const step = async (ws: Parameters<typeof computePath>[0], userId: string, key: string) =>
    (await computePath(ws, userId)).days.flatMap((d) => d.steps).find((s) => s.key === key);

  it("puts content first on Day 1 and the website at Day 2's half-time, in the course's words", () => {
    const keys = (day: number) => WEEK_STEPS.filter((s) => s.day === day).map((s) => s.key);
    expect(keys(1)).toEqual(["ai", "reel1", "carousel", "firstpost", "skool", "kit", "post1"]);
    expect(keys(2)).toEqual(["pages", "publish", "pixel", "research", "statics", "clicks", "planweek", "post2"]);
    for (const k of ["rivals", "video1"]) expect(stepDef(k), k).toBeUndefined();
    expect(HALF_TIME).toEqual({ day: 2, after: "publish" });
    expect(stepDef("reel1")).toMatchObject({ title: "Find what already works in your niche", where: "app", hrefKind: "reelvault", tick: "you", canLater: false });
    expect(stepDef("carousel")).toMatchObject({ title: "Make your first post", verb: "Make my carousel", where: "app", hrefKind: "carousel", tick: "you-upgrades", canLater: false });
    expect(stepDef("firstpost")).toMatchObject({ title: "Post it on Instagram", where: "phone", hrefKind: "none", tick: "you", canLater: false });
    expect(stepDef("planweek")).toMatchObject({ title: "Plan this week's posts in one sitting", where: "meta", hrefKind: "metaPlanner", tick: "you", canLater: true });
    expect(stepDef("kit")!.why).toMatch(/^AI writes your Skool About page and your group description, then makes your cover/);
    // The Instagram and Planner ticks are the member's word; the carousel turns solid by itself.
    for (const k of ["reel1", "carousel", "firstpost", "planweek"]) expect(SELF_TICK_KEYS, k).toContain(k);
    expect(postFor(1)).not.toContain("My website");
    expect(postFor(1, undefined, "https://www.skool.com/the-45-minute-dad")).toContain("My group: https://www.skool.com/the-45-minute-dad");
    expect(postFor(2, "https://dads.example.com")).toContain("My website: https://dads.example.com");
    for (const d of [1, 2]) expect(postFor(d), `Day ${d}`).not.toMatch(/\{(website|group)\}/);
  });

  it("opens Make my carousel and Meta's free Planner, and ReelVault only when it's switched on", async () => {
    const { ws, user } = await makeWorkspace();
    expect(await step(ws, user.id, "carousel")).toMatchObject({ href: `/app/w/${ws.id}/carousel`, external: false });
    expect(await step(ws, user.id, "planweek")).toMatchObject({ href: "https://business.facebook.com/latest/content_calendar", external: true });
    expect(META_PLANNER).toBe("https://business.facebook.com/latest/content_calendar");
    const { env } = await import("@/lib/env");
    const secret = env.onexSsoSecret;
    try {
      env.onexSsoSecret = "";
      // No ReelVault here: the same job by hand, on Instagram, and no button to a page that isn't there.
      expect(await step(ws, user.id, "reel1")).toMatchObject({ href: null, why: JOURNEY_COPY.hero.reelVaultOff });
      env.onexSsoSecret = "x".repeat(40);
      expect(await step(ws, user.id, "reel1")).toMatchObject({ href: `/app/w/${ws.id}/reelvault`, why: stepDef("reel1")!.why });
    } finally {
      env.onexSsoSecret = secret;
    }
  });

  it("turns 'Make your first post' solid at a saved carousel, and takes a video on the member's word", async () => {
    const { ws, user } = await makeWorkspace();
    expect(await step(ws, user.id, "carousel")).toMatchObject({ done: false, tick: null, selfLabel: "I filmed a video instead" });
    const video = await step(journey(ws, { ticks: { carousel: { at: at() } } }), user.id, "carousel");
    expect(video).toMatchObject({ done: true, tick: "you" });
    expect(video?.proof).toBeUndefined();
    await (await getDb()).insert(aiGenerations).values({ workspaceId: ws.id, kind: "carousel", model: "rules" });
    expect(await step(ws, user.id, "carousel")).toMatchObject({ done: true, tick: "app", win: "Done: your first post is made.", proof: { href: `/app/w/${ws.id}/carousel` } });
    // Another workspace's carousel never counts.
    const other = await makeWorkspace();
    expect((await step(other.ws, other.user.id, "carousel"))?.done).toBe(false);
  });

  it("keeps a member mid-week whole: an old video1 tick counts for the first post, an old rivals tick for nothing", async () => {
    const { ws, user } = await makeWorkspace();
    await day1Data(ws.id, { skip: ["carousel"] });
    const old = at(3 * DAY);
    // Ticked under the old week: Day 1 (rivals, post1), Day 2 (pages, reel1, clicks, video1, post2).
    const ticks = { rivals: { at: old }, post1: { at: old }, post1r: { at: old }, pages: { at: old }, reel1: { at: old }, clicks: { at: old }, video1: { at: old }, post2: { at: old }, post2r: { at: old } };
    const p = await computePath(journey(ws, { ticks }, DAY1_SETTINGS), user.id);
    const keys = p.days.flatMap((d) => d.steps.map((s) => s.key));
    for (const k of ["rivals", "video1"]) expect(keys, k).not.toContain(k);
    expect(p.days[0].steps.find((s) => s.key === "carousel")).toMatchObject({ done: true, tick: "you" });
    expect(p.days[0].steps.find((s) => s.key === "firstpost")).toMatchObject({ done: true, tick: "you" });
    expect(p.days[0].complete).toBe(true);
    // Day 2 only misses the new step: planning this week's posts.
    expect(p.days[1].steps.filter((s) => !s.done).map((s) => s.key)).toEqual(["planweek"]);
    expect(p.current?.key).toBe("planweek");
    expect(p.done).toBe(p.days[0].total + p.days[1].total - 1);
    // A tick under the new key wins over the old one.
    expect(withLegacyTicks({ video1: { at: old }, firstpost: { at: "mine" } })).toMatchObject({ carousel: { at: old }, firstpost: { at: "mine" } });
    expect(withLegacyTicks(undefined)).toEqual({});
  });
});
