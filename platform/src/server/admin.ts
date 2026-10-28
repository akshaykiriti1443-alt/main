import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agencies, jobs, subscriptions, users, walletTransactions, webhookEvents, workspaces } from "@/lib/db/schema";
import { creditWallet, getOrCreateWallet } from "./wallet";

export async function platformStats() {
  const db = await getDb();
  const [row] = await db.select({
    users: sql<number>`(select count(*)::int from ${users})`,
    workspaces: sql<number>`(select count(*)::int from ${workspaces})`,
    active: sql<number>`(select count(*)::int from ${workspaces} where ${workspaces.status} = 'active')`,
    grace: sql<number>`(select count(*)::int from ${workspaces} where ${workspaces.status} = 'grace')`,
    paused: sql<number>`(select count(*)::int from ${workspaces} where ${workspaces.status} = 'paused')`,
    growth: sql<number>`(select count(*)::int from ${workspaces} where ${workspaces.plan} = 'growth')`,
    agencies: sql<number>`(select count(*)::int from ${agencies} where ${agencies.plan} = 'agency')`,
    activeSubs: sql<number>`(select count(*)::int from ${subscriptions} where ${subscriptions.status} in ('active','trialing'))`,
    usageRevenue30d: sql<number>`(select coalesce(-sum(${walletTransactions.amountMicros}), 0)::bigint from ${walletTransactions} where ${walletTransactions.type} = 'usage' and ${walletTransactions.createdAt} > now() - interval '30 days')`,
    usageCost30d: sql<number>`(select coalesce(sum(${walletTransactions.costMicros}), 0)::bigint from ${walletTransactions} where ${walletTransactions.type} = 'usage' and ${walletTransactions.createdAt} > now() - interval '30 days')`,
    failedJobs: sql<number>`(select count(*)::int from ${jobs} where ${jobs.status} = 'failed')`,
    pendingJobs: sql<number>`(select count(*)::int from ${jobs} where ${jobs.status} = 'pending')`,
  }).from(sql`(select 1) as one`);
  return {
    ...row,
    usageRevenue30d: Number(row.usageRevenue30d),
    usageCost30d: Number(row.usageCost30d),
  };
}

export async function listAllWorkspaces(limit = 200) {
  const db = await getDb();
  return db
    .select({
      workspace: workspaces,
      agencyName: agencies.name,
      isPlatformAgency: agencies.isPlatform,
      owner: sql<string | null>`(select u.email from workspace_members wm join users u on u.id = wm.user_id where wm.workspace_id = "workspaces"."id" and wm.role = 'owner' limit 1)`,
      balance: sql<number | null>`(select w.balance_micros from wallets w where w.owner_type = 'workspace' and w.owner_id = "workspaces"."id")`,
    })
    .from(workspaces)
    .innerJoin(agencies, eq(agencies.id, workspaces.agencyId))
    .orderBy(desc(workspaces.createdAt))
    .limit(limit);
}

export async function listAllAgencies() {
  const db = await getDb();
  return db
    .select({
      agency: agencies,
      workspaces: sql<number>`(select count(*)::int from workspaces ws where ws.agency_id = "agencies"."id")`,
      balance: sql<number | null>`(select w.balance_micros from wallets w where w.owner_type = 'agency' and w.owner_id = "agencies"."id")`,
    })
    .from(agencies)
    .where(eq(agencies.isPlatform, false))
    .orderBy(desc(agencies.createdAt));
}

export async function adminSetWorkspace(workspaceId: string, patch: { plan?: "starter" | "growth"; status?: "active" | "grace" | "paused"; accessSource?: "admin" }) {
  const db = await getDb();
  await db
    .update(workspaces)
    .set({
      ...patch,
      ...(patch.status === "active" ? { graceEndsAt: null, pausedAt: null } : {}),
      ...(patch.status === "paused" ? { pausedAt: new Date() } : {}),
    })
    .where(eq(workspaces.id, workspaceId));
}

export async function adminSetAgency(agencyId: string, patch: { plan?: "none" | "agency"; status?: "active" | "paused" }) {
  const db = await getDb();
  await db.update(agencies).set(patch).where(eq(agencies.id, agencyId));
}

export async function adminAdjustWallet(ownerType: "workspace" | "agency", ownerId: string, amountUsd: number, note: string) {
  const wallet = await getOrCreateWallet(ownerType, ownerId);
  await creditWallet(wallet.id, Math.round(amountUsd * 1_000_000), {
    type: "adjustment",
    description: note || "Manual adjustment",
    workspaceId: ownerType === "workspace" ? ownerId : null,
  });
}

export async function recentJobs(status: "failed" | "pending" | "done" = "failed") {
  const db = await getDb();
  return db.select().from(jobs).where(eq(jobs.status, status)).orderBy(desc(jobs.createdAt)).limit(50);
}

export async function retryJob(jobId: string) {
  const db = await getDb();
  await db.update(jobs).set({ status: "pending", runAt: new Date(), attempts: 0, lastError: null }).where(eq(jobs.id, jobId));
}

export async function recentWebhooks() {
  const db = await getDb();
  return db.select().from(webhookEvents).orderBy(desc(webhookEvents.createdAt)).limit(30);
}
