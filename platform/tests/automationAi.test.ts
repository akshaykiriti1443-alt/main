import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { contacts, workspaces } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { listAutomations } from "@/server/automations";
import { automationContext, automationSuggestions, draftAutomation, finishDraft, getAutomationDraft, recipeFor, whoBuilds, type RawDraft } from "@/server/ai/automationDraft";
import { createConnectorToken } from "@/server/connectors";
import { upsertContact } from "@/server/contacts";
import { POST as mcpRoute } from "@/app/api/mcp/[token]/route";
import { makeWorkspace, setPlan } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const blank = { tag: "", stage: "", minutes: 0, subject: "", body: "", message: "", temperature: "", instruction: "", sequenceId: "" };
const step = (s: Partial<typeof blank> & { type: RawDraft["steps"][number]["type"] }) => ({ ...blank, ...s });
const ctx = { siteIds: new Set<string>(), sequenceIds: new Set<string>() };

describe("Tell your AI what to automate: checking the AI's draft", () => {
  it("keeps only steps the engine can run, and spaces out emails", () => {
    const d = finishDraft(
      {
        name: "Follow up quiet leads",
        summary: "Emails them and drafts a DM.",
        why: "3 leads went quiet.",
        trigger: { type: "tag_added", value: "Needs Follow Up" },
        steps: [
          step({ type: "send_email", subject: "Still thinking it over?", body: "Hey {{first_name}}, what's the one thing holding you back?" }),
          step({ type: "send_email", subject: "Still here", body: "The door's open, {{first_name}}." }),
          step({ type: "send_message", body: "hi" }), // needs a conversation they started: dropped
          step({ type: "enroll_sequence", sequenceId: "not-theirs" }), // unknown sequence: dropped
          step({ type: "add_tag", tag: "Save Attempt!" }),
          step({ type: "ask_my_ai", instruction: "Draft a short Skool DM asking what's holding them back." }),
          step({ type: "notify_owner", message: "Send the DM your AI drafted, in Skool." }),
        ],
        notes: [],
      },
      ctx,
    );
    if ("error" in d) throw new Error(d.error);
    expect(d.trigger).toEqual({ type: "tag_added", value: "needs-follow-up" });
    expect(d.actions.map((a) => a.type)).toEqual(["send_email", "wait", "send_email", "add_tag", "ask_my_ai", "notify_owner"]);
    expect(d.actions[1]).toEqual({ type: "wait", minutes: 1440 });
    expect(d.actions[3]).toEqual({ type: "add_tag", tag: "save-attempt" });
    expect(d.notes.at(-1)).toMatch(/2 steps didn't fit/);
  });

  it("refuses a draft with nothing runnable, or a tag trigger with no tag", () => {
    expect(finishDraft({ name: "x", summary: "", why: "", trigger: { type: "lead_created", value: "" }, steps: [step({ type: "wait", minutes: 0 })], notes: [] }, ctx)).toHaveProperty("error");
    expect(finishDraft({ name: "x", summary: "", why: "", trigger: { type: "tag_added", value: "" }, steps: [step({ type: "ai_score" })], notes: [] }, ctx)).toHaveProperty("error");
    // An unknown stage filter becomes "any", rather than an automation that never fires.
    const d = finishDraft({ name: "x", summary: "", why: "", trigger: { type: "stage_changed", value: "Paying" }, steps: [step({ type: "ai_score" })], notes: [] }, ctx);
    expect("error" in d ? null : d.trigger.value).toBe("");
  });
});

describe("Tell your AI what to automate: building", () => {
  it("builds it on the member's own free AI, from their numbers, without switching anything on", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    const db = await getDb();
    await db.update(workspaces).set({ settings: { ...ws.settings, aiProvider: "gemini", aiKeyEnc: encrypt("test-key"), aiModel: "gemini-2.5-flash" } }).where(eq(workspaces.id, ws.id));
    for (const name of ["Ann", "Bo", "Cy"]) {
      const { contact } = await upsertContact({ workspaceId: ws.id, email: `${name.toLowerCase()}-${Date.now()}@example.com`, firstName: name, source: "landing_page" });
      await db.update(contacts).set({ temperature: "hot" }).where(eq(contacts.id, contact.id));
    }

    const draft = {
      name: "Follow up hot leads",
      summary: "When a lead turns hot, your AI drafts a follow-up and you get told to send it.",
      why: "3 leads are hot right now, your biggest chance.",
      trigger: { type: "temperature_changed", value: "hot" },
      steps: [
        step({ type: "send_email", subject: "Quick question, {{first_name}}", body: "Hey {{first_name}}, what made you grab the guide? {{owner_name}}" }),
        step({ type: "ask_my_ai", instruction: "Draft a 2-line Skool DM that mentions what they did." }),
        step({ type: "notify_owner", message: "Send the DM your AI drafted, in Skool, today." }),
      ],
      notes: [],
    };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ model: "gemini-2.5-flash", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(draft) } }], usage: { prompt_tokens: 50, completion_tokens: 70 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const before = (await listAutomations(ws.id)).length;
    const r = await draftAutomation(ws.id, { request: "Follow up hot leads before they go cold" });
    if (!r.ok) throw new Error(r.error);
    expect(r.draft.actions.map((a) => a.type)).toEqual(["send_email", "ask_my_ai", "notify_owner"]);
    expect(r.draft.why).toContain("3 leads");
    // The AI saw their numbers and the rules for Skool, and nothing of the removed member CRM.
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const prompt = sent.messages.map((m: { content: string }) => m.content).join("\n");
    expect(prompt).toContain('"hotLeads":3');
    expect(prompt).toContain("AI writes, you send");
    expect(prompt).not.toMatch(/cancelling|skool_invite|skool-member/);
    // A draft, not an automation: nothing runs until the owner saves it.
    expect(await listAutomations(ws.id)).toHaveLength(before);
    expect((await getAutomationDraft(ws.id, r.draftId, null))?.draft.name).toBe("Follow up hot leads");
    // Drafts are private to their workspace and to the automation they were made for.
    const other = await makeWorkspace();
    expect(await getAutomationDraft(other.ws.id, r.draftId, null)).toBeNull();
    expect(await getAutomationDraft(ws.id, r.draftId, "00000000-0000-4000-8000-000000000000")).toBeNull();

    expect(whoBuilds({ plan: "growth", settings: { aiKeyEnc: "x", aiProvider: "gemini" } })).toMatch(/Google Gemini \(free tier\)/);
    const ideas = automationSuggestions(await automationContext(ws.id));
    expect(ideas[0].label).toBe("3 hot leads: follow up fast");
    expect(ideas.map((i) => i.label).join(" ")).not.toMatch(/cancel|trial|churn/i);
  });

  it.skipIf(env.aiEnabled)("with no AI connected, falls back to the closest recipe", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    const r = await draftAutomation(ws.id, { request: "follow up new leads from my free guide" });
    expect(r.ok && r.recipe).toBe("nurture");
    const none = await draftAutomation(ws.id, { request: "do something clever with my calendar" });
    expect(none.ok).toBe(false);
  });

  it("matches plain words to recipes", () => {
    expect(recipeFor("alert me when a hot lead messages on instagram")).toBe("hot");
    expect(recipeFor("follow up new leads from my guide")).toBe("nurture");
    // The Skool member recipes are gone, so member-lifecycle asks have no recipe.
    expect(recipeFor("Save people who cancel")).toBeNull();
    expect(recipeFor("win back members who left")).toBeNull();
  });
});

