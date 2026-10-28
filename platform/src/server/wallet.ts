import { and, eq, sql } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db";
import { agencies, usageCounters, wallets, walletTransactions, workspaces, type WalletOwner } from "@/lib/db/schema";
import { monthKey } from "@/lib/util";
import { PLANS } from "./plans";
import { UNIT_PRICES, type UsageUnit } from "./pricing";

export class InsufficientBalanceError extends Error {
  constructor(public neededMicros: number) {
    super("Your wallet balance is too low for this action. Add funds in Wallet & Billing.");
  }
}

export async function getOrCreateWallet(ownerType: WalletOwner, ownerId: string, db?: DB) {
  const conn = db ?? (await getDb());
  await conn.insert(wallets).values({ ownerType, ownerId }).onConflictDoNothing();
  const [w] = await conn
    .select()
    .from(wallets)
    .where(and(eq(wallets.ownerType, ownerType), eq(wallets.ownerId, ownerId)))
    .limit(1);
  return w;
}

// Sub-accounts of a reseller agency spend from the agency's wallet; everyone else
// spends from their own workspace wallet.
export async function billingWalletFor(workspaceId: string, db?: DB) {
  const conn = db ?? (await getDb());
  const [row] = await conn
    .select({ agencyId: workspaces.agencyId, plan: workspaces.plan, isPlatform: agencies.isPlatform })
    .from(workspaces)
    .innerJoin(agencies, eq(agencies.id, workspaces.agencyId))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!row) throw new Error("Workspace not found");
  const wallet = row.isPlatform
    ? await getOrCreateWallet("workspace", workspaceId, conn)
    : await getOrCreateWallet("agency", row.agencyId, conn);
  return { wallet, plan: row.plan };
}

export async function creditWallet(
  walletId: string,
  amountMicros: number,
  input: { type: "topup" | "adjustment" | "refund"; description: string; externalRef?: string; workspaceId?: string | null },
) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    if (input.externalRef) {
      const existing = await tx
        .select({ id: walletTransactions.id })
        .from(walletTransactions)
        .where(eq(walletTransactions.externalRef, input.externalRef))
        .limit(1);
      if (existing.length) return false; // already applied (idempotent webhooks)
    }
    await tx
      .update(wallets)
      .set({ balanceMicros: sql`${wallets.balanceMicros} + ${amountMicros}`, updatedAt: new Date() })
      .where(eq(wallets.id, walletId));
    await tx.insert(walletTransactions).values({
      walletId,
      workspaceId: input.workspaceId ?? null,
      type: input.type,
      amountMicros,
      description: input.description,
      externalRef: input.externalRef,
    });
    return true;
  });
}

/**
 * Record usage. Units inside the plan's monthly allowance are free; the rest are
 * debited from the billing wallet. Throws InsufficientBalanceError (and records
 * nothing) when the wallet cannot cover the overage.
 */
export async function chargeUsage(
  workspaceId: string,
  unit: UsageUnit,
  quantity = 1,
  opts: { description?: string; costMicros?: number } = {},
): Promise<{ billedMicros: number; included: boolean }> {
  const db = await getDb();
  const period = monthKey();
  return db.transaction(async (tx) => {
    const { wallet, plan } = await billingWalletFor(workspaceId, tx);
    const included = PLANS[plan].included[unit] ?? 0;

    await tx
      .insert(usageCounters)
      .values({ workspaceId, unit, period, used: 0 })
      .onConflictDoNothing();
    const [counter] = await tx
      .update(usageCounters)
      .set({ used: sql`${usageCounters.used} + ${quantity}` })
      .where(and(eq(usageCounters.workspaceId, workspaceId), eq(usageCounters.unit, unit), eq(usageCounters.period, period)))
      .returning({ used: usageCounters.used });

    const usedAfter = counter.used;
    const usedBefore = usedAfter - quantity;
    const billable = Math.max(0, usedAfter - included) - Math.max(0, usedBefore - included);
    if (billable <= 0) return { billedMicros: 0, included: true };

    const price = UNIT_PRICES[unit];
    const amount = billable * price.priceMicros;
    const debited = await tx
      .update(wallets)
      .set({ balanceMicros: sql`${wallets.balanceMicros} - ${amount}`, updatedAt: new Date() })
      .where(and(eq(wallets.id, wallet.id), sql`${wallets.balanceMicros} >= ${amount}`))
      .returning({ id: wallets.id });
    if (debited.length === 0) throw new InsufficientBalanceError(amount);

    await tx.insert(walletTransactions).values({
      walletId: wallet.id,
      workspaceId,
      type: "usage",
      unit,
      quantity: billable,
      amountMicros: -amount,
      costMicros: opts.costMicros ?? billable * price.costMicros,
      description: opts.description ?? price.label,
    });
    return { billedMicros: amount, included: false };
  });
}

/**
 * Undo a chargeUsage() when the paid work failed: gives back the allowance and,
 * if money was taken, credits it back to the same wallet.
 */
export async function refundUsage(workspaceId: string, unit: UsageUnit, quantity: number, billedMicros: number, description = "Refund") {
  const db = await getDb();
  await db
    .update(usageCounters)
    .set({ used: sql`greatest(0, ${usageCounters.used} - ${quantity})` })
    .where(and(eq(usageCounters.workspaceId, workspaceId), eq(usageCounters.unit, unit), eq(usageCounters.period, monthKey())));
  if (billedMicros > 0) {
    const { wallet } = await billingWalletFor(workspaceId, db);
    await creditWallet(wallet.id, billedMicros, { type: "refund", description, workspaceId });
  }
}

/** True when the action fits the monthly allowance or the wallet can pay for it. */
export async function canAfford(workspaceId: string, unit: UsageUnit, quantity = 1): Promise<boolean> {
  const db = await getDb();
  const { wallet, plan } = await billingWalletFor(workspaceId, db);
  const included = PLANS[plan].included[unit] ?? 0;
  const [counter] = await db
    .select({ used: usageCounters.used })
    .from(usageCounters)
    .where(and(eq(usageCounters.workspaceId, workspaceId), eq(usageCounters.unit, unit), eq(usageCounters.period, monthKey())))
    .limit(1);
  const used = counter?.used ?? 0;
  const billable = Math.max(0, used + quantity - included) - Math.max(0, used - included);
  return billable === 0 || wallet.balanceMicros >= billable * UNIT_PRICES[unit].priceMicros;
}

export async function usageThisMonth(workspaceId: string) {
  const db = await getDb();
  const rows = await db
    .select({ unit: usageCounters.unit, used: usageCounters.used })
    .from(usageCounters)
    .where(and(eq(usageCounters.workspaceId, workspaceId), eq(usageCounters.period, monthKey())));
  return Object.fromEntries(rows.map((r) => [r.unit, r.used])) as Record<string, number>;
}
