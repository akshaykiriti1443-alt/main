import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiGenerations, workspaces } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { addContactPreset, DAY5_ADD_CONTACT, JOURNEY_COPY, postLinkPlaceholder } from "@/lib/week";
import { UNLOCK_SUGGEST_LIMITED, UNLOCK_SUGGEST_NO_AI, fallbackUnlock, suggestUnlock } from "@/server/ai/unlockSuggest";
import * as client from "@/server/ai/client";
import { makeWorkspace } from "./helpers";

vi.mock("@/server/ai/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/ai/client")>();
  return { ...real, generateStructured: vi.fn(real.generateStructured) };
});

const aiWas = env.aiEnabled;
afterEach(() => {
  env.aiEnabled = aiWas;
  vi.mocked(client.generateStructured).mockClear();
});

async function withBusiness(wsId: string) {
  const db = await getDb();
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, wsId)).limit(1);
  await db.update(workspaces).set({ settings: { ...ws.settings, niche: "Fat loss for busy dads" } }).where(eq(workspaces.id, wsId));
  await db.insert(aiGenerations).values({
    workspaceId: wsId,
    kind: "launch_kit",
    input: { businessName: "Fit Dads Club", ownerName: "Sam Owner", niche: "fat loss for busy dads", audience: "dads with desk jobs", outcome: "Lose 10 lbs in 8 weeks", tone: "bold" },
    output: { leadMagnetName: "7-Day Dad Reset" },
    model: "template",
  });
}

async function giveOwnKey(wsId: string) {
  const db = await getDb();
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, wsId)).limit(1);
  await db
    .update(workspaces)
    .set({ settings: { ...ws.settings, aiProvider: "gemini", aiKeyEnc: encrypt("test-key"), aiModel: "gemini-2.5-flash" } })
    .where(eq(workspaces.id, wsId));
}

describe("Suggest an unlock", () => {
  it("with no AI, fills in a starter idea from what they told us and says how to connect AI", async () => {
    env.aiEnabled = false;
    const { ws } = await makeWorkspace();
    await withBusiness(ws.id);
    const res = await suggestUnlock(ws.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.usedAi).toBe(false);
    expect(res.note).toBe(UNLOCK_SUGGEST_NO_AI);
    expect(res.note).toMatch(/Your AI/);
    expect(res.suggestion.title).toContain("fat loss for busy dads");
    expect(res.suggestion.reward).toContain("lose 10 lbs in 8 weeks");
    expect(res.suggestion.action).toBe("post");
    expect(res.suggestion.instructions.length).toBeGreaterThan(10);
    expect(vi.mocked(client.generateStructured)).not.toHaveBeenCalled();
  });

  it("never comes back empty, even knowing nothing", () => {
    const s = fallbackUnlock({ niche: "", outcome: "", audience: "", leadMagnetName: "" });
    expect(s.title).toBeTruthy();
    expect(s.reward).toBeTruthy();
    expect(s.instructions).toBeTruthy();
  });

  it("on the member's own AI, asks with their business and fills in the AI's idea", async () => {
    const { ws } = await makeWorkspace();
    await withBusiness(ws.id);
    await giveOwnKey(ws.id);
    vi.mocked(client.generateStructured).mockResolvedValueOnce({
      data: { title: "  The dad lunchbox swap list ", reward: "Ten swaps that save 300 calories.", action: "comment", instructions: "Comment the lunch you eat most." },
      usage: { inputTokens: 1, outputTokens: 1, model: "test" },
    });
    const res = await suggestUnlock(ws.id);
    expect(res.ok && res.usedAi).toBe(true);
    if (!res.ok) return;
    expect(res.note).toBeUndefined();
    expect(res.suggestion).toEqual({ title: "The dad lunchbox swap list", reward: "Ten swaps that save 300 calories.", action: "comment", instructions: "Comment the lunch you eat most." });
    const call = vi.mocked(client.generateStructured).mock.calls[0][0];
    expect(call.prompt).toContain("Fat loss for busy dads");
    expect(call.prompt).toContain("dads with desk jobs");
    expect(call.prompt).toContain("7-Day Dad Reset");
    expect(call.prompt).toContain("Tone: bold");
    expect(call.system).toContain(client.VOICE_RULES);
  });

  it("when the AI breaks, falls back to the starter idea and says why", async () => {
    const { ws } = await makeWorkspace();
    await withBusiness(ws.id);
    await giveOwnKey(ws.id);
    vi.mocked(client.generateStructured).mockRejectedValueOnce(new client.AiOutputError("The AI returned an unexpected format. Please try again."));
    const res = await suggestUnlock(ws.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.usedAi).toBe(false);
    expect(res.note).toMatch(/unexpected format.*starter idea/);
    expect(res.suggestion.title).toContain("fat loss");
  });

  it("is rate limited like the other suggest buttons, with a kind word and no AI spent", async () => {
    env.aiEnabled = false;
    const { ws } = await makeWorkspace();
    await withBusiness(ws.id);
    for (let i = 0; i < 15; i++) expect((await suggestUnlock(ws.id)).ok).toBe(true);
    expect(await suggestUnlock(ws.id)).toEqual({ ok: false, error: UNLOCK_SUGGEST_LIMITED });
    expect(UNLOCK_SUGGEST_LIMITED).toMatch(/Wait a minute/);
    // Another account has its own allowance.
    const other = await makeWorkspace();
    expect((await suggestUnlock(other.ws.id)).ok).toBe(true);
  });
});

describe("Leads from Day 5, and the post-link box", () => {
  it("Day 5's link opens Add contact with the tag friend filled in", () => {
    expect(DAY5_ADD_CONTACT).toContain("add=1");
    expect(DAY5_ADD_CONTACT).toContain("from=day5");
    expect(addContactPreset("day5").tags).toBe("friend");
    expect(addContactPreset(undefined).tags).toBe("");
    expect(addContactPreset("other").tags).toBe("");
    expect(JOURNEY_COPY.hero.warmAdd).toMatch(/Leads/);
  });

  it("the post-link example shows the group the post goes in, plus where to copy the link", () => {
    expect(postLinkPlaceholder("onex")).toBe("https://www.skool.com/onex/…");
    expect(postLinkPlaceholder(null)).toBe("https://www.skool.com/…");
    expect(JOURNEY_COPY.post.linkHint).toBe("In Skool: ⋯ on your post › Copy link");
  });
});
