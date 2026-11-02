import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { addTag, contactName, contactTimeline, getContact, listContacts, removeTag, setStage, updateContactDetails } from "./contacts";
import { getPage, getSite, listPages, listSites, publishSite, savePageContent, siteBaseUrl } from "./sites";
import { listAutomations, saveAutomation } from "./automations";
import { AUTOMATION_PRESETS, presetByKey } from "./automationPresets";
import { workspaceStats } from "./analytics";
import { skoolMemberCounts, syncSkoolMembers } from "./skool";
import { computeLadder, latestCheckins, saveCheckin, skoolLinkFor, skoolVisits } from "./growth";
import { hasFeature } from "./plans";
import { adLibraryConfigured, adLibraryWebUrl, searchAdLibrary } from "./meta/adLibrary";

// A small MCP server (Model Context Protocol, streamable HTTP, stateless JSON responses) so an
// owner's own Claude or ChatGPT can work inside their workspace: read leads, edit pages, switch on
// automations, log the growth check-in. The AI runs on the owner's subscription, not our bill.
// Scope: one workspace per token. No deletes. Never touches anyone's Skool login.

export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

type Ctx = { workspaceId: string };
type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  write?: boolean;
  annotations?: Record<string, unknown>;
  run: (ctx: Ctx, args: Record<string, unknown>) => Promise<unknown>;
};

const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const int = (description: string) => ({ type: "integer", description, minimum: 0 });
const STAGES = ["new", "engaged", "trial", "member", "lost"] as const;

async function workspaceOf(id: string) {
  const db = await getDb();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
  if (!ws) throw new Error("Workspace not found.");
  return ws;
}

