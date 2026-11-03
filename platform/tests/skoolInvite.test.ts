import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, workspaces } from "@/lib/db/schema";
import { upsertContact } from "@/server/contacts";
import { saveAutomation } from "@/server/automations";
import { presetByKey } from "@/server/automationPresets";
import { finishDraft } from "@/server/ai/automationDraft";
import { sendSkoolInvite } from "@/server/memberInvite";
import {
  checkSkoolInviteUrl,
  INVITED_TAG,
  inviteContactToSkool,
  maskInviteUrl,
  platformInviteUrl,
  setPlatformInviteUrl,
  setWorkspaceInviteUrl,
  workspaceInviteUrl,
} from "@/server/skoolInvite";
import { makeWorkspace } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

const HOOK = "https://api.skool.com/groups/fit-dads/webhooks/abc123secret";
const ok = () => vi.fn(async (_url: URL | string, _init?: RequestInit) => new Response("ok", { status: 200 }));

describe("Skool's Webhook plugin: invite people into a Skool group", () => {
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

  it("invites a contact once, the way Skool expects (?email=), and keeps the link encrypted", async () => {
    const { ws } = await makeWorkspace();
    const { contact } = await upsertContact({ workspaceId: ws.id, email: `jo-${Date.now()}@example.com`, firstName: "Jo", source: "landing_page" });

    expect(await inviteContactToSkool(ws.id, contact.id)).toMatch(/connect your Skool webhook/);

    await setWorkspaceInviteUrl(ws.id, HOOK);
    const db = await getDb();
    const [row] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, ws.id));
    expect(JSON.stringify(row.settings)).not.toContain("abc123secret");
    expect(row.settings.skoolInviteHint).toBe("api.skool.com/…cret");
    expect(await workspaceInviteUrl(ws.id)).toBe(HOOK);

    const fetchMock = ok();
    vi.stubGlobal("fetch", fetchMock);
    expect(await inviteContactToSkool(ws.id, contact.id)).toBe("Sent a Skool invite");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${HOOK}?email=${encodeURIComponent(contact.email!)}`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({ email: contact.email, first_name: "Jo" });
    const [after] = await db.select({ tags: contacts.tags }).from(contacts).where(eq(contacts.id, contact.id));
    expect(after.tags).toContain(INVITED_TAG);

    // Never twice.
    expect(await inviteContactToSkool(ws.id, contact.id)).toBe("Already invited to Skool");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a refused invite is reported, not retried forever, and never blocks the automation", async () => {
    const { ws } = await makeWorkspace();
    await setWorkspaceInviteUrl(ws.id, HOOK);
    const { contact } = await upsertContact({ workspaceId: ws.id, email: `sam-${Date.now()}@example.com`, firstName: "Sam", source: "landing_page" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    expect(await inviteContactToSkool(ws.id, contact.id)).toMatch(/didn't take the invite \(404\)/);
    const db = await getDb();
    const [after] = await db.select({ tags: contacts.tags }).from(contacts).where(eq(contacts.id, contact.id));
    expect(after.tags).not.toContain(INVITED_TAG);
  });

  it("is a real automation step: the recipe saves, and AI-built automations may use it", async () => {
    const { ws } = await makeWorkspace();
    const recipe = presetByKey("skool-invite-leads")!;
    expect(await saveAutomation(ws.id, null, { ...recipe.def, active: false })).toBeTruthy();
    const d = finishDraft(
      { name: "Invite leads", summary: "", why: "", trigger: { type: "lead_created", value: "" }, steps: [{ type: "skool_invite", tag: "", stage: "", minutes: 0, subject: "", body: "", message: "", temperature: "", instruction: "", sequenceId: "" }], notes: [] },
      { siteIds: new Set(), sequenceIds: new Set() },
    );
    expect("error" in d ? d.error : d.actions).toEqual([{ type: "skool_invite" }]);
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
