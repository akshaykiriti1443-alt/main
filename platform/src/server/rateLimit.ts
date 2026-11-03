import { inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";

export type RateWindow = { seconds: number; max: number };

/**
 * Take one hit for this key. Allowed only when every window has room, and then it counts against
 * every window. A refused hit counts only against the window(s) that refused it (so hammering never
 * resets those), never against the others: five blocked clicks in a minute don't use up the day.
 * Fixed windows: simple and enough to stop loops.
 */
export async function takeRateLimit(key: string, windows: RateWindow[], at = new Date()): Promise<boolean> {
  const db = await getDb();
  const keyFor = (w: RateWindow) => `${key}:${w.seconds}`;
  const rows = await db
    .select()
    .from(rateLimits)
    .where(inArray(rateLimits.key, windows.map(keyFor)));
  const used = (w: RateWindow) => {
    const row = rows.find((r) => r.key === keyFor(w));
    if (!row || row.windowStart.getTime() <= at.getTime() - w.seconds * 1000) return 0;
    return row.count;
  };
  const refused = windows.filter((w) => used(w) >= w.max);
  let allowed = refused.length === 0;
  for (const w of refused.length ? refused : windows) {
    const cutoff = new Date(at.getTime() - w.seconds * 1000).toISOString();
    const now = at.toISOString();
    const expired = sql`${rateLimits.windowStart} <= ${cutoff}::timestamptz`;
    const [row] = await db
      .insert(rateLimits)
      .values({ key: keyFor(w), windowStart: at, count: 1 })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
          windowStart: sql`case when ${expired} then ${now}::timestamptz else ${rateLimits.windowStart} end`,
        },
      })
      .returning({ count: rateLimits.count });
    // Re-checked after counting, so two hits racing past the read can't both slip through.
    if ((row?.count ?? 0) > w.max) allowed = false;
  }
  return allowed;
}

/** One email to an address per minute, five a day: stops "send again" loops from mail-bombing anyone. */
export const EMAIL_SEND_LIMIT: RateWindow[] = [
  { seconds: 60, max: 1 },
  { seconds: 86_400, max: 5 },
];