const TOOLS: Tool[] = [
  {
    name: "get_overview",
    description: "Start here. The workspace at a glance: business details, last 30 days of page views and leads, Skool member counts, the Skool growth ladder (level, what's missing, next moves) and Skool link clicks.",
    inputSchema: obj(),
    annotations: { readOnlyHint: true },
    run: async ({ workspaceId }) => {
      const ws = await workspaceOf(workspaceId);
      const [stats, skool, checkins, visits] = await Promise.all([workspaceStats(workspaceId, 30), skoolMemberCounts(workspaceId), latestCheckins(workspaceId, 1), skoolVisits(workspaceId, 30)]);
      const ladder = computeLadder(checkins[0] ?? null);
      const { series: _series, ...totals } = stats as Record<string, unknown> & { series?: unknown };
      return {
        business: { name: ws.name, niche: ws.settings.niche, offer: ws.settings.offer, skoolUrl: ws.settings.skoolUrl, plan: ws.plan, status: ws.status },
        last30Days: totals,
        skoolMembers: skool,
        growthLadder: { qualifiesForLevel: ladder.qualifies, skoolShowsLevel: ladder.reported, nextLevel: ladder.next?.level ?? null, gaps: ladder.gaps, nextMoves: ladder.moves, lastCheckin: checkins[0]?.createdAt ?? null },
        skoolLink: { url: skoolLinkFor(ws.slug), clicks30Days: visits.total, bySource: visits.bySource },
        appUrl: `${env.appUrl}/app/w/${workspaceId}`,
      };
    },
  },
  {
    name: "list_leads",
    description: "List leads and members in the CRM, newest first. Filter by search text, stage, temperature or tag.",
    inputSchema: obj({
      q: str("Search name, email or phone"),
      stage: { type: "string", enum: STAGES },
      temperature: { type: "string", enum: ["hot", "warm", "cold"] },
      tag: str("Only contacts with this tag"),
      limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
    }),
    annotations: { readOnlyHint: true },
    run: async ({ workspaceId }, a) => {
      const args = z.object({ q: z.string().max(100).optional(), stage: z.enum(STAGES).optional(), temperature: z.enum(["hot", "warm", "cold"]).optional(), tag: z.string().max(60).optional(), limit: z.number().int().min(1).max(100).optional() }).parse(a);
      const rows = await listContacts(workspaceId, { ...args, limit: args.limit ?? 25 });
      return rows.map((c) => ({ id: c.id, name: contactName(c), email: c.email, phone: c.phone, stage: c.stage, temperature: c.temperature, score: c.score, tags: c.tags, source: c.source, created: c.createdAt }));
    },
  },
  {
    name: "get_lead",
    description: "One contact with notes, score reason and their recent timeline (page views, leads, emails, Skool trial/paid/churn).",
    inputSchema: obj({ contactId: str("Contact id from list_leads") }, ["contactId"]),
    annotations: { readOnlyHint: true },
    run: async ({ workspaceId }, a) => {
      const { contactId } = z.object({ contactId: z.string() }).parse(a);
      const c = await getContact(workspaceId, contactId);
      if (!c) throw new Error("Contact not found.");
      const timeline = await contactTimeline(workspaceId, contactId, 20);
      return { ...c, timeline: timeline.map((t) => ({ type: t.type, at: t.createdAt, data: t.data })) };
    },
  },
  {
    name: "update_lead",
    description: "Change a contact: add or remove tags, move their stage (this fires the owner's stage-changed automations), or replace their notes.",
    inputSchema: obj(
      {
        contactId: str("Contact id"),
        addTags: { type: "array", items: { type: "string" }, maxItems: 10 },
        removeTags: { type: "array", items: { type: "string" }, maxItems: 10 },
        stage: { type: "string", enum: STAGES },
        notes: str("Replaces the contact's notes"),
      },
      ["contactId"],
    ),
    write: true,
    run: async ({ workspaceId }, a) => {
      const args = z.object({ contactId: z.string(), addTags: z.array(z.string().max(60)).max(10).optional(), removeTags: z.array(z.string().max(60)).max(10).optional(), stage: z.enum(STAGES).optional(), notes: z.string().max(5000).optional() }).parse(a);
      const c = await getContact(workspaceId, args.contactId);
      if (!c) throw new Error("Contact not found.");
      for (const t of args.addTags ?? []) await addTag(workspaceId, c.id, t);
      for (const t of args.removeTags ?? []) await removeTag(workspaceId, c.id, t);
      if (args.stage && args.stage !== c.stage) await setStage(workspaceId, c.id, args.stage);
      if (args.notes !== undefined) await updateContactDetails(workspaceId, c.id, { notes: args.notes });
      return { ok: true, contact: await getContact(workspaceId, c.id) };
    },
  },
  {
    name: "list_pages",
    description: "Funnels (sites) and their pages, with ids and live links.",
    inputSchema: obj(),
    annotations: { readOnlyHint: true },
    run: async ({ workspaceId }) => {
      const all = await listSites(workspaceId);
      return Promise.all(
        all.map(async (s) => ({
          siteId: s.id,
          name: s.name,
          published: s.published,
          url: siteBaseUrl(s),
          pages: (await listPages(s.id)).map((p) => ({ pageId: p.id, title: p.title, slug: p.slug, kind: p.kind, publishedAt: p.publishedAt })),
        })),
      );
    },
  },
  {
    name: "get_page",
    description: "A page's draft content: an ordered list of sections (hero, benefits, steps, text, faq, cta, form, video). Edit it and send the whole list back with update_page.",
    inputSchema: obj({ pageId: str("Page id from list_pages") }, ["pageId"]),
    annotations: { readOnlyHint: true },
    run: async ({ workspaceId }, a) => {
      const { pageId } = z.object({ pageId: z.string() }).parse(a);
      const page = await getPage(workspaceId, pageId);
      if (!page) throw new Error("Page not found.");
      return { pageId: page.id, siteId: page.siteId, title: page.title, kind: page.kind, sections: page.content.sections };
    },
  },
  {
    name: "update_page",
    description:
      "Save new draft content for a page. Send the full sections array (same shape as get_page; keep each section's id and type). Copy rules: simple words, short sentences, no invented testimonials or income claims. Changes stay a draft until publish_site.",
    inputSchema: obj({ pageId: str("Page id"), title: str("Optional new page title"), sections: { type: "array", items: { type: "object" }, maxItems: 40 } }, ["pageId", "sections"]),
    write: true,
    run: async ({ workspaceId }, a) => {
      const args = z.object({ pageId: z.string(), title: z.string().max(120).optional(), sections: z.array(z.unknown()).max(40) }).parse(a);
      const page = await getPage(workspaceId, args.pageId);
      if (!page) throw new Error("Page not found.");
      const saved = await savePageContent(workspaceId, page.id, { sections: args.sections }, args.title);
      return { ok: true, sections: saved.sections.length, next: `Draft saved. Call publish_site with siteId ${page.siteId} to make it live.` };
    },
  },
  {
    name: "publish_site",
    description: "Publish every page of a funnel so the drafts go live.",
    inputSchema: obj({ siteId: str("Site id from list_pages") }, ["siteId"]),
    write: true,
    run: async ({ workspaceId }, a) => {
      const { siteId } = z.object({ siteId: z.string() }).parse(a);
      const site = await getSite(workspaceId, siteId);
      if (!site) throw new Error("Site not found.");
      await publishSite(workspaceId, siteId);
      return { ok: true, url: siteBaseUrl(site) };
    },
  },
  {
    name: "search_competitor_ads",
    description:
      "Search the Meta Ad Library for ads running now, by keyword or competitor Facebook Page id. Longest-running first (long-runners usually make money). Always returns the Ad Library website link, which shows every country; the API only covers ads that reached the EU plus political ads.",
    inputSchema: obj({ q: str("Keyword, max 100 characters"), pageId: str("Competitor Facebook Page id"), country: str("ISO country code or ALL") }),
    annotations: { readOnlyHint: true },
    run: async (_ctx, a) => {
      const args = z.object({ q: z.string().max(100).optional(), pageId: z.string().regex(/^\d{3,30}$/).optional(), country: z.string().max(3).optional() }).parse(a);
      const website = adLibraryWebUrl({ q: args.q, pageId: args.pageId, country: args.country });
      if (!adLibraryConfigured()) return { website, ads: [], note: "Live search is not connected on this server. Open the website link." };
      const ads = await searchAdLibrary({ q: args.q, pageIds: args.pageId ? [args.pageId] : [], countries: [args.country?.toUpperCase() || "ALL"] });
      return { website, ads: ads.slice(0, 25).map((x) => ({ page: x.pageName, daysRunning: x.daysRunning, text: x.bodies[0] ?? "", headline: x.titles[0] ?? "", platforms: x.platforms, link: x.snapshotUrl })) };
    },
  },
  {
    name: "list_automations",
    description: "The workspace's automations, plus the ready-made recipes (welcome, convert a trial, save a cancelling member, win back) that add_automation_recipe can install.",
    inputSchema: obj(),
    annotations: { readOnlyHint: true },
    run: async ({ workspaceId }) => ({
      automations: (await listAutomations(workspaceId)).map((x) => ({ id: x.id, name: x.name, active: x.active, trigger: x.trigger, actions: x.actions })),
      recipes: AUTOMATION_PRESETS.map((p) => ({ key: p.key, title: p.title, what: p.body, group: p.group })),
    }),
  },
  {
    name: "add_automation_recipe",
    description: "Install a recipe from list_automations. It starts switched OFF so the owner can review it. Pass active: true only if the owner asked to switch it on. Growth plan.",
    inputSchema: obj({ key: str("Recipe key"), active: { type: "boolean", default: false } }, ["key"]),
    write: true,
    run: async ({ workspaceId }, a) => {
      const args = z.object({ key: z.string(), active: z.boolean().optional() }).parse(a);
      const ws = await workspaceOf(workspaceId);
      if (!hasFeature(ws.plan, "automations")) throw new Error("Automations are on the Growth plan. The owner can upgrade in Plan & wallet.");
      const preset = presetByKey(args.key);
      if (!preset) throw new Error(`Unknown recipe. Use one of: ${AUTOMATION_PRESETS.map((p) => p.key).join(", ")}`);
      const id = await saveAutomation(workspaceId, null, { ...preset.def, active: Boolean(args.active) });
      return { ok: true, id, active: Boolean(args.active), review: `${env.appUrl}/app/w/${workspaceId}/automations/${id}` };
    },
  },
  {
    name: "save_growth_checkin",
    description: "Log this week's numbers from Skool › Settings › Growth (last 30 days). Returns the level they qualify for and the next moves.",
    inputSchema: obj(
      {
        aboutVisitors: int("About-page visitors, last 30 days"),
        newPaid: int("New paying members, last 30 days"),
        networkSignups: int("Skool Network sign-ups, last 30 days"),
        skoolLevel: { type: "integer", minimum: 1, maximum: 4, description: "Level Skool shows" },
        members: int("Total members"),
        adSpendPerDay: int("Owner's own ad spend per day in USD"),
        postsPerWeek: int("Organic posts per week"),
        linkInBio: { type: "boolean", description: "Skool link in social bios" },
        boostPercent: { type: "integer", minimum: 0, maximum: 100 },
        note: str("What changed this week"),
      },
      ["aboutVisitors", "newPaid", "networkSignups"],
    ),
    write: true,
    run: async ({ workspaceId }, a) => {
      const row = await saveCheckin(workspaceId, a as never);
      const l = computeLadder(row);
      return { ok: true, qualifiesForLevel: l.qualifies, nextLevel: l.next?.level ?? null, gaps: l.gaps, nextMoves: l.moves };
    },
  },
  {
    name: "sync_skool_members",
    description:
      "Bring the owner's Skool member export (CSV text from Skool › Members › Export, pasted by the owner) into the CRM. fullExport: true marks members missing from the file as churned, which starts win-back automations, so only use it for the complete export. Never ask for Skool logins.",
    inputSchema: obj({ csv: str("The exported CSV, or one email per line"), fullExport: { type: "boolean", default: false } }, ["csv"]),
    write: true,
    run: async ({ workspaceId }, a) => {
      const args = z.object({ csv: z.string().max(2_000_000), fullExport: z.boolean().optional() }).parse(a);
      return syncSkoolMembers(workspaceId, args.csv, { churnMissing: Boolean(args.fullExport) });
    },
  },
];

