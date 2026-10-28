import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword, openState, sealState, sha256hex } from "@/lib/crypto";
import { env } from "@/lib/env";

// Stateless, signed reset links. The token embeds a fingerprint of the current
// password hash, so it stops working once the password changes.

const fingerprint = (hash: string) => sha256hex(hash).slice(0, 16);

export async function passwordLinkFor(userId: string, ttlHours = 72) {
  const db = await getDb();
  const [u] = await db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new Error("User not found");
  const token = sealState({ uid: u.id, fp: fingerprint(u.passwordHash) }, ttlHours * 3600);
  return `${env.appUrl}/reset?token=${encodeURIComponent(token)}`;
}

export async function resetPassword(token: string, newPassword: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  if (newPassword.length < 8) return { ok: false, error: "Use at least 8 characters." };
  const data = openState<{ uid: string; fp: string }>(token);
  if (!data) return { ok: false, error: "This link expired. Ask for a new one." };
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, data.uid)).limit(1);
  if (!u || fingerprint(u.passwordHash) !== data.fp) return { ok: false, error: "This link was already used. Ask for a new one." };
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, u.id));
  return { ok: true, userId: u.id };
}
