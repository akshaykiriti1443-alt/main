import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, platformSettings, unlockClaims, unlocks, workspaces, type UnlockAction } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { isPublicHttpsUrl, safeUrl } from "@/lib/html";
import { isEmail, normalizeEmail, shortId, slugify } from "@/lib/util";
import { addTag, upsertContact } from "./contacts";
import { logActivity } from "./activity";
import { enqueue } from "./jobs/queue";

// Unlocks: "post or comment in my Skool community, get this free thing". Engagement is what Skool's
// Discovery ranks on, so rewarding it helps the community climb. How a claim works:
//   1. The member posts or comments in Skool where the unlock says.
//   2. They paste the link to their post on the claim page (/u/<slug>) with their email.
//   3. We check the link points into this community, then deliver the reward at once (page + email),
//      tag them "engaged" (automations can react) and, optionally, ping Zapier to unlock a Skool course.
// We never read Skool (no scraping, no logins). Links are trusted, and suspicious claims are flagged
// for the owner to spot-check.

export type Unlock = typeof unlocks.$inferSelect;
export const ENGAGED_TAG = "engaged";
export const claimUrlFor = (slug: string) => `${env.appUrl}/u/${slug}`;

/** The community's Skool group slug ("fit-dads" from https://www.skool.com/fit-dads/about), if known. */
export function skoolGroupOf(url: string | undefined | null): string | null {
  const u = safeUrl(url ?? "");
  if (!u) return null;
  const parsed = new URL(u);
  if (!/(^|\.)skool\.com$/i.test(parsed.hostname)) return null;
  return parsed.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? null;
}

/** Is this a link to a post (or comment) inside the given Skool group? */
export function checkPostLink(postUrl: string, group: string | null): { ok: true; url: string } | { ok: false; error: string } {
  const u = safeUrl(postUrl);
  if (!u) return { ok: false, error: "Paste the full link to your post (it starts with https://www.skool.com/)." };
  const parsed = new URL(u);
  if (!/(^|\.)skool\.com$/i.test(parsed.hostname)) return { ok: false, error: "That isn't a Skool link. Open your post in Skool and copy its link." };
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || ["about", "classroom", "calendar", "members", "map", "leaderboards", "-"].includes(parts[1].toLowerCase())) {
    return { ok: false, error: "Paste the link to your post or comment, not to the community page." };
  }
  if (group && parts[0].toLowerCase() !== group) return { ok: false, error: "That post is in a different Skool community." };
  parsed.hash = "";
  return { ok: true, url: parsed.toString() };
}

async function communityGroup(workspaceId: string) {
  const db = await getDb();
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return skoolGroupOf(ws?.settings.skoolUrl);
}

export async function createUnlock(
  workspaceId: string,
  input: { title: string; reward: string; rewardUrl: string; action: UnlockAction; instructions: string; skoolPostUrl: string; zapierWebhookUrl: string },
) {
  const title = input.title.trim().slice(0, 80);
  if (!title) throw new Error("Give your unlock a name.");
  const rewardUrl = input.rewardUrl.trim() ? safeUrl(input.rewardUrl) : "";
  if (input.rewardUrl.trim() && !rewardUrl) throw new Error("The reward link must start with https://.");
  if (!input.reward.trim() && !rewardUrl) throw new Error("Say what they get, or add the reward link.");
  const skoolPostUrl = input.skoolPostUrl.trim() ? safeUrl(input.skoolPostUrl) : "";
  if (skoolPostUrl && !skoolGroupOf(skoolPostUrl)) throw new Error("The \"where to engage\" link must be a Skool link.");
  const zapier = input.zapierWebhookUrl.trim();
  if (zapier && !isPublicHttpsUrl(zapier)) throw new Error("The Zapier link must be a public https:// URL.");
  const db = await getDb();
  const [row] = await db
    .insert(unlocks)
    .values({
      workspaceId,
      slug: `${slugify(title, 30) || "unlock"}-${shortId(5).toLowerCase()}`,
      title,
      reward: input.reward.trim().slice(0, 300),
      rewardUrl,
      action: input.action === "post" ? "post" : "comment",
      instructions: input.instructions.trim().slice(0, 600),
      skoolPostUrl,
      zapierWebhookUrl: zapier,
    })
    .returning();
  return row;
}

export async function listUnlocks(workspaceId: string) {
  const db = await getDb();
  return db
    .select({
      unlock: unlocks,
      claims: sql<number>`(select count(*)::int from ${unlockClaims} where ${unlockClaims.unlockId} = ${unlocks.id})`,
      flagged: sql<number>`(select count(*)::int from ${unlockClaims} where ${unlockClaims.unlockId} = ${unlocks.id} and ${unlockClaims.flagged})`,
    })
    .from(unlocks)
    .where(eq(unlocks.workspaceId, workspaceId))
    .orderBy(desc(unlocks.createdAt));
}

