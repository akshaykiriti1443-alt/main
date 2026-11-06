import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { automationRuns, contacts, opportunities, pipelines } from "@/lib/db/schema";
import { upsertContact, addTag } from "@/server/contacts";
import {
  createOpportunity,
  createPipeline,
  deletePipeline,
  ensureDefaultPipeline,
  getBoard,
  markCallBooked,
  moveOpportunity,
  savePipeline,
  stageNamed,
} from "@/server/pipelines";
import { saveAutomation } from "@/server/automations";
import { runDueJobs } from "@/server/jobs/runner";
import { finishDraft } from "@/server/ai/automationDraft";
import { handleMcpMessage } from "@/server/mcp";
import { makeWorkspace } from "./helpers";

async function lead(workspaceId: string, email = `lead${Math.random().toString(36).slice(2, 8)}@example.com`) {
  return (await upsertContact({ workspaceId, email, firstName: "Jamie", lastName: "Doyle", source: "manual" })).contact;
}

describe("pipelines", () => {
  it("creates the default Sales pipeline once, even when asked twice at the same moment", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    const [a, b] = await Promise.all([ensureDefaultPipeline(ws.id), ensureDefaultPipeline(ws.id)]);
    expect(a.id).toBe(b.id);
    expect(a.name).toBe("Sales");
    expect(a.stages.map((s) => [s.name, s.kind])).toEqual([
      ["New lead", "open"],
      ["Contacted", "open"],
      ["Call booked", "open"],
      ["Proposal sent", "open"],
      ["Won", "won"],
      ["Lost", "lost"],
    ]);
    const db = await getDb();
    expect(await db.select().from(pipelines).where(eq(pipelines.workspaceId, ws.id))).toHaveLength(1);
  });

  it("moves deals: won closes, back to open reopens, and index orders the column", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    const p = await ensureDefaultPipeline(ws.id);
    const c = await lead(ws.id);
    const d1 = await createOpportunity(ws.id, { title: "One", contactId: c.id, valueCents: 50000 });
    const d2 = await createOpportunity(ws.id, { title: "Two", valueCents: 25000 });
    expect(d1.stageId).toBe(p.stages[0].id);
    // Newest on top.
    let board = await getBoard(ws.id);
    expect(board.columns[0].deals.map((d) => d.title)).toEqual(["Two", "One"]);
    expect(board.columns[0].totals).toEqual({ USD: 75000 });
    expect(board.totals.openCount).toBe(2);

    await moveOpportunity(ws.id, d1.id, stageNamed(p, "won")!.id);
    const db = await getDb();
    let [row] = await db.select().from(opportunities).where(eq(opportunities.id, d1.id));
    expect(row.status).toBe("won");
    expect(row.closedAt).toBeInstanceOf(Date);
    await moveOpportunity(ws.id, d1.id, stageNamed(p, "Contacted")!.id);
    [row] = await db.select().from(opportunities).where(eq(opportunities.id, d1.id));
    expect(row.status).toBe("open");
    expect(row.closedAt).toBeNull();

    // Drop "Two" under "One" in Contacted.
    await moveOpportunity(ws.id, d2.id, stageNamed(p, "Contacted")!.id, { index: 1 });
    board = await getBoard(ws.id);
    expect(board.columns[1].deals.map((d) => d.title)).toEqual(["One", "Two"]);
    await moveOpportunity(ws.id, d2.id, stageNamed(p, "Contacted")!.id, { index: 0 });
    board = await getBoard(ws.id);
    expect(board.columns[1].deals.map((d) => d.title)).toEqual(["Two", "One"]);
  });

  it("refuses a deal or stage from another workspace", async () => {
    const a = await makeWorkspace({ plan: "growth" });
    const b = await makeWorkspace({ plan: "growth" });
    const pb = await ensureDefaultPipeline(b.ws.id);
    const deal = await createOpportunity(a.ws.id, { title: "Mine" });
    await expect(moveOpportunity(a.ws.id, deal.id, pb.stages[1].id)).rejects.toThrow(/stage/);
    await expect(moveOpportunity(b.ws.id, deal.id, pb.stages[1].id)).rejects.toThrow(/deal/);
    const theirs = await lead(b.ws.id);
    await expect(createOpportunity(a.ws.id, { title: "x", contactId: theirs.id })).rejects.toThrow(/contact/);
  });

  it("edits stages: rename keeps deals, removing a stage moves its deals back one stage", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    const p = await ensureDefaultPipeline(ws.id);
    const callBooked = stageNamed(p, "Call booked")!;
    const deal = await createOpportunity(ws.id, { title: "Deal", stageId: callBooked.id });
    const stages = p.stages.filter((s) => s.id !== callBooked.id).map((s) => ({ id: s.id, name: s.name === "Contacted" ? "Replied" : s.name, kind: s.kind }));
    const r = await savePipeline(ws.id, p.id, { name: "Sales", stages });
    expect(r.moved).toBe(1);
    const fresh = await ensureDefaultPipeline(ws.id);
    expect(fresh.stages.map((s) => s.name)).toEqual(["New lead", "Replied", "Proposal sent", "Won", "Lost"]);
    const db = await getDb();
    const [row] = await db.select().from(opportunities).where(eq(opportunities.id, deal.id));
    expect(row.stageId).toBe(stageNamed(fresh, "Replied")!.id);
    await expect(savePipeline(ws.id, p.id, { name: "Sales", stages: [{ name: "A" }, { name: "a" }] })).rejects.toThrow(/Two stages/);
  });

  it("won't delete the only pipeline or one that still has deals", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    const p = await ensureDefaultPipeline(ws.id);
    await expect(deletePipeline(ws.id, p.id)).rejects.toThrow(/only pipeline/);
    const second = await createPipeline(ws.id, { name: "Coaching", stages: [{ name: "Applied" }, { name: "Enrolled", kind: "won" }] });
    await createOpportunity(ws.id, { title: "x", pipelineId: second.id });
    await expect(deletePipeline(ws.id, second.id)).rejects.toThrow(/still has 1 deal/);
    await expect(createPipeline(ws.id, { name: "coaching" })).rejects.toThrow(/already have/);
  });
});

