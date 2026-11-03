import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, contacts, emailMessages, unlockClaims, workspaces } from "@/lib/db/schema";
import {
  checkPostLink,
  claimEntryTicket,
  claimUnlock,
  createUnlock,
  engagementLeaders,
  getEntryTicket,
  needsEntryTicket,
  setEntryTicket,
  setUnlockActive,
  skoolGroupOf,
  unlockPostText,
} from "@/server/unlocks";
import { makeWorkspace } from "./helpers";

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const base = { reward: "The 7-day plan", rewardUrl: "https://docs.example.com/plan", action: "comment" as const, instructions: "Comment your #1 goal.", skoolPostUrl: "https://www.skool.com/fit-dads/goals-thread", zapierWebhookUrl: "" };

describe("unlocks: engage in Skool, get the reward", () => {
  it("only accepts links to posts inside this community", () => {
    expect(skoolGroupOf("https://www.skool.com/fit-dads/about")).toBe("fit-dads");
    expect(checkPostLink("https://www.skool.com/fit-dads/my-intro-123", "fit-dads").ok).toBe(true);
    expect(checkPostLink("https://www.skool.com/other-group/my-intro", "fit-dads").ok).toBe(false);
    expect(checkPostLink("https://www.skool.com/fit-dads/about", "fit-dads").ok).toBe(false);
    expect(checkPostLink("https://evil.example/fit-dads/x", "fit-dads").ok).toBe(false);
    expect(checkPostLink("javascript:alert(1)", null).ok).toBe(false);
  });

  it("a claim delivers the reward, tags the member engaged and emails them; repeats are idempotent", async () => {
    const { ws } = await makeWorkspace();
    const u = await createUnlock(ws.id, { title: "Starter plan", ...base });
    expect(unlockPostText(u)).toContain(`/u/${u.slug}`);
    const email = `claim-${stamp()}@example.com`;

    const res = await claimUnlock({ slug: u.slug, email, name: "Jane Doe", postUrl: "https://www.skool.com/fit-dads/goals-thread?c=abc" });
    expect(res).toMatchObject({ ok: true, already: false, rewardUrl: base.rewardUrl });

    const db = await getDb();
    const [c] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, ws.id), eq(contacts.email, email)));
    expect(c.tags).toEqual(expect.arrayContaining(["engaged", `unlock-${u.slug}`]));
    const acts = await db.select().from(activities).where(and(eq(activities.contactId, c.id), eq(activities.type, "skool_engaged")));
    expect(acts).toHaveLength(1);
    const mails = await db.select().from(emailMessages).where(eq(emailMessages.toEmail, email));
    expect(mails[0].subject).toContain("Unlocked");

    expect(await claimUnlock({ slug: u.slug, email: email.toUpperCase(), postUrl: "https://www.skool.com/fit-dads/goals-thread" })).toMatchObject({ ok: true, already: true });
    expect((await engagementLeaders(ws.id))[0]).toMatchObject({ email, claims: 1 });
  });

  it("flags a link reused by someone else, rejects other communities and paused unlocks", async () => {
    const { ws } = await makeWorkspace();
    const u = await createUnlock(ws.id, { title: "Swipe file", ...base, action: "post" });
    const link = `https://www.skool.com/fit-dads/my-win-${stamp()}`;
    await claimUnlock({ slug: u.slug, email: `a-${stamp()}@example.com`, postUrl: link });
    await claimUnlock({ slug: u.slug, email: `b-${stamp()}@example.com`, postUrl: link });
    const db = await getDb();
    const claims = await db.select().from(unlockClaims).where(eq(unlockClaims.unlockId, u.id));
    expect(claims.filter((c) => c.flagged)).toHaveLength(1);

    expect((await claimUnlock({ slug: u.slug, email: `c-${stamp()}@example.com`, postUrl: "https://www.skool.com/someone-else/post" })).ok).toBe(false);
    await setUnlockActive(ws.id, u.id, false);
    expect((await claimUnlock({ slug: u.slug, email: `d-${stamp()}@example.com`, postUrl: `https://www.skool.com/fit-dads/p-${stamp()}` })).ok).toBe(false);
  });

  it("the entry ticket gates new member accounts until they post, then lets them in", async () => {
    const admin = await makeWorkspace();
    const intro = await createUnlock(admin.ws.id, { title: "Say hi", ...base, action: "post", instructions: "Introduce yourself." });
    await setEntryTicket({ on: true, unlockId: intro.id, since: new Date(Date.now() - 60_000).toISOString() });
    const ticket = await getEntryTicket();
    expect(ticket?.on).toBe(true);

    const { ws, user } = await makeWorkspace();
    expect(needsEntryTicket(ticket, ws)).toBe(true);
    expect(needsEntryTicket(ticket, { ...ws, accessSource: "admin" })).toBe(false);
    // Workspaces created before the ticket was switched on are left alone (unless "everyone").
    expect(needsEntryTicket({ ...ticket!, since: new Date(Date.now() + 60_000).toISOString() }, ws)).toBe(false);

    const bad = await claimEntryTicket(ws.id, { email: user.email, name: user.name }, "https://www.skool.com/fit-dads/about");
    expect(bad.ok).toBe(false);
    const good = await claimEntryTicket(ws.id, { email: user.email, name: user.name }, `https://www.skool.com/fit-dads/hello-${stamp()}`);
    expect(good.ok).toBe(true);
    const db = await getDb();
    const [after] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(needsEntryTicket(ticket, after)).toBe(false);
    // The intro lands in the admin's CRM as an engaged member.
    const [c] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, admin.ws.id), eq(contacts.email, user.email)));
    expect(c.tags).toContain("engaged");
    await setEntryTicket({ on: false, unlockId: intro.id, since: new Date().toISOString() });
  });
});