export const mcpTools = () =>
  TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: t.annotations ?? { readOnlyHint: false, destructiveHint: false },
  }));

const SERVER_INSTRUCTIONS = `You are working inside one ${env.platformName} workspace: the owner's funnel pages, CRM and Skool community growth.
Call get_overview first. Pages are drafts until publish_site. Write in simple words and short sentences; never invent testimonials, results or income claims.
The growth ladder follows Skool's Growth tab (rolling 30 days): L1 Discovery. L2 = 6 custom ads: 100 About-page visitors + 1 new customer + subscription or tiers. L3 = upload your own ads + up to $1,000/day Skool spend: 3,000 visitors + Skool link in bio + consistent organic promo + 10 Skool Network sign-ups. L4 = partnership ads + video uploads, ~$10,000/day: 10,000 visitors + link in bio + organic promo + 30 Skool Network sign-ups.
Never ask for, store or use anyone's Skool login. The owner sends Skool messages by hand.`;

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
type RpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

/** Handle one JSON-RPC message. Returns null for notifications (no reply). */
export async function handleMcpMessage(ctx: Ctx, msg: RpcRequest): Promise<RpcResponse | null> {
  const id = msg.id ?? null;
  const isNotification = msg.id === undefined;
  const ok = (result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return isNotification ? null : fail(-32600, "Invalid request");
  if (msg.method.startsWith("notifications/")) return null;

  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: MCP_PROTOCOL_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: `${env.platformName.toLowerCase()}-workspace`, title: `${env.platformName} workspace`, version: "1.0.0" },
        instructions: SERVER_INSTRUCTIONS,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: mcpTools() });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return fail(-32602, `Unknown tool: ${name}`);
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        if (tool.write) {
          const ws = await workspaceOf(ctx.workspaceId);
          if (ws.status === "paused") throw new Error("This workspace is paused, so changes are off. The owner can turn it back on in the app.");
        }
        const result = await tool.run(ctx, args);
        return ok({ content: [{ type: "text", text: JSON.stringify(result, null, 1) }], isError: false });
      } catch (err) {
        const message = err instanceof z.ZodError ? `Invalid arguments: ${err.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` : err instanceof Error ? err.message : "Tool failed.";
        return ok({ content: [{ type: "text", text: message }], isError: true });
      }
    }
    default:
      return isNotification ? null : fail(-32601, `Method not found: ${msg.method}`);
  }
}
