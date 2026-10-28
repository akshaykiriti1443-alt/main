import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agencies, subscriptions, workspaces, type WalletOwner } from "@/lib/db/schema";
import { hmacHex, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { creditWallet, getOrCreateWallet } from "../wallet";

export const stripeConfigured = () => Boolean(env.stripeSecretKey);

async function stripe<T>(path: string, form: Record<string, string>): Promise<T> {
  if (!env.stripeSecretKey) throw new Error("Payments are not set up yet (STRIPE_SECRET_KEY).");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.stripeSecretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe: ${data.error?.message ?? res.statusText}`);
  return data;
}

export type CheckoutKind = "topup" | "growth" | "agency";

export async function createCheckout(input: {
  kind: CheckoutKind;
  ownerType: WalletOwner;
  ownerId: string;
  amountUsd?: number;
  email: string;
  returnPath: string;
}) {
  const meta = { kind: input.kind, owner_type: input.ownerType, owner_id: input.ownerId };
  const form: Record<string, string> = {
    success_url: `${env.appUrl}${input.returnPath}?checkout=success`,
    cancel_url: `${env.appUrl}${input.returnPath}?checkout=cancelled`,
    customer_email: input.email,
    "metadata[kind]": meta.kind,
    "metadata[owner_type]": meta.owner_type,
    "metadata[owner_id]": meta.owner_id,
  };
  if (input.kind === "topup") {
    const cents = Math.round((input.amountUsd ?? 0) * 100);
    if (cents < 500 || cents > 100_000) throw new Error("Top-ups must be between $5 and $1,000.");
    Object.assign(form, {
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(cents),
      "line_items[0][price_data][product_data][name]": "Wallet top-up",
    });
  } else {
    const price = input.kind === "growth" ? env.stripePriceGrowth : env.stripePriceAgency;
    if (!price) throw new Error(`Set STRIPE_PRICE_${input.kind.toUpperCase()} to sell this plan.`);
    Object.assign(form, {
      mode: "subscription",
      "line_items[0][quantity]": "1",
      "line_items[0][price]": price,
      "subscription_data[metadata][kind]": meta.kind,
      "subscription_data[metadata][owner_type]": meta.owner_type,
      "subscription_data[metadata][owner_id]": meta.owner_id,
    });
  }
  const session = await stripe<{ url: string }>("checkout/sessions", form);
  return session.url;
}

/** Stripe-Signature: t=timestamp,v1=hex(HMAC_SHA256(secret, `${t}.${payload}`)) */
export function verifyStripeSignature(payload: string, header: string | null, secret = env.stripeWebhookSecret, toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || sigs.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const expected = hmacHex(secret, `${t}.${payload}`);
  return sigs.some((s) => safeEqual(s, expected));
}

type StripeObject = {
  id: string;
  mode?: string;
  amount_total?: number;
  subscription?: string;
  customer?: string;
  status?: string;
  current_period_end?: number;
  items?: { data?: { current_period_end?: number }[] };
  metadata?: Record<string, string>;
};

async function applyPlan(ownerType: WalletOwner, ownerId: string, plan: "growth" | "agency", active: boolean) {
  const db = await getDb();
  if (ownerType === "workspace" && plan === "growth") {
    await db.update(workspaces).set({ plan: active ? "growth" : "starter" }).where(eq(workspaces.id, ownerId));
  }
  if (ownerType === "agency" && plan === "agency") {
    await db
      .update(agencies)
      .set(active ? { plan: "agency", status: "active" } : { status: "paused" })
      .where(and(eq(agencies.id, ownerId), eq(agencies.isPlatform, false)));
  }
}

export async function handleStripeEvent(event: { id: string; type: string; data: { object: StripeObject } }) {
  const obj = event.data.object;
  const meta = obj.metadata ?? {};
  const ownerType = meta.owner_type as WalletOwner | undefined;
  const ownerId = meta.owner_id;
  const db = await getDb();

  if (event.type === "checkout.session.completed" && ownerType && ownerId) {
    if (meta.kind === "topup" && obj.amount_total) {
      const wallet = await getOrCreateWallet(ownerType, ownerId);
      await creditWallet(wallet.id, obj.amount_total * 10_000, {
        type: "topup",
        description: "Wallet top-up",
        externalRef: `stripe:${obj.id}`,
        workspaceId: ownerType === "workspace" ? ownerId : null,
      });
    }
    if ((meta.kind === "growth" || meta.kind === "agency") && obj.subscription) {
      await db
        .insert(subscriptions)
        .values({ ownerType, ownerId, plan: meta.kind, externalId: obj.subscription, customerId: obj.customer ?? null, status: "active" })
        .onConflictDoUpdate({ target: subscriptions.externalId, set: { status: "active", updatedAt: new Date() } });
      await applyPlan(ownerType, ownerId, meta.kind, true);
    }
    return;
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.externalId, obj.id)).limit(1);
    if (!sub) return;
    const status = event.type === "customer.subscription.deleted" ? "canceled" : (obj.status ?? sub.status);
    const periodEnd = obj.current_period_end ?? obj.items?.data?.[0]?.current_period_end;
    await db
      .update(subscriptions)
      .set({ status, currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : sub.currentPeriodEnd, updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
    const active = status === "active" || status === "trialing" || status === "past_due";
    await applyPlan(sub.ownerType, sub.ownerId, sub.plan, active);
  }
}
