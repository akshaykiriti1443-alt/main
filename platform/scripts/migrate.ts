// Apply database migrations. Run at deploy time (e.g. in the Vercel build command).
// With DATABASE_URL set this migrates Postgres; without it, the local PGlite folder.
import path from "node:path";

async function main() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  // On Vercel there is no local disk to keep data on, so a missing database must stop the deploy.
  if (process.env.VERCEL && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Connect a Neon database (Vercel › Project › Storage › Neon), then redeploy.");
  }
  if (process.env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
    await migrate(drizzle(client), { migrationsFolder });
    await client.end();
    console.log("Postgres migrated.");
  } else {
    const { getDb, closeDb } = await import("../src/lib/db");
    await getDb(); // PGlite migrates on connect
    await closeDb();
    console.log(`Local database migrated (${process.env.PGLITE_DIR ?? ".data/pglite"}).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