describe("the member's own AI app builds automations through the connector", () => {
  async function rpc(token: string, body: unknown) {
    const res = await mcpRoute(new NextRequest("http://localhost/api/mcp/x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ token }) });
    return { status: res.status, body: await res.json() };
  }
  const call = (token: string, args: unknown) => rpc(token, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_automation", arguments: args } });

  it("creates it switched off, and refuses what can't run", async () => {
    const { ws, user } = await makeWorkspace();
    const { token } = await createConnectorToken(ws.id, user.id, "My Claude");
    const args = {
      name: "Thank engaged members",
      trigger: { type: "tag_added", value: "engaged" },
      steps: [
        { type: "send_email", subject: "Thank you, {{first_name}}", body: "Your comment made my week. {{owner_name}}" },
        { type: "ask_my_ai", instruction: "Draft a one-line shout-out I can post in Skool." },
      ],
    };
    expect((await call(token, args)).body.result.isError).toBe(true); // Growth plan
    await setPlan(ws.id, "growth");
    const ok = JSON.parse((await call(token, args)).body.result.content[0].text);
    expect(ok).toMatchObject({ ok: true, active: false, steps: 2 });
    const saved = (await listAutomations(ws.id)).find((x) => x.id === ok.id);
    expect(saved).toMatchObject({ name: "Thank engaged members", active: false, trigger: { type: "tag_added", value: "engaged" } });

    const bad = await call(token, { name: "x", trigger: { type: "lead_created" }, steps: [{ type: "send_message", body: "hi" }] });
    expect(bad.body.result.isError).toBe(true);

    const tools = (await rpc(token, { jsonrpc: "2.0", id: 2, method: "prompts/list" })).body.result.prompts.map((p: { name: string }) => p.name);
    expect(tools).toContain("build_my_automation");
  });
});
