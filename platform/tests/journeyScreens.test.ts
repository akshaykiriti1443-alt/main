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
const DAY = 86_400_000;
const at = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
type W = Awaited<ReturnType<typeof makeWorkspace>>["ws"];
const withJourney = (ws: W, j: Journey, extra: Record<string, unknown> = {}) => ({ ...ws, settings: { ...ws.settings, journey: j, ...extra } });

async function day1Data(workspaceId: string) {
  const db = await getDb();
  for (const kind of ["carousel", "launch_kit", "ad_research"] as const) await db.insert(aiGenerations).values({ workspaceId, kind, model: "rules" });
  await db.insert(aiGenerations).values({ workspaceId, kind: "ad_studio", model: "rules", input: { destination: "website" } });
  await db.insert(sites).values({ workspaceId, name: "Funnel", slug: `funnel-screen-${workspaceId}`, theme: {} as never, published: true });
}

describe("the big card", () => {
  it("starts Day 1 on connecting Claude, with one pink button, the free key as a quiet way round, and two quiet links", async () => {
    const { ws, user } = await makeWorkspace();
    // Claude is step 1 of Day 1. The helper's group link (step 5) is saved, so this account is past "first".
    const p = await computePath(ws, user.id);
    const html = hero(p, ws.id);
    const t = text(html);
    expect(t).toContain("Next · step 1 of 7");
    expect(t).toContain("Connect your Claude");
    expect(t).toContain("Connect my Claude");
    expect(t).toContain("No Claude? Get a free Gemini key instead");
    expect(t).toContain("I'll use my 3 included runs");
    expect(t).toContain("Stuck?");
    expect(t).toContain("Do this later");
    expect(pinkButtons(html)).toBe(1);
    // The pink button goes to Your AI, which leads with Claude; the fallback link lands on the key.
    expect(html).toContain(`href="/app/w/${ws.id}/ai"`);
    expect(html).toContain(`href="/app/w/${ws.id}/ai#key"`);
    expect(t.indexOf("Connect my Claude")).toBeLessThan(t.indexOf("No Claude? Get a free Gemini key instead"));
    expect(t).not.toMatch(JARGON);
  });

  it("opens a member's group from the referral link once their first post is out, or says where it is, and takes the link right there", async () => {
    const { ws, user } = await makeWorkspace();
    // Claude, the reel, the carousel and the Instagram post done: the group is Day 1's step 5.
    const firstWin = { ai: { at: at() }, reel1: { at: at() }, carousel: { at: at() }, firstpost: { at: at() } };
    const noGroup = withJourney(ws, { ticks: firstWin }, { skoolUrl: "" });
    const p = await computePath(noGroup, user.id);
    expect(p.current?.key).toBe("skool");
    env.skoolReferralUrl = "";
    const none = hero(p, ws.id);
    expect(text(none)).toContain("Next · step 5 of 7");
    expect(text(none)).toContain("Open your own Skool group");
    expect(text(none)).toContain("The link to start your group is in your Day 1 lesson.");
    expect(text(none)).toContain("Your group's link");
    expect(pinkButtons(none)).toBe(0);

    env.skoolReferralUrl = "https://www.skool.com/signup?ref=owner";
    const withRef = hero(await computePath(noGroup, user.id), ws.id);
    expect(pinkButtons(withRef)).toBe(1);
    expect(withRef).toContain('href="https://www.skool.com/signup?ref=owner"');
    expect(withRef).toContain('target="_blank"');
    expect(text(withRef)).toContain("That's our referral link. Skool pays us if you stay, and it costs you nothing extra.");
  });

  it("pairs an outside step's link with the member's own tick", async () => {
    const { ws, user } = await makeWorkspace();
    await day1Data(ws.id);
    // Day 1 done, and Day 2's Page ticked and website live: pressing Publish on the first 5 ads is next.
    const ticks = { reel1: { at: at(2 * DAY) }, firstpost: { at: at(2 * DAY) }, post1: { at: at(2 * DAY) }, post1r: { at: at(2 * DAY) }, pages: { at: at() } };
    const p = await computePath(withJourney(ws, { ticks }, { aiKeyEnc: "x", metaPixelId: "1234567890" }), user.id);
    expect(p.current?.key).toBe("clicks");
    const html = hero(p, ws.id);
    const t = text(html);
    expect(t).toContain("Open my launch plan");
    expect(t).toContain("I pressed Publish");
    expect(t).toContain("The app can't see Ads Manager, so this one is on your word.");
    expect(pinkButtons(html)).toBe(1);
  });

  it("ends Day 1 on the post, with the member's first post, the reel and their own group in it", async () => {
    const { ws, user } = await makeWorkspace();
    await day1Data(ws.id);
    env.skoolGroupUrl = "https://www.skool.com/anti-pete";
    // First post out, group saved, kit built: the Skool post is the last step today.
    const posted = { ...ws, settings: { ...ws.settings, aiKeyEnc: "x", journey: { ticks: { reel1: { at: at() }, firstpost: { at: at() } } } } };
    const p = await computePath(posted, user.id);
    expect(p.current?.key).toBe("post1");
    expect(p.days[0].steps.map((s) => s.key).slice(-3)).toEqual(["skool", "kit", "post1"]);
    const html = hero(p, ws.id);
    const t = text(html);
    expect(t).toContain("Last step today · In Skool");
    expect(p.current!.n).toBe(p.current!.count);
    expect(t).not.toContain("Do it before you press Publish");
    expect(t).toContain("Day 1: My First Post");
    expect(t).toContain("My first post: [link]");
    expect(t).toContain("The reel I borrowed the hook from: [link]");
    expect(t).toContain(`My group: ${p.links.ownGroup}`);
    expect(p.links.ownGroup).toMatch(/^https:\/\/www\.skool\.com\//);
    expect(t).toContain("The part that scared me: ___");
    // The website goes live tomorrow, so it isn't in today's post.
    expect(t).not.toContain("My website:");
    expect(t).toContain("Copy my post");
    expect(t).toContain("I posted mine");
    expect(t).toContain("I reviewed the one before me");
    expect(t).toContain("The app can't see Skool. These two ticks are your word.");
    expect(pinkButtons(html)).toBe(1);
    expect(html).toContain('href="https://www.skool.com/anti-pete"');

    env.skoolGroupUrl = "";
    const noCommunity = hero(await computePath(posted, user.id), ws.id);
    expect(pinkButtons(noCommunity)).toBe(0);
    expect(text(noCommunity)).toContain("Open the community in Skool");
  });

  it("says Last step today only when the post really ends the day", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath(ws, user.id);
    for (const day of p.days) {
      const post = day.steps.find((s) => s.key === `post${day.day}`)!;
      const t = text(hero({ ...p, current: post, state: "doing" }, ws.id));
      const last = post.n === post.count;
      // Every day ends on its post.
      expect(last, `Day ${day.day}`).toBe(true);
      if (last) expect(t, `Day ${day.day}`).toContain("Last step today · In Skool");
      else expect(t, `Day ${day.day}`).not.toContain("Last step today");
    }
  });

  it("finishes the day calmly: what exists now, tomorrow named, no pink button", async () => {
    const { ws, user } = await makeWorkspace();
    await day1Data(ws.id);
    const p = await computePath(withJourney(ws, { ticks: { reel1: { at: at() }, firstpost: { at: at() }, post1: { at: at() }, post1r: { at: at() } } }, { aiKeyEnc: "x" }), user.id);
    expect(p.state).toBe("dayDone");
    const html = hero(p, ws.id);
    const t = text(html);
    expect(t).toContain("You're done for today.");
    expect(t).toContain("Day 1 done. Your first post is out, and your group exists.");
    expect(t).toContain("This is what exists now:");
    expect(t).toContain("Done: your first post is out. That's your first win.");
    expect(t).toContain("Done: your first post is made.");
    expect(t).toContain("(you ticked this)");
    expect(t).toContain("Tomorrow · Day 2: Your shop window and your first ads.");
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
  it("shows only today's steps, the half-time note on Day 2 after the website, and win lines on done rows", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath(ws, user.id);
    const t = text(markup(createElement(TodayList, { day: p.days[0], current: p.current, wid: ws.id, back: `/app/w/${ws.id}` })));
    expect(t).toContain("Today's steps");
    expect(t).toContain("Day 1 · step 1 of 7 today");
    expect(t).toContain("Find what already works in your niche");
    expect(t).toContain("Make your first post");
    expect(t).toContain("Post it on Instagram");
    expect(t).not.toContain("Half-time"); // Day 1 spends nothing, so it's one sitting
    expect(t).toContain("Done: your group's link is saved. Every Join button now goes there.");
    expect(t).toContain("Seen by the app");
    expect(t).not.toContain("Put your 5 ads live"); // Day 2 isn't on today's list
    expect(t).not.toMatch(/\d+%|of 32|of 33/);
    const day2 = text(markup(createElement(TodayList, { day: p.days[1], current: null, wid: ws.id, back: `/app/w/${ws.id}` })));
    expect(day2).toContain("Half-time");
    expect(day2.indexOf("Put your website live")).toBeLessThan(day2.indexOf("Half-time"));
    expect(day2).toContain("Plan this week's posts in one sitting");
    expect(day2.indexOf("Half-time")).toBeLessThan(day2.indexOf("Connect your Meta Pixel"));
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
