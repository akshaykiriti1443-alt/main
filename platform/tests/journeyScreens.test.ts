import { afterEach, describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getDb } from "@/lib/db";
import { aiGenerations, sites } from "@/lib/db/schema";
import type { Journey } from "@/lib/db/types";
import { env } from "@/lib/env";
import { computePath, type Path } from "@/server/path";
import { JourneyHero } from "@/components/journey/journey-hero";
import { StepRow } from "@/components/journey/step-row";
import { TodayList } from "@/components/journey/today-list";
import { WeekStrip } from "@/components/journey/week-strip";
import { makeWorkspace } from "./helpers";

// The journey screens as a member sees them: one pink button per screen, plain words, real links.

const was = { referral: env.skoolReferralUrl, group: env.skoolGroupUrl };
afterEach(() => {
  env.skoolReferralUrl = was.referral;
  env.skoolGroupUrl = was.group;
});

const markup = (el: ReactElement) => renderToStaticMarkup(el);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const pinkButtons = (html: string) => (html.match(/data-variant="cta"/g) ?? []).length;
const hero = (path: Path, wid: string) => markup(createElement(JourneyHero, { path, wid, back: `/app/w/${wid}` }));
const JARGON = /\bserver\b|platform owner|wallet|\bCAPI\b|\benv\b|journey/i;
const at = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
type W = Awaited<ReturnType<typeof makeWorkspace>>["ws"];
const withJourney = (ws: W, j: Journey, extra: Record<string, unknown> = {}) => ({ ...ws, settings: { ...ws.settings, journey: j, ...extra } });

async function day1Data(workspaceId: string) {
  const db = await getDb();
  for (const kind of ["launch_kit", "ad_research"] as const) await db.insert(aiGenerations).values({ workspaceId, kind, model: "rules" });
  await db.insert(aiGenerations).values({ workspaceId, kind: "ad_studio", model: "rules", input: { destination: "website" } });
  await db.insert(sites).values({ workspaceId, name: "Funnel", slug: `funnel-screen-${workspaceId}`, theme: {} as never, published: true });
}

