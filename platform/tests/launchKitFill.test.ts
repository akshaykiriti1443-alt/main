import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { createSite } from "@/server/sites";
import {
  SKOOL_DESCRIPTION_MAX,
  buildPrompt,
  fallbackGroupDescription,
  fallbackKit,
  fitSkoolDescription,
  getLaunchKit,
  groupDescriptionFor,
  launchKitInputSchema,
  launchKitSchema,
  runLaunchKit,
  weeklyItems,
} from "@/server/ai/launchKit";
import { KIT_SUGGEST_NEEDS_NICHE, KIT_SUGGEST_NO_AI, cleanSuggestion, fallbackKitSuggestions, suggestKitAnswer, tidySuggestions } from "@/server/ai/kitSuggest";
import { KIT_FIELDS } from "@/app/app/w/[wid]/launch/deal";
import { buildLaunchKitAction, suggestKitAnswerAction } from "@/app/app/w/[wid]/launch/actions";
import { makeWorkspace } from "./helpers";

// "Whatever we ask members to fill out, the app helps them fill it out": the AI launch kit form.

const h = vi.hoisted(() => ({ ctx: null as unknown, reply: null as null | ((schema: unknown) => unknown) }));
vi.mock("@/server/tenancy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenancy")>()),
  requireWorkspace: async () => h.ctx,
}));
vi.mock("@/server/ai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/client")>()),
  generateStructured: async (opts: { schema: unknown }) => {
    if (!h.reply) throw new Error("The reply was cut off.");
    return { data: h.reply(opts.schema), usage: { inputTokens: 1, outputTokens: 1, model: "test-model" } };
  },
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    throw Object.assign(new Error("redirect"), { url });
  },
}));
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: () => {},
}));

const aiWas = env.aiEnabled;
afterEach(() => {
  env.aiEnabled = aiWas;
  h.reply = null;
});

async function signIn(settings?: Record<string, string>) {
  const made = await makeWorkspace();
  const db = await getDb();
  if (settings) await db.update(workspaces).set({ settings: { ...made.ws.settings, ...settings } }).where(eq(workspaces.id, made.ws.id));
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, made.ws.id));
  h.ctx = { workspace, user: { ...made.user, isPlatformAdmin: false }, role: "owner" };
  return { ...made, ws: workspace };
}

type PageFn = (p: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) => Promise<unknown>;
async function markup(wid: string, sp: Record<string, string> = {}) {
  const page = (await import("@/app/app/w/[wid]/launch/page")).default as PageFn;
  return renderToStaticMarkup((await page({ params: Promise.resolve({ wid }), searchParams: Promise.resolve(sp) })) as React.ReactElement);
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");
/** Every <input> on the page as its attributes, in any order React writes them. */
const inputs = (html: string) => [...html.matchAll(/<input([^>]*)\/?>/g)].map(([, a]) => Object.fromEntries([...a.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])));
const valueOf = (html: string, name: string) => inputs(html).find((i) => i.name === name)?.value?.replace(/&amp;/g, "&");
/** The radio that's checked for the framework pick. */
const picked = (html: string) => inputs(html).find((i) => i.name === "leadMagnetFramework" && "checked" in i)?.value;

const INPUT = { businessName: "Fit Dads Club", ownerName: "Sam Owner", niche: "fat loss for busy dads", audience: "busy dads", outcome: "lose 10 lbs in 8 weeks", leadMagnetIdea: "", offer: "", skoolUrl: "", tone: "friendly" as const, brandColor: "#2A44EE" };
const LONG = "Busy dads lose the belly with a 20-minute plan they can do at home, a weekly live class with Sam, feedback on every check-in, and a group that keeps them going all year long.";

