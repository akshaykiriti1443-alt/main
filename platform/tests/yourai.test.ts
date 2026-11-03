import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import { activities, aiTasks, workspaces } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { completeAiTask, createAiTask, listAiTasks } from "@/server/aiTasks";
import { extractJson, generateStructured, pickModel, verifyAiKey } from "@/server/ai/client";
import { fallbackKit } from "@/server/ai/launchKit";
import { fallbackAnalysis } from "@/server/ai/adResearch";
import { createConnectorToken } from "@/server/connectors";
import { POST as mcpRoute } from "@/app/api/mcp/[token]/route";
import { makeWorkspace } from "./helpers";
import { upsertContact } from "@/server/contacts";

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function useKey(workspaceId: string, provider: string, model = "") {
  const db = await getDb();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  await db.update(workspaces).set({ settings: { ...ws.settings, aiProvider: provider as "gemini", aiKeyEnc: encrypt("test-key"), aiModel: model } }).where(eq(workspaces.id, workspaceId));
}

describe("your own AI: free providers", () => {
  it("picks sensible free models", () => {
    expect(pickModel("gemini", ["models/text-embedding-004", "models/gemini-2.5-flash", "models/gemini-2.5-pro", "models/gemini-2.5-flash-image"])).toBe("gemini-2.5-flash");
    expect(pickModel("groq", ["whisper-large-v3", "llama-3.1-8b-instant", "llama-3.3-70b-versatile"])).toBe("llama-3.3-70b-versatile");
    expect(pickModel("openrouter", ["openai/gpt-5", "meta-llama/llama-3.3-70b-instruct:free"])).toBe("meta-llama/llama-3.3-70b-instruct:free");
  });

  it("verifies a Gemini key by listing models, without spending tokens", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [{ id: "models/gemini-2.5-flash" }] })));
    expect(await verifyAiKey("gemini", "k")).toEqual({ ok: true, model: "gemini-2.5-flash" });
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "bad" }, 401)));
    expect((await verifyAiKey("groq", "k")).ok).toBe(false);
    expect((await verifyAiKey("custom", "k", "http://localhost:11434/v1")).ok).toBe(false);
  });

  it("structured output on a free model: tolerates code fences and retries once with the error", async () => {
    const { ws } = await makeWorkspace();
    await useKey(ws.id, "gemini", "gemini-2.5-flash");
    const replies = ["not json at all", "```json\n{\"name\":\"Pete\",\"followers\":212}\n```"];
    const fetchMock = vi.fn(async (_url: string) => json({ model: "gemini-2.5-flash", choices: [{ finish_reason: "stop", message: { content: replies.shift() } }], usage: { prompt_tokens: 5, completion_tokens: 7 } }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await generateStructured({ workspaceId: ws.id, system: "s", prompt: "p", effort: "low", schema: z.object({ name: z.string(), followers: z.number() }) });
    expect(res.data).toEqual({ name: "Pete", followers: 212 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(extractJson('Sure! {"a":1} hope that helps')).toEqual({ a: 1 });
  });
});

describe("Ask my AI tasks", () => {
  it("waits for the connected AI app when there's no key, and runs at once on the owner's key", async () => {
    const { ws } = await makeWorkspace();
    const { contact } = await upsertContact({ workspaceId: ws.id, email: `t-${Date.now()}@example.com`, firstName: "Jane", source: "skool" });
    const waiting = await createAiTask({ workspaceId: ws.id, contactId: contact.id, instruction: "Write a welcome DM for {{first_name}}", source: "Welcome" });
    expect(waiting.ranNow).toBe(false);
    expect(waiting.task.instruction).toBe("Write a welcome DM for Jane");
    expect(await listAiTasks(ws.id, { status: "pending" })).toHaveLength(1);
    expect(await completeAiTask(ws.id, waiting.task.id, "Hey Jane! Welcome in.", "test")).toBeTruthy();
    expect(await completeAiTask(ws.id, waiting.task.id, "again", "test")).toBeNull();

    await useKey(ws.id, "groq", "llama-3.3-70b-versatile");
    vi.stubGlobal("fetch", vi.fn(async () => json({ choices: [{ finish_reason: "stop", message: { content: "Hey Jane, so glad you're here." } }] })));
    const now = await createAiTask({ workspaceId: ws.id, contactId: contact.id, instruction: "Write a welcome DM", source: "Welcome" });
    expect(now.ranNow).toBe(true);
    const db = await getDb();
    const [t] = await db.select().from(aiTasks).where(eq(aiTasks.id, now.task.id));
    expect(t).toMatchObject({ status: "done", result: "Hey Jane, so glad you're here." });
    const acts = await db.select().from(activities).where(eq(activities.contactId, contact.id));
    expect(acts.filter((a) => a.type === "ai_task_done")).toHaveLength(2);
  });
});

async function rpc(token: string, body: unknown) {
  const res = await mcpRoute(new NextRequest("http://localhost/api/mcp/x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ token }) });
  return res.json();
}
const call = async (token: string, name: string, args: Record<string, unknown> = {}) => {
  const r = await rpc(token, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  return { isError: r.result.isError as boolean, data: (() => { try { return JSON.parse(r.result.content[0].text); } catch { return r.result.content[0].text; } })() };
};

describe("connector playbooks and tools", () => {
  it("serves playbooks as prompts and tools, runs tasks, saves ad packs and creates unlocks", async () => {
    const { ws, user } = await makeWorkspace();
    const { token } = await createConnectorToken(ws.id, user.id, "Claude");
    const init = await rpc(token, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
    expect(init.result.capabilities.prompts).toBeTruthy();
    const prompts = await rpc(token, { jsonrpc: "2.0", id: 2, method: "prompts/list" });
    expect(prompts.result.prompts.map((p: { name: string }) => p.name)).toContain("monday_review");
    const got = await rpc(token, { jsonrpc: "2.0", id: 3, method: "prompts/get", params: { name: "write_my_3_pack" } });
    expect(got.result.messages[0].content.text).toContain("Hook");
    expect((await call(token, "get_playbook", { name: "do_my_ai_tasks" })).data.steps).toContain("complete_ai_task");

    const { task } = await createAiTask({ workspaceId: ws.id, contactId: null, instruction: "Write 3 hooks", source: "Test" });
    const list = await call(token, "list_ai_tasks");
    expect(list.data[0].taskId).toBe(task.id);
    expect((await call(token, "complete_ai_task", { taskId: task.id, result: "1. … 2. … 3. …" })).isError).toBe(false);

    const pack = await call(token, "save_ad_pack", {
      notes: "Long-runners lead with a number.",
      ads: [{ angle: "pain", hook: "Still stuck?", turn: "It's not effort.", door: "Peek inside: link below.", headline: "Look inside", creativeIdea: "Selfie video" }],
    });
    expect(pack.data.view).toContain("/ads/research?analysis=");

    const u = await call(token, "create_unlock", { title: "Hook Vault", reward: "100 hooks from long-running ads", action: "comment", instructions: "Comment your niche." });
    expect(u.data.claimLink).toContain("/u/hook-vault");
    expect(u.data.skoolPost).toContain("FREE: Hook Vault");
  });
});

describe("ads follow the course framework", () => {
  it("launch kit and ad research both produce the 3-Pack as Hook · Turn · Door", () => {
    const kit = fallbackKit({ businessName: "Fit Dads Club", ownerName: "Sam Owner", niche: "fitness for dads", audience: "busy dads", outcome: "lose the dad belly", leadMagnetIdea: "", offer: "", tone: "friendly", brandColor: "#2A44EE", skoolUrl: "" } as never);
    expect(kit.ads.map((a) => a.angle)).toEqual(["pain", "dream", "lesson"]);
    expect(kit.ads.every((a) => a.hook && a.turn && a.door)).toBe(true);
    expect(JSON.stringify(kit.adPlan)).not.toMatch(/Instagram profile/i);
    expect(fallbackAnalysis([{ page: "x", text: "Tired of guessing what to eat?", daysRunning: 60 }], "").drafts.map((d) => d.angle)).toEqual(["pain", "dream", "lesson"]);
  });
});
