// npx tsx scripts/local-accounts.ts [--reset <email> <password>]
// Local helper (never production): migrate the local database, list its accounts and, with
// `--reset <email> <password>`, set that account's password. Stop the dev server first.
async function main() {
  const { getDb, closeDb } = await import("../src/lib/db");
  const { users, workspaces } = await import("../src/lib/db/schema");
  const { hashPassword } = await import("../src/lib/crypto");
  const { eq } = await import("drizzle-orm");
  if (process.env.DATABASE_URL) throw new Error("Refusing to run against DATABASE_URL. This is for the local PGlite database only.");
  const db = await getDb();
  const i = process.argv.indexOf("--reset");
  if (i > 0) {
    const [email, password] = process.argv.slice(i + 1);
    if (!email || !password || password.length < 8) throw new Error("Usage: --reset <email> <password of 8+ chars>");
    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.email, email));
    console.log(`Password set for ${email}.`);
  }
  const u = await db.select({ email: users.email, admin: users.isPlatformAdmin }).from(users);
  const w = await db.select({ name: workspaces.name, plan: workspaces.plan, status: workspaces.status, source: workspaces.accessSource }).from(workspaces);
  console.log(JSON.stringify({ users: u, workspaces: w }, null, 1));
  await closeDb();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
