import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db";
import { agencies, agencyMembers, workspaceMembers, workspaces, type WorkspaceRole } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { requireUser, type SessionUser } from "./auth";

export async function getPlatformAgency(db?: DB) {
  const conn = db ?? (await getDb());
  const [existing] = await conn.select().from(agencies).where(eq(agencies.isPlatform, true)).limit(1);
  if (existing) return existing;
  await conn
    .insert(agencies)
    .values({ name: env.platformName, slug: "platform", isPlatform: true, plan: "platform", markupPercent: 0 })
    .onConflictDoNothing();
  const [row] = await conn.select().from(agencies).where(eq(agencies.isPlatform, true)).limit(1);
  return row;
}

export type Workspace = typeof workspaces.$inferSelect;
export type Agency = typeof agencies.$inferSelect;

const ROLE_RANK: Record<WorkspaceRole, number> = { user: 1, admin: 2, owner: 3 };

export async function listUserWorkspaces(userId: string) {
  const db = await getDb();
  const direct = await db
    .select({ workspace: workspaces, role: workspaceMembers.role, agency: agencies })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .innerJoin(agencies, eq(agencies.id, workspaces.agencyId))
    .where(eq(workspaceMembers.userId, userId));
  return direct;
}

export async function listUserAgencies(userId: string) {
  const db = await getDb();
  return db
    .select({ agency: agencies, role: agencyMembers.role })
    .from(agencyMembers)
    .innerJoin(agencies, eq(agencies.id, agencyMembers.agencyId))
    .where(and(eq(agencyMembers.userId, userId), eq(agencies.isPlatform, false)));
}

export type WorkspaceContext = {
  user: SessionUser;
  workspace: Workspace;
  agency: Agency;
  role: WorkspaceRole;
  effectiveStatus: "active" | "grace" | "paused";
};

async function loadWorkspaceContext(workspaceId: string): Promise<WorkspaceContext> {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ workspace: workspaces, agency: agencies })
    .from(workspaces)
    .innerJoin(agencies, eq(agencies.id, workspaces.agencyId))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!row) notFound();

  let role: WorkspaceRole | null = null;
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, user.id)))
    .limit(1);
  if (member) role = member.role;
  if (!role && !row.agency.isPlatform) {
    const [am] = await db
      .select({ role: agencyMembers.role })
      .from(agencyMembers)
      .where(and(eq(agencyMembers.agencyId, row.agency.id), eq(agencyMembers.userId, user.id)))
      .limit(1);
    if (am) role = "owner";
  }
  if (!role && user.isPlatformAdmin) role = "owner";
  if (!role) notFound();

  const effectiveStatus = row.agency.status === "paused" ? "paused" : row.workspace.status;
  return { user, workspace: row.workspace, agency: row.agency, role, effectiveStatus };
}

export const getWorkspaceContext = cache(loadWorkspaceContext);

export async function requireWorkspace(workspaceId: string, minRole: WorkspaceRole = "user", opts: { allowPaused?: boolean } = {}) {
  const ctx = await getWorkspaceContext(workspaceId);
  if (ROLE_RANK[ctx.role] < ROLE_RANK[minRole]) throw new Error("You don't have permission for this action.");
  if (ctx.effectiveStatus === "paused" && !opts.allowPaused) redirect(`/app/w/${workspaceId}/paused`);
  return ctx;
}

export async function requireAgency(agencyId: string) {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(agencyId)) notFound();
  const db = await getDb();
  const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId)).limit(1);
  if (!agency || agency.isPlatform) notFound();
  const [member] = await db
    .select({ role: agencyMembers.role })
    .from(agencyMembers)
    .where(and(eq(agencyMembers.agencyId, agencyId), eq(agencyMembers.userId, user.id)))
    .limit(1);
  if (!member && !user.isPlatformAdmin) notFound();
  return { user, agency, role: member?.role ?? "owner" };
}

export async function workspaceIdsForAgency(agencyId: string) {
  const db = await getDb();
  const rows = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.agencyId, agencyId));
  return rows.map((r) => r.id);
}

export async function workspacesByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const db = await getDb();
  return db.select().from(workspaces).where(inArray(workspaces.id, ids));
}
