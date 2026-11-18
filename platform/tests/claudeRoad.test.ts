import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { chargeUsage } from "@/server/wallet";
import { connectorInUse, createConnectorToken, listConnectorTokens, resolveConnectorToken, revokeConnectorToken } from "@/server/connectors";
import { mcpTools } from "@/server/mcp";
import { PLAYBOOKS, playbookByName } from "@/server/playbooks";
import { runLaunchKit } from "@/server/ai/launchKit";
import { publishSite, listSites } from "@/server/sites";
import { CLAUDE_JOBS, aiGate, aiRunsFrom, runsLine, studioJob, type AiRuns } from "@/app/app/w/[wid]/ai/runs";
import { makeWorkspace } from "./helpers";

// The screens render as the signed-in member; everything else (data, AI runs, connector links) is real.
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
  return { ...made, refresh: async () => void (who.ctx = { ...(who.ctx as object), workspace: await reload() }) };
}

type PageFn = (p: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) => Promise<unknown>;
async function html(page: Promise<{ default: unknown }>, wid: string, sp: Record<string, string> = {}) {
  const el = await ((await page).default as PageFn)({ params: Promise.resolve({ wid }), searchParams: Promise.resolve(sp) });
  return renderToStaticMarkup(el as React.ReactElement)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;|“|”/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const KEY_NAG = "Add your free AI key first";
const ROAD = "You're on the Claude road";

describe("The Claude road: which card sits above an AI button", () => {
  const all: AiRuns[] = [
    aiRunsFrom({ provider: "gemini", aiEnabled: true, included: 3, used: 0, canPay: false }),
    aiRunsFrom({ provider: null, aiEnabled: true, included: 3, used: 1, canPay: false }),
    aiRunsFrom({ provider: null, aiEnabled: true, included: 3, used: 3, canPay: false }),
    aiRunsFrom({ provider: null, aiEnabled: true, included: 30, used: 30, canPay: true }),
    aiRunsFrom({ provider: null, aiEnabled: true, included: 1e9, used: 5, canPay: false }),
    aiRunsFrom({ provider: null, aiEnabled: false, included: 3, used: 0, canPay: false }),
  ];

  it("a connected Claude always gets the Claude card and never the key nag", () => {
    for (const r of all) expect(aiGate(r, true)).toEqual({ claudeCard: true, keyCard: false });
  });

  it("without Claude it is today's behaviour: the key card only when the next press can't use AI", () => {
    const keyCard = all.filter((r) => aiGate(r, false).keyCard).map((r) => r.kind);
    expect(keyCard.sort()).toEqual(["off", "out"]);
    for (const r of all) expect(aiGate(r, false).claudeCard).toBe(false);
  });

  it("the line beside the button stops saying no AI is connected once Claude is", () => {
    const off = aiRunsFrom({ provider: null, aiEnabled: false, included: 3, used: 0, canPay: false });
    expect(runsLine(off)).toBe("No AI is connected yet.");
    expect(runsLine(off, true)).not.toMatch(/No AI is connected/);
    expect(runsLine({ kind: "free", used: 0, total: 3, next: 1 }, true)).toBe("AI run 1 of 3 this month.");
  });
});

describe("Each Claude sentence maps to a real connector tool or playbook", () => {
  const tools = new Set(mcpTools().map((t) => t.name));

  it("every job names tools the connector really has, and a playbook that exists", () => {
    for (const [job, j] of Object.entries(CLAUDE_JOBS)) {
      expect(j.tools.length, job).toBeGreaterThan(0);
      for (const t of j.tools) expect(tools.has(t), `${job}: ${t}`).toBe(true);
      if (j.playbook) expect(PLAYBOOKS.some((p) => p.name === j.playbook), `${job}: ${j.playbook}`).toBe(true);
      expect(j.say).toContain(env.platformName);
    }
  });

  it("the launch kit has no tool of its own, so it uses the Day 1 with Claude playbook's words", () => {
    expect(tools.has("build_launch_kit")).toBe(false);
    expect(CLAUDE_JOBS.launch_kit.say).toBe(playbookByName("day_1_with_claude")!.say);
    expect(CLAUDE_JOBS.launch_kit.say).toContain("premium template");
  });

  it("Ad research searches the Ad Library for month-old ads and saves to the Ad research page", () => {
    expect(CLAUDE_JOBS.ad_research.say).toMatch(/^Search the Meta Ad Library for ads in my niche that have run for a month or more/);
    expect(CLAUDE_JOBS.ad_research.tools).toEqual(["search_competitor_ads", "save_ad_pack"]);
  });

  it("Ad studio: Day 2 is the website at $10 a day, Day 3 the Skool link at $5 a day", () => {
    expect(studioJob("website")).toBe("ad_studio_website");
    expect(studioJob("skool")).toBe("ad_studio_skool");
    expect(studioJob(undefined)).toBe("ad_studio_skool");
    expect(CLAUDE_JOBS.ad_studio_website.say).toMatch(/^Make my 5 statics for my website at \$10 a day/);
    expect(CLAUDE_JOBS.ad_studio_skool.say).toMatch(/^Make my 5 statics for my Skool link at \$5 a day/);
  });
});

describe("connectorInUse: a live connector link Claude has used", () => {
  it("is false until Claude uses the link, and false again once it is revoked", async () => {
    const { ws, user } = await makeWorkspace();
    expect(await connectorInUse(ws.id)).toBe(false);
    const { token } = await createConnectorToken(ws.id, user.id, "Claude");
    expect(await connectorInUse(ws.id)).toBe(false);
    await resolveConnectorToken(token);
    expect(await connectorInUse(ws.id)).toBe(true);
    const [row] = await listConnectorTokens(ws.id);
    await revokeConnectorToken(ws.id, row.id);
    expect(await connectorInUse(ws.id)).toBe(false);
  });

  it("only counts this workspace's links", async () => {
    const a = await makeWorkspace();
    const b = await makeWorkspace();
    await resolveConnectorToken((await createConnectorToken(a.ws.id, a.user.id, "Claude")).token);
    expect(await connectorInUse(a.ws.id)).toBe(true);
    expect(await connectorInUse(b.ws.id)).toBe(false);
  });
});

describe("The Claude road on the screens", () => {
  it("launch kit, Ad research and Ad studio swap the key nag for the Claude card, and keep the buttons", async () => {
    env.aiEnabled = true;
    const { ws, user } = await signIn();
    for (let i = 0; i < 3; i++) await chargeUsage(ws.id, "ai_generation", 1, { description: "test" });

    // No Claude, no key, runs used up: today's nag stays.
    const before = await html(import("@/app/app/w/[wid]/ads/research/page"), ws.id);
    expect(before).toContain("You've used your 3 free AI runs this month");
    expect(before).toContain("Add my free Gemini key");
    expect(before).not.toContain(ROAD);

    await resolveConnectorToken((await createConnectorToken(ws.id, user.id, "Claude")).token);

    const kit = await html(import("@/app/app/w/[wid]/launch/page"), ws.id);
    expect(kit).toContain(ROAD);
    expect(kit).toContain(`"${CLAUDE_JOBS.launch_kit.say}"`);
    expect(kit).not.toContain("Add my free Gemini key");
    expect(kit).not.toContain(KEY_NAG);
    expect(kit).toContain("Build my launch kit");
    expect(kit).toContain("Use the starter template instead");
    expect(kit).toContain("Want the buttons below to write with AI too?");

    const research = await html(import("@/app/app/w/[wid]/ads/research/page"), ws.id);
    expect(research).toContain(ROAD);
    expect(research).toContain(`"${CLAUDE_JOBS.ad_research.say}"`);
    expect(research).not.toContain("Add my free Gemini key");
    expect(research).toContain("Analyse with AI");

    // No website published yet and no pack: the Skool link at $5 a day (what make_ad_studio_pack would pick).
    const studio = await html(import("@/app/app/w/[wid]/ads/studio/page"), ws.id);
    expect(studio).toContain(ROAD);
    expect(studio).toContain(`"${CLAUDE_JOBS.ad_studio_skool.say}"`);
    expect(studio).toContain("Make my 5 statics");
  });

  it("Ad studio suggests the website at $10 a day once the website is published, and the card sits on top of a working key", async () => {
    env.aiEnabled = true;
    const { ws, user, refresh } = await signIn();
    const built = await runLaunchKit(ws.id, { businessName: "Fit Dads Club", ownerName: "Sam", niche: "fat loss for dads", audience: "busy dads", outcome: "lose 10 lbs", leadMagnetIdea: "Dad Reset", price: "$29", trialDays: 7 }, { useAi: false });
    if (!built.ok) throw new Error(built.error);
    const [site] = await listSites(ws.id);
    await publishSite(ws.id, site.id);
    await resolveConnectorToken((await createConnectorToken(ws.id, user.id, "Claude")).token);
    const db = await getDb();
    await db.update(workspaces).set({ settings: { ...ws.settings, aiProvider: "gemini", aiKeyEnc: encrypt("AIza-test"), aiKeyHint: "…test" } }).where(eq(workspaces.id, ws.id));
    await refresh();

    const studio = await html(import("@/app/app/w/[wid]/ads/studio/page"), ws.id);
    expect(studio).toContain(ROAD);
    expect(studio).toContain(`"${CLAUDE_JOBS.ad_studio_website.say}"`);
    // Their key still runs the button, and the card doesn't ask for one.
    expect(studio).toContain("Runs on your Google Gemini key.");
    expect(studio).not.toContain("Want the buttons below to write with AI too?");
  });
});
