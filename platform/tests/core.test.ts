import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  activities,
  channelConnections,
  contacts,
  conversations,
  emailEnrollments,
  emailMessages,
  emailSequenceSteps,
  emailSequences,
  jobs,
  messages,
  pages,
  automations,
  automationRuns,
} from "@/lib/db/schema";
import { encrypt, decrypt, hmacHex, sealState, openState, hashPassword, verifyPassword } from "@/lib/crypto";
import { runLaunchKit, fallbackKit } from "@/server/ai/launchKit";
import { listPages, listSites, publishSite } from "@/server/sites";
import { captureLead } from "@/server/leads";
import { runDueJobs } from "@/server/jobs/runner";
import { chargeUsage, getOrCreateWallet, creditWallet, InsufficientBalanceError, canAfford } from "@/server/wallet";
import { createAccessCode, enforceAccess, redeemCode, recordSkoolApproval } from "@/server/access";
import { processMetaPayload, verifyMetaSignature } from "@/server/meta/webhooks";
import { verifyStripeSignature, handleStripeEvent } from "@/server/billing/stripe";
import { verifyTwilioSignature } from "@/server/sms";
import { exportWorkspace, importTemplateData } from "@/server/templates";
import { heuristicScore } from "@/server/ai/scoring";
import { buildCapiPayload } from "@/server/meta/capi";
import { ruleReview } from "@/server/ai/adReview";
import { saveAutomation } from "@/server/automations";
import { workspaces } from "@/lib/db/schema";
import { makeWorkspace, setPlan } from "./helpers";