describe("lead-magnet framework: the domino or go wide, picked on the form", () => {
  it("is a form box, so it rides through the build and back after an error", () => {
    expect(KIT_FIELDS).toContainEqual(["leadMagnetFramework", 10]);
    expect(KIT_FIELDS).toContainEqual(["groupWeekly", 200]);
  });

  it("the form shows both choices as radio cards, the domino checked and recommended", async () => {
    const { ws } = await signIn();
    const html = await markup(ws.id);
    const t = text(html);
    expect(t).toContain("The domino (recommended)");
    expect(t).toContain("Solve one valuable problem for free");
    expect(t).toContain("Go wide");
    expect(t).toContain("Show a wide audience they have the problem");
    expect(inputs(html).filter((i) => i.name === "leadMagnetFramework").map((i) => `${i.type}:${i.value}`)).toEqual(["radio:domino", "radio:wide"]);
    expect(picked(html)).toBe("domino");
    // Sent back after an error, the pick stays.
    expect(picked(await markup(ws.id, { new: "1", leadMagnetFramework: "wide" }))).toBe("wide");
  });

  it("Build my launch kit passes the pick and the weekly line to the kit", async () => {
    env.aiEnabled = false;
    const { ws } = await signIn();
    const fd = new FormData();
    for (const [k, v] of Object.entries({ ...INPUT, price: "$29", trialDays: "7", leadMagnetFramework: "wide", groupWeekly: "A weekly live class, a new lesson" })) fd.set(k, v);
    let url = "";
    try {
      await buildLaunchKitAction(ws.id, fd);
    } catch (e) {
      url = (e as { url?: string }).url ?? "";
    }
    const kitId = new URL(url, "http://x").searchParams.get("kit");
    expect(kitId).toBeTruthy();
    const kit = await getLaunchKit(ws.id, kitId!);
    expect(kit?.input.leadMagnetFramework).toBe("wide");
    expect(kit?.input.groupWeekly).toBe("A weekly live class, a new lesson");
    expect(kit?.kit.skoolAboutPage).toContain("🔹 A weekly live class");
  });
});

describe("What happens inside your group each week", () => {
  it("is optional, and goes into the prompt for the About page and the website", () => {
    expect(launchKitInputSchema.parse(INPUT).groupWeekly).toBeUndefined();
    expect(launchKitInputSchema.parse({ ...INPUT, groupWeekly: "  A weekly live class  " }).groupWeekly).toBe("A weekly live class");
    const prompt = buildPrompt({ ...INPUT, groupWeekly: "A weekly live class, a new lesson" });
    expect(prompt).toContain("What happens inside the group each week: A weekly live class, a new lesson");
    expect(prompt).toContain("Skool About page");
    expect(buildPrompt(INPUT)).toContain("(not given)");
    expect(buildPrompt(INPUT)).toContain("Never invent live calls");
  });

  it("the template lists exactly those things, and promises nothing weekly when it's blank", () => {
    expect(weeklyItems("A weekly live class, a new lesson; feedback on your work.")).toEqual(["A weekly live class", "a new lesson", "feedback on your work"]);
    const kit = fallbackKit({ ...INPUT, groupWeekly: "A weekly live class, a new lesson, feedback on your work" });
    expect(kit.skoolAboutPage).toContain("WHAT YOU GET EVERY WEEK");
    expect(kit.skoolAboutPage).toContain("🔹 A weekly live class\n🔹 A new lesson\n🔹 Feedback on your work");
    expect(kit.faq.find((f) => f.q === "What is the group?")?.a).toContain("A weekly live class, a new lesson, feedback on your work");
    expect(kit.benefits.map((b) => b.body).join(" ")).toContain("A weekly live class");
    const blank = fallbackKit(INPUT);
    expect(`${blank.skoolAboutPage} ${blank.thankYouBody} ${blank.faq.map((f) => f.a).join(" ")}`).not.toMatch(/live call|live help|every week|weekly/i);
  });
});

