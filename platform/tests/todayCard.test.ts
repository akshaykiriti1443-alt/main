import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { activities, aiGenerations, contacts, sites } from "@/lib/db/schema";
import { canBeUpNext } from "@/lib/guides";
import { companionSnapshot } from "@/server/companion";
import { createConnectorToken } from "@/server/connectors";
import { computePath, launchDay, todayInLaunchWeek } from "@/server/path";
import { makeWorkspace } from "./helpers";

const DAY = 86_400_000;
const now = new Date("2026-11-09T12:00:00Z");
const onDay = (n: number) => new Date(now.getTime() - (n - 1) * DAY);
const DAYS = [2, 3, 4, 5, 6, 7];

const card = (n: number, shopOpen = true, adClicked = true, aiOn = false) => todayInLaunchWeek({ createdAt: onDay(n), shopOpen, adClicked, base: "/app/w/x", aiOn, now });
const withPixel = <T extends { settings: object }>(ws: T) => ({ ...ws, settings: { ...ws.settings, metaPixelId: "1234567890" } });
const NO_BILLING = /\b(charged|billed|billing date|renews|expires?|trial (has )?ended|your trial ends|last chance|hurry)\b|\d+ days? left|\bDay \d+ of \d+\b/i;

/** Every Day 1 to-do done, on real data (the Pixel lives on the workspace: see withPixel). */
async function finishDay1(workspaceId: string) {
  const db = await getDb();
  for (const kind of ["launch_kit", "ad_research", "ad_studio"] as const) await db.insert(aiGenerations).values({ workspaceId, kind, model: "rules" });
  await db.insert(sites).values({ workspaceId, name: "Funnel", slug: `funnel-today-${workspaceId}`, theme: {} as never, published: true });
  await db.insert(activities).values({ workspaceId, type: "lead", data: {} });
  await db.insert(activities).values({ workspaceId, type: "skool_visit", data: { source: "meta-ad" } });
}

