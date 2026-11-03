import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { workspaceMembers, workspaces } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { LEVELS, aboutUrl, computeLadder, saveCheckin, skoolVisits, visitSource } from "@/server/growth";
import { GET as goRoute } from "@/app/go/[slug]/route";
import { POST as mcpRoute } from "@/app/api/mcp/[token]/route";
import { createConnectorToken, revokeConnectorToken, listConnectorTokens } from "@/server/connectors";
import { chargeAi } from "@/server/ai/client";
import { usageThisMonth } from "@/server/wallet";
import { makeWorkspace, setPlan } from "./helpers";
import { createUser } from "@/server/auth";
import { removeMember } from "@/server/team";

const base = { aboutVisitors: 0, newPaid: 0, networkSignups: 0, members: 0, skoolLevel: 1, boostPercent: 30, linkInBio: false, postsPerWeek: 0, adSpendPerDay: 0, note: "" };

describe("growth ladder", () => {
  it("places numbers on Skool's levels and names the gaps", () => {
    expect(computeLadder(null).qualifies).toBe(1);
    const l2 = computeLadder({ ...base, aboutVisitors: 140, newPaid: 1 });
    expect(l2.qualifies).toBe(2);
    expect(l2.next?.level).toBe(3);
    expect(l2.gaps.find((g) => g.label.startsWith("Skool Network"))).toMatchObject({ have: 0, need: 10, done: false });
    // 3,000 visitors and 10 network sign-ups still need organic promotion for Level 3.
    expect(computeLadder({ ...base, aboutVisitors: 3200, newPaid: 4, networkSignups: 12 }).qualifies).toBe(2);
    expect(computeLadder({ ...base, aboutVisitors: 3200, newPaid: 4, networkSignups: 12, linkInBio: true, adSpendPerDay: 30 }).qualifies).toBe(3);
    expect(computeLadder({ ...base, aboutVisitors: 12000, newPaid: 2, networkSignups: 31, linkInBio: true, postsPerWeek: 5 }).qualifies).toBe(4);
    // Cumulative: big numbers without a paying customer are still Level 1, and the next step is pricing.
    const free = computeLadder({ ...base, aboutVisitors: 12000, networkSignups: 31, postsPerWeek: 5 });
    expect(free.qualifies).toBe(1);
    expect(free.next?.level).toBe(2);
    expect(free.moves.some((m) => m.startsWith("Turn on subscription or tiers"))).toBe(true);
    // Skool's help center lists no link-in-bio requirement: it's only a tip.
    const noBio = computeLadder({ ...base, aboutVisitors: 3200, newPaid: 4, networkSignups: 12, postsPerWeek: 7 });
    expect(noBio.qualifies).toBe(3);
    expect(noBio.gaps.find((g) => g.label.startsWith("Skool link in bio"))).toBeUndefined();
    expect(noBio.moves.some((m) => m.startsWith("Tip: put your plain skool.com link"))).toBe(true);
    // No promised dollar amounts anywhere on the ladder.
    expect(JSON.stringify(LEVELS)).not.toMatch(/\$\d|upload/i);
    expect([...l2.moves, ...noBio.moves].join(" ")).not.toMatch(/1,000|10,000|upload/i);
  });

  it("normalises group links to the About page and reads visit sources", () => {
    expect(aboutUrl("https://www.skool.com/fit-dads/classroom?x=1")).toBe("https://www.skool.com/fit-dads/about");
    expect(aboutUrl("javascript:alert(1)")).toBe("");
    // Never an open redirect: only skool.com targets.
    expect(aboutUrl("https://evil.example/login")).toBe("");
    expect(aboutUrl("https://skool.com.evil.example/x")).toBe("");
    expect(visitSource(new URLSearchParams("src=bio"), "")).toBe("bio");
    expect(visitSource(new URLSearchParams("fbclid=abc"), "")).toBe("meta-ad");
    expect(visitSource(new URLSearchParams(""), "https://l.instagram.com/")).toBe("meta");
  });

  it("the Skool link redirects to the About page, keeps utm params and counts real clicks only", async () => {
    const { ws } = await makeWorkspace();
    const ua = { "user-agent": "Mozilla/5.0 (iPhone)" };
    const res = await goRoute(new NextRequest(`http://localhost/go/${ws.slug}?src=ads&utm_campaign=l2`, { headers: ua }), { params: Promise.resolve({ slug: ws.slug }) });
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://www.skool.com/fit-dads/about");
    expect(loc.searchParams.get("utm_campaign")).toBe("l2");
    expect(loc.searchParams.get("src")).toBeNull();

    await goRoute(new NextRequest(`http://localhost/go/${ws.slug}`, { headers: { "user-agent": "facebookexternalhit/1.1" } }), { params: Promise.resolve({ slug: ws.slug }) });
    const visits = await skoolVisits(ws.id);
    expect(visits.total).toBe(1);
    expect(visits.bySource[0]).toEqual({ source: "ads", count: 1 });

    // A loop from one address is still redirected, but only counted a few times a minute.
    const loop = { ...ua, "x-real-ip": `10.7.${Date.now() % 250}.9` };
    for (let i = 0; i < 6; i++) {
      const r = await goRoute(new NextRequest(`http://localhost/go/${ws.slug}`, { headers: loop }), { params: Promise.resolve({ slug: ws.slug }) });
      expect(r.status).toBe(302);
    }
    expect((await skoolVisits(ws.id)).total).toBe(4);
  });
});

