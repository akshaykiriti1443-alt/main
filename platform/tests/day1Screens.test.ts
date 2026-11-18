import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { chargeUsage } from "@/server/wallet";
import { createConnectorToken, resolveConnectorToken } from "@/server/connectors";
import { runLaunchKit } from "@/server/ai/launchKit";
import { makeWorkspace } from "./helpers";

// The screens render as the signed-in member; everything else (data, AI runs) is real.
const who = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock("@/server/tenancy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenancy")>()),
  requireWorkspace: async () => who.ctx,
}));

const aiWas = env.aiEnabled;
afterEach(() => {
  env.aiEnabled = aiWas;
});

async function signIn() {
  const made = await makeWorkspace();
  const db = await getDb();
  const reload = async () => (await db.select().from(workspaces).where(eq(workspaces.id, made.ws.id)))[0];
  who.ctx = { workspace: await reload(), user: { ...made.user, isPlatformAdmin: false }, role: "owner" };
  return { ...made, reload, refresh: async () => void (who.ctx = { ...(who.ctx as object), workspace: await reload() }) };
}

type PageFn = (p: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) => Promise<unknown>;
async function html(page: Promise<{ default: unknown }>, wid: string, sp: Record<string, string> = {}) {
  const el = await ((await page).default as PageFn)({ params: Promise.resolve({ wid }), searchParams: Promise.resolve(sp) });
  // Strip tags so assertions read like the screen.
  return renderToStaticMarkup(el as React.ReactElement).replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");
}

const JARGON = /server|platform owner|wallet|add funds|AI generation|ANTHROPIC/i;

