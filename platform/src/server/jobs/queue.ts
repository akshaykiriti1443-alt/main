import { getDb, type DB } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { env } from "@/lib/env";

export type JobType =
  | "email.send"
  | "email.sequence_step"
  | "campaign.send"
  | "meta.capi"
  | "automation.step"
  | "ai.score"
  | "ai.reply_draft"
  | "social.publish"
  | "inbox.webhook"
  | "domain.check"
  | "agency_domain.check";

export async function enqueue(
  type: JobType,
  payload: Record<string, unknown>,
  opts: { runAt?: Date; dedupeKey?: string; maxAttempts?: number; db?: DB } = {},
) {
  const db = opts.db ?? (await getDb());
  await db
    .insert(jobs)
    .values({
      type,
      payload,
      runAt: opts.runAt ?? new Date(),
      dedupeKey: opts.dedupeKey,
      maxAttempts: opts.maxAttempts ?? 5,
    })
    .onConflictDoNothing({ target: jobs.dedupeKey });
  kickJobs();
}

// In local/dev mode we process jobs right after the response is sent, so the app
// works without a separate worker. In production a cron hits /api/cron/tick.
let inlineTimer: ReturnType<typeof setTimeout> | null = null;
export function kickJobs() {
  if (!env.jobsInline || process.env.VITEST) return;
  if (inlineTimer) return;
  inlineTimer = setTimeout(async () => {
    inlineTimer = null;
    try {
      const { runDueJobs } = await import("./runner");
      await runDueJobs();
    } catch (err) {
      console.error("[jobs] inline run failed", err);
    }
  }, 250);
}
