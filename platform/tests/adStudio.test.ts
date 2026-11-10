import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { aiGenerations, sites } from "@/lib/db/schema";
import { pageGuideFor, STEP_HOWTO } from "@/lib/guides";
import {
  adStudioDefaults,
  adStudioInputSchema,
  differences,
  fallbackStatics,
  launchPlan,
  limitWords,
  listAdStudioPacks,
  makeAdStudioPack,
  normalizeStatics,
  numbersLines,
  packProblems,
  policyCheck,
  publishedFunnelUrl,
  realCostPerVisit,
  studioNumbers,
  videoFromConcept,
} from "@/server/ai/adStudio";
import { saveCheckin } from "@/server/growth";
import { computePath } from "@/server/path";
import { playbookByName } from "@/server/playbooks";
import { createConnectorToken } from "@/server/connectors";
import { POST as mcpRoute } from "@/app/api/mcp/[token]/route";
import { makeWorkspace } from "./helpers";

const input = (over: Record<string, unknown> = {}) =>
  adStudioInputSchema.parse({ businessName: "Fit Dads Club", niche: "Fitness for busy dads", audience: "busy dads over 40", promise: "Feel fit again in 20 minutes a day", budget: 5, ...over });

describe("Ad studio: your numbers", () => {
  it("turns a budget into About-page visits and days to Level 2 at $0.50–$1.50 a visit", () => {
    const five = studioNumbers(5);
    expect(five.cpvSource).toBe("assumption");
    expect(five.visitsPerDay.low).toBeCloseTo(3.33, 2);
    expect(five.visitsPerDay.high).toBe(10);
    expect(five.visitsPerMonth).toEqual({ low: 100, high: 300 });
    expect(five.daysTo100).toEqual({ fast: 10, slow: 30 });
    expect(five.monthlySpend).toBe(150);
    expect(five.minBudgetFor100).toBe(5);
    expect(five.statics).toBe(5);

    const ten = studioNumbers(10);
    expect(ten.visitsPerMonth).toEqual({ low: 200, high: 600 });
    expect(ten.daysTo100).toEqual({ fast: 5, slow: 15 });

    // Their own number replaces the assumption.
    const real = studioNumbers(10, { cpv: 0.8, source: "ad_review", at: new Date().toISOString() });
    expect(real.visitsPerDay).toEqual({ low: 12.5, high: 12.5 });
    expect(real.daysTo100).toEqual({ fast: 8, slow: 8 });
  });

  it("says plainly when a budget is too small, and never promises members or income", () => {
    const lines = numbersLines(studioNumbers(3), { price: 29, country: "United States" });
    const all = lines.map((l) => l.text).join(" ");
    expect(lines.map((l) => l.key)).toEqual(["assumption", "level2", "statics", "target", "images", "social"]);
    expect(all).toContain("$5 a day gets you there");
    expect(all).toContain("Visitors aren't members");
    expect(all).toContain("Andromeda");
    expect(all).toMatch(/don't need a following/);
    expect(all).not.toMatch(/you will (get|make|earn)|guarantee/i);
    expect(numbersLines(studioNumbers(10)).map((l) => l.text).join(" ")).not.toContain("is a stretch");
    // "What images" names the pack's own five formats.
    const images = numbersLines(studioNumbers(10), { formats: fallbackStatics(input({ proof: "Ann posted her first win" })).map((s) => s.format) }).find((l) => l.key === "images")?.text;
    expect(images).toContain("a real member's words");
    expect(images).not.toContain("before/after");
  });

  it("labels a cost per visit as a guess until the member has their own, and allows $15 across two campaigns", () => {
    const guess = numbersLines(studioNumbers(10), { destination: "website" });
    expect(guess[0].text).toMatch(/Our guess is \$0\.50–\$1\.50 per website visit.*planning guess, not a promise.*Day 6/);
    const real = numbersLines(studioNumbers(10, { cpv: 0.8, source: "ad_review", at: new Date().toISOString() }), { destination: "skool" });
    expect(real[0].text).toMatch(/Your real cost per visit/);
    expect(real[0].text).not.toMatch(/guess/i);
    expect(guess.find((l) => l.key === "statics")?.text).toContain("up to $15 a day across your two");
    expect(JSON.stringify(numbersLines(studioNumbers(5)))).not.toMatch(/\$5–\$10/);
    // Skool counts About-page visitors, so a website pack makes no days-to-100 claim.
    const level2 = guess.find((l) => l.key === "level2")?.text ?? "";
    expect(level2).toMatch(/counts About-page visitors, not emails/);
    expect(level2).not.toMatch(/takes \d/);
  });

  it("uses the member's real cost per visit from Ad review, else the Monday check-in", async () => {
    const { ws } = await makeWorkspace();
    expect(await realCostPerVisit(ws.id)).toBeNull();
    await saveCheckin(ws.id, { aboutVisitors: 200, adSpendPerDay: 10, newPaid: 0, networkSignups: 0 });
    expect(await realCostPerVisit(ws.id)).toMatchObject({ source: "checkin", cpv: 1.5 });
    const db = await getDb();
    await db.insert(aiGenerations).values({ workspaceId: ws.id, kind: "ad_review", input: { spend: 30, linkClicks: 40, impressions: 4000, leads: 2 }, output: {}, model: "rules" });
    expect(await realCostPerVisit(ws.id)).toMatchObject({ source: "ad_review", cpv: 0.75 });
    // A website pack only uses a review of an opt-in ad, and a check-in says nothing about it.
    expect(await realCostPerVisit(ws.id, "website")).toBeNull();
    await db.insert(aiGenerations).values({ workspaceId: ws.id, kind: "ad_review", input: { spend: 20, linkClicks: 20, destination: "optin" }, output: {}, model: "rules" });
    expect(await realCostPerVisit(ws.id, "website")).toMatchObject({ source: "ad_review", cpv: 1 });
    expect(await realCostPerVisit(ws.id)).toMatchObject({ cpv: 0.75 });
  });
});

describe("Ad studio: the 5 statics", () => {
  const FIELDS = ["name", "angle", "format", "persona", "benefit", "onImageText", "hook", "turn", "door", "primaryText", "headline", "cta", "imagePrompt", "storyNote", "designNote"] as const;

  it("the rule-based pack has 5 genuinely different statics with every field filled", () => {
    const statics = fallbackStatics(input());
    expect(statics).toHaveLength(5);
    for (const s of statics) {
      for (const f of FIELDS) expect(String(s[f]).trim().length, `${s.name}.${f}`).toBeGreaterThan(0);
      expect(s.onImageText.split(/\s+/).length).toBeLessThanOrEqual(7);
      expect(s.imagePrompt).toContain("4:5");
      expect(s.imagePrompt).toContain("1080×1350");
      expect(s.storyNote).toContain("9:16");
      expect(s.primaryText).toBe([s.hook, s.turn, s.door].join("\n\n"));
      expect(s.policy, s.name).toEqual({ ok: true, flags: [] });
    }
    // Andromeda: one format each, and every pair differs in at least two dimensions.
    expect(new Set(statics.map((s) => s.format)).size).toBe(5);
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) expect(differences(statics[i], statics[j]), `S${i + 1} vs S${j + 1}`).toBeGreaterThanOrEqual(2);
    expect(packProblems(statics)).toEqual([]);
    // Pain, Dream and Lesson; no Proof without a real result.
    expect(new Set(statics.map((s) => s.angle))).toEqual(new Set(["pain", "dream", "lesson"]));
    expect(statics.map((s) => s.format)).not.toContain("quote_card");
  });

  it("adds a Proof static only when there's a real member result", () => {
    const statics = fallbackStatics(input({ proof: "Mark trained 3 times a week for a month" }));
    expect(statics).toHaveLength(5);
    const proof = statics.find((s) => s.angle === "proof");
    expect(proof?.format).toBe("quote_card");
    expect(proof?.turn).toContain("Mark trained 3 times a week for a month");
    expect(proof?.policy.ok).toBe(true);
  });

  it("normalises an AI pack: no duplicate formats, no Proof without a result, gaps filled from the rules", () => {
    const ai = {
      name: "Desk dad",
      angle: "pain",
      format: "text_on_colour",
      persona: "Dads at a desk all day",
      benefit: "Energy after work",
      onImageText: "Your desk chair is winning right now, every single day",
      hook: "8 hours in a chair adds up.",
      turn: "Twenty minutes undoes more than you think.",
      door: "See the plan inside. Tap Learn more.",
      headline: "Twenty minutes, not two hours",
      cta: "Learn more",
      imagePrompt: "Bold yellow background with big words.",
      storyNote: "",
      designNote: "Make it huge.",
    };
    const out = normalizeStatics(
      [
        ai,
        { ...ai, name: "Same format again", persona: "Someone else" }, // duplicate format: dropped
        { ...ai, name: "Fake proof", format: "quote_card", angle: "proof" }, // no real result: dropped
        { nonsense: true }, // invalid: dropped
      ],
      input(),
    );
    expect(out).toHaveLength(5);
    expect(out[0].name).toBe("Desk dad");
    expect(out[0].onImageText.split(" ")).toHaveLength(7); // trimmed to 7 words
    expect(out[0].imagePrompt).toContain("Portrait 4:5, 1080×1350"); // size added
    expect(out[0].storyNote).toContain("9:16"); // default added
    expect(new Set(out.map((s) => s.format)).size).toBe(5);
    expect(out.some((s) => s.angle === "proof")).toBe(false);
    expect(packProblems(out)).toEqual([]);
  });

  it("flags Meta policy problems: personal attributes, income claims and fake testimonials", () => {
    const check = (t: string, angle?: "proof") => policyCheck([t], { angle, hasProof: false });
    expect(check("Are you overweight and tired?").ok).toBe(false);
    expect(check("You're broke and tired of it.").ok).toBe(false);
    expect(check("Lose your belly fat for good.").ok).toBe(false);
    expect(check("Members make $5,000 a month from home.").ok).toBe(false);
    expect(check("Build a $10k month.").ok).toBe(false);
    expect(check("Six-figure coaching, guaranteed.").flags.length).toBeGreaterThanOrEqual(2);
    expect(check("Lose 10 lbs in 8 weeks.").ok).toBe(false);
    expect(check("“Best group I ever joined” — Sarah").ok).toBe(false);
    expect(check("500 members have already joined.").ok).toBe(false);
    expect(check("A real result from the group.", "proof").flags[0]).toMatch(/fake testimonial/);
    // Plain, honest copy passes, and a price is not an income claim.
    expect(check("Most busy dads don't need more motivation. It's $29 a month: look inside first.")).toEqual({ ok: true, flags: [] });
    expect(limitWords("one two three four five six seven eight nine")).toBe("one two three four five six seven");
  });
});