describe("Day 1 screens", () => {
  it("Your AI leads with connecting Claude, keeps the free key as the fallback, and confirms a saved key works", async () => {
    env.aiEnabled = true;
    const { ws, user, refresh } = await signIn();
    const before = await html(import("@/app/app/w/[wid]/ai/page"), ws.id);
    expect(before).toContain("Connect your Claude");
    expect(before).toContain("Make your connector URL");
    expect(before).toContain("Create connector URL");
    expect(before).toContain("Paste it into Claude");
    expect(before).toContain("Ask Claude to build your Day 1");
    expect(before).toContain("Build my website from the premium template");
    expect(before).toContain("No Claude? A free Gemini key works too");
    expect(before).toContain("Open Google AI Studio");
    expect(before).toContain("Press Create API key, then copy it");
    expect(before).toContain("Paste it here and press Save key");
    expect(before).toContain("You have 3 of 3 free AI runs left this month");
    // Claude first, the key second, ChatGPT and the rest under the fold.
    expect(before.indexOf("Connect your Claude")).toBeLessThan(before.indexOf("No Claude? A free Gemini key works too"));
    expect(before.indexOf("No Claude? A free Gemini key works too")).toBeLessThan(before.indexOf("chatgpt.com/plugins"));
    expect(before).not.toContain("Pay for Claude or ChatGPT?");
    // The main path, up to the optional folds (those quote other apps' own menus, like "custom MCP server").
    expect(before.slice(0, before.indexOf("Use a different AI"))).not.toMatch(JARGON);

    // Connected through the connector: it says so, and the key stays there as the second way.
    const { token } = await createConnectorToken(ws.id, user.id, "My Claude");
    // Only made: it says it's waiting for Claude, not that Claude is connected.
    const made = await html(import("@/app/app/w/[wid]/ai/page"), ws.id);
    expect(made).toContain("Link made · waiting for Claude");
    expect(made).toContain("Your path ticks this step once Claude uses it");
    expect(made).not.toContain("Your Claude is connected");
    await resolveConnectorToken(token);
    const linked = await html(import("@/app/app/w/[wid]/ai/page"), ws.id);
    expect(linked).toContain("Connected");
    expect(linked).toContain("My Claude");
    expect(linked).toContain("Your Claude is connected. Ask it to build your Day 1");
    expect(linked).toContain("No Claude? A free Gemini key works too");

    const db = await getDb();
    await db.update(workspaces).set({ settings: { ...ws.settings, aiProvider: "gemini", aiKeyEnc: encrypt("AIza-test"), aiKeyHint: "…test", aiModel: "gemini-2.5-flash" } }).where(eq(workspaces.id, ws.id));
    await refresh();
    const after = await html(import("@/app/app/w/[wid]/ai/page"), ws.id);
    expect(after).toContain("Your key works");
    expect(after).toContain("Check my key");
    expect(after.indexOf("Your key works")).toBeLessThan(after.indexOf("Use a different key"));
    expect(after.slice(0, after.indexOf("Use a different key"))).not.toMatch(JARGON);
  });

  it("the launch kit asks for price and trial, counts the AI run, and shows the deal check once built", async () => {
    env.aiEnabled = true;
    const { ws } = await signIn();
    const form = await html(import("@/app/app/w/[wid]/launch/page"), ws.id);
    expect(form).toContain("What will you charge a month?");
    expect(form).toContain("7-day free trial");
    expect(form).toContain("Name your free checklist");
    expect(form).toContain("AI run 1 of 3 this month.");
    expect(form).not.toMatch(JARGON);

    for (let i = 0; i < 3; i++) await chargeUsage(ws.id, "ai_generation", 1, { description: "test" });
    const out = await html(import("@/app/app/w/[wid]/launch/page"), ws.id);
    expect(out).toContain("You've used your 3 free AI runs this month");
    expect(out).toContain("Add my free Gemini key");
    expect(out).toContain("Use the starter template instead");

    const kit = await runLaunchKit(ws.id, { businessName: "Fit Dads Club", ownerName: "Sam", niche: "fat loss for dads", audience: "busy dads", outcome: "lose 10 lbs", leadMagnetIdea: "Dad Reset", price: "$29", trialDays: 7 }, { useAi: false });
    if (!kit.ok) throw new Error(kit.error);
    const built = await html(import("@/app/app/w/[wid]/launch/page"), ws.id);
    expect(built).toContain("Your thank-you page states the deal");
    expect(built).toContain("$29 a month");
    expect(built).toContain("7 days free");
    expect(built).toContain("Your free checklist");
    expect(built).toContain("Dad Reset");
    expect(built).toContain("Change answers and rebuild");

    // Rebuilding comes back with the last answers filled in.
    const again = await html(import("@/app/app/w/[wid]/launch/page"), ws.id, { new: "1" });
    expect(again).toContain("It rewrites the kit you have");
  });

  it("Ad studio shows what each destination offers and the out-of-runs card", async () => {
    env.aiEnabled = true;
    const { ws } = await signIn();
    await runLaunchKit(ws.id, { businessName: "Fit Dads Club", ownerName: "Sam", niche: "fat loss for dads", audience: "busy dads", outcome: "lose 10 lbs", leadMagnetIdea: "Dad Reset", price: "$29", trialDays: 7 }, { useAi: false });
    for (let i = 0; i < 3; i++) await chargeUsage(ws.id, "ai_generation", 1, { description: "test" });
    const page = await html(import("@/app/app/w/[wid]/ads/studio/page"), ws.id);
    expect(page).toContain("Offers: Free checklist: Dad Reset");
    expect(page).toContain("Offers: 7-day free trial of Fit Dads Club, then $29 a month");
    expect(page).toContain("Add my free Gemini key");
    expect(page).toContain("not written by AI");
    expect(page).not.toMatch(JARGON);
  });

  it("Ad research leads with copy-and-paste, not a switched-off search", async () => {
    env.aiEnabled = false;
    const { ws } = await signIn();
    const page = await html(import("@/app/app/w/[wid]/ads/research/page"), ws.id);
    expect(page).toContain("Copy 3 ads that have run a month or more");
    expect(page).toContain("Search in Meta Ad Library");
    expect(page).toContain("Competitor ads");
    expect(page).not.toContain("isn't switched on");
    expect(page.indexOf("Copy 3 ads")).toBeLessThan(page.indexOf("Paste them here"));
    expect(page).not.toMatch(JARGON);
  });
});
