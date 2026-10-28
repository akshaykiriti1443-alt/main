import { and, desc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, emailCampaigns, workspaces } from "@/lib/db/schema";
import type { CampaignAudience } from "@/lib/db/types";
import { enqueue } from "../jobs/queue";
import { buildVars, queueEmail } from "./send";

export function audienceWhere(workspaceId: string, audience: CampaignAudience): SQL {
  const conds: SQL[] = [eq(contacts.workspaceId, workspaceId), isNotNull(contacts.email), eq(contacts.unsubscribed, false)];
  if (audience.temperatures?.length) conds.push(inArray(contacts.temperature, audience.temperatures));
  if (audience.stages?.length) conds.push(inArray(contacts.stage, audience.stages));
  if (audience.tags?.length) conds.push(sql`${contacts.tags} && ${sql`array[${sql.join(audience.tags.map((t) => sql`${t}`), sql`, `)}]::text[]`}`);
  return and(...conds)!;
}

export async function countAudience(workspaceId: string, audience: CampaignAudience) {
  const db = await getDb();
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(audienceWhere(workspaceId, audience));
  return row?.n ?? 0;
}

export async function listCampaigns(workspaceId: string) {
  const db = await getDb();
  return db.select().from(emailCampaigns).where(eq(emailCampaigns.workspaceId, workspaceId)).orderBy(desc(emailCampaigns.createdAt));
}

export async function getCampaign(workspaceId: string, campaignId: string) {
  const db = await getDb();
  const [c] = await db
    .select()
    .from(emailCampaigns)
    .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.workspaceId, workspaceId)))
    .limit(1);
  return c ?? null;
}

export async function scheduleCampaign(workspaceId: string, campaignId: string, at: Date) {
  const db = await getDb();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!ws?.settings.mailingAddress) {
    throw new Error("Add your business mailing address in Settings first. The law requires it in marketing emails.");
  }
  const campaign = await getCampaign(workspaceId, campaignId);
  if (!campaign) throw new Error("Campaign not found");
  if (!campaign.subject.trim() || !campaign.body.trim()) throw new Error("Add a subject and a message first.");
  if (campaign.status !== "draft") throw new Error("This campaign was already scheduled.");
  await db.update(emailCampaigns).set({ status: "scheduled", scheduledAt: at }).where(eq(emailCampaigns.id, campaignId));
  await enqueue("campaign.send", { campaignId }, { runAt: at, dedupeKey: `campaign:${campaignId}` });
}

export async function processCampaignSend(campaignId: string) {
  const db = await getDb();
  const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, campaignId)).limit(1);
  if (!campaign || campaign.status !== "scheduled") return;
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, campaign.workspaceId)).limit(1);
  if (!ws || ws.status === "paused") return;

  await db.update(emailCampaigns).set({ status: "sending" }).where(eq(emailCampaigns.id, campaignId));
  const recipients = await db.select().from(contacts).where(audienceWhere(ws.id, campaign.audience));
  for (const c of recipients) {
    if (!c.email) continue;
    await queueEmail({
      workspaceId: ws.id,
      contactId: c.id,
      to: c.email,
      subject: campaign.subject,
      body: campaign.body,
      vars: await buildVars(ws, c),
      campaignId: campaign.id,
    });
  }
  await db
    .update(emailCampaigns)
    .set({ status: "sent", sentAt: new Date(), recipients: recipients.length })
    .where(eq(emailCampaigns.id, campaignId));
}