describe("the big card", () => {
  it("opens a new member on the free key, with one pink button and two quiet links", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath({ ...ws, settings: { ...ws.settings, skoolUrl: "" } }, user.id);
    const html = hero(p, ws.id);
    const t = text(html);
    expect(t).toContain("Start here · Day 1, step 1 of 9");
    expect(t).toContain("Get your free AI key");
    expect(t).toContain("Get my free key");
    expect(t).toContain("Stuck?");
    expect(t).toContain("Do this later");
    expect(pinkButtons(html)).toBe(1);
    expect(html).toContain(`href="/app/w/${ws.id}/ai"`);
    expect(t).not.toMatch(JARGON);
  });

  it("starts the group from the referral link, or says where it is, and takes the link right there", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath({ ...ws, settings: { ...ws.settings, skoolUrl: "", aiKeyEnc: "x" } }, user.id);
    expect(p.current?.key).toBe("skool");
    env.skoolReferralUrl = "";
    const none = hero(p, ws.id);
    expect(text(none)).toContain("The link to start your group is in your Day 1 lesson.");
    expect(text(none)).toContain("Your group's link");
    expect(pinkButtons(none)).toBe(0);

    env.skoolReferralUrl = "https://www.skool.com/signup?ref=owner";
    const withRef = hero(await computePath({ ...ws, settings: { ...ws.settings, skoolUrl: "", aiKeyEnc: "x" } }, user.id), ws.id);
    expect(pinkButtons(withRef)).toBe(1);
    expect(withRef).toContain('href="https://www.skool.com/signup?ref=owner"');
    expect(withRef).toContain('target="_blank"');
    expect(text(withRef)).toContain("That's our referral link. Skool pays us if you stay, and it costs you nothing extra.");
  });

  it("pairs an outside step's link with the member's own tick", async () => {
    const { ws, user } = await makeWorkspace();
    await day1Data(ws.id);
    // Publish comes after the Day 1 post: posted and reviewed, so pressing Publish is next.
    const p = await computePath(withJourney(ws, { ticks: { post1: { at: at() }, post1r: { at: at() } } }, { aiKeyEnc: "x", metaPixelId: "1234567890" }), user.id);
    expect(p.current?.key).toBe("clicks");
    const html = hero(p, ws.id);
    const t = text(html);
    expect(t).toContain("Open my launch plan");
    expect(t).toContain("I pressed Publish");
    expect(t).toContain("The app can't see Ads Manager, so this one is on your word.");
    expect(pinkButtons(html)).toBe(1);
  });

  it("asks for the Day 1 post before Publish, with the member's real website in it", async () => {
    const { ws, user } = await makeWorkspace();
    await day1Data(ws.id);
    env.skoolGroupUrl = "https://www.skool.com/anti-pete";
    // The ads are made but not live: the post (and its review) comes before any money is spent.
    const p = await computePath({ ...ws, settings: { ...ws.settings, aiKeyEnc: "x", metaPixelId: "1234567890" } }, user.id);
    expect(p.current?.key).toBe("post1");
    expect(p.days[0].steps.map((s) => s.key).slice(-2)).toEqual(["post1", "clicks"]);
    const html = hero(p, ws.id);
    const t = text(html);
    // Not the last step today (Publish is), so the card doesn't say it is.
    expect(t).not.toContain("Last step today");
    expect(t).toContain(`Next · step ${p.current!.n} of ${p.current!.count}`);
    expect(p.current!.n).toBeLessThan(p.current!.count);
    expect(t).toContain("Do it before you press Publish");
    expect(t).toContain("Day 1: 5-Second Test");
    expect(t).toContain("Copy my post");
    expect(t).toContain("I posted mine");
    expect(t).toContain("I reviewed the one before me");
    expect(t).toContain(`My website: ${p.links.website}`);
    expect(p.links.website).toContain(`funnel-screen-${ws.id}`);
    expect(t).toContain("The app can't see Skool. These two ticks are your word.");
    expect(pinkButtons(html)).toBe(1);
    expect(html).toContain('href="https://www.skool.com/anti-pete"');

    env.skoolGroupUrl = "";
    const noGroup = hero(await computePath({ ...ws, settings: { ...ws.settings, aiKeyEnc: "x", metaPixelId: "1234567890" } }, user.id), ws.id);
    expect(pinkButtons(noGroup)).toBe(0);
    expect(text(noGroup)).toContain("Open the community in Skool");
  });

  it("says Last step today only when the post really ends the day", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath(ws, user.id);
    for (const day of p.days) {
      const post = day.steps.find((s) => s.key === `post${day.day}`)!;
      const t = text(hero({ ...p, current: post, state: "doing" }, ws.id));
      const last = post.n === post.count;
      // Days 1 and 2 put Publish after the post; Days 3 to 7 end on it.
      expect(last, `Day ${day.day}`).toBe(day.day > 2);
      if (last) expect(t, `Day ${day.day}`).toContain("Last step today · In Skool");
      else expect(t, `Day ${day.day}`).not.toContain("Last step today");
    }
  });

  it("finishes the day calmly: what exists now, tomorrow named, no pink button", async () => {
    const { ws, user } = await makeWorkspace();
    await day1Data(ws.id);
    const p = await computePath(withJourney(ws, { ticks: { clicks: { at: at() }, post1: { at: at() }, post1r: { at: at() } } }, { aiKeyEnc: "x", metaPixelId: "1234567890" }), user.id);
    expect(p.state).toBe("dayDone");
    const html = hero(p, ws.id);
    const t = text(html);
    expect(t).toContain("You're done for today.");
    expect(t).toContain("Day 1 done. You have a Skool group, a live website, a Pixel and 5 ads.");
    expect(t).toContain("This is what exists now:");
    expect(t).toContain("Done: your website is live.");
    expect(t).toContain("(you ticked this)");
    expect(t).toContain("Tomorrow · Day 2: Five more ads, straight to Skool.");
    expect(t).toContain("Start Day 2 now");
    expect(t).toContain("or come back tomorrow. Nothing closes.");
    expect(pinkButtons(html)).toBe(0);
  });

  it("says Day 6 has nothing to judge yet without making it a bad sign", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath(ws, user.id);
    const review = p.days[5].steps[0];
    const html = hero({ ...p, current: review, state: "doing" }, ws.id);
    expect(text(html)).toContain("Day 6 · Nothing to judge yet");
    expect(text(html)).toContain("It isn't a bad sign or a good one.");
    expect(text(html)).toContain("None at 1,000 yet");
    expect(pinkButtons(html)).toBe(1);
  });

  it("keeps the Day 7 call private and lists only what the app can see", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath(ws, user.id);
    const decide = p.days[6].steps.find((s) => s.key === "decide")!;
    const html = hero({ ...p, current: decide, state: "doing" }, ws.id);
    const t = text(html);
    expect(t).toContain("What the app can see of your week");
    expect(t).toContain("Your launch kit");
    expect(t).toContain("I've decided");
    expect(t).toContain("Only the time you ticked this is saved, never which way you went.");
    expect(pinkButtons(html)).toBe(1);
  });
});

describe("the lists", () => {
  it("shows only today's steps, the half-time note after the Pixel, and win lines on done rows", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath(ws, user.id);
    const t = text(markup(createElement(TodayList, { day: p.days[0], current: p.current, wid: ws.id, back: `/app/w/${ws.id}` })));
    expect(t).toContain("Today's steps");
    expect(t).toContain("Day 1 · step 1 of 9 today");
    expect(t).toContain("Half-time");
    expect(t).toContain("Done: your group's link is saved. Every Join button now goes there.");
    expect(t).toContain("Seen by the app");
    expect(t).not.toContain("Five more ads"); // Day 2 isn't on today's list
    expect(t).not.toMatch(/\d+%|of 27|of 28/);
  });

  it("marks a self-ticked row with Undo, and never draws a padlock", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath(withJourney(ws, { ticks: { events: { at: at() } } }), user.id);
    const events = p.days[2].steps.find((s) => s.key === "events")!;
    const t = text(markup(createElement("ul", null, createElement(StepRow, { step: events, wid: ws.id, back: `/app/w/${ws.id}/path`, current: false, variant: "path" }))));
    expect(t).toContain("Done: Meta can see your website.");
    expect(t).toContain("You ticked this");
    expect(t).toContain("Undo");
    expect(t).toContain("In Meta");
    const strip = markup(createElement(WeekStrip, { days: p.days, current: 1, wid: ws.id, size: "lg" }));
    expect(strip).toContain(`href="/app/w/${ws.id}/path#day-7"`);
    expect(strip).not.toMatch(/lock/i);
  });
});
