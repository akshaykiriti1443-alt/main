import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, automations, contacts, unlocks, workspaces } from "@/lib/db/schema";
import type { WorkspaceSettings } from "@/lib/db/types";
import { addTag } from "./contacts";
import { logActivity } from "./activity";
import { ANSWERS_START, answersFrom } from "./skool";

// Skool's Pro plugins, the Hobby way. Skool locks Auto DM, Zapier, Webhook, Meta pixel and the
// onboarding/cancellation videos behind Pro. We never unlock them inside Skool (that would mean
// logging in as the member). Instead each one gets an equivalent that runs in this CRM, fed by
// the free things Skool does give every plan: the member export (with membership answers) and
// the group's own link.

export const WELCOMED_TAG = "skool-welcomed";
const QUEUE_DAYS = 21;

/** New members since recent syncs who haven't had a personal hello yet (Auto DM, by hand). */
export async function welcomeQueue(workspaceId: string, limit = 12) {
  const db = await getDb();
  const since = new Date(Date.now() - QUEUE_DAYS * 86_400_000);
  const rows = await db
    .select({ id: contacts.id, email: contacts.email, firstName: contacts.firstName, lastName: contacts.lastName, stage: contacts.stage, notes: contacts.notes, createdAt: contacts.createdAt })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        sql`'skool-member' = any(${contacts.tags})`,
        sql`not (${WELCOMED_TAG} = any(${contacts.tags}))`,
        inArray(contacts.stage, ["trial", "member"]),
        gte(contacts.createdAt, since),
      ),
    )
    .orderBy(desc(contacts.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, answers: answersFrom(r.notes) }));
}

export async function welcomeQueueCount(workspaceId: string) {
  const db = await getDb();
  const since = new Date(Date.now() - QUEUE_DAYS * 86_400_000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        sql`'skool-member' = any(${contacts.tags})`,
        sql`not (${WELCOMED_TAG} = any(${contacts.tags}))`,
        inArray(contacts.stage, ["trial", "member"]),
        gte(contacts.createdAt, since),
      ),
    );
  return row?.n ?? 0;
}

export async function markWelcomed(workspaceId: string, contactId: string) {
  const db = await getDb();
  const [mine] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId))).limit(1);
  if (!mine) return;
  await addTag(workspaceId, contactId, WELCOMED_TAG);
  await logActivity({ workspaceId, contactId, type: "skool_welcomed", data: {} });
}

/** What each Pro-plugin stand-in looks like right now, for the "Hobby way" panel. */
export async function hobbyStatus(workspaceId: string) {
  const db = await getDb();
  const n = sql<number>`count(*)::int`;
  const [[ws], [answers], [google], waiting, live, [myUnlocks]] = await Promise.all([
    db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1),
    db.select({ n }).from(contacts).where(and(eq(contacts.workspaceId, workspaceId), sql`position(${ANSWERS_START} in ${contacts.notes}) > 0`)),
    db
      .select({ n })
      .from(activities)
      .where(
        and(
          eq(activities.workspaceId, workspaceId),
          eq(activities.type, "skool_visit"),
          sql`lower(coalesce(${activities.data}->>'source', '')) similar to '(google|youtube|gclid)%'`,
        ),
      ),
    welcomeQueueCount(workspaceId),
    db.select({ trigger: automations.trigger, actions: automations.actions }).from(automations).where(and(eq(automations.workspaceId, workspaceId), eq(automations.active, true))),
    db.select({ n }).from(unlocks).where(eq(unlocks.workspaceId, workspaceId)),
  ]);
  const s: WorkspaceSettings = ws?.settings ?? {};
  const emails = (t: (x: (typeof live)[number]["trigger"]) => boolean) => live.some((a) => t(a.trigger) && a.actions.some((x) => x.type === "send_email"));
  return {
    answers: answers?.n ?? 0,
    welcomeWaiting: waiting,
    welcomeEmailOn: emails((t) => t.type === "stage_changed" && (t.value === "member" || t.value === "trial")),
    saveEmailOn: emails((t) => t.type === "tag_added" && t.value === "skool-cancelling"),
    onboardingVideo: Boolean(s.onboardingVideoUrl),
    cancelVideo: Boolean(s.cancelVideoUrl),
    pixel: Boolean(s.metaPixelId && s.metaCapiTokenEnc),
    googleClicks: google?.n ?? 0,
    invite: Boolean(s.skoolInviteEnc),
    unlocks: myUnlocks?.n ?? 0,
    settings: { onboardingVideoUrl: s.onboardingVideoUrl ?? "", cancelVideoUrl: s.cancelVideoUrl ?? "" },
  };
}

/** Merge fields for the videos: a whole line, so an email reads fine when no video is set. */
export function videoVars(s: Pick<WorkspaceSettings, "onboardingVideoUrl" | "cancelVideoUrl">): Record<string, string> {
  return {
    onboarding_video_url: s.onboardingVideoUrl ?? "",
    cancel_video_url: s.cancelVideoUrl ?? "",
    onboarding_video_line: s.onboardingVideoUrl ? `Start with this 2-minute welcome video: ${s.onboardingVideoUrl}` : "",
    cancel_video_line: s.cancelVideoUrl ? `Before you go, I made you a 1-minute video: ${s.cancelVideoUrl}` : "",
  };
}
