import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agencies, agencyMembers, apiTokens, users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { randomToken, sha256hex } from "@/lib/crypto";
import { env } from "@/lib/env";

// Connector URLs: a private link the owner pastes into Claude (custom connector) or ChatGPT
// (developer-mode connector). The token in the URL is the credential, so we only keep its hash
// and show the full URL once. Each token is scoped to one workspace and can be revoked.

const PREFIX = "onx_";
export const connectorUrl = (token: string) => `${env.appUrl}/api/mcp/${token}`;

export async function createConnectorToken(workspaceId: string, userId: string | null, name: string) {
  const token = `${PREFIX}${randomToken(24)}`;
  const db = await getDb();
  await db.insert(apiTokens).values({ workspaceId, name: name.slice(0, 60) || "Connector", tokenHash: sha256hex(token), createdBy: userId });
  return { token, url: connectorUrl(token) };
}

export async function listConnectorTokens(workspaceId: string) {
  const db = await getDb();
  return db
    .select({ id: apiTokens.id, name: apiTokens.name, lastUsedAt: apiTokens.lastUsedAt, createdAt: apiTokens.createdAt, createdByName: users.name, createdByEmail: users.email })
    .from(apiTokens)
    .leftJoin(users, eq(users.id, apiTokens.createdBy))
    .where(and(eq(apiTokens.workspaceId, workspaceId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));
}

export async function revokeConnectorToken(workspaceId: string, id: string) {
  const db = await getDb();
  await db.update(apiTokens).set({ revokedAt: new Date() }).where(and(eq(apiTokens.id, id), eq(apiTokens.workspaceId, workspaceId)));
}

/** Revoke every connector URL this person made in a workspace (they were removed from it). */
export async function revokeConnectorTokensBy(workspaceId: string, userId: string) {
  const db = await getDb();
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.workspaceId, workspaceId), eq(apiTokens.createdBy, userId), isNull(apiTokens.revokedAt)));
}

/**
 * Can the person who made a token still create one (admin rights in the workspace)? A connector URL
 * is only as good as its creator's access: a removed or demoted teammate's URLs stop working.
 */
async function creatorStillAdmin(workspaceId: string, userId: string | null) {
  if (!userId) return false;
  const db = await getDb();
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  if (member) return member.role === "owner" || member.role === "admin";
  // Agency staff and platform admins reach a workspace without a member row (see tenancy).
  const [agencyStaff] = await db
    .select({ role: agencyMembers.role })
    .from(workspaces)
    .innerJoin(agencies, eq(agencies.id, workspaces.agencyId))
    .innerJoin(agencyMembers, eq(agencyMembers.agencyId, workspaces.agencyId))
    .where(and(eq(workspaces.id, workspaceId), eq(agencies.isPlatform, false), eq(agencyMembers.userId, userId)))
    .limit(1);
  if (agencyStaff) return true;
  const [u] = await db.select({ admin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(u?.admin);
}

/** The workspace a connector token belongs to, or null when unknown, revoked, or its creator lost admin rights. */
export async function resolveConnectorToken(token: string): Promise<{ workspaceId: string; tokenId: string } | null> {
  if (!token.startsWith(PREFIX) || token.length > 100) return null;
  const db = await getDb();
  const [row] = await db
    .select({ id: apiTokens.id, workspaceId: apiTokens.workspaceId, createdBy: apiTokens.createdBy })
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, sha256hex(token)), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (!row) return null;
  if (!(await creatorStillAdmin(row.workspaceId, row.createdBy))) return null;
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(apiTokens.id, row.id), or(isNull(apiTokens.lastUsedAt), lt(apiTokens.lastUsedAt, fiveMinAgo))));
  return { workspaceId: row.workspaceId, tokenId: row.id };
}
