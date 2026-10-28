import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = await getDb();
  await db.execute(sql`select 1`);
  return NextResponse.json({ ok: true });
}