describe("Ad studio: launch plan and video", () => {
  it("writes numbered Ads Manager click-steps for one Traffic campaign, one broad ad set and all 5 statics", () => {
    const statics = fallbackStatics(input());
    const plan = launchPlan({ budget: 10, country: "Canada", link: "https://app.example.com/go/fit-dads", pixel: true, statics });
    const settings = Object.fromEntries(plan.settings.map((s) => [s.label, s.value]));
    expect(settings["Campaign objective"]).toBe("Traffic");
    expect(settings["Performance goal"]).toMatch(/landing page views/);
    expect(settings["Ad sets"]).toBe("1");
    expect(settings.Audience).toMatch(/Canada, 18\+, Advantage\+ audience/);
    expect(settings.Placements).toBe("Advantage+ placements");
    expect(settings["Daily budget"]).toBe("$10");
    expect(settings["Website URL"]).toBe("https://app.example.com/go/fit-dads");
    const all = JSON.stringify(plan);
    expect(all).toContain("Pixel");
    expect(plan.steps.length).toBeGreaterThanOrEqual(8);
    expect(plan.destination).toBe("skool");
    expect(plan.after.map((s) => s.title)).toEqual(["Hands off till Day 6", "Get your verdicts on Day 6", "Kill ads go off on Day 6", "Refresh every 1–3 weeks"]);
    expect(all).not.toMatch(/Day 7|Day 8|Day 9/);
  });

  it("the website plan is Leads to the published funnel, with the Pixel and the Lead event", () => {
    const statics = fallbackStatics(input({ destination: "website" }));
    const plan = launchPlan({ budget: 10, country: "Canada", link: "https://app.example.com/go/fit-dads", pixel: true, statics, destination: "website", websiteUrl: "https://fit-dads.example.com" });
    const settings = Object.fromEntries(plan.settings.map((s) => [s.label, s.value]));
    expect(plan.destination).toBe("website");
    expect(settings).toMatchObject({ "Campaign objective": "Leads", "Campaign name": "Website · Leads", "Conversion location": "Website", Dataset: "Your Meta Pixel", "Conversion event": "Lead", "Website URL": "https://fit-dads.example.com", "Daily budget": "$10" });
    const steps = plan.steps.map((s) => `${s.title} ${s.detail}`).join(" ");
    expect(steps).toContain("Choose Leads");
    expect(steps).toContain("Website · Leads");
    expect(steps).toContain("Under Dataset, pick your Pixel, then set Conversion event to Lead");
    expect(steps).toContain("https://fit-dads.example.com");
    expect(steps).not.toContain("https://app.example.com/go/fit-dads");
    expect(steps).not.toContain("Traffic");
    expect(steps).not.toContain("isn't connected");
    expect(plan.after).toEqual(launchPlan({ budget: 5, country: "Canada", link: "x", pixel: true, statics }).after);
    // No Pixel yet: the plan says so, so nobody hunts an empty Dataset box.
    expect(JSON.stringify(launchPlan({ budget: 10, country: "Canada", link: "x", pixel: false, statics, destination: "website", websiteUrl: "https://a.example.com" }))).toContain("isn't connected yet");
    // Nowhere to send them: the Traffic plan, not a website plan with a blank address.
    expect(launchPlan({ budget: 10, country: "Canada", link: "x", pixel: true, statics, destination: "website" }).destination).toBe("skool");
  });

  it("website ads sell the free checklist; Skool-link ads invite people inside", () => {
    expect(fallbackStatics(input({ destination: "website" })).every((s) => s.door.includes("free checklist"))).toBe(true);
    const skool = fallbackStatics(input({ destination: "skool" }));
    expect(skool.every((s) => s.door.includes("look inside"))).toBe(true);
    for (const s of fallbackStatics(input({ destination: "website" }))) expect(s.policy, s.name).toEqual({ ok: true, flags: [] });
  });

  it("builds a 20–30 second Hook · Turn · Door selfie script on a static", () => {
    const statics = fallbackStatics(input());
    const v = videoFromConcept(statics[2], 2);
    expect(v.basedOn).toBe(2);
    expect(v.angle).toBe("lesson");
    expect(v.beats.map((b) => [b.part, b.time])).toEqual([
      ["Hook", "0–2s"],
      ["Turn", "2–20s"],
      ["Door", "20–28s"],
    ]);
    expect(v.beats.every((b) => b.say && b.caption && b.shot)).toBe(true);
    expect(v.policy.ok).toBe(true);
  });
});

