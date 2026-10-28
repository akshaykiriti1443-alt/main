import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, emailMessages, sites, users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { logActivity } from "../activity";
import { enqueue } from "../jobs/queue";
import { siteVars, type Site } from "../sites";
import { canAfford, chargeUsage } from "../wallet";
import { EmailProviderError, sendEmail } from "./providers";
import { renderEmail, unsubscribeUrl } from "./render";

type Workspace = typeof workspaces.$inferSelect;
type Contact = typeof contacts.$inferSelect;

export async function workspaceOwnerEmail(workspaceId: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db
    .select({ email: users.email })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner")))
    .limit(1);
  return row?.email ?? null;
}

export async function workspaceOwnerFirstName(workspaceId: string): Promise<string> {
  const db = await getDb();
  const [row] = await db
    .select({ name: users.name })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner")))
    .limit(1);
  return (row?.name ?? "").split(" ")[0] ?? "";
}

export async function buildVars(ws: Workspace, contact: Contact | null, site?: Site | null) {
  let s = site ?? null;
  if (!s && contact?.sourceRef) {
    const db = await getDb();
    [s] = await db.select().from(sites).where(and(eq(sites.id, contact.sourceRef), eq(sites.workspaceId, ws.id))).limit(1);
  }
  const fromSite = s ? siteVars(s) : {};
  return {
    first_name: contact?.firstName || "there",
    business_name: ws.settings.businessName || ws.name,
    owner_name: await workspaceOwnerFirstName(ws.id),
    skool_url: fromSite.skool_url || ws.settings.skoolUrl || "",
    lead_magnet_url: fromSite.lead_magnet_url || "",
    lead_magnet_name: fromSite.lead_magnet_name || "your free guide",
    site_url: fromSite.site_url || "",
  } as Record<string, string>;
}

export async function queueEmail(input: {
  workspaceId: string;
  contactId?: string | null;
  to: string;
  subject: string;
  body: string;
  vars: Record<string, string | undefined>;
  campaignId?: string;
  sequenceStepId?: string;
  runAt?: Date;
}) {
  const db = await getDb();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1);
  if (!ws) throw new Error("Workspace not found");
  const rendered = renderEmail({
    subject: input.subject,
    body: input.body,
    vars: input.vars,
    businessName: ws.settings.businessName || ws.name,
    mailingAddress: ws.settings.mailingAddress,
    contactId: input.contactId,
  });
  const [msg] = await db
    .insert(emailMessages)
    .values({
      workspaceId: input.workspaceId,
      contactId: input.contactId ?? null,
      toEmail: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      provider: env.emailProvider,
      campaignId: input.campaignId,
      sequenceStepId: input.sequenceStepId,
    })
    .returning({ id: emailMessages.id });
  await enqueue("email.send", { emailMessageId: msg.id }, { runAt: input.runAt });
  return msg.id;
}

export async function processEmailSend(emailMessageId: string) {
  const db = await getDb();
  const [msg] = await db.select().from(emailMessages).where(eq(emailMessages.id, emailMessageId)).limit(1);
  if (!msg || msg.status !== "queued") return;
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, msg.workspaceId)).limit(1);
  const skip = async (reason: string) =>
    db.update(emailMessages).set({ status: "skipped", error: reason }).where(eq(emailMessages.id, msg.id));

  if (!ws || ws.status === "paused") return void (await skip("workspace paused"));
  if (msg.contactId) {
    const [c] = await db.select({ unsubscribed: contacts.unsubscribed }).from(contacts).where(eq(contacts.id, msg.contactId)).limit(1);
    if (c?.unsubscribed) return void (await skip("contact unsubscribed"));
  }
  if (!(await canAfford(ws.id, "email", 1))) {
    await db
      .update(emailMessages)
      .set({ status: "failed", error: "Monthly email allowance used and wallet is empty." })
      .where(eq(emailMessages.id, msg.id));
    return;
  }

  const replyTo = ws.settings.replyToEmail || (await workspaceOwnerEmail(ws.id)) || undefined;
  const businessName = (ws.settings.businessName || ws.name).replace(/["<>]/g, "");
  const headers: Record<string, string> = msg.contactId
    ? { "List-Unsubscribe": `<${unsubscribeUrl(msg.contactId)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : {};
  try {
    const sent = await sendEmail({
      from: `"${businessName}" <${env.emailFrom}>`,
      to: msg.toEmail,
      replyTo,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      headers,
      stream: msg.campaignId ? "broadcast" : "transactional",
    });
    await db
      .update(emailMessages)
      .set({ status: "sent", provider: sent.provider, providerMessageId: sent.id, sentAt: new Date(), error: null })
      .where(eq(emailMessages.id, msg.id));
  } catch (err) {
    if (err instanceof EmailProviderError && err.permanent) {
      await db.update(emailMessages).set({ status: "failed", error: err.message }).where(eq(emailMessages.id, msg.id));
      return;
    }
    throw err;
  }
  await chargeUsage(ws.id, "email", 1).catch((err) => console.error("[email] billing failed", err));
  await logActivity({
    workspaceId: ws.id,
    contactId: msg.contactId,
    type: "email_sent",
    refId: msg.id,
    data: { subject: msg.subject },
  });
}

/** Account emails (password links, invites) sent right away, outside any workspace. */
export async function sendSystemEmail(input: { to: string; subject: string; body: string; brandName?: string }) {
  const { renderEmail } = await import("./render");
  const brand = input.brandName || env.platformName;
  const r = renderEmail({ subject: input.subject, body: input.body, vars: {}, businessName: brand });
  return sendEmail({ from: `"${brand.replace(/["<>]/g, "")}" <${env.emailFrom}>`, to: input.to, subject: r.subject, html: r.html, text: r.text });
}