describe("pipeline automations", () => {
  it("fires 'opportunity moves to stage' only for the named stage", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    const p = await ensureDefaultPipeline(ws.id);
    await saveAutomation(ws.id, null, {
      name: "Proposal follow-up",
      trigger: { type: "opportunity_stage_changed", value: "proposal sent" },
      actions: [{ type: "add_tag", tag: "proposal" }],
      active: true,
    });
    const c = await lead(ws.id);
    const deal = await createOpportunity(ws.id, { title: "Jamie", contactId: c.id });
    await moveOpportunity(ws.id, deal.id, stageNamed(p, "Contacted")!.id);
    const db = await getDb();
    expect(await db.select().from(automationRuns).where(eq(automationRuns.workspaceId, ws.id))).toHaveLength(0);
    await moveOpportunity(ws.id, deal.id, stageNamed(p, "Proposal sent")!.id);
    const runs = await db.select().from(automationRuns).where(eq(automationRuns.workspaceId, ws.id));
    expect(runs).toHaveLength(1);
    expect(runs[0].context).toMatchObject({ opportunityId: deal.id, stageName: "Proposal sent" });
    await runDueJobs();
    const [fresh] = await db.select().from(contacts).where(eq(contacts.id, c.id));
    expect(fresh.tags).toContain("proposal");
    // Same stage again: not a move, no new run.
    await moveOpportunity(ws.id, deal.id, stageNamed(p, "Proposal sent")!.id);
    expect(await db.select().from(automationRuns).where(eq(automationRuns.workspaceId, ws.id))).toHaveLength(1);
  });

  it("runs the move and create opportunity steps", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    await saveAutomation(ws.id, null, {
      name: "Hot lead to pipeline",
      trigger: { type: "tag_added", value: "hot-lead" },
      actions: [
        { type: "move_opportunity", stage: "contacted" },
        { type: "create_opportunity", title: "{{first_name}} upsell", value: 300, stage: "Proposal sent" },
      ],
      active: true,
    });
    const c = await lead(ws.id);
    await addTag(ws.id, c.id, "hot-lead");
    await runDueJobs();
    const db = await getDb();
    const deals = await db.select().from(opportunities).where(and(eq(opportunities.workspaceId, ws.id), eq(opportunities.contactId, c.id)));
    const p = await ensureDefaultPipeline(ws.id);
    expect(deals.map((d) => [d.title, d.stageId, d.valueCents]).sort()).toEqual(
      [
        ["Jamie Doyle", stageNamed(p, "Contacted")!.id, 0],
        ["Jamie upsell", stageNamed(p, "Proposal sent")!.id, 30000],
      ].sort(),
    );
    const [run] = await db.select().from(automationRuns).where(eq(automationRuns.workspaceId, ws.id));
    expect(run.status).toBe("completed");
  });

  it("the AI guide's draft keeps opportunity steps and triggers", () => {
    const blank = { tag: "", stage: "", minutes: 0, subject: "", body: "", message: "", temperature: "", instruction: "", sequenceId: "" };
    const d = finishDraft(
      {
        name: "Booked call",
        summary: "",
        why: "",
        trigger: { type: "appointment_booked", value: "Intro-Call!" },
        steps: [
          { ...blank, type: "move_opportunity", stage: "Call booked" },
          { ...blank, type: "create_opportunity", stage: "", title: "{{first_name}} coaching", value: 1500.4 },
        ],
        notes: [],
      },
      { siteIds: new Set(), sequenceIds: new Set() },
    );
    expect(d).toMatchObject({
      trigger: { type: "appointment_booked", value: "intro-call" },
      actions: [
        { type: "move_opportunity", stage: "Call booked" },
        { type: "create_opportunity", title: "{{first_name}} coaching", value: 1500, stage: "" },
      ],
    });
  });

  it("markCallBooked moves forward only, and creates a deal when there is none", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    const p = await ensureDefaultPipeline(ws.id);
    const c = await lead(ws.id);
    const id = await markCallBooked(ws.id, c.id, "Call: Jamie");
    const db = await getDb();
    let [deal] = await db.select().from(opportunities).where(eq(opportunities.id, id!));
    expect(deal.stageId).toBe(stageNamed(p, "Call booked")!.id);
    await moveOpportunity(ws.id, deal.id, stageNamed(p, "Proposal sent")!.id);
    await markCallBooked(ws.id, c.id, "Call: Jamie");
    [deal] = await db.select().from(opportunities).where(eq(opportunities.id, id!));
    expect(deal.stageId).toBe(stageNamed(p, "Proposal sent")!.id);
    // Member plan: no pipelines, nothing happens.
    const starter = await makeWorkspace();
    const sc = await lead(starter.ws.id);
    expect(await markCallBooked(starter.ws.id, sc.id, "x")).toBeNull();
  });
});