async function rpc(token: string, body: unknown) {
  const res = await mcpRoute(new NextRequest("http://localhost/api/mcp/x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ token }) });
  return { status: res.status, body: res.status === 202 ? null : await res.json() };
}

describe("Claude / ChatGPT connector (MCP)", () => {
  it("speaks MCP, stays inside its workspace and stops when revoked", async () => {
    const { ws, user } = await makeWorkspace();
    const { token } = await createConnectorToken(ws.id, user.id, "My Claude");

    const init = await rpc(token, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    expect(init.body.result.protocolVersion).toBe("2025-06-18");
    expect(init.body.result.capabilities.tools).toBeTruthy();
    expect((await rpc(token, { jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);

    const list = await rpc(token, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const names = list.body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(["get_overview", "update_page", "save_growth_checkin", "add_automation_recipe"]));

    const checkin = await rpc(token, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "save_growth_checkin", arguments: { aboutVisitors: 150, newPaid: 1, networkSignups: 0 } } });
    expect(JSON.parse(checkin.body.result.content[0].text).qualifiesForLevel).toBe(2);

    const overview = await rpc(token, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_overview", arguments: {} } });
    expect(JSON.parse(overview.body.result.content[0].text).business.name).toBe(ws.name);

    // Automations are a Growth plan feature: a tool error, not a crash.
    const locked = await rpc(token, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "add_automation_recipe", arguments: { key: "hot" } } });
    expect(locked.body.result.isError).toBe(true);
    await setPlan(ws.id, "growth");
    const added = await rpc(token, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "add_automation_recipe", arguments: { key: "hot" } } });
    expect(JSON.parse(added.body.result.content[0].text)).toMatchObject({ ok: true, active: false });

    // Another workspace's contact id is invisible.
    const other = await makeWorkspace();
    const otherToken = (await createConnectorToken(other.ws.id, other.user.id, "x")).token;
    const peek = await rpc(otherToken, { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "get_page", arguments: { pageId: "00000000-0000-0000-0000-000000000000" } } });
    expect(peek.body.result.isError).toBe(true);

    const [row] = await listConnectorTokens(ws.id);
    await revokeConnectorToken(ws.id, row.id);
    expect((await rpc(token, { jsonrpc: "2.0", id: 8, method: "ping" })).status).toBe(401);
  });

  it("a teammate's connector URL stops working when they are demoted or removed", async () => {
    const { ws } = await makeWorkspace();
    const va = await createUser({ email: `va-${Date.now()}@example.com`, name: "Val Assist", password: "password123" });
    const db = await getDb();
    await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: va.id, role: "admin" });
    const { token } = await createConnectorToken(ws.id, va.id, "VA's Claude");
    expect((await listConnectorTokens(ws.id))[0].createdByName).toBe("Val Assist");
    expect((await rpc(token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);

    await db.update(workspaceMembers).set({ role: "user" }).where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.userId, va.id)));
    expect((await rpc(token, { jsonrpc: "2.0", id: 2, method: "ping" })).status).toBe(401);

    await db.update(workspaceMembers).set({ role: "admin" }).where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.userId, va.id)));
    await removeMember(ws.id, va.id);
    expect(await listConnectorTokens(ws.id)).toHaveLength(0);
    expect((await rpc(token, { jsonrpc: "2.0", id: 3, method: "ping" })).status).toBe(401);
  });
});

describe("bring your own AI key", () => {
  it("never charges the wallet or allowance when the workspace has its own key", async () => {
    const { ws } = await makeWorkspace();
    const db = await getDb();
    await db.update(workspaces).set({ settings: { ...ws.settings, aiProvider: "anthropic", aiKeyEnc: encrypt("sk-ant-test"), aiKeyHint: "…test" } }).where(eq(workspaces.id, ws.id));
    for (let i = 0; i < 5; i++) expect(await chargeAi(ws.id, "ai_generation", "test")).toMatchObject({ billedMicros: 0, byo: true, creds: { provider: "anthropic", apiKey: "sk-ant-test" } });
    const usage = await usageThisMonth(ws.id);
    expect(JSON.stringify(usage)).not.toContain("ai_generation");
  });

  it("saves a growth check-in with clamped numbers", async () => {
    const { ws } = await makeWorkspace();
    const row = await saveCheckin(ws.id, { aboutVisitors: -5, skoolLevel: 9, boostPercent: 300 });
    expect(row).toMatchObject({ aboutVisitors: 0, skoolLevel: 4, boostPercent: 100 });
  });
});