describe("Today in your free week", () => {
  it("counts the day the workspace was made as Day 1", () => {
    expect(launchDay(now, now)).toBe(1);
    expect(launchDay(new Date(now.getTime() - DAY + 1000), now)).toBe(1);
    expect(launchDay(new Date(now.getTime() - DAY), now)).toBe(2);
    expect(launchDay(onDay(7), now)).toBe(7);
  });

  it("shows the course's day, title and destination on each of Days 2 to 7", () => {
    expect(DAYS.map((d) => { const c = card(d); return c && [c.eyebrow, c.title, c.href]; })).toEqual([
      ["Today · Day 2", "Five more ads, straight to Skool", "/app/w/x/ai"],
      ["Today · Day 3", "Walk through your own machine", "/app/w/x/leads"],
      ["Today · Day 4", "Furnish the room", "/app/w/x/unlocks"],
      ["Today · Day 5", "Text five people", "/app/w/x/growth"],
      ["Today · Day 6", "Your real numbers", "/app/w/x/ads"],
      ["Today · Day 7", "The scoreboard, and your decision", "/app/w/x/growth"],
    ]);
  });

  it("sends Day 2 straight to Ad studio once there's a key", () => {
    expect(card(2, true, true, true)?.href).toBe("/app/w/x/ads/studio");
    expect(card(3, true, true, true)?.href).toBe("/app/w/x/leads");
  });

  it("stays away on Day 1, Day 8 onwards and until the shop is open", () => {
    expect(card(1)).toBeNull();
    expect(card(8)).toBeNull();
    expect(card(40)).toBeNull();
    for (const d of [2, 3, 4, 5, 6]) expect(card(d, false)).toBeNull();
  });

  it("shows Day 7 even to someone behind: it's about their money", () => {
    expect(card(7, false)?.lesson).toBe("Day 7");
    expect(card(7, false)?.body).toMatch(/Behind, or no ads live\? Read this one anyway/);
  });

  it("files each day under its own stage", () => {
    for (const d of DAYS) expect(card(d)).toMatchObject({ lesson: `Day ${d}`, stage: `day${d}`, stageTag: `Day ${d}` });
  });

  it("doesn't describe ads that may not exist", () => {
    expect(card(3, true, true)?.body).toMatch(/learning to walk/);
    expect(card(6, true, true)?.body).toMatch(/marked Kill/);
    expect(card(3, true, false)?.body).toMatch(/No ads live yet\? Today still counts/);
    expect(card(6, true, false)?.body).toMatch(/No ads live yet\? Then there's nothing to judge/);
    for (const d of DAYS) {
      const c = card(d, true, false)!;
      expect(c.body, c.title).not.toMatch(/Stay out of Ads Manager|learning to walk|hands off|your worst verdict/i);
      expect(c.body.length, c.title).toBeGreaterThan(60);
      expect(c.body, c.title).not.toMatch(/—|\bdone\b|like-for-like|\bpod\b|journey|game-changer/i);
      expect(c.body, c.title).not.toMatch(NO_BILLING);
      expect([c.lesson, c.title, c.href]).toEqual([card(d)!.lesson, card(d)!.title, card(d)!.href]);
    }
  });

  it("allows up to $15 a day across the two campaigns", () => {
    expect(card(2)?.body).toContain("up to $15 a day across the two");
  });

  it("never claims a date, a charge or a trial ending it can't see", () => {
    expect(card(7)!.body).toMatch(/the day you joined, which the app can't see/);
    for (const d of DAYS) {
      const c = card(d)!;
      expect(`${c.title} ${c.body}`, c.title).not.toMatch(NO_BILLING);
    }
  });

  it("never reads like a status line or uses a banned move", () => {
    for (const d of DAYS) {
      const c = card(d)!;
      expect(c.body.length, c.title).toBeGreaterThan(60);
      expect(c.body, c.title).not.toMatch(/—|\bdone\b|like-for-like|\bpod\b|journey|game-changer/i);
    }
  });

  it("waits for Day 1's to-dos on a real workspace, then shows today's lesson", async () => {
    const { ws, user } = await makeWorkspace();
    const dayThree = withPixel({ ...ws, createdAt: new Date(Date.now() - 2.5 * DAY) });
    // Day 3, but Day 1 isn't finished: Up next stays on Day 1's work.
    const early = await computePath(dayThree, user.id);
    expect(early.today).toBeNull();
    expect(early.next?.key).toBe("kit");

    await finishDay1(ws.id);
    const p = await computePath(dayThree, user.id);
    expect(p.today).toMatchObject({ day: 3, lesson: "Day 3", title: "Walk through your own machine", href: `/app/w/${ws.id}/leads` });
  });

  it("needs the Pixel saved before the shop counts as open", async () => {
    const { ws, user } = await makeWorkspace();
    await finishDay1(ws.id);
    const dayThree = { ...ws, createdAt: new Date(Date.now() - 2.5 * DAY) };
    const p = await computePath(dayThree, user.id);
    expect(p.next?.key).toBe("pixel");
    expect(p.today).toBeNull();
    expect((await computePath(withPixel(dayThree), user.id)).today?.day).toBe(3);
  });

  it("needs only the shop open: the ads can wait, and stay Up next meanwhile", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    await db.insert(aiGenerations).values({ workspaceId: ws.id, kind: "launch_kit", model: "rules" });
    await db.insert(sites).values({ workspaceId: ws.id, name: "Funnel", slug: `funnel-shop-${ws.id}`, theme: {} as never, published: true });
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: {} });
    const dayOf = (n: number) => computePath(withPixel({ ...ws, createdAt: new Date(Date.now() - (n - 0.5) * DAY) }), user.id);

    const three = await dayOf(3);
    expect(three.today).toMatchObject({ lesson: "Day 3" });
    expect(three.today?.body).toMatch(/No ads live yet/);
    expect(three.next?.key).toBe("research");
    expect((await dayOf(6)).today?.lesson).toBe("Day 6");

    const eight = await dayOf(8);
    expect(eight.today).toBeNull();
    expect(eight.next?.key).toBe("research");
  });

  it("says hands off only once a real ad lead or ad click is recorded", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    for (const kind of ["launch_kit", "ad_research", "ad_studio"] as const) await db.insert(aiGenerations).values({ workspaceId: ws.id, kind, model: "rules" });
    await db.insert(sites).values({ workspaceId: ws.id, name: "Funnel", slug: `funnel-click-${ws.id}`, theme: {} as never, published: true });
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: {} });
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "direct" } });
    const dayThree = withPixel({ ...ws, createdAt: new Date(Date.now() - 2.5 * DAY) });
    expect((await computePath(dayThree, user.id)).today?.body).toMatch(/No ads live yet/);
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: { utm: { fbclid: "abc123" } } });
    expect((await computePath(dayThree, user.id)).today?.body).toMatch(/learning to walk/);
  });

  it("isn't blocked by your own AI, and is gone on Day 1 and Day 8", async () => {
    const { ws, user } = await makeWorkspace();
    await finishDay1(ws.id);
    const dayOf = (n: number) => computePath(withPixel({ ...ws, createdAt: new Date(Date.now() - (n - 0.5) * DAY) }), user.id);
    const p = await dayOf(2);
    const steps = p.stages.flatMap((s) => s.steps);
    expect(steps.find((s) => s.key === "ai")?.done).toBe(false);
    expect(p.today?.lesson).toBe("Day 2");
    expect((await computePath(withPixel(ws), user.id)).today).toBeNull(); // made just now: still Day 1
    expect((await dayOf(7)).today?.lesson).toBe("Day 7");
    expect((await dayOf(8)).today).toBeNull();
  });

  it("is never counted and never ticks", async () => {
    const { ws, user } = await makeWorkspace();
    await finishDay1(ws.id);
    const day1 = await computePath(withPixel(ws), user.id);
    expect(day1.today).toBeNull();
    const day4 = await computePath(withPixel({ ...ws, createdAt: new Date(Date.now() - 3.5 * DAY) }), user.id);
    expect(day4.today?.lesson).toBe("Day 4");
    expect(day4.total).toBe(day1.total);
    expect(day4.done).toBe(day1.done);
    // Nothing on the path is the card: no step for it, so it can't be Up next or a tick.
    const titles = day4.stages.flatMap((s) => s.steps).map((s) => s.title);
    expect(titles).not.toContain(day4.today!.title);
    expect(day4.stages.flatMap((s) => s.steps).find(canBeUpNext)?.key).toBe("ai");
  });

  it("holds Day 7 for someone who hasn't finished Day 1, and Day 8 waits for them", async () => {
    const { ws, user } = await makeWorkspace();
    const dayOf = (n: number) => computePath({ ...ws, createdAt: new Date(Date.now() - (n - 0.5) * DAY) }, user.id);
    const seven = await dayOf(7);
    expect(seven.today?.lesson).toBe("Day 7");
    expect(seven.next?.key).toBe("kit");
    const eight = await dayOf(8);
    expect(eight.today).toBeNull();
    expect(eight.next?.key).toBe("kit");
  });

  it("reaches Penny, so she doesn't jump a Day 2 member to Day 6 either", async () => {
    const { ws, user } = await makeWorkspace();
    await finishDay1(ws.id);
    const snap = await companionSnapshot(withPixel({ ...ws, createdAt: new Date(Date.now() - 1.5 * DAY) }), user.id);
    expect(snap.today).toMatchObject({ lesson: "Day 2", href: `/app/w/${ws.id}/ai` });
    expect(snap.total).toBe(snap.steps.length);
  });
});