describe("crypto", () => {
  it("hashes and verifies passwords", async () => {
    const h = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
  it("encrypts and seals state", () => {
    expect(decrypt(encrypt("secret-token"))).toBe("secret-token");
    const s = sealState({ w: "abc" });
    expect(openState<{ w: string }>(s)?.w).toBe("abc");
    expect(openState(s.replace(/.$/, "x"))).toBeNull();
  });
});

describe("workspace + launch kit + lead flow", () => {
  it("creates defaults, builds a funnel and runs the 3-email sequence", async () => {
    const { ws } = await makeWorkspace();
    const db = await getDb();
    const seqs = await db.select().from(emailSequences).where(eq(emailSequences.workspaceId, ws.id));
    expect(seqs).toHaveLength(1);

    const res = await runLaunchKit(ws.id, {
      businessName: "Fit Dads Club",
      ownerName: "Sam Owner",
      niche: "fat loss for busy dads",
      audience: "dads with desk jobs",
      outcome: "lose 10 lbs in 8 weeks",
      skoolUrl: "https://www.skool.com/fit-dads",
      brandColor: "#2A44EE",
    });
    expect(res.ok).toBe(true);
    const sites = await listSites(ws.id);
    expect(sites).toHaveLength(1);
    const sitePages = await listPages(sites[0].id);
    expect(sitePages.map((p) => p.slug).sort()).toEqual(["", "guide", "thank-you"]);
    const steps = await db.select().from(emailSequenceSteps).where(eq(emailSequenceSteps.sequenceId, seqs[0].id));
    expect(steps).toHaveLength(3);

    // Not published yet: leads are refused.
    const optin = sitePages.find((p) => p.slug === "")!;
    const refused = await captureLead({ pageId: optin.id, email: "lead@example.com" });
    expect(refused.ok).toBe(false);

    await publishSite(ws.id, sites[0].id);
    const lead = await captureLead({ pageId: optin.id, email: "Lead@Example.com", name: "Alex Lead", eventId: "evt-1" });
    expect(lead.ok).toBe(true);
    if (lead.ok) expect(lead.redirectTo).toContain("/thank-you?eid=evt-1");

    const [contact] = await db.select().from(contacts).where(eq(contacts.workspaceId, ws.id));
    expect(contact.email).toBe("lead@example.com");
    expect(contact.firstName).toBe("Alex");
    const enrollments = await db.select().from(emailEnrollments).where(eq(emailEnrollments.contactId, contact.id));
    expect(enrollments).toHaveLength(1);

    // Same email again: no duplicate contact or enrollment.
    await captureLead({ pageId: optin.id, email: "lead@example.com" });
    expect(await db.select().from(contacts).where(eq(contacts.workspaceId, ws.id))).toHaveLength(1);

    await runDueJobs();
    const sent = await db.select().from(emailMessages).where(eq(emailMessages.workspaceId, ws.id));
    expect(sent).toHaveLength(1);
    expect(sent[0].status).toBe("sent");
    expect(sent[0].html).toContain("Unsubscribe");
    expect(sent[0].html).toContain("/s/"); // lead magnet link resolved to the hosted guide page
    const [enr] = await db.select().from(emailEnrollments).where(eq(emailEnrollments.contactId, contact.id));
    expect(enr.nextPosition).toBe(1);
    const pendingStep = await db.select().from(jobs).where(and(eq(jobs.type, "email.sequence_step"), eq(jobs.status, "pending")));
    expect(pendingStep.length).toBeGreaterThan(0);
    expect(pendingStep[0].runAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);

    const leadActs = await db.select().from(activities).where(and(eq(activities.workspaceId, ws.id), eq(activities.type, "lead")));
    expect(leadActs.length).toBe(2);
  });

  it("honeypot submissions are ignored", async () => {
    const { ws } = await makeWorkspace();
    await runLaunchKit(ws.id, { businessName: "Yoga Moms", ownerName: "Ana", niche: "yoga", audience: "moms", outcome: "feel strong" });
    const [site] = await listSites(ws.id);
    await publishSite(ws.id, site.id);
    const [optin] = (await listPages(site.id)).filter((p) => p.slug === "");
    const res = await captureLead({ pageId: optin.id, email: "bot@example.com", honeypot: "http://spam" });
    expect(res.ok).toBe(true);
    const db = await getDb();
    expect(await db.select().from(contacts).where(eq(contacts.workspaceId, ws.id))).toHaveLength(0);
  });

  it("fallback kit fills every field", () => {
    const kit = fallbackKit({ businessName: "X", ownerName: "Y Z", niche: "golf", audience: "beginners", outcome: "break 90", leadMagnetIdea: "", offer: "", skoolUrl: "", tone: "friendly", brandColor: "#000000" });
    expect(kit.emails).toHaveLength(3);
    expect(kit.hooks.length).toBeGreaterThanOrEqual(10);
    expect(kit.adPlan.firstWeek).toHaveLength(7);
  });
});

describe("wallet", () => {
  it("bills only above the monthly allowance and refuses when empty", async () => {
    const { ws } = await makeWorkspace();
    // starter includes 3 AI generations
    for (let i = 0; i < 3; i++) expect((await chargeUsage(ws.id, "ai_generation")).included).toBe(true);
    expect(await canAfford(ws.id, "ai_generation")).toBe(false);
    await expect(chargeUsage(ws.id, "ai_generation")).rejects.toBeInstanceOf(InsufficientBalanceError);
    const wallet = await getOrCreateWallet("workspace", ws.id);
    await creditWallet(wallet.id, 1_000_000, { type: "adjustment", description: "test" });
    const charged = await chargeUsage(ws.id, "ai_generation");
    expect(charged.billedMicros).toBe(500_000);
    const after = await getOrCreateWallet("workspace", ws.id);
    expect(after.balanceMicros).toBe(500_000);
  });
});

describe("Skool access", () => {
  it("redeems codes, approves Zapier members and enforces grace then pause", async () => {
    const { ws, user } = await makeWorkspace();
    const now = new Date();
    await createAccessCode({ code: `NOV${Date.now()}`.slice(0, 14), label: "test", validFrom: new Date(now.getTime() - 86_400_000), validUntil: new Date(now.getTime() + 20 * 86_400_000) });
    const bad = await redeemCode(ws.id, "NOPE");
    expect(bad.ok).toBe(false);

    const db = await getDb();
    await db.update(workspaces).set({ accessVerifiedUntil: new Date(now.getTime() - 1000) }).where(eq(workspaces.id, ws.id));
    await enforceAccess(now);
    let [w] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(w.status).toBe("grace");
    await enforceAccess(new Date(now.getTime() + 8 * 86_400_000));
    [w] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(w.status).toBe("paused");

    const approval = await recordSkoolApproval({ email: user.email, name: "Sam" });
    expect(approval.extended).toBe(1);
    [w] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(w.status).toBe("active");
  });
});

describe("inbox webhooks", () => {
  it("verifies Meta signatures", () => {
    const body = JSON.stringify({ object: "page" });
    expect(verifyMetaSignature(body, `sha256=${hmacHex("test-meta-secret", body)}`)).toBe(true);
    expect(verifyMetaSignature(body, "sha256=deadbeef")).toBe(false);
  });

  it("ingests Messenger, Instagram and WhatsApp messages once", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    const db = await getDb();
    const token = encrypt("page-token");
    await db.insert(channelConnections).values([
      { workspaceId: ws.id, kind: "facebook_page", externalId: `PAGE${ws.id.slice(0, 6)}`, name: "Page", accessTokenEnc: token },
      { workspaceId: ws.id, kind: "instagram", externalId: `IG${ws.id.slice(0, 6)}`, name: "@ig", accessTokenEnc: token, meta: { pageId: `PAGE${ws.id.slice(0, 6)}` } },
      { workspaceId: ws.id, kind: "whatsapp", externalId: `WA${ws.id.slice(0, 6)}`, name: "WA", accessTokenEnc: token },
    ]);
    const messenger = {
      object: "page",
      entry: [{ messaging: [{ sender: { id: "PSID1" }, recipient: { id: `PAGE${ws.id.slice(0, 6)}` }, timestamp: Date.now(), message: { mid: `m1-${ws.id}`, text: "How much is it to join?" } }] }],
    };
    await processMetaPayload(messenger);
    await processMetaPayload(messenger); // duplicate delivery
    await processMetaPayload({
      object: "instagram",
      entry: [{ messaging: [{ sender: { id: "IGSID1" }, recipient: { id: `IG${ws.id.slice(0, 6)}` }, timestamp: Date.now(), message: { mid: `m2-${ws.id}`, text: "hey!" } }] }],
    });
    await processMetaPayload({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: `WA${ws.id.slice(0, 6)}` }, contacts: [{ wa_id: "15551234567", profile: { name: "Jo Wa" } }], messages: [{ from: "15551234567", id: `wamid-${ws.id}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Is there a free trial?" } }] } }] }],
    });

    const convs = await db.select().from(conversations).where(eq(conversations.workspaceId, ws.id));
    expect(convs.map((c) => c.channel).sort()).toEqual(["facebook", "instagram", "whatsapp"]);
    const msgs = await db.select().from(messages).where(eq(messages.workspaceId, ws.id));
    expect(msgs).toHaveLength(3);
    const waContact = (await db.select().from(contacts).where(eq(contacts.workspaceId, ws.id))).find((c) => c.phone === "+15551234567");
    expect(waContact?.firstName).toBe("Jo");

    // Scoring jobs were queued (growth plan); run them with rules (no AI key in tests).
    await db.update(jobs).set({ runAt: new Date(0) }).where(eq(jobs.type, "ai.score"));
    await runDueJobs();
    const fb = (await db.select().from(contacts).where(eq(contacts.workspaceId, ws.id))).find((c) => c.channelIds.facebook === "PSID1");
    expect(fb?.score).toBeGreaterThan(40);
    expect(fb?.scoreReason).toContain("price");
  });
});

describe("billing", () => {
  it("verifies Stripe signatures and credits top-ups once", async () => {
    const payload = JSON.stringify({ id: "evt_1" });
    const t = Math.floor(Date.now() / 1000);
    const sig = `t=${t},v1=${hmacHex("whsec_test", `${t}.${payload}`)}`;
    expect(verifyStripeSignature(payload, sig)).toBe(true);
    expect(verifyStripeSignature(payload, `t=${t - 1000},v1=${hmacHex("whsec_test", `${t - 1000}.${payload}`)}`)).toBe(false);

    const { ws } = await makeWorkspace();
    const event = {
      id: "evt_topup",
      type: "checkout.session.completed",
      data: { object: { id: `cs_${ws.id}`, mode: "payment", amount_total: 2500, metadata: { kind: "topup", owner_type: "workspace", owner_id: ws.id } } },
    };
    await handleStripeEvent(event);
    await handleStripeEvent(event);
    const wallet = await getOrCreateWallet("workspace", ws.id);
    expect(wallet.balanceMicros).toBe(25_000_000);
  });

  it("verifies Twilio signatures", () => {
    const url = "https://example.com/api/webhooks/twilio";
    const params = { Body: "hi", From: "+1555", To: "+1666" };
    const data = url + Object.keys(params).sort().map((k) => k + params[k as keyof typeof params]).join("");
    const { createHmac } = require("node:crypto") as typeof import("node:crypto");
    const sig = createHmac("sha1", "twilio-test-token").update(data).digest("base64");
    expect(verifyTwilioSignature(url, params, sig)).toBe(true);
    expect(verifyTwilioSignature(url, { ...params, Body: "changed" }, sig)).toBe(false);
  });
});

describe("templates", () => {
  it("round-trips funnels, sequences and automations", async () => {
    const { ws } = await makeWorkspace();
    await runLaunchKit(ws.id, { businessName: "Run Club", ownerName: "Lee", niche: "running", audience: "new runners", outcome: "run a 5k" });
    const data = await exportWorkspace(ws.id);
    expect(data.sites).toHaveLength(1);
    expect(data.sequences[0].steps).toHaveLength(3);
    const { ws: target } = await makeWorkspace();
    await importTemplateData(target.id, data);
    const db = await getDb();
    const copied = await db.select().from(pages).where(eq(pages.workspaceId, target.id));
    expect(copied).toHaveLength(3);
  });
});

describe("automations", () => {
  it("runs trigger -> actions on the growth plan", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    await runLaunchKit(ws.id, { businessName: "Lift Club", ownerName: "Max", niche: "strength", audience: "beginners", outcome: "get strong" });
    const [site] = await listSites(ws.id);
    await publishSite(ws.id, site.id);
    await saveAutomation(ws.id, null, {
      name: "Tag new leads",
      trigger: { type: "lead_created", value: "" },
      actions: [{ type: "add_tag", tag: "new-lead" }, { type: "set_stage", stage: "engaged" }, { type: "wait", minutes: 60 }, { type: "add_tag", tag: "later" }],
      active: true,
    });
    const [optin] = (await listPages(site.id)).filter((p) => p.slug === "");
    await captureLead({ pageId: optin.id, email: "auto@example.com" });
    await runDueJobs();
    const db = await getDb();
    const [c] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, ws.id), eq(contacts.email, "auto@example.com")));
    expect(c.tags).toContain("new-lead");
    expect(c.tags).not.toContain("later");
    expect(c.stage).toBe("engaged");
    const runs = await db.select().from(automationRuns).where(eq(automationRuns.workspaceId, ws.id));
    expect(runs.find((r) => r.status === "waiting")).toBeTruthy();
    const all = await db.select().from(automations).where(eq(automations.workspaceId, ws.id));
    expect(all.length).toBe(2);
    await setPlan(ws.id, "starter");
  });
});

describe("rules", () => {
  it("scores leads and reviews ads without AI", () => {
    expect(heuristicScore({ inboundMessages: ["what's the price?"], leadCount: 1, hasPhone: false, daysSinceLastActivity: 0 }).temperature).toBe("hot");
    expect(heuristicScore({ inboundMessages: [], leadCount: 0, hasPhone: false, daysSinceLastActivity: 30 }).temperature).toBe("cold");
    const r = ruleReview({ spend: 30, impressions: 5000, linkClicks: 30, leads: 8, followers: 0, members: 0, days: 3, goal: "", notes: "" });
    expect(r.metrics[0].status).toBe("fix"); // 0.6% CTR
    expect(r.actions.length).toBeGreaterThan(0);
  });
  it("hashes CAPI user data", () => {
    const p = buildCapiPayload({ workspaceId: "w", eventName: "Lead", eventId: "e", eventTime: 1, eventSourceUrl: "https://x", email: " A@B.com " });
    expect(p.data[0].user_data.em?.[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(p.data[0].event_id).toBe("e");
  });
});

describe("hardening", () => {
  it("blocks private webhook targets", async () => {
    const { isPublicHttpsUrl } = await import("@/lib/html");
    expect(isPublicHttpsUrl("https://hooks.zapier.com/abc")).toBe(true);
    for (const bad of ["http://hooks.zapier.com", "https://localhost/x", "https://169.254.169.254/latest", "https://10.0.0.5/", "https://192.168.1.1", "https://[::1]/"]) {
      expect(isPublicHttpsUrl(bad)).toBe(false);
    }
  });
});
