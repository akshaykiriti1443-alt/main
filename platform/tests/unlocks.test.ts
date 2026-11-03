import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, contacts, emailMessages, unlockClaims, workspaces } from "@/lib/db/schema";
import {
  CLAIM_LIMITS,
  checkPostLink,
  claimEntryTicket,
  claimUnlock,
  createUnlock,
  engagementLeaders,
  entryTicketPending,
  getEntryTicket,
  needsEntryTicket,
  setEntryTicket,
  setUnlockActive,
  skoolGroupOf,
  unlockPostText,
} from "@/server/unlocks";
import { makeWorkspace } from "./helpers";
import { grantAccess } from "@/server/access";
import { renderEmail } from "@/server/email/render";

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

  it("a claimant's typed name can't put a link into the owner's email", async () => {
    const { ws } = await makeWorkspace();
    const u = await createUnlock(ws.id, { title: "Phish test", ...base });
    const email = `victim-${stamp()}@example.com`;
    await claimUnlock({ slug: u.slug, email, name: "[Claim-your-reward](https://evil.example/login)", postUrl: `https://www.skool.com/fit-dads/goals-thread?c=${stamp()}` });
    const db = await getDb();
    const [c] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, ws.id), eq(contacts.email, email)));
    expect(c.firstName).not.toMatch(/[[\]()]/);
    // Even a markdown-looking value from elsewhere renders as plain text.
    const r = renderEmail({ subject: "Hi", body: "Hi {{first_name}}", vars: { first_name: "[x](https://evil.example)" }, businessName: "Fit Dads" });
    expect(r.html).not.toContain("<a href=\"https://evil.example");
    expect(r.html).toContain("&#91;x&#93;");
    expect(r.text).toContain("[x](https://evil.example)");
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

  it("comment unlocks don't flag members who paste the announcement post, and flagged claims run nothing", async () => {
    const { ws } = await makeWorkspace();
    const u = await createUnlock(ws.id, { title: "Goals", ...base });
    expect(unlockPostText(u)).not.toContain("or this post");
    for (const who of ["a", "b", "c"]) await claimUnlock({ slug: u.slug, email: `${who}-${stamp()}@example.com`, postUrl: base.skoolPostUrl });
    const db = await getDb();
    expect((await db.select().from(unlockClaims).where(eq(unlockClaims.unlockId, u.id))).filter((c) => c.flagged)).toHaveLength(0);

    // The same specific comment link from two people is still flagged, and the second gets no "engaged" tag.
    const comment = `${base.skoolPostUrl}?c=${stamp()}`;
    await claimUnlock({ slug: u.slug, email: `d-${stamp()}@example.com`, postUrl: comment });
    const late = `e-${stamp()}@example.com`;
    await claimUnlock({ slug: u.slug, email: late, postUrl: comment });
    const [c] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, ws.id), eq(contacts.email, late)));
    expect(c.tags).not.toContain("engaged");
  });

  it("public claims are rate limited per network", async () => {
    const { ws } = await makeWorkspace();
    const u = await createUnlock(ws.id, { title: "Limits", ...base });
    const ip = `10.9.${stamp().slice(-3)}.7`;
    const results = [];
    for (let i = 0; i < CLAIM_LIMITS.ipPerUnlock[0].max + 1; i++) {
      results.push((await claimUnlock({ slug: u.slug, email: `r${i}-${stamp()}@example.com`, postUrl: `https://www.skool.com/fit-dads/p-${stamp()}`, limits: { ip } })).ok);
    }
    expect(results.filter(Boolean)).toHaveLength(CLAIM_LIMITS.ipPerUnlock[0].max);
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

  it("the entry ticket stands down while its unlock can't be claimed, and direct buyers skip it", async () => {
    const admin = await makeWorkspace();
    const intro = await createUnlock(admin.ws.id, { title: "Say hi", ...base, action: "post", instructions: "Introduce yourself." });
    await setEntryTicket({ on: true, unlockId: intro.id, since: new Date(Date.now() - 60_000).toISOString() });
    const { ws, user } = await makeWorkspace();
    expect(await entryTicketPending(await getEntryTicket(), ws)).toBe(true);

    // Bought on /join: may not be in the community at all, so no intro step. The exception follows
    // the owner's purchase, so their teammates get in too (the gate never looks at the viewer).
    await grantAccess({ email: user.email, channel: "stripe", until: new Date(Date.now() + 86_400_000) });
    expect(await entryTicketPending(await getEntryTicket(), ws)).toBe(false);

    // The unlock's workspace pauses: claims fail, so the ticket must not trap anyone.
    const db = await getDb();
    await db.update(workspaces).set({ status: "paused", pauseReason: "admin" }).where(eq(workspaces.id, admin.ws.id));
    const paused = await getEntryTicket();
    expect(paused).toMatchObject({ on: false, enabled: true });
    expect(needsEntryTicket(paused, ws)).toBe(false);
    await db.update(workspaces).set({ status: "active", pauseReason: null }).where(eq(workspaces.id, admin.ws.id));
    await setEntryTicket({ on: false, unlockId: intro.id, since: new Date().toISOString() });
  });
});
