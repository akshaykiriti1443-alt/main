// Regression tests for the fixes from the independent code review.
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { automationRuns, channelConnections, contacts, emailCampaigns, emailMessages, jobs, subscriptions, usageCounters, workspaces } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { monthKey } from "@/lib/util";
import { createAccessCode, enforceAccess, recordSkoolApproval, redeemCode } from "@/server/access";
import { adminSetAgency, adminSetWorkspace } from "@/server/admin";
import { agencyForHost, createAgency, createSubAccount, setSubAccountStatus } from "@/server/agency";
import { createUser } from "@/server/auth";
import { saveAutomation } from "@/server/automations";
import { handleStripeEvent } from "@/server/billing/stripe";
import { addTag, getContact, upsertContact } from "@/server/contacts";
import { setAgencyAppDomain } from "@/server/domains";
import { processCampaignSend } from "@/server/email/campaigns";
import { processEmailSend, queueEmail } from "@/server/email/send";
import { ingestInbound } from "@/server/inbox";
import { runDueJobs } from "@/server/jobs/runner";
import { inviteMember, listMembers } from "@/server/team";
import { chargeUsage, creditWallet, getOrCreateWallet, refundUsage } from "@/server/wallet";
import { makeWorkspace } from "./helpers";

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function statusOf(workspaceId: string) {
  const db = await getDb();
  const [w] = await db.select({ status: workspaces.status, pauseReason: workspaces.pauseReason }).from(workspaces).where(eq(workspaces.id, workspaceId));
  return w;
}

async function usedThisMonth(workspaceId: string, unit: "email" | "ai_generation") {
  const db = await getDb();
  const [c] = await db
    .select({ used: usageCounters.used })
    .from(usageCounters)
    .where(and(eq(usageCounters.workspaceId, workspaceId), eq(usageCounters.unit, unit), eq(usageCounters.period, monthKey())));
  return c?.used ?? 0;
}

describe("team", () => {
  it("never changes an existing member's role through an invite", async () => {
    const { ws, user } = await makeWorkspace();
    const res = await inviteMember({ workspaceId: ws.id, workspaceName: ws.name, email: user.email, name: "Sam", role: "user" });
    expect(res.alreadyMember).toBe(true);
    expect((await listMembers(ws.id)).find((m) => m.userId === user.id)?.role).toBe("owner");
  });
});

describe("pauses", () => {
  it("member codes and Zapier only lift pauses caused by lapsed access", async () => {
    const { ws, user } = await makeWorkspace();
    const now = Date.now();
    const code = `RV${stamp()}`.slice(0, 14);
    await createAccessCode({ code, label: "review", validFrom: new Date(now - 86_400_000), validUntil: new Date(now + 20 * 86_400_000) });

    await adminSetWorkspace(ws.id, { status: "paused" });
    expect((await redeemCode(ws.id, code)).ok).toBe(true);
    await recordSkoolApproval({ email: user.email });
    expect(await statusOf(ws.id)).toEqual({ status: "paused", pauseReason: "admin" });

    await adminSetWorkspace(ws.id, { status: "active" });
    const db = await getDb();
    await db.update(workspaces).set({ accessVerifiedUntil: new Date(now - 1000) }).where(eq(workspaces.id, ws.id));
    await enforceAccess(new Date(now));
    await enforceAccess(new Date(now + 8 * 86_400_000));
    expect(await statusOf(ws.id)).toEqual({ status: "paused", pauseReason: "access" });
    expect((await redeemCode(ws.id, code)).ok).toBe(true);
    expect(await statusOf(ws.id)).toEqual({ status: "active", pauseReason: null });
  });

  it("codes can't change accounts the platform or an agency manages", async () => {
    const { ws } = await makeWorkspace();
    await adminSetWorkspace(ws.id, { accessSource: "admin" });
    expect((await redeemCode(ws.id, "ANYCODE")).ok).toBe(false);
  });

  it("an agency can't lift a pause set by the platform admin", async () => {
    const owner = await createUser({ email: `ag-${stamp()}@example.com`, name: "Agency Owner", password: "password123" });
    const agency = await createAgency(owner.id, "Pause Lab");
    const ws = await createSubAccount({ agencyId: agency.id, agencyName: "Pause Lab", name: "Client", ownerEmail: `client-${stamp()}@example.com`, ownerName: "Cam" });

    await adminSetWorkspace(ws.id, { status: "paused" });
    expect(await setSubAccountStatus(agency.id, ws.id, "active")).toBe(false);
    expect(await setSubAccountStatus(agency.id, ws.id, "paused")).toBe(false);
    expect(await statusOf(ws.id)).toEqual({ status: "paused", pauseReason: "admin" });

    await adminSetWorkspace(ws.id, { status: "active" });
    expect(await setSubAccountStatus(agency.id, ws.id, "paused")).toBe(true);
    expect(await statusOf(ws.id)).toEqual({ status: "paused", pauseReason: "agency" });
    expect(await setSubAccountStatus(agency.id, ws.id, "active")).toBe(true);
    expect(await statusOf(ws.id)).toEqual({ status: "active", pauseReason: null });
  });
});

