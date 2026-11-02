import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, jobs, workspaces } from "@/lib/db/schema";
import { parseSkoolMembers, normalizeStatus, syncSkoolMembers, skoolMemberCounts } from "@/server/skool";
import { buildCapiPayload } from "@/server/meta/capi";
import { upsertContact } from "@/server/contacts";
import { makeWorkspace } from "./helpers";

const byEmail = async (wid: string, email: string) => {
  const db = await getDb();
  const [c] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, wid), eq(contacts.email, email))).limit(1);
  return c;
};

describe("Skool member parsing", () => {
  it("reads a CSV export with a header, name and status", () => {
    const { members, skipped } = parseSkoolMembers(
      ["Email,Name,Status", "Jane Doe <skip>,,", "jane@example.com,Jane Doe,Active", "sam@example.com,Sam Lee,Trial"].join("\n"),
    );
    expect(skipped).toBe(1);
    expect(members).toHaveLength(2);
    const jane = members.find((m) => m.email === "jane@example.com")!;
    expect(jane.firstName).toBe("Jane");
    expect(jane.lastName).toBe("Doe");
    expect(jane.status).toBe("active");
    expect(members.find((m) => m.email === "sam@example.com")!.status).toBe("trial");
  });

  it("handles a plain list of emails and dedupes, last wins", () => {
    const { members } = parseSkoolMembers("a@example.com\nb@example.com\nA@example.com\n");
    expect(members).toHaveLength(2);
    expect(members.every((m) => m.status === "active")).toBe(true);
  });

  it("maps status words onto the four states", () => {
    expect(normalizeStatus("Cancelling")).toBe("cancelling");
    expect(normalizeStatus("past due")).toBe("cancelling");
    expect(normalizeStatus("Churned")).toBe("churned");
    expect(normalizeStatus("left the group")).toBe("churned");
    expect(normalizeStatus("Active member")).toBe("active");
  });
});

describe("Skool member sync", () => {
  it("creates members, converts a trial to paid, and churns anyone missing from a full export", async () => {
    const { ws } = await makeWorkspace();

    // First sync: one paying member, one on trial.
    const first = await syncSkoolMembers(
      ws.id,
      ["email,name,status", "paid@example.com,Pat Paid,active", "trial@example.com,Tess Trial,trial"].join("\n"),
      { churnMissing: true },
    );
    expect(first.created).toBe(2);
    expect((await byEmail(ws.id, "paid@example.com")).stage).toBe("member");
    expect((await byEmail(ws.id, "trial@example.com")).stage).toBe("trial");

    // Second sync (full export): the trial converts, the paid member is gone -> churned.
    const second = await syncSkoolMembers(ws.id, ["email,name,status", "trial@example.com,Tess Trial,active"].join("\n"), {
      churnMissing: true,
    });
    expect(second.converted).toBe(1);
    expect(second.churned).toBe(1);
    expect((await byEmail(ws.id, "trial@example.com")).stage).toBe("member");
    expect((await byEmail(ws.id, "paid@example.com")).stage).toBe("lost");

    const counts = await skoolMemberCounts(ws.id);
    expect(counts.members).toBe(1);
    expect(counts.churned).toBe(1);
    expect(counts.trials).toBe(0);
  });

  it("a partial paste never churns absent members", async () => {
    const { ws } = await makeWorkspace();
    await syncSkoolMembers(ws.id, ["email,status", "keep@example.com,active"].join("\n"), { churnMissing: true });
    const r = await syncSkoolMembers(ws.id, "new@example.com\n", { churnMissing: false });
    expect(r.churned).toBe(0);
    expect((await byEmail(ws.id, "keep@example.com")).stage).toBe("member");
  });

  it("links a funnel lead to their Skool membership on the same contact", async () => {
    const { ws } = await makeWorkspace();
    const { contact } = await upsertContact({ workspaceId: ws.id, email: "lead@example.com", source: "landing_page" });
    await syncSkoolMembers(ws.id, "lead@example.com\n", { churnMissing: false });
    const after = await byEmail(ws.id, "lead@example.com");
    expect(after.id).toBe(contact.id); // same contact, not a duplicate
    expect(after.stage).toBe("member");
    expect(after.tags).toContain("skool-member");
  });

  it("tags cancelling members and clears the tag when they recover", async () => {
    const { ws } = await makeWorkspace();
    await syncSkoolMembers(ws.id, ["email,status", "wobble@example.com,cancelling"].join("\n"), { churnMissing: false });
    expect((await byEmail(ws.id, "wobble@example.com")).tags).toContain("skool-cancelling");
    await syncSkoolMembers(ws.id, ["email,status", "wobble@example.com,active"].join("\n"), { churnMissing: false });
    expect((await byEmail(ws.id, "wobble@example.com")).tags).not.toContain("skool-cancelling");
  });
});