export async function setUnlockActive(workspaceId: string, id: string, active: boolean) {
  const db = await getDb();
  await db.update(unlocks).set({ active }).where(and(eq(unlocks.id, id), eq(unlocks.workspaceId, workspaceId)));
}

export async function publicUnlock(slug: string) {
  const db = await getDb();
  const [row] = await db
    .select({ unlock: unlocks, workspace: { id: workspaces.id, name: workspaces.name, settings: workspaces.settings, status: workspaces.status } })
    .from(unlocks)
    .innerJoin(workspaces, eq(workspaces.id, unlocks.workspaceId))
    .where(eq(unlocks.slug, slug.toLowerCase().slice(0, 80)))
    .limit(1);
  return row ?? null;
}

/** The ready-to-paste Skool post that announces an unlock. */
export function unlockPostText(u: Pick<Unlock, "title" | "reward" | "action" | "instructions" | "slug">) {
  const step1 = u.action === "comment" ? `Comment below: ${u.instructions || "tell us one thing you're working on this week"}` : u.instructions || "Make a post in the community";
  return `🔓 FREE: ${u.title}${u.reward ? `\n${u.reward}` : ""}

How to get it (takes 1 minute):
1. ${step1}
2. Copy the link to your ${u.action === "comment" ? "comment or this post" : "post"} (the ⋯ menu › Copy link)
3. Paste it here: ${claimUrlFor(u.slug)}

It lands in your inbox in seconds. 👇`;
}

export type ClaimResult =
  | { ok: true; already: boolean; title: string; reward: string; rewardUrl: string }
  | { ok: false; error: string };

export async function claimUnlock(input: { slug: string; email: string; name?: string; postUrl: string; honeypot?: string }): Promise<ClaimResult> {
  if (input.honeypot) return { ok: false, error: "Something went wrong. Please try again." };
  const row = await publicUnlock(input.slug);
  if (!row || !row.unlock.active || row.workspace.status === "paused") return { ok: false, error: "This unlock isn't available any more." };
  const { unlock } = row;
  const email = normalizeEmail(input.email);
  if (!isEmail(email)) return { ok: false, error: "Enter the email you want the reward sent to." };
  const group = skoolGroupOf(row.workspace.settings.skoolUrl) ?? skoolGroupOf(unlock.skoolPostUrl);
  const link = checkPostLink(input.postUrl, group);
  if (!link.ok) return link;

  const db = await getDb();
  const name = (input.name ?? "").trim().slice(0, 120);
  const [existing] = await db.select().from(unlockClaims).where(and(eq(unlockClaims.unlockId, unlock.id), eq(unlockClaims.email, email))).limit(1);
  if (existing) return { ok: true, already: true, title: unlock.title, reward: unlock.reward, rewardUrl: unlock.rewardUrl };

  // Trust, then spot-check: flag links that look reused.
  let flagReason = "";
  const [reused] = await db
    .select({ id: unlockClaims.id })
    .from(unlockClaims)
    .where(and(eq(unlockClaims.unlockId, unlock.id), eq(unlockClaims.postUrl, link.url), ne(unlockClaims.email, email)))
    .limit(1);
  if (reused) flagReason = "Same link as another claim";
  else if (unlock.action === "post" && unlock.skoolPostUrl && link.url.split("?")[0] === unlock.skoolPostUrl.split("?")[0]) flagReason = "Linked the announcement, not their own post";

  const [first, ...rest] = name.split(/\s+/);
  const { contact } = await upsertContact({ workspaceId: unlock.workspaceId, email, firstName: first ?? "", lastName: rest.join(" "), source: "skool", tags: [`unlock-${unlock.slug}`.slice(0, 60)] });
  const inserted = await db
    .insert(unlockClaims)
    .values({ unlockId: unlock.id, workspaceId: unlock.workspaceId, email, name, postUrl: link.url, contactId: contact.id, flagged: Boolean(flagReason), flagReason })
    .onConflictDoNothing()
    .returning({ id: unlockClaims.id });
  if (inserted.length === 0) return { ok: true, already: true, title: unlock.title, reward: unlock.reward, rewardUrl: unlock.rewardUrl };

  await logActivity({ workspaceId: unlock.workspaceId, contactId: contact.id, type: "skool_engaged", refId: unlock.id, data: { unlock: unlock.title, postUrl: link.url, flagged: Boolean(flagReason) } });
  await addTag(unlock.workspaceId, contact.id, ENGAGED_TAG); // fires "tag added" automations the first time

  const { queueEmail } = await import("./email/send");
  await queueEmail({
    workspaceId: unlock.workspaceId,
    contactId: contact.id,
    to: email,
    subject: `🔓 Unlocked: ${unlock.title}`,
    body: `Hi {{first_name}},\n\nThanks for jumping in. Here's your reward.\n\n**${unlock.title}**\n${unlock.reward}\n\n${unlock.rewardUrl ? `[Open it here](${unlock.rewardUrl})` : ""}\n\nSee you in the community.`,
    vars: { first_name: first || "there" },
  });
  if (unlock.zapierWebhookUrl) {
    await enqueue("unlock.webhook", { url: unlock.zapierWebhookUrl, email, name, unlock: unlock.title, slug: unlock.slug, postUrl: link.url }, { dedupeKey: `unlock-hook:${unlock.id}:${email}` });
  }
  return { ok: true, already: false, title: unlock.title, reward: unlock.reward, rewardUrl: unlock.rewardUrl };
}

