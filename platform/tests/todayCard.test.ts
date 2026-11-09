import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { activities, aiGenerations, sites } from "@/lib/db/schema";
import { canBeUpNext } from "@/lib/guides";
import { companionSnapshot } from "@/server/companion";
import { academyClassroomUrl, computePath, launchDay, todayInLaunchWeek } from "@/server/path";
import { makeWorkspace } from "./helpers";

const DAY = 86_400_000;
const CLASSROOM = "https://www.skool.com/0-to-1x-academy-9129/classroom";
const now = new Date("2026-11-09T12:00:00Z");
const onDay = (n: number) => new Date(now.getTime() - (n - 1) * DAY);

const card = (n: number, day1Done = true) => todayInLaunchWeek({ createdAt: onDay(n), day1Done, base: "/app/w/x", classroomUrl: CLASSROOM, now });

/** Every Day 1 to-do done, on real data. */
async function finishDay1(workspaceId: string) {
  const db = await getDb();
  for (const kind of ["launch_kit", "ad_research", "ad_studio"] as const) await db.insert(aiGenerations).values({ workspaceId, kind, model: "rules" });
  await db.insert(sites).values({ workspaceId, name: "Funnel", slug: `funnel-today-${workspaceId}`, theme: {} as never, published: true });
  await db.insert(activities).values({ workspaceId, type: "lead", data: {} });
  await db.insert(activities).values({ workspaceId, type: "skool_visit", data: { source: "meta-ad" } });
}

describe("Today in Launch Week", () => {
  it("counts the day the workspace was made as Day 1", () => {
    expect(launchDay(now, now)).toBe(1);
    expect(launchDay(new Date(now.getTime() - DAY + 1000), now)).toBe(1);
    expect(launchDay(new Date(now.getTime() - DAY), now)).toBe(2);
    expect(launchDay(onDay(7), now)).toBe(7);
  });

  it("shows the blueprint's lesson, title and destination on each of Days 2 to 6", () => {
    expect([2, 3, 4, 5, 6].map((d) => { const c = card(d); return c && [c.eyebrow, c.title, c.href]; })).toEqual([
      ["Today · Lesson 2.1", "Polish your About page", "/app/w/x/launch"],
      ["Today · Lesson 2.2", "Text five people", "/app/w/x/growth"],
      ["Today · Lesson 2.3", "Pin your Start here post", CLASSROOM],
      ["Today · Lesson 2.4", "Switch on your welcome", CLASSROOM],
      ["Today · Lesson 2.5", "Send your first Ask", "/app/w/x/leads"],
    ]);
  });

  it("stays away on Day 1, Day 7 onwards and until Day 1's to-dos are done", () => {
    expect(card(1)).toBeNull();
    expect(card(7)).toBeNull();
    expect(card(8)).toBeNull();
    expect(card(40)).toBeNull();
    for (const d of [2, 3, 4, 5, 6]) expect(card(d, false)).toBeNull();
  });

  it("never reads like a status line or uses a banned move", () => {
    for (const d of [2, 3, 4, 5, 6]) {
      const c = card(d)!;
      expect(c.body.length, c.title).toBeGreaterThan(60);
      expect(c.body, c.title).not.toMatch(/—|\bdone\b|like-for-like|\bpod\b|journey|game-changer/i);
    }
  });

  it("finds the Academy's Classroom from its group link, however it was saved", () => {
    expect(academyClassroomUrl("https://www.skool.com/0-to-1x-academy-9129/about")).toBe(CLASSROOM);
    expect(academyClassroomUrl("https://www.skool.com/0-to-1x-academy-9129/about?ref=abc")).toBe(CLASSROOM);
    expect(academyClassroomUrl("https://www.skool.com/0-to-1x-academy-9129/")).toBe(CLASSROOM);
    expect(academyClassroomUrl("")).toBe(CLASSROOM);
  });

  it("waits for Day 1's to-dos on a real workspace, then shows today's lesson", async () => {
    const { ws, user } = await makeWorkspace();
    const dayThree = { ...ws, createdAt: new Date(Date.now() - 2.5 * DAY) };
    // Day 3, but Day 1 isn't finished: Up next stays on Day 1's work.
    const early = await computePath(dayThree, user.id);
    expect(early.today).toBeNull();
    expect(early.next?.key).toBe("kit");

    await finishDay1(ws.id);
    const p = await computePath(dayThree, user.id);
    expect(p.today).toMatchObject({ day: 3, lesson: "2.2", title: "Text five people", href: `/app/w/${ws.id}/growth` });
  });

  it("isn't blocked by the optional Pixel or your own AI, and is gone on Day 1 and Day 7", async () => {
    const { ws, user } = await makeWorkspace();
    await finishDay1(ws.id);
    const dayOf = (n: number) => computePath({ ...ws, createdAt: new Date(Date.now() - (n - 0.5) * DAY) }, user.id);
    const p = await dayOf(2);
    const steps = p.stages.flatMap((s) => s.steps);
    expect(steps.find((s) => s.key === "pixel")?.done).toBe(false);
    expect(steps.find((s) => s.key === "ai")?.done).toBe(false);
    expect(p.today?.lesson).toBe("2.1");
    expect((await computePath(ws, user.id)).today).toBeNull(); // made just now: still Day 1
    expect((await dayOf(7)).today).toBeNull();
    expect((await dayOf(7)).next?.key).toBe("checkin");
  });

  it("is never counted and never ticks: the steps, N of T and Up next are untouched", async () => {
    const { ws, user } = await makeWorkspace();
    await finishDay1(ws.id);
    const day1 = await computePath(ws, user.id);
    expect(day1.today).toBeNull();
    const day4 = await computePath({ ...ws, createdAt: new Date(Date.now() - 3.5 * DAY) }, user.id);
    expect(day4.today?.lesson).toBe("2.3");
    expect(day4.total).toBe(day1.total);
    expect(day4.done).toBe(day1.done);
    expect(day4.next?.key).toBe(day1.next?.key);
    expect(day4.stages).toEqual(day1.stages);
    // Nothing on the path is the card: no step for it, so it can't be Up next or a tick.
    const titles = day4.stages.flatMap((s) => s.steps).map((s) => s.title);
    expect(titles).not.toContain(day4.today!.title);
    expect(day4.stages.flatMap((s) => s.steps).find(canBeUpNext)?.key).toBe("checkin");
  });

  it("reaches Penny, so she doesn't jump a Day 2 member to Day 7 either", async () => {
    const { ws, user } = await makeWorkspace();
    await finishDay1(ws.id);
    const snap = await companionSnapshot({ ...ws, createdAt: new Date(Date.now() - 1.5 * DAY) }, user.id);
    expect(snap.today).toMatchObject({ lesson: "2.1", href: `/app/w/${ws.id}/launch` });
    expect(snap.total).toBe(snap.steps.length);
  });
});
