import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import type { JobType } from "./queue";

type Handler = (payload: Record<string, unknown>) => Promise<void>;

// Lazy imports keep this registry free of import cycles.
const handlers: Record<JobType, Handler> = {
  "email.send": async (p) => (await import("../email/send")).processEmailSend(p.emailMessageId as string),
  "email.sequence_step": async (p) => (await import("../email/sequences")).processSequenceStep(p.enrollmentId as string),
  "campaign.send": async (p) => (await import("../email/campaigns")).processCampaignSend(p.campaignId as string),
  "meta.capi": async (p) => (await import("../meta/capi")).processCapiJob(p),
  "automation.step": async (p) => (await import("../automations")).processAutomationStep(p.runId as string),
  "ai.score": async (p) => (await import("../ai/scoring")).scoreContactJob(p.contactId as string),
  "ai.reply_draft": async (p) => (await import("../ai/replies")).draftReplyJob(p.conversationId as string),
  "social.publish": async (p) => (await import("../social")).publishPostJob(p.postId as string),
  "inbox.webhook": async (p) => (await import("../meta/webhooks")).processWebhookEvent(p.webhookEventId as string),
  "domain.check": async (p) => (await import("../domains")).checkDomainJob(p.siteId as string),
  "agency_domain.check": async (p) => (await import("../domains")).checkAgencyDomainJob(p.agencyId as string, Number(p.startedAt) || Date.now()),
};

export class PermanentJobError extends Error {}

let running = false;

export async function runDueJobs(limit = 25): Promise<{ processed: number; failed: number }> {
  if (running) return { processed: 0, failed: 0 };
  running = true;
  let processed = 0;
  let failed = 0;
  try {
    const db = await getDb();
    for (let round = 0; round < 10; round++) {
      const claimed = (await db.execute(sql`
        update ${jobs} set status = 'running', locked_at = now(), attempts = attempts + 1
        where id in (
          select id from ${jobs}
          where (status = 'pending' and run_at <= now())
             or (status = 'running' and locked_at < now() - interval '10 minutes')
          order by run_at
          limit ${limit}
          for update skip locked
        )
        returning id, type, payload, attempts, max_attempts
      `)) as unknown as { rows?: JobRow[] } | JobRow[];
      const rows: JobRow[] = Array.isArray(claimed) ? claimed : (claimed.rows ?? []);
      if (rows.length === 0) break;
      for (const job of rows) {
        const handler = handlers[job.type as JobType];
        try {
          if (!handler) throw new PermanentJobError(`No handler for ${job.type}`);
          await handler(job.payload ?? {});
          await db.execute(sql`update ${jobs} set status = 'done', locked_at = null, last_error = null where id = ${job.id}`);
          processed++;
        } catch (err) {
          failed++;
          const message = err instanceof Error ? err.message : String(err);
          const permanent = err instanceof PermanentJobError || job.attempts >= job.max_attempts;
          const backoffMinutes = Math.min(60, 2 ** job.attempts);
          await db.execute(sql`
            update ${jobs}
            set status = ${permanent ? "failed" : "pending"},
                locked_at = null,
                last_error = ${message.slice(0, 2000)},
                run_at = now() + (${backoffMinutes} * interval '1 minute')
            where id = ${job.id}
          `);
          console.error(`[jobs] ${job.type} failed (attempt ${job.attempts})`, message);
        }
      }
    }
  } finally {
    running = false;
  }
  return { processed, failed };
}

type JobRow = { id: string; type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number };