describe("Skool group description: 150 characters at most", () => {
  it("the schema holds it to Skool's limit", () => {
    expect(SKOOL_DESCRIPTION_MAX).toBe(150);
    const ok = launchKitSchema.shape.skoolGroupDescription;
    expect(ok.safeParse("x".repeat(150)).success).toBe(true);
    expect(ok.safeParse("x".repeat(151)).success).toBe(false);
  });

  it("long text is cut at a sentence or a word, never past 150", () => {
    expect(fitSkoolDescription("  Short and   sweet. ")).toBe("Short and sweet.");
    const cut = fitSkoolDescription(LONG);
    expect(cut.length).toBeLessThanOrEqual(150);
    expect(cut.endsWith("…")).toBe(true);
    expect(LONG.startsWith(cut.slice(0, -1))).toBe(true);
    const twoSentences = `${"A clear plan for busy dads who want to lose the belly at home in twenty minutes."} ${"Then a group that keeps you going with check-ins and wins every single week of the year."}`;
    expect(fitSkoolDescription(twoSentences)).toBe("A clear plan for busy dads who want to lose the belly at home in twenty minutes.");
    for (let n = 140; n < 400; n += 7) expect(fitSkoolDescription("word ".repeat(n)).length).toBeLessThanOrEqual(150);
  });

  it("the template writes one from their answers, even from very long answers", () => {
    const kit = fallbackKit(INPUT);
    // Who + Prize + Path in one line (no trial in INPUT, so no push).
    expect(kit.skoolGroupDescription).toBe("For busy dads: lose 10 lbs in 8 weeks, with a simple plan and a group that keeps you going.");
    // With a trial, the trial is the push.
    expect(fallbackKit({ ...INPUT, price: "$29", trialDays: 7 }).skoolGroupDescription).toBe("For busy dads: lose 10 lbs in 8 weeks, with a simple plan and a group that keeps you going. Start with a 7-day free trial.");
    const long = fallbackKit({ ...INPUT, outcome: "o".repeat(5) + " lose ".repeat(30), audience: "a ".repeat(90) });
    expect(long.skoolGroupDescription.length).toBeLessThanOrEqual(150);
    expect(launchKitSchema.safeParse(long).success).toBe(true);
    // Kits from before the description existed still get one.
    expect(groupDescriptionFor({}, INPUT)).toBe(fallbackGroupDescription(INPUT));
  });

  it("an AI reply over 150 characters is fitted, not failed", async () => {
    env.aiEnabled = true;
    const { ws } = await signIn();
    h.reply = () => ({ ...fallbackKit(INPUT), adPlan: undefined, skoolGroupDescription: LONG });
    const res = await runLaunchKit(ws.id, { ...INPUT, price: "$29", trialDays: 7 });
    if (!res.ok) throw new Error(res.error);
    expect(res.usedAi).toBe(true);
    const kit = await getLaunchKit(ws.id, res.generationId);
    expect(kit!.kit.skoolGroupDescription.length).toBeLessThanOrEqual(150);
    expect(kit!.kit.skoolGroupDescription.length).toBeGreaterThan(40);
    // An AI that leaves it out gets the template's line.
    h.reply = () => ({ ...fallbackKit(INPUT), adPlan: undefined, skoolGroupDescription: "" });
    const again = await runLaunchKit(ws.id, { ...INPUT, price: "$29", trialDays: 7 });
    if (!again.ok) throw new Error(again.error);
    expect((await getLaunchKit(ws.id, again.generationId))!.kit.skoolGroupDescription).toBe(fallbackGroupDescription({ ...INPUT, price: "$29", trialDays: 7 }));
  });

  it("the built kit shows the description and About page, each with its own copy button, and says Day 2 ads", async () => {
    const { ws } = await signIn();
    const res = await runLaunchKit(ws.id, { ...INPUT, price: "$29", trialDays: 7 }, { useAi: false });
    if (!res.ok) throw new Error(res.error);
    const t = text(await markup(ws.id));
    expect(t).toContain("Skool group description");
    expect(t).toContain("Copy description");
    expect(t).toContain("Copy About page");
    expect(t).toContain(`${fallbackGroupDescription({ ...INPUT, price: "$29", trialDays: 7 }).length} of 150 characters`);
    expect(t).toContain("Settings › General");
    expect(t).toContain("Your Day 2 ads offer it by this name");
    expect(t).not.toMatch(/Day 1 ads|Today's five ads/);
  });
});

describe("first build: prefilled from what the account already knows", () => {
  it("fills niche, audience and price from settings, and the Skool link from the account", async () => {
    const { ws } = await signIn({ niche: "Strength for new mums", audience: "New mums", offer: "$19 a month", skoolUrl: "" });
    await createSite({ workspaceId: ws.id, name: "Old site", skoolUrl: "https://www.skool.com/strong-mums/about", pages: [] });
    const html = await markup(ws.id);
    expect(valueOf(html, "niche")).toBe("Strength for new mums");
    expect(valueOf(html, "audience")).toBe("New mums");
    expect(valueOf(html, "price")).toBe("$19");
    // Settings had no link saved; the account's link (its website's copy) fills the box.
    expect(valueOf(html, "skoolUrl")).toBe("https://www.skool.com/strong-mums/about");
    expect(text(html)).toContain("It's what your Day 2 ads offer");
    expect(text(html)).not.toContain("Day 1 ads");
    expect(text(html)).toContain("What happens inside your group each week?");
    expect(inputs(html).find((i) => i.name === "groupWeekly")?.placeholder).toBe("A weekly live class, a new lesson, feedback on your work");
  });

  it("a rebuild comes back with the outcome, weekly line and pick from the last kit", async () => {
    const { ws } = await signIn();
    const res = await runLaunchKit(ws.id, { ...INPUT, price: "$29", trialDays: 7, leadMagnetFramework: "wide", groupWeekly: "A new lesson" }, { useAi: false });
    if (!res.ok) throw new Error(res.error);
    const html = await markup(ws.id, { new: "1" });
    expect(valueOf(html, "outcome")).toBe("lose 10 lbs in 8 weeks");
    expect(valueOf(html, "groupWeekly")).toBe("A new lesson");
    expect(picked(html)).toBe("wide");
  });
});

describe("Suggest: 2 or 3 answers from the niche, one click fills the box", () => {
  it("the template offers three answers for each box from the niche", () => {
    for (const field of ["audience", "outcome", "leadMagnetIdea"] as const) {
      const out = fallbackKitSuggestions(field, { niche: "fat loss for busy dads", audience: "" });
      expect(out, field).toHaveLength(3);
      for (const o of out) expect(o.length, o).toBeGreaterThan(5);
      expect(new Set(out).size).toBe(3);
    }
    expect(fallbackKitSuggestions("audience", { niche: "fat loss for busy dads", audience: "" })[0]).toBe("Busy dads who are just starting out");
    expect(fallbackKitSuggestions("audience", { niche: "Yoga", audience: "" })[0]).toBe("Beginners who want help with yoga");
    expect(fallbackKitSuggestions("leadMagnetIdea", { niche: "fat loss for busy dads", audience: "" })[0]).toBe("The 7-Day Fat Loss Quick-Start");
    expect(fallbackKitSuggestions("outcome", { niche: "", audience: "" })).toEqual([]);
  });

  it("AI answers are cleaned, deduped and capped at three", () => {
    expect(cleanSuggestion("leadMagnetIdea", '1. "The Dad Reset."')).toBe("The Dad Reset");
    expect(tidySuggestions("audience", ["- Busy dads", "busy dads", "New dads over 40", "x", "Dads with desk jobs", "One more"])).toEqual(["Busy dads", "New dads over 40", "Dads with desk jobs"]);
  });

  it("with no AI, the button still returns starter answers and says so; with no niche it asks for one", async () => {
    env.aiEnabled = false;
    const { ws } = await signIn();
    const res = await suggestKitAnswerAction(ws.id, { field: "audience", niche: "fat loss for busy dads" });
    expect(res).toEqual({ ok: true, options: fallbackKitSuggestions("audience", { niche: "fat loss for busy dads", audience: "" }), usedAi: false, note: KIT_SUGGEST_NO_AI });
    expect(await suggestKitAnswer(ws.id, { field: "outcome" })).toEqual({ ok: false, error: KIT_SUGGEST_NEEDS_NICHE });
    // A niche saved in Settings is enough.
    const saved = await signIn({ niche: "golf for beginners" });
    const golf = await suggestKitAnswer(saved.ws.id, { field: "outcome" });
    expect(golf.ok && golf.options[0]).toContain("golf");
  });

  it("with AI, the options come from the AI; a broken reply falls back to the starter answers", async () => {
    env.aiEnabled = true;
    const { ws } = await signIn();
    h.reply = () => ({ options: ["Dads 30-50 with desk jobs", "New dads who stopped training", "Dads who want to keep up with their kids"] });
    const res = await suggestKitAnswer(ws.id, { field: "audience", niche: "fat loss for busy dads" });
    expect(res).toEqual({ ok: true, options: ["Dads 30-50 with desk jobs", "New dads who stopped training", "Dads who want to keep up with their kids"], usedAi: true });
    h.reply = null;
    const broke = await suggestKitAnswer(ws.id, { field: "outcome", niche: "fat loss for busy dads" });
    expect(broke.ok && broke.usedAi).toBe(false);
    expect(broke.ok && broke.options).toHaveLength(3);
  });

  it("the form has a Suggest button for who it's for, the result and the checklist name", async () => {
    const { ws } = await signIn();
    const t = text(await markup(ws.id));
    expect(t.match(/Suggest /g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(t).toContain("AI suggests who it's for");
    expect(t).toContain("AI suggests a result");
    expect(t).toContain("AI suggests a name");
  });
});