/** Job: tell Zapier (e.g. Skool "Unlock Course for Member") about a claim. Retries via the job queue. */
export async function processUnlockWebhook(payload: Record<string, unknown>) {
  const url = String(payload.url ?? "");
  if (!isPublicHttpsUrl(url)) return;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ email: payload.email, name: payload.name, unlock: payload.unlock, slug: payload.slug, post_url: payload.postUrl }),
  });
  if (!res.ok) throw new Error(`Unlock webhook answered ${res.status}`);
}

export async function recentClaims(workspaceId: string, limit = 30) {
  const db = await getDb();
  return db
    .select({ claim: unlockClaims, title: unlocks.title })
    .from(unlockClaims)
    .innerJoin(unlocks, eq(unlocks.id, unlockClaims.unlockId))
    .where(eq(unlockClaims.workspaceId, workspaceId))
    .orderBy(desc(unlockClaims.createdAt))
    .limit(limit);
}

/** The members who engage most, by claims in the last N days. */
export async function engagementLeaders(workspaceId: string, days = 30, limit = 10) {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86_400_000);
  return db
    .select({
      email: unlockClaims.email,
      name: sql<string>`max(${unlockClaims.name})`,
      contactId: sql<string | null>`max(${unlockClaims.contactId}::text)`,
      claims: sql<number>`count(*)::int`,
      last: sql<Date>`max(${unlockClaims.createdAt})`,
    })
    .from(unlockClaims)
    .where(and(eq(unlockClaims.workspaceId, workspaceId), gte(unlockClaims.createdAt, since)))
    .groupBy(unlockClaims.email)
    .orderBy(sql`count(*) desc`, sql`max(${unlockClaims.createdAt}) desc`)
    .limit(limit);
}

export async function engagedContactCount(workspaceId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), sql`${ENGAGED_TAG} = any(${contacts.tags})`));
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// The entry ticket: the platform can ask new members to post an intro in the community
// before their app account unlocks ("as soon as they post, they get connected").
// ---------------------------------------------------------------------------

export type EntryTicket = { on: boolean; unlockId: string; since: string };
const ENTRY_KEY = "entry_ticket";

export async function getEntryTicket(): Promise<(EntryTicket & { unlock: Unlock | null }) | null> {
  const db = await getDb();
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, ENTRY_KEY)).limit(1);
  const v = row?.value as Partial<EntryTicket> | undefined;
  if (!v?.unlockId) return null;
  const [unlock] = await db.select().from(unlocks).where(eq(unlocks.id, v.unlockId)).limit(1);
  return { on: Boolean(v.on) && Boolean(unlock?.active), unlockId: v.unlockId, since: v.since ?? new Date(0).toISOString(), unlock: unlock ?? null };
}

export async function setEntryTicket(input: EntryTicket) {
  const db = await getDb();
  await db
    .insert(platformSettings)
    .values({ key: ENTRY_KEY, value: input })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value: input, updatedAt: new Date() } });
}

/** Does this workspace still need to post its intro before using the app? */
export function needsEntryTicket(
  ticket: Awaited<ReturnType<typeof getEntryTicket>>,
  ws: { accessSource: string; createdAt: Date; settings: { entryClaimedAt?: string } },
) {
  if (!ticket?.on || !ticket.unlock) return false;
  if (ws.accessSource !== "member" || ws.settings.entryClaimedAt) return false;
  return ws.createdAt.getTime() >= new Date(ticket.since).getTime();
}

export async function claimEntryTicket(workspaceId: string, user: { email: string; name: string }, postUrl: string): Promise<ClaimResult> {
  const ticket = await getEntryTicket();
  if (!ticket?.unlock) return { ok: false, error: "There's no entry step right now. Refresh the page." };
  const res = await claimUnlock({ slug: ticket.unlock.slug, email: user.email, name: user.name, postUrl });
  if (!res.ok) return res;
  const db = await getDb();
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (ws) {
    await db
      .update(workspaces)
      .set({ settings: { ...ws.settings, entryPostUrl: postUrl.slice(0, 500), entryClaimedAt: new Date().toISOString() } })
      .where(eq(workspaces.id, workspaceId));
  }
  return res;
}
