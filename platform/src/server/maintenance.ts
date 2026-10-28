import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobs, sessions, webhookEvents } from "@/lib/db/schema";
import { addDays } from "@/lib/util";
import { enforceAccess } from "./access";
import { runDueJobs } from "./jobs/runner";
import { billPhoneNumbers, smsConfigured } from "./sms";

let lastHousekeeping = 0;

export async function tick() {
  const access = await enforceAccess();
  const result = await runDueJobs();
  if (Date.now() - lastHousekeeping > 3_600_000) {
    lastHousekeeping = Date.now();
    const db = await getDb();
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    await db.delete(jobs).where(and(eq(jobs.status, "done"), lt(jobs.createdAt, addDays(new Date(), -14))));
    await db.delete(webhookEvents).where(lt(webhookEvents.createdAt, addDays(new Date(), -30)));
    if (smsConfigured()) await billPhoneNumbers();
  }
  return { access, jobs: result };
}