describe("Your path ticks the new days from real data", () => {
  const step = async (ws: Parameters<typeof computePath>[0], userId: string, key: string) => (await computePath(ws, userId)).stages.flatMap((s) => s.steps).find((s) => s.key === key);

  it("Day 1's first ads tick at a lead from an ad or a Skool-link ad click, never at your own test", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: { utm: {} } });
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "direct" } });
    expect((await step(ws, user.id, "clicks"))?.done).toBe(false);

    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: { utm: { fbclid: "abc123" } } });
    expect((await step(ws, user.id, "clicks"))?.done).toBe(true);

    const other = await makeWorkspace();
    await db.insert(activities).values({ workspaceId: other.ws.id, type: "skool_visit", data: { source: "meta-ad" } });
    expect((await step(other.ws, other.user.id, "clicks"))?.done).toBe(true);
  });

  it("Day 2's AI step ticks at a saved key, not a connector (only a key lifts the cap)", async () => {
    const { ws, user } = await makeWorkspace();
    expect((await step(ws, user.id, "ai"))?.done).toBe(false);
    expect((await step({ ...ws, settings: { ...ws.settings, aiKeyEnc: "x" } }, user.id, "ai"))?.done).toBe(true);
    await createConnectorToken(ws.id, user.id, "Claude");
    expect((await step(ws, user.id, "ai"))?.done).toBe(false);
  });

  it("Day 3 ticks only when the Pixel, two sign-ups and a counted click are all real", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    const pixelled = withPixel(ws);
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: {} });
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "direct" } });
    expect((await step(pixelled, user.id, "tracking"))?.done).toBe(false); // only one sign-up
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: {} });
    expect((await step(ws, user.id, "tracking"))?.done).toBe(false); // no Pixel
    expect((await step(pixelled, user.id, "tracking"))?.done).toBe(true);
  });

  it("Day 5 ticks at a contact added by hand or a ?src=text click, not an ordinary sign-up", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    await db.insert(contacts).values({ workspaceId: ws.id, email: `form-${Date.now()}@example.com`, source: "landing_page" });
    expect((await step(ws, user.id, "warm"))?.done).toBe(false);
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "text" } });
    expect((await step(ws, user.id, "warm"))?.done).toBe(true);

    const other = await makeWorkspace();
    await db.insert(contacts).values({ workspaceId: other.ws.id, email: `mum-${Date.now()}@example.com`, source: "manual" });
    expect((await step(other.ws, other.user.id, "warm"))?.done).toBe(true);
  });
});
