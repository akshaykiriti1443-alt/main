import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { automationRuns } from "@/lib/db/schema";
import { upsertContact } from "@/server/contacts";
import { getAutomation, processAutomationStep, saveAutomation } from "@/server/automations";
import { AUTOMATION_PRESETS } from "@/server/automationPresets";
import { STEP_TYPES } from "@/server/ai/automationDraft";
import { sendSkoolInvite } from "@/server/memberInvite";
import { checkSkoolInviteUrl, maskInviteUrl, platformInviteUrl, setPlatformInviteUrl } from "@/server/skoolInvite";
import { makeWorkspace } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

const HOOK = "https://api.skool.com/groups/fit-dads/webhooks/abc123secret";
const ok = () => vi.fn(async (_url: URL | string, _init?: RequestInit) => new Response("ok", { status: 200 }));

describe("Skool's Webhook plugin: the platform owner's /join buyers get invited", () => {
  it("only takes Skool's own link or a Zapier hook", () => {
    expect(checkSkoolInviteUrl(HOOK)).toEqual({ ok: true, url: HOOK });
    expect(checkSkoolInviteUrl("https://hooks.zapier.com/hooks/catch/1/abc/").ok).toBe(true);
    expect(checkSkoolInviteUrl("http://api.skool.com/x").ok).toBe(false);
    expect(checkSkoolInviteUrl("https://evil.example.com/skool.com").ok).toBe(false);
    expect(checkSkoolInviteUrl("https://skool.com.evil.io/x").ok).toBe(false);
    expect(checkSkoolInviteUrl("not a link").ok).toBe(false);
    // A pasted test address isn't kept.
    expect(checkSkoolInviteUrl(`${HOOK}?email=me@x.com`)).toEqual({ ok: true, url: HOOK });
    expect(maskInviteUrl(HOOK)).toBe("api.skool.com/…cret");
  });

  it("pay here, get in there: /join buyers are invited to the platform owner's Skool group", async () => {
    await setPlatformInviteUrl(HOOK);
    expect(await platformInviteUrl()).toBe(HOOK);
    const fetchMock = ok();
    vi.stubGlobal("fetch", fetchMock);
    await sendSkoolInvite({ email: "buyer@example.com", name: "Bea Buyer" });
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${HOOK}?email=buyer%40example.com`);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    await expect(sendSkoolInvite({ email: "buyer@example.com" })).rejects.toThrow(/500/); // the job queue retries
    await setPlatformInviteUrl(null);
  });
});

describe("workspace Skool invites were removed", () => {
  it("is never offered: no recipe uses it and AI-built automations can't add it", () => {
    expect(AUTOMATION_PRESETS.some((p) => p.def.actions.some((a) => a.type === "skool_invite"))).toBe(false);
    expect((STEP_TYPES as readonly string[]).includes("skool_invite")).toBe(false);
  });

  it("an automation saved before still loads, and its Skool invite step is skipped while the rest runs", async () => {
    const { ws } = await makeWorkspace();
    const id = await saveAutomation(ws.id, null, {
      name: "Invite new leads to Skool",
      trigger: { type: "lead_created", value: "" },
      actions: [{ type: "skool_invite" }, { type: "add_tag", tag: "after-invite" }],
      active: true,
    });
    expect((await getAutomation(ws.id, id))?.actions[0]).toEqual({ type: "skool_invite" });

    const { contact } = await upsertContact({ workspaceId: ws.id, email: `jo-${Date.now()}@example.com`, firstName: "Jo", source: "landing_page" });
    const fetchMock = ok();
    vi.stubGlobal("fetch", fetchMock);
    const db = await getDb();
    const [run] = await db.insert(automationRuns).values({ workspaceId: ws.id, automationId: id, contactId: contact.id, status: "running" }).returning();
    await processAutomationStep(run.id);
    const [after] = await db.select().from(automationRuns).where(eq(automationRuns.id, run.id));
    expect(after.status).toBe("completed");
    expect(after.log.map((l) => l.message)).toEqual(["Skipped: Skool invites were removed", 'Tagged "after-invite"']);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