describe("Ad studio: saving, Your path, Penny and the connector", () => {
  it("saves a pack without AI, prefills the next one and ticks off the statics step right before clicks", async () => {
    const { ws, user } = await makeWorkspace();
    const before = await computePath(ws, user.id);
    const steps = before.stages.flatMap((s) => s.steps);
    const at = steps.findIndex((s) => s.key === "statics");
    expect(steps[at]).toMatchObject({ title: "Make your 5 statics", lesson: "Day 1", href: `/app/w/${ws.id}/ads/studio`, done: false });
    expect(steps[at + 1].key).toBe("clicks");
    expect(steps[at - 1]).toMatchObject({ key: "research", title: "Find ads that already work", lesson: "Day 1" });

    const res = await makeAdStudioPack(ws.id, { audience: "busy dads over 40", promise: "Feel fit again", budget: 10, country: "GB", competitorAds: [{ page: "Rival", text: "Tired of starting over? Here's what works.", daysRunning: 62 }] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.model).toBe("rules");
    expect(res.pack.statics).toHaveLength(5);
    expect(res.pack.numbers.budget).toBe(10);
    expect(res.pack.country).toBe("United Kingdom");
    expect(res.pack.skoolLink).toBe(`http://localhost:3000/go/${ws.slug}`);
    expect(res.pack.inspiration[0]).toBe("Tired of starting over?");
    expect(res.pack.plan.settings.find((s) => s.label === "Website URL")?.value).toBe(res.pack.skoolLink);

    const db = await getDb();
    const rows = await db.select().from(aiGenerations).where(and(eq(aiGenerations.workspaceId, ws.id), eq(aiGenerations.kind, "ad_studio")));
    expect(rows).toHaveLength(1);
    expect(rows[0].input).toMatchObject({ businessName: "Fit Dads Club", budget: 10, country: "GB" });
    expect((await listAdStudioPacks(ws.id)).map((p) => p.id)).toEqual([res.id]);

    const defaults = await adStudioDefaults(ws);
    expect(defaults).toMatchObject({ budget: 10, country: "GB", audience: "busy dads over 40", promise: "Feel fit again" });

    const after = await computePath(ws, user.id);
    expect(after.stages.flatMap((s) => s.steps).find((s) => s.key === "statics")?.done).toBe(true);

    expect((await makeAdStudioPack(ws.id, { budget: 0 })).ok).toBe(false);
  });

  it("defaults to the website when a funnel is published and no pack exists, then to the Skool link", async () => {
    const { ws } = await makeWorkspace();
    const db = await getDb();
    expect(await adStudioDefaults(ws)).toMatchObject({ destination: "skool", budget: 5 });
    expect((await makeAdStudioPack(ws.id, { destination: "website", budget: 10 })).ok).toBe(false); // nothing published yet
    await db.insert(sites).values({ workspaceId: ws.id, name: "Funnel", slug: `funnel-web-${ws.id}`, theme: {} as never, published: true });
    expect(await publishedFunnelUrl(ws.id)).toContain(`funnel-web-${ws.id}`);
    expect(await adStudioDefaults(ws)).toMatchObject({ destination: "website", budget: 10 });

    const first = await makeAdStudioPack(ws.id, { budget: 10, country: "GB" });
    if (!first.ok) throw new Error(first.error);
    expect(first.pack.destination).toBe("website");
    expect(first.pack.websiteUrl).toContain(`funnel-web-${ws.id}`);
    expect(first.pack.plan.settings[0]).toEqual({ label: "Campaign objective", value: "Leads" });
    expect(first.pack.plan.settings.find((s) => s.label === "Website URL")?.value).toBe(first.pack.websiteUrl);

    // Day 2: the Skool link, at the course's $5, not Day 1's $10.
    expect(await adStudioDefaults(ws)).toMatchObject({ destination: "skool", budget: 5, country: "GB" });
    const second = await makeAdStudioPack(ws.id, { budget: 5 });
    if (!second.ok) throw new Error(second.error);
    expect(second.pack.destination).toBe("skool");
    expect(second.pack.websiteUrl).toBeUndefined();
    expect(second.pack.plan.settings[0]).toEqual({ label: "Campaign objective", value: "Traffic" });

    // The member can still choose.
    const again = await makeAdStudioPack(ws.id, { budget: 7, destination: "website" });
    if (!again.ok) throw new Error(again.error);
    expect(again.pack.destination).toBe("website");
  });

  it("the step-by-step guide says where Day 1's ads go", () => {
    expect(STEP_HOWTO.clicks.how.join(" ")).toMatch(/your website as a Leads campaign/);
    expect(STEP_HOWTO.refresh.how.join(" ")).toMatch(/My Skool link and \$5 a day/);
  });

  it("Penny knows the page and points at the main button", () => {
    const wid = "00000000-0000-4000-8000-000000000000";
    expect(pageGuideFor(`/app/w/${wid}/ads/studio`, wid)?.title).toBe("Ad studio");
    expect(pageGuideFor(`/app/w/${wid}/ads`, wid)?.title).toBe("Ad review");
    expect(STEP_HOWTO.statics.target).toBe("ad-studio-make");
    expect(STEP_HOWTO.statics.how.join(" ")).toContain("Make my 5 statics");
  });

  it("a connected AI app can make and save a pack, with the same checks", async () => {
    const { ws, user } = await makeWorkspace();
    const { token } = await createConnectorToken(ws.id, user.id, "Claude");
    const rpc = async (body: unknown) => (await mcpRoute(new NextRequest(`http://localhost/api/mcp/${token}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", accept: "application/json, text/event-stream" } }), { params: Promise.resolve({ token }) })).json();
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
      return { isError: r.result.isError as boolean, data: (() => { try { return JSON.parse(r.result.content[0].text); } catch { return r.result.content[0].text; } })() };
    };

    const tools = (await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" })).result.tools.map((t: { name: string }) => t.name);
    expect(tools).toContain("make_ad_studio_pack");
    expect(playbookByName("make_my_5_statics")?.title).toBe("Make my 5 statics");
    expect(playbookByName("make_my_5_statics")?.steps).toContain("make_ad_studio_pack");

    const written = await call("make_ad_studio_pack", {
      budget: 5,
      country: "us",
      audience: "new coaches",
      statics: [
        { name: "Are you stuck", angle: "pain", format: "notes_app", persona: "Coaches with no clients", benefit: "First client", onImageText: "Are you stuck at zero clients?", hook: "Are you stuck?", turn: "Most are.", door: "Tap Learn more.", headline: "Get unstuck", cta: "Learn more", imagePrompt: "A notes app screenshot. Portrait 4:5.", storyNote: "Stack it 9:16.", designNote: "Keep it native." },
      ],
      video: { angle: "pain", title: "Stuck", beats: [{ part: "Hook", time: "0-2s", say: "Zero clients?", caption: "Zero clients?", shot: "Selfie" }, { part: "Turn", time: "2-15s", say: "It's the offer.", caption: "It's the offer", shot: "Walk" }, { part: "Door", time: "15-25s", say: "Tap Learn more.", caption: "Tap Learn more", shot: "Point" }], tips: ["Film vertical."] },
    });
    expect(written.isError).toBe(false);
    expect(written.data.view).toContain("/ads/studio?pack=");
    expect(written.data.statics).toHaveLength(5);
    expect(written.data.statics[0]).toMatchObject({ id: "S1", name: "Are you stuck", policy: { ok: false } }); // "Are you…?" is flagged
    expect(written.data.checks).toEqual([]);
    expect(written.data.launchPlan.settings[0]).toEqual({ label: "Campaign objective", value: "Traffic" });
    expect(written.data.video.title).toBe("Stuck");

    const starter = await call("make_ad_studio_pack", { budget: 10 });
    expect(starter.isError).toBe(false);
    expect(starter.data.statics).toHaveLength(5);
    expect(starter.data.numbers.daysTo100Visitors).toEqual({ fast: 5, slow: 15 });

    const db = await getDb();
    const rows = await db.select({ model: aiGenerations.model }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, ws.id), eq(aiGenerations.kind, "ad_studio")));
    expect(rows.map((r) => r.model).sort()).toEqual(["connected AI app", "rules"]);
  });
});