describe("Skool → Meta conversions", () => {
  it("builds a Subscribe payload with value and omits event_source_url for system events", () => {
    const payload = buildCapiPayload({
      workspaceId: "w", eventName: "Subscribe", eventId: "e1", eventTime: 1700000000,
      eventSourceUrl: "", actionSource: "system_generated", value: 9, currency: "USD", email: "Jane@Example.com",
    }) as any;
    const d = payload.data[0];
    expect(d.event_name).toBe("Subscribe");
    expect(d.action_source).toBe("system_generated");
    expect(d.event_source_url).toBeUndefined();
    expect(d.custom_data).toEqual({ value: 9, currency: "USD" });
    expect(d.user_data.em[0]).toMatch(/^[a-f0-9]{64}$/); // email hashed, lowercased
  });

  it("enqueues StartTrial then Subscribe as a member progresses, only when the pixel is set", async () => {
    const { ws } = await makeWorkspace();
    const db = await getDb();

    // No pixel yet: no conversion jobs.
    await syncSkoolMembers(ws.id, "nopixel@example.com\n", { churnMissing: false });
    const none = await db.select().from(jobs).where(eq(jobs.type, "meta.capi"));
    expect(none.length).toBe(0);

    // Configure a pixel, then run a trial -> paid journey.
    await db.update(workspaces).set({ settings: { metaPixelId: "123456789", metaCapiTokenEnc: "enc", skoolMemberPrice: 9 } }).where(eq(workspaces.id, ws.id));
    await syncSkoolMembers(ws.id, ["email,status", "rise@example.com,trial"].join("\n"), { churnMissing: false });
    await syncSkoolMembers(ws.id, ["email,status", "rise@example.com,active"].join("\n"), { churnMissing: false });

    const capi = await db.select().from(jobs).where(eq(jobs.type, "meta.capi"));
    const names = capi.map((j) => (j.payload as any).eventName);
    expect(names).toContain("StartTrial");
    expect(names).toContain("Subscribe");
    const sub = capi.find((j) => (j.payload as any).eventName === "Subscribe")!.payload as any;
    expect(sub.value).toBe(9);
  });
});

describe("Skool AI message assist", () => {
  it("picks the right intent for each lifecycle stage", async () => {
    const { intentForContact } = await import("@/server/ai/skoolMessages");
    expect(intentForContact({ stage: "member", tags: ["skool-member"] })).toBe("welcome");
    expect(intentForContact({ stage: "trial", tags: ["skool-member"] })).toBe("convert");
    expect(intentForContact({ stage: "member", tags: ["skool-member", "skool-cancelling"] })).toBe("save");
    expect(intentForContact({ stage: "lost", tags: ["skool-member"] })).toBe("winback");
  });

  it("drafts a usable fallback message when AI is off", async () => {
    const { ws } = await makeWorkspace();
    const { draftSkoolMessage } = await import("@/server/ai/skoolMessages");
    const { contact } = await upsertContact({ workspaceId: ws.id, email: "churned@example.com", firstName: "Dana", source: "skool", tags: ["skool-member"] });
    const r = await draftSkoolMessage(ws.id, contact.id, "winback");
    expect(r.intent).toBe("winback");
    expect(r.ai).toBe(false); // no ANTHROPIC key in tests
    expect(r.text).toContain("Dana");
    expect(r.text.length).toBeGreaterThan(20);
  });
});

describe("Automation recipes", () => {
  it("every preset passes validation and saves", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    const { AUTOMATION_PRESETS } = await import("@/server/automationPresets");
    const { saveAutomation, listAutomations } = await import("@/server/automations");
    for (const p of AUTOMATION_PRESETS) {
      await saveAutomation(ws.id, null, { name: p.def.name, trigger: p.def.trigger, actions: p.def.actions, active: true });
    }
    const saved = await listAutomations(ws.id);
    // Every preset saved without a schema error (a workspace may also seed its own defaults).
    for (const p of AUTOMATION_PRESETS) expect(saved.some((a) => a.name === p.def.name)).toBe(true);
    // The four Skool lifecycle flows are present.
    const skool = AUTOMATION_PRESETS.filter((p) => p.group === "Skool members");
    expect(skool.map((p) => p.key).sort()).toEqual(["skool-convert", "skool-save", "skool-welcome", "skool-winback"]);
  });
});
