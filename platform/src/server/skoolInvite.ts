import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, platformSettings, workspaces } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { isEmail } from "@/lib/util";
import { addTag } from "./contacts";
import { logActivity } from "./activity";

// Skool invites through Skool's own Webhook plugin (Skool › Settings › Plugins › Webhook › Edit
// gives a private URL; sending it an email address makes Skool email that person an invite that
// skips approval). A Zapier catch hook wired to Skool's "Invite Member" works the same way.
// Every workspace can connect its own group, so members (and agency clients) get it too.
// No Skool login is ever stored or used.

export const INVITED_TAG = "skool-invited";
const PLATFORM_KEY = "skool_invite";

/** Only Skool's own webhook or a Zapier hook: the URL is a secret that invites people, nothing else. */
export function checkSkoolInviteUrl(
  raw: string,
): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return {
      ok: false,
      error:
        "That isn't a link. Copy the whole webhook URL from Skool › Settings › Plugins › Webhook.",
    };
  }
  if (u.protocol !== "https:")
    return { ok: false, error: "Use the https:// link Skool gives you." };
  const host = u.hostname.toLowerCase();
  if (!/(^|\.)skool\.com$/.test(host) && !/(^|\.)zapier\.com$/.test(host)) {
    return {
      ok: false,
      error:
        "Paste the webhook link from Skool (skool.com) or a Zapier hook (zapier.com).",
    };
  }
  u.searchParams.delete("email");
  return { ok: true, url: u.toString() };
}

/** Shows enough to recognise the link without revealing it. */
export function maskInviteUrl(url: string): string {
  try {
    const u = new URL(url);
    const tail = (u.pathname + u.search).replace(/\/+$/, "");
    return `${u.hostname}/…${tail.slice(-4)}`;
  } catch {
    return "a saved link";
  }
}

/** Ask Skool (or the Zapier hook) to invite one person. */
export async function postSkoolInvite(
  url: string,
  person: { email: string; name?: string },
): Promise<{ ok: boolean; status: number }> {
  const u = new URL(url);
  u.searchParams.set("email", person.email);
  const [first, ...rest] = (person.name ?? "").trim().split(/\s+/);
  const res = await fetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: person.email,
      name: person.name ?? "",
      first_name: first ?? "",
      last_name: rest.join(" "),
    }),
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res) return { ok: false, status: 0 };
  return { ok: res.status < 400, status: res.status };
}

// ----- the platform owner's own community (for /join buyers) -----

export async function platformInviteUrl(): Promise<string | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, PLATFORM_KEY))
    .limit(1);
  const sealed = (row?.value as { enc?: string } | undefined)?.enc;
  if (sealed) {
    try {
      return decrypt(sealed);
    } catch {
      return null;
    }
  }
  return env.skoolInviteWebhookUrl || null;
}

export async function setPlatformInviteUrl(url: string | null) {
  const db = await getDb();
  const value = url ? { enc: encrypt(url), hint: maskInviteUrl(url) } : {};
  await db
    .insert(platformSettings)
    .values({ key: PLATFORM_KEY, value })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function platformInviteHint(): Promise<string | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, PLATFORM_KEY))
    .limit(1);
  const hint = (row?.value as { hint?: string } | undefined)?.hint;
  return (
    hint ??
    (env.skoolInviteWebhookUrl
      ? `${maskInviteUrl(env.skoolInviteWebhookUrl)} (server setting)`
      : null)
  );
}

// ----- a member's own Skool group -----

export async function workspaceInviteUrl(
  workspaceId: string,
): Promise<string | null> {
  const db = await getDb();
  const [ws] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const sealed = ws?.settings.skoolInviteEnc;
  if (!sealed) return null;
  try {
    return decrypt(sealed);
  } catch {
    return null;
  }
}

export async function setWorkspaceInviteUrl(
  workspaceId: string,
  url: string | null,
) {
  const db = await getDb();
  const [ws] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const settings = { ...(ws?.settings ?? {}) };
  if (url) {
    settings.skoolInviteEnc = encrypt(url);
    settings.skoolInviteHint = maskInviteUrl(url);
  } else {
    delete settings.skoolInviteEnc;
    delete settings.skoolInviteHint;
  }
  await db
    .update(workspaces)
    .set({ settings })
    .where(eq(workspaces.id, workspaceId));
}

/**
 * The "Invite to my Skool group" automation step. Never invites the same person twice, and a
 * failed invite never stops the rest of the automation.
 */
export async function inviteContactToSkool(
  workspaceId: string,
  contactId: string,
): Promise<string> {
  const db = await getDb();
  const [c] = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      tags: contacts.tags,
    })
    .from(contacts)
    .where(
      and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!c?.email || !isEmail(c.email))
    return "Skipped the Skool invite: no email address";
  if (c.tags.includes(INVITED_TAG) || c.tags.includes("skool-member"))
    return "Already invited to Skool";
  const url = await workspaceInviteUrl(workspaceId);
  if (!url)
    return "Skipped the Skool invite: connect your Skool webhook in Skool members first";
  const r = await postSkoolInvite(url, {
    email: c.email,
    name: [c.firstName, c.lastName].filter(Boolean).join(" "),
  });
  if (!r.ok)
    return `Skool didn't take the invite (${r.status || "no answer"}). Check your webhook in Skool members`;
  await addTag(workspaceId, c.id, INVITED_TAG);
  await logActivity({
    workspaceId,
    contactId: c.id,
    type: "skool_invite",
    data: {},
  });
  return "Sent a Skool invite";
}
