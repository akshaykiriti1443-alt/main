import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { apiTokens, sessions, users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { openState, sealState } from "@/lib/crypto";
import { env } from "@/lib/env";
import { grantWelcomeAccess, membershipFor, refreshOwnerAccess } from "./access";
import { EMAIL_SEND_LIMIT, takeRateLimit } from "./rateLimit";

// Access follows the email address, so a self-signup has to prove it owns that address before a
// membership (or the one-time welcome window) can turn its workspace on. Until then the workspace
// waits, paused with reason "verify". The link is signed and stateless, like the password links,
// and it only works for someone logged in to that account (see verifyEmail).

const VERIFY_HOURS = 72;

export async function emailVerifyLinkFor(userId: string) {
  const db = await getDb();
  const [u] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new Error("User not found");
  const token = sealState({ purpose: "verify", uid: u.id, email: u.email }, VERIFY_HOURS * 3600);
  return `${env.appUrl}/verify?token=${encodeURIComponent(token)}`;
}

/** Throws when this address had a confirm email less than a minute ago, or five today. */
export async function sendVerifyEmail(userId: string, brandName?: string) {
  const db = await getDb();
  const [u] = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return;
  if (!(await takeRateLimit(`verify-email:${u.id}`, EMAIL_SEND_LIMIT))) {
    throw new Error("We just sent you a link. Wait a minute and check spam, then try again (5 a day at most).");
  }
  const link = await emailVerifyLinkFor(userId);
  // Local dev and the e2e run send no real email: print the link so it can be opened.
  if (env.emailProvider === "console") console.info(`[email:console] verify link for ${u.email}: ${link}`);
  const { sendSystemEmail } = await import("./email/send");
  await sendSystemEmail({
    to: u.email,
    subject: "Confirm your email",
    body: `Hi ${u.name.split(" ")[0] || "there"},\n\n[Confirm your email](${link})\n\nYour account opens once you click it. This link works for ${VERIFY_HOURS} hours. If you didn't sign up, ignore this email.`,
    brandName,
  });
}

export async function isEmailVerified(userId: string) {
  const db = await getDb();
  const [u] = await db.select({ at: users.emailVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(u?.at);
}

export const VERIFY_EXPIRED = "That confirm link expired. Log in and press \"Send the link again\" for a fresh one.";

/** Who a confirm link is for, without using it. Null when it is expired or not a confirm link. */
export function readVerifyToken(token: string): { uid: string; email: string } | null {
  const data = openState<{ purpose?: string; uid?: string; email?: string }>(token);
  if (!data || data.purpose !== "verify" || !data.uid || !data.email) return null;
  return { uid: data.uid, email: data.email };
}

export type VerifyResult = { ok: true; userId: string; alreadyVerified: boolean } | { ok: false; error: string };

/**
 * Confirm the address from a link, then let access follow it: an active membership turns the
 * workspace on, otherwise the one-time welcome window does (if this email hasn't had it).
 * The clicker must be logged in as the account the link is for (userId): a link alone never
 * confirms, so whoever signed up with someone else's address can't have them (or their mail
 * scanner) confirm it, and an old link is never a password-free way in. The real owner of an
 * address someone else signed up with uses "Forgot password", which confirms it and replaces the
 * password. Every session the account had is signed out; the caller signs the clicker back in.
 */
export async function verifyEmail(token: string, opts: { userId: string; ip?: string | null }): Promise<VerifyResult> {
  const data = readVerifyToken(token);
  if (!data) return { ok: false, error: VERIFY_EXPIRED };
  if (data.uid !== opts.userId) return { ok: false, error: `This link is for ${data.email}. Log out, then log in with that email to confirm it.` };
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, data.uid)).limit(1);
  // The link is for one address: it stops working if the account's email changed.
  if (!u || u.email !== data.email) return { ok: false, error: "That confirm link no longer works. Log in and press \"Send the link again\" for a fresh one." };
  if (u.emailVerifiedAt) return { ok: true, userId: u.id, alreadyVerified: true };
  await markEmailVerified(u, opts);
  return { ok: true, userId: u.id, alreadyVerified: false };
}

/**
 * The address is proven (a confirm link, or a password reset link that reached the inbox).
 * Signs out every session and revokes connector URLs made before this point, then lets access
 * follow the email. A no-op for the access part when the user was already confirmed.
 */
export async function markEmailVerified(u: { id: string; email: string; name: string; emailVerifiedAt: Date | null }, opts: { ip?: string | null } = {}) {
  const db = await getDb();
  const now = new Date();
  await db.delete(sessions).where(eq(sessions.userId, u.id));
  if (u.emailVerifiedAt) return;
  const changed = await db
    .update(users)
    .set({ emailVerifiedAt: now })
    .where(and(eq(users.id, u.id), isNull(users.emailVerifiedAt)))
    .returning({ id: users.id });
  if (!changed.length) return;
  await db.update(apiTokens).set({ revokedAt: now }).where(and(eq(apiTokens.createdBy, u.id), isNull(apiTokens.revokedAt)));
  // Their member workspaces now wait on membership like any other ("access"), not on the email.
  const owned = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.role, "owner")))
    .where(and(eq(workspaceMembers.userId, u.id), eq(workspaces.pauseReason, "verify")));
  if (owned.length) {
    await db
      .update(workspaces)
      .set({ pauseReason: "access" })
      .where(inArray(workspaces.id, owned.map((w) => w.id)));
  }
  // Only for someone with a member account of their own: an invited teammate setting a password
  // mustn't use up the email's one-time welcome window before they ever start an account.
  const [ownsMember] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.role, "owner")))
    .where(and(eq(workspaceMembers.userId, u.id), eq(workspaces.accessSource, "member")))
    .limit(1);
  if (!ownsMember) return;
  if ((await membershipFor(u.email)).active) await refreshOwnerAccess(u.email);
  else await grantWelcomeAccess(u.email, u.name, { ip: opts.ip });
}