describe("MCP opportunity tools", () => {
  const call = async (workspaceId: string, name: string, args: Record<string, unknown> = {}) => {
    const res = await handleMcpMessage({ workspaceId }, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
    const result = res?.result as { content: { text: string }[]; isError: boolean };
    return { isError: result.isError, text: result.content[0].text, json: () => JSON.parse(result.content[0].text) };
  };

  it("lists, creates and moves opportunities, and stays on the Growth plan", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    const c = await lead(ws.id);
    const created = await call(ws.id, "create_opportunity", { title: "Jamie coaching", contactId: c.id, value: 1500, stage: "contacted" });
    expect(created.isError).toBe(false);
    const { opportunityId, stage } = created.json();
    expect(stage).toBe("Contacted");
    const moved = await call(ws.id, "move_opportunity", { opportunityId, stage: "Won" });
    expect(moved.json().opportunity.status).toBe("won");
    const list = (await call(ws.id, "list_opportunities", { status: "won" })).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ stage: "Won", value: "$1,500", untrusted: { title: "Jamie coaching", contactName: "Jamie Doyle" } });
    const pipes = (await call(ws.id, "list_pipelines")).json();
    expect(pipes[0].stages.map((s: { name: string }) => s.name)).toContain("Call booked");

    const starter = await makeWorkspace();
    const locked = await call(starter.ws.id, "list_pipelines");
    expect(locked.isError).toBe(true);
    expect(locked.text).toMatch(/Growth plan/);
  });
});
