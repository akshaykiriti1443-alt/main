"use server";

import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isEmail, normalizeEmail } from "@/lib/util";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { checkCredentials, createSession, createUser, findUserByEmail, requestHost } from "@/server/auth";
import { FOREVER, membershipFor } from "@/server/access";
import { workspaces } from "@/lib/db/schema";
import { getPlatformAgency } from "@/server/tenancy";
import { createWorkspace } from "@/server/workspace";
import { passwordLinkFor, resetPassword } from "@/server/passwords";
import { sendSystemEmail } from "@/server/email/send";
import { agencyForHost } from "@/server/agency";

export type FormState = { error?: string; ok?: string; values?: Record<string, string> };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email");
  const password = String(fd.get("password") ?? "");
  const values = { email };
  if (!isEmail(email) || !password) return { error: "Enter your email and password.", values };
  const user = await checkCredentials(email, password);
  if (!user) return { error: "That email and password don't match.", values };
  await createSession(user.id);
  const next = str(fd, "next");
  redirect(next.startsWith("/app") ? next : "/app");
}

export async function signupAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const name = str(fd, "name");
  const email = normalizeEmail(str(fd, "email"));
  const password = String(fd.get("password") ?? "");
  const businessName = str(fd, "businessName") || `${name.split(" ")[0] || "My"}'s community`;
  // Echo back what they typed (never the password) so a fix doesn't mean retyping everything.
  const values = { name, email, businessName: str(fd, "businessName") };

  if (!name) return { error: "Enter your name.", values };
  if (!isEmail(email)) return { error: "Enter a valid email.", values };
  if (password.length < 8) return { error: "Use a password with at least 8 characters.", values };
  if (await findUserByEmail(email)) return { error: "You already have an account. Log in instead.", values };

  const db = await getDb();
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  const firstUser = count === 0;
  if (firstUser) {
    // The first account becomes the platform owner, so it needs the setup token.
    if (env.isProd && !env.setupToken) return { error: "Set SETUP_TOKEN on the server, then open /signup?setup=<token>.", values };
    if (env.setupToken && !safeEqual(str(fd, "setup"), env.setupToken)) {
      return { error: "Use the owner setup link (/signup?setup=<SETUP_TOKEN>) to create the first account.", values };
    }
  }

  // No codes: anyone can create a login. The app turns on while the email is an active member
  // (Skool or a direct purchase) and waits on the "unlock" screen until then.
  const membership = firstUser ? null : await membershipFor(email);
  const active = firstUser || Boolean(membership?.active);

  const user = await createUser({ email, name, password });
  if (firstUser) await db.update(users).set({ isPlatformAdmin: true }).where(sql`${users.id} = ${user.id}`);
  const agency = await getPlatformAgency();
  const ws = await createWorkspace({
    agencyId: agency.id,
    name: businessName,
    ownerUserId: user.id,
    accessSource: firstUser ? "admin" : "member",
    accessVerifiedUntil: membership?.active ? (membership.until ?? FOREVER) : null,
    isPlatformAgency: true,
    settings: { businessName },
  });
  if (!active) {
    await db.update(workspaces).set({ status: "paused", pausedAt: new Date(), pauseReason: "access" }).where(sql`${workspaces.id} = ${ws.id}`);
  }
  await createSession(user.id);
  redirect(active ? `/app/w/${ws.id}/launch` : `/app/w/${ws.id}/paused`);
}

export async function forgotAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email");
  if (!isEmail(email)) return { error: "Enter a valid email." };
  const user = await findUserByEmail(email);
  if (user) {
    const link = await passwordLinkFor(user.id, 2);
    const agency = await agencyForHost(await requestHost());
    await sendSystemEmail({
      to: user.email,
      subject: "Reset your password",
      body: `Hi ${user.name.split(" ")[0] || "there"},\n\n[Choose a new password](${link})\n\nThis link works for 2 hours. If you didn't ask for it, ignore this email.`,
      brandName: agency?.brand.name,
    }).catch((err) => console.error("[auth] reset email failed", err));
  }
  return { ok: "If that email has an account, a reset link is on its way." };
}

export async function resetAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const res = await resetPassword(str(fd, "token"), String(fd.get("password") ?? ""));
  if (!res.ok) return { error: res.error };
  await createSession(res.userId);
  redirect("/app");
}

/** /join: send the buyer to Stripe Checkout. Access is granted to this email when payment lands. */
export async function joinAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = normalizeEmail(str(fd, "email"));
  const name = str(fd, "name");
  const values = { email, name };
  if (!isEmail(email)) return { error: "Enter a valid email.", values };
  const { createMemberCheckout } = await import("@/server/billing/stripe");
  let url: string;
  try {
    url = await createMemberCheckout({ email, name });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Checkout isn't available right now.", values };
  }
  redirect(url);
}
