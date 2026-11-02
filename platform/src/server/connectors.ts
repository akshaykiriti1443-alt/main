import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
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
    .select({ id: apiTokens.id, name: apiTokens.name, lastUsedAt: apiTokens.lastUsedAt, createdAt: apiTokens.createdAt })
    .from(apiTokens)
    .where(and(eq(apiTokens.workspaceId, workspaceId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));
}

export async function revokeConnectorToken(workspaceId: string, id: string) {
  const db = await getDb();
  await db.update(apiTokens).set({ revokedAt: new Date() }).where(and(eq(apiTokens.id, id), eq(apiTokens.workspaceId, workspaceId)));
}

/** The workspace a connector token belongs to, or null when unknown or revoked. */
export async function resolveConnectorToken(token: string): Promise<{ workspaceId: string; tokenId: string } | null> {
  if (!token.startsWith(PREFIX) || token.length > 100) return null;
  const db = await getDb();
  const [row] = await db
    .select({ id: apiTokens.id, workspaceId: apiTokens.workspaceId })
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, sha256hex(token)), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (!row) return null;
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(apiTokens.id, row.id), or(isNull(apiTokens.lastUsedAt), lt(apiTokens.lastUsedAt, fiveMinAgo))));
  return { workspaceId: row.workspaceId, tokenId: row.id };
}
