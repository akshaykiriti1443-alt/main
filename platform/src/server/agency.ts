import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agencies, agencyMembers, workspaceMembers, workspaces } from "@/lib/db/schema";
import type { BrandSettings } from "@/lib/db/types";
import { randomToken } from "@/lib/crypto";
import { normalizeEmail, shortId, slugify } from "@/lib/util";
import { createUser, findUserByEmail } from "./auth";
import { queueEmail } from "./email/send";
import { passwordLinkFor } from "./passwords";
import { applyTemplate } from "./templates";
import { getOrCreateWallet } from "./wallet";
import { createWorkspace } from "./workspace";

export async function createAgency(userId: string, name: string) {
  const db = await getDb();
  const base = slugify(name, 30);
  const [agency] = await db
    .insert(agencies)
    .values({ name: name.trim(), slug: `${base}-${shortId(4)}`, plan: "none", brand: { name: name.trim() } })
    .returning();
  await db.insert(agencyMembers).values({ agencyId: agency.id, userId, role: "owner" });
  await getOrCreateWallet("agency", agency.id);
  return agency;
}

export async function listSubAccounts(agencyId: string) {
  const db = await getDb();
  return db
    .select({
      workspace: workspaces,
      contacts: sql<number>`(select count(*)::int from contacts c where c.workspace_id = "workspaces"."id")`,
      owner: sql<string | null>`(select u.email from workspace_members wm join users u on u.id = wm.user_id where wm.workspace_id = "workspaces"."id" and wm.role = 'owner' limit 1)`,
    })
    .from(workspaces)
    .where(eq(workspaces.agencyId, agencyId))
    .orderBy(workspaces.createdAt);
}

/** Create a client sub-account and invite its owner by email. */
export async function createSubAccount(input: {
  agencyId: string;
  agencyName: string;
  name: string;
  ownerEmail?: string;
  ownerName?: string;
  templateId?: string;
}) {
  const ws = await createWorkspace({
    agencyId: input.agencyId,
    name: input.name,
    plan: "growth",
    accessSource: "agency",
    isPlatformAgency: false,
    withDefaults: !input.templateId,
    settings: { businessName: input.name },
  });
  if (input.templateId) await applyTemplate(ws.id, input.templateId, { allowedAgencyId: input.agencyId });

  if (input.ownerEmail) {
    const email = normalizeEmail(input.ownerEmail);
    let user = await findUserByEmail(email);
    let isNew = false;
    if (!user) {
      user = await createUser({ email, name: input.ownerName ?? "", password: randomToken(24) });
      isNew = true;
    }
    const db = await getDb();
    await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: user.id, role: "owner" }).onConflictDoNothing();
    const link = isNew ? await passwordLinkFor(user.id, 24 * 7) : null;
    await queueEmail({
      workspaceId: ws.id,
      to: email,
      subject: `Your ${input.name} account is ready`,
      body: isNew
        ? `Hi ${input.ownerName || "there"},\n\n${input.agencyName} set up your account.\n\n[Set your password]({{link}})\n\nThe link works for 7 days.`
        : `Hi ${input.ownerName || "there"},\n\n${input.agencyName} added you to ${input.name}. Log in to get started.`,
      vars: { link: link ?? "" },
    });
  }
  return ws;
}

export async function setSubAccountStatus(agencyId: string, workspaceId: string, status: "active" | "paused") {
  const db = await getDb();
  await db
    .update(workspaces)
    .set({ status, pausedAt: status === "paused" ? new Date() : null, graceEndsAt: null })
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.agencyId, agencyId)));
}

export async function updateAgencySettings(agencyId: string, input: { brand: BrandSettings; appDomain: string | null; markupPercent: number }) {
  const db = await getDb();
  const domain = input.appDomain?.trim().toLowerCase() || null;
  if (domain && !/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw new Error("Enter a domain like app.youragency.com");
  await db
    .update(agencies)
    .set({ brand: input.brand, appDomain: domain, markupPercent: Math.max(0, Math.min(500, Math.round(input.markupPercent))) })
    .where(and(eq(agencies.id, agencyId), eq(agencies.isPlatform, false)));
}

export async function agencyForHost(host: string) {
  if (!host) return null;
  const db = await getDb();
  const [agency] = await db.select().from(agencies).where(eq(agencies.appDomain, host.split(":")[0])).limit(1);
  return agency ?? null;
}
