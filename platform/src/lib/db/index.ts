import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { env } from "../env";
import * as schema from "./schema";

export type Schema = typeof schema;
export type DB = PgDatabase<PgQueryResultHKT, Schema>;

type Holder = { db?: DB; ready?: Promise<DB>; close?: () => Promise<void> };
const g = globalThis as unknown as { __onexDb?: Holder };
const holder: Holder = (g.__onexDb ??= {});

const migrationsFolder = () => path.join(process.cwd(), "drizzle");

async function connect(): Promise<DB> {
  if (env.databaseUrl) {
    // Production: real Postgres (Supabase, Neon, RDS...). Migrations run at deploy time
    // with `npm run db:migrate`, never on a request path.
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(env.databaseUrl, { max: Number(process.env.DB_POOL_MAX ?? 5), prepare: false });
    holder.close = async () => client.end();
    return drizzle(client, { schema }) as unknown as DB;
  }

  // Local / test: embedded Postgres (PGlite) in a folder or in memory.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = env.pgliteDir === "memory" ? undefined : path.resolve(env.pgliteDir);
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: migrationsFolder() });
  holder.close = async () => client.close();
  return db as unknown as DB;
}

export async function getDb(): Promise<DB> {
  if (holder.db) return holder.db;
  holder.ready ??= connect().then((db) => (holder.db = db));
  return holder.ready;
}

export async function closeDb() {
  await holder.close?.();
  holder.db = undefined;
  holder.ready = undefined;
  holder.close = undefined;
}

export { schema };