describe("inbox", () => {
  it("matches every text from one phone number to one contact", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    const db = await getDb();
    const [conn] = await db
      .insert(channelConnections)
      .values({ workspaceId: ws.id, kind: "sms", externalId: `+1555${stamp().slice(-7)}`, name: "SMS", accessTokenEnc: encrypt("x") })
      .returning();
    const phone = "+15557654321";
    await ingestInbound({ connection: conn, channel: "sms", threadId: phone, externalId: `SM1-${ws.id}`, body: "hi", at: new Date(), phone });
    await ingestInbound({ connection: conn, channel: "sms", threadId: phone, externalId: `SM2-${ws.id}`, body: "what's the price?", at: new Date(), phone });
    const list = await db.select().from(contacts).where(and(eq(contacts.workspaceId, ws.id), eq(contacts.phone, phone)));
    expect(list).toHaveLength(1);
  });
});

describe("automation loop guard", () => {
  it("stops two automations that keep triggering each other", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    await saveAutomation(ws.id, null, {
      name: "Ping",
      trigger: { type: "tag_added", value: "ping" },
      actions: [{ type: "remove_tag", tag: "pong" }, { type: "add_tag", tag: "pong" }],
      active: true,
    });
    await saveAutomation(ws.id, null, {
      name: "Pong",
      trigger: { type: "tag_added", value: "pong" },
      actions: [{ type: "remove_tag", tag: "ping" }, { type: "add_tag", tag: "ping" }],
      active: true,
    });
    const { contact } = await upsertContact({ workspaceId: ws.id, email: `loop-${stamp()}@example.com`, source: "manual" });
    await addTag(ws.id, contact.id, "ping");
    for (let i = 0; i < 20; i++) if ((await runDueJobs()).processed === 0) break;

    const db = await getDb();
    const runs = await db.select().from(automationRuns).where(eq(automationRuns.contactId, contact.id));
    expect(runs.length).toBeGreaterThan(2);
    expect(runs.length).toBeLessThanOrEqual(6); // 3 per automation per hour
    const pending = await db.select().from(jobs).where(and(eq(jobs.type, "automation.step"), eq(jobs.status, "pending")));
    expect(pending.filter((j) => runs.some((r) => (j.payload as { runId?: string }).runId === r.id))).toHaveLength(0);
  });
});

describe("billing", () => {
  it("credits a delayed Stripe payment once, and only after it clears", async () => {
    const { ws } = await makeWorkspace();
    const session = {
      id: `cs_async_${ws.id}`,
      mode: "payment",
      amount_total: 1000,
      payment_status: "unpaid" as const,
      metadata: { kind: "topup", owner_type: "workspace", owner_id: ws.id },
    };
    await handleStripeEvent({ id: "evt_async_1", type: "checkout.session.completed", data: { object: session } });
    expect((await getOrCreateWallet("workspace", ws.id)).balanceMicros).toBe(0);
    const cleared = { ...session, payment_status: "paid" as const };
    await handleStripeEvent({ id: "evt_async_2", type: "checkout.session.async_payment_succeeded", data: { object: cleared } });
    await handleStripeEvent({ id: "evt_async_3", type: "checkout.session.async_payment_succeeded", data: { object: cleared } });
    expect((await getOrCreateWallet("workspace", ws.id)).balanceMicros).toBe(10_000_000);
  });

  it("doesn't unlock Growth until the subscription payment clears", async () => {
    const { ws } = await makeWorkspace();
    const db = await getDb();
    const session = {
      id: `cs_sub_${ws.id}`,
      mode: "subscription",
      subscription: `sub_${ws.id}`,
      customer: "cus_review",
      payment_status: "unpaid" as const,
      metadata: { kind: "growth", owner_type: "workspace", owner_id: ws.id },
    };
    await handleStripeEvent({ id: "evt_sub_1", type: "checkout.session.completed", data: { object: session } });
    let [w] = await db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, ws.id));
    expect(w.plan).toBe("starter");
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.externalId, `sub_${ws.id}`));
    expect(sub.status).toBe("incomplete");

    await handleStripeEvent({ id: "evt_sub_2", type: "checkout.session.async_payment_succeeded", data: { object: { ...session, payment_status: "paid" } } });
    [w] = await db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, ws.id));
    expect(w.plan).toBe("growth");
  });

  it("refunds give back the allowance and the money", async () => {
    const { ws } = await makeWorkspace();
    const wallet = await getOrCreateWallet("workspace", ws.id);
    await creditWallet(wallet.id, 1_000_000, { type: "adjustment", description: "seed" });
    for (let i = 0; i < 3; i++) await chargeUsage(ws.id, "ai_generation"); // starter includes 3
    const paid = await chargeUsage(ws.id, "ai_generation");
    expect(paid.billedMicros).toBe(500_000);
    await refundUsage(ws.id, "ai_generation", 1, paid.billedMicros, "Refund: test");
    expect((await getOrCreateWallet("workspace", ws.id)).balanceMicros).toBe(1_000_000);
    expect(await usedThisMonth(ws.id, "ai_generation")).toBe(3);
  });

  it("bills each email once, even when the send runs again", async () => {
    const { ws } = await makeWorkspace();
    const { contact } = await upsertContact({ workspaceId: ws.id, email: `bill-${stamp()}@example.com`, source: "manual" });
    const before = await usedThisMonth(ws.id, "email");
    const id = await queueEmail({ workspaceId: ws.id, contactId: contact.id, to: contact.email!, subject: "Hi", body: "Hello", vars: {} });
    const db = await getDb();
    // Simulate a crash after billing: billed, but still queued.
    await db.update(emailMessages).set({ billedMicros: 0 }).where(eq(emailMessages.id, id));
    await processEmailSend(id);
    const [msg] = await db.select().from(emailMessages).where(eq(emailMessages.id, id));
    expect(msg.status).toBe("sent");
    expect(await usedThisMonth(ws.id, "email")).toBe(before);
  });
});

