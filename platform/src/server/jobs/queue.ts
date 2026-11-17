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
  | "agency_domain.check"
  | "member.skool_invite"
  | "unlock.webhook"
  | "booking.reminder";

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
  await kickJobs();
}

// In local/dev mode we process jobs right after the response is sent, so the app
// works without a separate worker.
let inlineTimer: ReturnType<typeof setTimeout> | null = null;
// On the live site the scheduler (/api/cron/tick) may only come round once a day. So whatever is
// due also runs as soon as the request that queued it has answered: a new lead's score, Meta
// event and emails don't sit until morning. The scheduler still covers delayed and retried jobs.
let afterQueuedAt = 0;
const AFTER_STALE_MS = 60_000;

export async function kickJobs() {
  if (process.env.VITEST) return;
  if (env.jobsInline) {
    if (inlineTimer) return;
    inlineTimer = setTimeout(async () => {
      inlineTimer = null;
      await runNow("inline");
    }, 250);
    return;
  }
  // One pending run per instance is enough: it takes everything that is due.
  if (Date.now() - afterQueuedAt < AFTER_STALE_MS) return;
  afterQueuedAt = Date.now();
  try {
    const { after } = await import("next/server");
    after(async () => {
      afterQueuedAt = 0;
      await runNow("after-response");
    });
  } catch {
    // Not inside a request (a script, say): nothing to hang it on. The scheduler picks it up.
    afterQueuedAt = 0;
  }
}

async function runNow(how: string) {
  try {
    const { runDueJobs } = await import("./runner");
    await runDueJobs();
  } catch (err) {
    console.error(`[jobs] ${how} run failed`, err);
  }
}
