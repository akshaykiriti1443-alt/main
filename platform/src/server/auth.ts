import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { hashPassword, randomToken, sha256hex, verifyPassword } from "@/lib/crypto";
import { env } from "@/lib/env";
import { normalizeEmail } from "@/lib/util";

export const SESSION_COOKIE = "onex_session";
const SESSION_DAYS = 30;

export type SessionUser = { id: string; email: string; name: string; isPlatformAdmin: boolean };

export async function createSession(userId: string) {
  const db = await getDb();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: sha256hex(token), userId, expiresAt });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, sha256hex(token)));
  }
  store.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, isPlatformAdmin: users.isPlatformAdmin })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256hex(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isPlatformAdmin) redirect("/app");
  return user;
}

export async function findUserByEmail(email: string) {
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  return rows[0] ?? null;
}

export async function createUser(input: { email: string; name: string; password: string }) {
  const db = await getDb();
  const email = normalizeEmail(input.email);
  const [row] = await db
    .insert(users)
    .values({
      email,
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
    })
    .returning();
  return row;
}

export async function checkCredentials(email: string, password: string) {
  const user = await findUserByEmail(email);
  if (!user) {
    // Spend similar time to avoid leaking which emails exist.
    await verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAA");
    return null;
  }
  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}

export async function requestHost(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-host") ?? h.get("host") ?? "").toLowerCase();
}
