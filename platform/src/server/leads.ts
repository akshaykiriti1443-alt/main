import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pages, sites, workspaces } from "@/lib/db/schema";
import { isEmail, normalizeEmail } from "@/lib/util";
import { logActivity } from "./activity";
import { upsertContact } from "./contacts";
import { emitEvent } from "./events";
import { enqueue } from "./jobs/queue";
import { siteBaseUrl, thankYouPageFor } from "./sites";

export type LeadInput = {
  pageId: string;
  email: string;
  name?: string;
  phone?: string;
  honeypot?: string;
  eventId?: string;
  ip?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  sourceUrl?: string | null;
  utm?: Record<string, string>;
};

export type LeadResult =
  | { ok: true; redirectTo: string; contactId: string | null }
  | { ok: false; status: number; error: string; redirectTo?: string };

export async function captureLead(input: LeadInput): Promise<LeadResult> {
  if (!/^[0-9a-f-]{36}$/i.test(input.pageId)) return { ok: false, status: 400, error: "Unknown form." };
  const db = await getDb();
  const [row] = await db
    .select({ page: pages, site: sites, workspace: workspaces })
    .from(pages)
    .innerJoin(sites, eq(sites.id, pages.siteId))
    .innerJoin(workspaces, eq(workspaces.id, pages.workspaceId))
    .where(eq(pages.id, input.pageId))
    .limit(1);
  if (!row || !row.site.published) return { ok: false, status: 404, error: "This page is not live." };
  if (row.workspace.status === "paused") return { ok: false, status: 410, error: "This page is unavailable." };

  const thankYou = await thankYouPageFor(row.site.id);
  const base = siteBaseUrl(row.site);
  const eventId = (input.eventId ?? "").slice(0, 64) || crypto.randomUUID();
  const redirectTo = `${base}${thankYou ? `/${thankYou.slug}` : ""}?eid=${encodeURIComponent(eventId)}`;

  // Bots fill hidden fields; pretend it worked so they move on.
  if (input.honeypot) return { ok: true, redirectTo, contactId: null };

  if (!isEmail(input.email)) {
    return { ok: false, status: 422, error: "Please enter a valid email address.", redirectTo: `${base}/${row.page.slug}` };
  }
  const [firstName, ...rest] = (input.name ?? "").trim().split(/\s+/);
  const { contact, created } = await upsertContact({
    workspaceId: row.workspace.id,
    email: normalizeEmail(input.email),
    phone: input.phone || null,
    firstName: firstName ?? "",
    lastName: rest.join(" "),
    source: "landing_page",
    sourceRef: row.site.id,
    tags: ["lead"],
  });

  await logActivity({
    workspaceId: row.workspace.id,
    contactId: contact.id,
    type: "lead",
    refId: row.page.id,
    data: { siteId: row.site.id, page: row.page.title, utm: input.utm ?? {}, created },
  });

  if (created) {
    await emitEvent({ type: "lead_created", workspaceId: row.workspace.id, contactId: contact.id, siteId: row.site.id });
  }

  if (row.workspace.settings.metaPixelId && row.workspace.settings.metaCapiTokenEnc) {
    await enqueue("meta.capi", {
      workspaceId: row.workspace.id,
      eventName: "Lead",
      eventId,
      eventTime: Math.floor(Date.now() / 1000),
      eventSourceUrl: input.sourceUrl || `${base}/${row.page.slug}`,
      email: contact.email,
      phone: contact.phone,
      firstName: contact.firstName,
      lastName: contact.lastName,
      externalId: contact.id,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      fbp: input.fbp ?? null,
      fbc: input.fbc ?? null,
    });
  }
  return { ok: true, redirectTo, contactId: contact.id };
}

const BOT_UA = /bot|crawler|spider|crawling|preview|facebookexternalhit|slurp|headless/i;

export async function recordPageView(input: { workspaceId: string; siteId: string; pageId: string; userAgent: string | null; referrer: string | null }) {
  if (input.userAgent && BOT_UA.test(input.userAgent)) return;
  await logActivity({
    workspaceId: input.workspaceId,
    type: "page_view",
    refId: input.pageId,
    data: { siteId: input.siteId, referrer: input.referrer ?? "" },
  });
}

export async function siteForPage(pageId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ site: sites })
    .from(pages)
    .innerJoin(sites, and(eq(sites.id, pages.siteId)))
    .where(eq(pages.id, pageId))
    .limit(1);
  return row?.site ?? null;
}
