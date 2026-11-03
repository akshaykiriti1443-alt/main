"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isEmail, normalizeEmail } from "@/lib/util";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { checkCredentials, createSession, createUser, findUserByEmail, getCurrentUser, requestHost } from "@/server/auth";
import { sendVerifyEmail, verifyEmail } from "@/server/emailVerify";
import { clientIp } from "@/lib/ip";
import { workspaceMembers, workspaces } from "@/lib/db/schema";
import { grantWelcomeAccess, membershipFor, refreshOwnerAccess } from "@/server/access";
import { getPlatformAgency } from "@/server/tenancy";
import { createWorkspace } from "@/server/workspace";
import { passwordLinkFor, resetPassword } from "@/server/passwords";
import { sendSystemEmail } from "@/server/email/send";
import { agencyForHost } from "@/server/agency";
import { EMAIL_SEND_LIMIT, takeRateLimit } from "@/server/rateLimit";

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
  // Back to where they were going: an app page, or the confirm link that sent them here.
  redirect(next.startsWith("/app") || next.startsWith("/verify?") ? next : "/app");
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
  const db = await getDb();
  const existing = await findUserByEmail(email);
  if (existing) {
    // A login can exist without a community account of its own (a team invite, an agency client).
    // Whoever proves its password can add their own member account, so an invite never blocks it.
    const agency = await getPlatformAgency();
    const [ownsMember] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.role, "owner")))
      .where(and(eq(workspaceMembers.userId, existing.id), eq(workspaces.accessSource, "member")))
      .limit(1);
    if (ownsMember) return { error: "You already have an account. Log in instead.", values };
    const user = await checkCredentials(email, password);
    if (!user) {
      return { error: "This email already has a login (maybe from a team invite). Enter its password to add your own account, or reset it with \"Forgot password\" on the login page.", values };
    }
    const ws = await createWorkspace({ agencyId: agency.id, name: businessName, ownerUserId: user.id, accessSource: "member", accessVerifiedUntil: null, isPlatformAgency: true, settings: { businessName } });
    if (!user.emailVerifiedAt) {
      await db.update(workspaces).set({ status: "paused", pausedAt: new Date(), pauseReason: "verify" }).where(eq(workspaces.id, ws.id));
      const brand = await agencyForHost(await requestHost());
      await sendVerifyEmail(user.id, brand?.brand.name).catch((err) => console.error("[auth] verify email failed", err));
    } else {
      // Already proven: access follows the email straight away, like after the confirm link.
      await db.update(workspaces).set({ status: "paused", pausedAt: new Date(), pauseReason: "access" }).where(eq(workspaces.id, ws.id));
      if ((await membershipFor(email)).active) await refreshOwnerAccess(email);
      else await grantWelcomeAccess(email, user.name, { ip: clientIp(await headers()) });
    }
    await createSession(user.id);
    redirect(`/app/w/${ws.id}`);
  }


  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  const firstUser = count === 0;
  if (firstUser) {
    // The first account becomes the platform owner, so it needs the setup token.
    if (env.isProd && !env.setupToken) return { error: "Set SETUP_TOKEN on the server, then open /signup?setup=<token>.", values };
    if (env.setupToken && !safeEqual(str(fd, "setup"), env.setupToken)) {
      return { error: "Use the owner setup link (/signup?setup=<SETUP_TOKEN>) to create the first account.", values };
    }
  }

  // No codes: anyone can create a login. Access follows the email address, so nothing turns on until
  // they click the link we email them (that proves the address is theirs). Then the app turns on while
  // the email is an active member (Skool or a direct purchase), or for the one-time welcome window.
  const user = await createUser({ email, name, password, emailVerified: firstUser });
  if (firstUser) await db.update(users).set({ isPlatformAdmin: true }).where(sql`${users.id} = ${user.id}`);
  const agency = await getPlatformAgency();
  const ws = await createWorkspace({
    agencyId: agency.id,
    name: businessName,
    ownerUserId: user.id,
    accessSource: firstUser ? "admin" : "member",
    accessVerifiedUntil: null,
    isPlatformAgency: true,
    settings: { businessName },
  });
  if (!firstUser) {
    await db.update(workspaces).set({ status: "paused", pausedAt: new Date(), pauseReason: "verify" }).where(sql`${workspaces.id} = ${ws.id}`);
    const brand = await agencyForHost(await requestHost());
    await sendVerifyEmail(user.id, brand?.brand.name).catch((err) => console.error("[auth] verify email failed", err));
  }
  await createSession(user.id);
  redirect(firstUser ? `/app/w/${ws.id}/launch` : `/app/w/${ws.id}/paused`);
}

export async function forgotAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email");
  if (!isEmail(email)) return { error: "Enter a valid email." };
  const user = await findUserByEmail(email);
  // One reset email a minute and five a day per address, so this form can't mail-bomb anyone.
  // The reply is the same either way, so it never says whether an account exists.
  if (user && (await takeRateLimit(`reset-email:${user.id}`, EMAIL_SEND_LIMIT))) {
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
  const res = await resetPassword(str(fd, "token"), String(fd.get("password") ?? ""), { ip: clientIp(await headers()) });
  if (!res.ok) return { error: res.error };
  await createSession(res.userId);
  redirect("/app");
}

/** /verify: the "Confirm my email" button. Only works for the account the link is for, logged in. */
export async function verifyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Log in first, then press Confirm." };
  const res = await verifyEmail(str(fd, "token"), { userId: user.id, ip: clientIp(await headers()) });
  if (!res.ok) return { error: res.error };
  // Confirming signs out every session (someone may have signed up with this email first), so sign
  // the clicker back in. They proved the password by being logged in.
  if (!res.alreadyVerified) await createSession(res.userId);
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
