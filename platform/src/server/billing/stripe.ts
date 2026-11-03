import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agencies, memberAccess, subscriptions, workspaces, type WalletOwner } from "@/lib/db/schema";
import { hmacHex, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { creditWallet, getOrCreateWallet } from "../wallet";
import { grantAccess, revokeAccess, STRIPE_BUFFER_DAYS } from "../access";
import { enqueue } from "../jobs/queue";
import { addDays, isEmail, normalizeEmail } from "@/lib/util";

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

export const memberCheckoutConfigured = () => Boolean(env.stripeSecretKey && env.stripePriceMember);

/** Direct app membership bought on /join. No account needed yet: access is keyed to the email. */
export async function createMemberCheckout(input: { email: string; name?: string }) {
  if (!env.stripePriceMember) throw new Error("Direct purchase isn't set up (STRIPE_PRICE_MEMBER).");
  const email = normalizeEmail(input.email);
  if (!isEmail(email)) throw new Error("Enter a valid email.");
  const back = `${env.appUrl}/signup?email=${encodeURIComponent(email)}`;
  const session = await stripe<{ url: string }>("checkout/sessions", {
    mode: "subscription",
    success_url: `${back}&paid=1`,
    cancel_url: `${env.appUrl}/join?checkout=cancelled`,
    customer_email: email,
    "line_items[0][quantity]": "1",
    "line_items[0][price]": env.stripePriceMember,
    "metadata[kind]": "member",
    "metadata[member_email]": email,
    "metadata[member_name]": (input.name ?? "").slice(0, 120),
    "subscription_data[metadata][kind]": "member",
    "subscription_data[metadata][member_email]": email,
  });
  return session.url;
}

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
  payment_status?: "paid" | "unpaid" | "no_payment_required";
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

/**
 * Stripe doesn't guarantee event order and retries failures for days, so a member grant must never
 * undo something newer. The stripe row remembers the time of the last event applied to it.
 */
async function staleMemberEvent(email: string, ref: string, eventAt: number, isCheckout: boolean) {
  const db = await getDb();
  const [row] = await db
    .select({ status: memberAccess.status, ref: memberAccess.ref, payload: memberAccess.payload })
    .from(memberAccess)
    .where(and(eq(memberAccess.email, normalizeEmail(email)), eq(memberAccess.channel, "stripe")))
    .limit(1);
  if (!row) return false;
  const lastAt = Number(row.payload?.stripeEventAt ?? 0);
  if (eventAt && lastAt && eventAt < lastAt) return true;
  // Only the subscription access currently follows may change it: a late event from an older
  // subscription (the buyer bought again on /join) never revokes or rewrites the newer one.
  if (!isCheckout && row.status === "active" && row.ref && row.ref !== ref) return true;
  // A retried checkout for a subscription that has since ended must not turn it back on.
  return isCheckout && row.status === "removed" && row.ref === ref;
}

export async function handleStripeEvent(event: { id: string; type: string; created?: number; data: { object: StripeObject } }) {
  const obj = event.data.object;
  const meta = obj.metadata ?? {};
  const ownerType = meta.owner_type as WalletOwner | undefined;
  const ownerId = meta.owner_id;
  const db = await getDb();

  const isCheckout = event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded";

  // Direct app membership: access follows the subscription, keyed to the buyer's email.
  if (meta.kind === "member") {
    const email = meta.member_email;
    if (!email || !isEmail(email)) return;
    const eventAt = event.created ?? 0;
    const stamp = { stripeEventAt: eventAt };
    if (isCheckout) {
      if (obj.payment_status === "unpaid") return;
      const ref = obj.subscription ?? obj.id;
      if (await staleMemberEvent(email, ref, eventAt, true)) return;
      await grantAccess({ email, name: meta.member_name, channel: "stripe", until: addDays(new Date(), 35), ref, payload: stamp });
      if (env.skoolInviteWebhookUrl) {
        await enqueue("member.skool_invite", { email, name: meta.member_name ?? "" }, { dedupeKey: `skool-invite:${email}` });
      }
      return;
    }
    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const status = event.type === "customer.subscription.deleted" ? "canceled" : (obj.status ?? "");
      const periodEnd = obj.current_period_end ?? obj.items?.data?.[0]?.current_period_end;
      if (await staleMemberEvent(email, obj.id, eventAt, false)) return;
      if (status === "active" || status === "trialing" || status === "past_due") {
        const until = addDays(periodEnd ? new Date(periodEnd * 1000) : new Date(), STRIPE_BUFFER_DAYS);
        await grantAccess({ email, channel: "stripe", until, ref: obj.id, payload: stamp });
      } else {
        await revokeAccess(email, "stripe", `stripe:${status}`, stamp);
      }
    }
    return;
  }
  if (isCheckout && ownerType && ownerId) {
    // Delayed payment methods complete checkout before the money arrives; wait for
    // checkout.session.async_payment_succeeded in that case.
    const paid = obj.payment_status !== "unpaid";
    if (meta.kind === "topup" && obj.amount_total && paid) {
      const wallet = await getOrCreateWallet(ownerType, ownerId);
      await creditWallet(wallet.id, obj.amount_total * 10_000, {
        type: "topup",
        description: "Wallet top-up",
        externalRef: `stripe:${obj.id}`,
        workspaceId: ownerType === "workspace" ? ownerId : null,
      });
    }
    if ((meta.kind === "growth" || meta.kind === "agency") && obj.subscription) {
      const status = paid ? "active" : "incomplete";
      await db
        .insert(subscriptions)
        .values({ ownerType, ownerId, plan: meta.kind, externalId: obj.subscription, customerId: obj.customer ?? null, status })
        .onConflictDoUpdate({ target: subscriptions.externalId, set: { status, updatedAt: new Date() } });
      if (paid) await applyPlan(ownerType, ownerId, meta.kind, true);
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