describe("campaigns", () => {
  it("resumes a half-sent broadcast without emailing anyone twice", async () => {
    const { ws } = await makeWorkspace();
    const db = await getDb();
    const emails = ["one", "two", "three"].map((n) => `${n}-${stamp()}@example.com`);
    const made = [];
    for (const email of emails) made.push((await upsertContact({ workspaceId: ws.id, email, source: "manual" })).contact);
    const [campaign] = await db
      .insert(emailCampaigns)
      .values({ workspaceId: ws.id, name: "News", subject: "Big news", body: "Hello", audience: {}, status: "sending" })
      .returning();
    await queueEmail({ workspaceId: ws.id, contactId: made[0].id, to: emails[0], subject: "Big news", body: "Hello", vars: {}, campaignId: campaign.id });

    await processCampaignSend(campaign.id);
    const msgs = await db.select().from(emailMessages).where(eq(emailMessages.campaignId, campaign.id));
    expect(msgs.map((m) => m.toEmail).sort()).toEqual([...emails].sort());
    const [after] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, campaign.id));
    expect(after.status).toBe("sent");
  });
});

describe("domains and ids", () => {
  it("serves an agency domain only after it verifies, on the Agency plan", async () => {
    const owner = await createUser({ email: `dom-${stamp()}@example.com`, name: "Dom Owner", password: "password123" });
    const agency = await createAgency(owner.id, "Domain Lab");
    const domain = `app.domainlab${stamp()}.com`;
    await expect(setAgencyAppDomain(agency.id, domain)).rejects.toThrow(/Agency plan/);
    await adminSetAgency(agency.id, { plan: "agency" });
    await expect(setAgencyAppDomain(agency.id, "localhost")).rejects.toThrow();
    await setAgencyAppDomain(agency.id, domain);
    expect(await agencyForHost(domain)).toBeNull(); // still pending

    const db = await getDb();
    await db.update(jobs).set({ runAt: new Date(0) }).where(and(eq(jobs.type, "agency_domain.check"), eq(jobs.status, "pending")));
    await runDueJobs();
    expect((await agencyForHost(domain))?.id).toBe(agency.id);

    // A second agency can't claim the same domain.
    const other = await createAgency(owner.id, "Copycat Lab");
    await adminSetAgency(other.id, { plan: "agency" });
    await expect(setAgencyAppDomain(other.id, domain)).rejects.toThrow(/already in use/);
  });

  it("treats malformed ids as not found", async () => {
    const { ws } = await makeWorkspace();
    expect(await getContact(ws.id, "not-a-uuid")).toBeNull();
    expect(await getContact(ws.id, "1; drop table contacts")).toBeNull();
  });
});

describe("host routing", () => {
  it("serves the app on localhost and raw IPs, and customer sites on their domains", async () => {
    const { NextRequest } = await import("next/server");
    const { middleware } = await import("@/middleware");
    const route = (host: string, path = "/") => {
      const res = middleware(new NextRequest(`http://${host}${path}`, { headers: { host } }));
      return res.headers.get("x-middleware-rewrite");
    };
    // The "Network" address from `npm run dev` and plain localhost reach the dashboard.
    expect(route("192.168.1.5:3000")).toBeNull();
    expect(route("localhost:3000")).toBeNull();
    expect(route("[::1]:3000")).toBeNull();
    // A customer's domain shows their site, but app paths stay the (white-label) dashboard.
    expect(route("join.fitdads.com")).toContain("/d/join.fitdads.com");
    expect(route("join.fitdads.com", "/login")).toBeNull();
  });
});
