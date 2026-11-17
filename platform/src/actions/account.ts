"use server";

import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { safeUrl } from "@/lib/html";
import { isEmail } from "@/lib/util";
import { env } from "@/lib/env";
import { clientIp } from "@/lib/ip";
import { requireWorkspace } from "@/server/tenancy";
import { accessGap, membershipFor, refreshOwnerAccess } from "@/server/access";
import { agencyForHost } from "@/server/agency";
import { requestHost } from "@/server/auth";
import { createCheckout, stripeConfigured } from "@/server/billing/stripe";
import { billingWalletFor } from "@/server/wallet";
import { disconnectChannel } from "@/server/inbox";
import { buyNumber, searchNumbers } from "@/server/sms";
import { hasFeature } from "@/server/plans";
import { isSkoolUrl } from "@/server/growth";
import { setAccountSkoolUrl, syncSkoolUrlToSites } from "@/server/sites";
import { checkPixel, cleanPixelId, type PixelTestResult, type TrackingSettings } from "@/server/meta/capi";
import { takeRateLimit } from "@/server/rateLimit";
import { settingsKeepingJourney } from "@/server/settingsWrite";
import { errMsg, field, go } from "./helpers";

const SKOOL_URL_ERROR = "Your Skool link must be a skool.com link, like https://www.skool.com/your-group";

/**
 * Send the "Confirm your email" link again (the signup one may have expired or gone to spam).
 * `back` (optional form field): a page in this workspace to come back to, like ReelVault's notice; else /paused.
 */
export async function resendVerifyAction(wid: string, fd?: FormData) {
  const { user } = await requireWorkspace(wid, "user", { allowPaused: true, allowEntry: true });
  const raw = fd?.get("back");
  const back = typeof raw === "string" && raw.startsWith(`/app/w/${wid}/`) && !raw.includes("//") && !raw.includes("\\") ? raw : `/app/w/${wid}/paused`;
  const { isEmailVerified, sendVerifyEmail } = await import("@/server/emailVerify");
  if (await isEmailVerified(user.id)) go(`/app/w/${wid}`, { ok: "Your email is already confirmed." });
  try {
    // The same sender name as the signup email and the wait screen.
    await sendVerifyEmail(user.id, (await agencyForHost(await requestHost()))?.brand.name);
  } catch (err) {
    go(back, { error: errMsg(err) });
  }
  go(back, { ok: `We sent a new link to ${user.email}. Check Promotions and Spam if it isn't there in a minute.` });
}

/** "Check again": re-read the owner's membership now (after joining Skool or paying). */
export async function checkAccessAction(wid: string, fd: FormData) {
  await requireWorkspace(wid, "user", { allowPaused: true, allowEntry: true });
  const back = field(fd, "back") || `/app/w/${wid}`;
  const db = await getDb();
  const [owner] = await db
    .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, wid), eq(workspaceMembers.role, "owner")))
    .limit(1);
  if (!owner) go(back, { error: `This account has no owner. Email us at ${env.emailReplyTo}.` });
  if (!owner.emailVerifiedAt) go(back, { error: `Confirm ${owner.email} first: click the link we emailed you.` });
  await refreshOwnerAccess(owner.email);
  const m = await membershipFor(owner.email);
  if (!m.active) {
    // Still in the first welcome days: a matching delay (a Skool trial the app hasn't heard of yet), not a lapse.
    if ((await accessGap(owner.email)) === "matching") {
      go(back, { warn: `Not matched yet. If you joined Skool with ${owner.email}, there's nothing to do: it switches over by itself when your trial turns paid, or at the next member update.` });
    }
    const wait = env.skoolWebhookSecret ? "Paid on Skool just now? Give it 15 minutes." : "Joined in the last few days? You'll be switched on at the next weekly member update.";
    go(back, { error: `We can't see an active membership for ${owner.email} yet. ${wait}` });
  }
  go(`/app/w/${wid}`, { ok: "You're an active member. Your account is on." });
}

export async function saveBusinessAction(wid: string, fd: FormData) {
  const { workspace } = await requireWorkspace(wid, "admin");
  const replyTo = field(fd, "replyToEmail", 200);
  if (replyTo && !isEmail(replyTo)) go(`/app/w/${wid}/settings`, { error: "Reply-to must be a valid email." });
  const skoolUrl = field(fd, "skoolUrl", 300);
  if (skoolUrl && !isSkoolUrl(skoolUrl)) go(`/app/w/${wid}/settings`, { error: SKOOL_URL_ERROR });
  const db = await getDb();
  await db
    .update(workspaces)
    .set({
      name: field(fd, "businessName", 80) || workspace.name,
      settings: settingsKeepingJourney({
        ...workspace.settings,
        businessName: field(fd, "businessName", 80),
        niche: field(fd, "niche", 160),
        offer: field(fd, "offer", 200),
        skoolUrl: skoolUrl ? safeUrl(skoolUrl) : "",
        mailingAddress: field(fd, "mailingAddress", 300),
        replyToEmail: replyTo,
      }),
    })
    .where(eq(workspaces.id, wid));
  // One Skool link per account: every website's Join button follows this one.
  await syncSkoolUrlToSites(wid, skoolUrl ? safeUrl(skoolUrl) : "");
  go(`/app/w/${wid}/settings`, { ok: "Business details saved." });
}

/** Paste the Skool group link from wherever it turned out to be missing (a website's page, say). */
export async function saveSkoolLinkAction(wid: string, fd: FormData) {
  await requireWorkspace(wid, "admin");
  const asked = field(fd, "back", 300);
  // Only ever back to a screen inside this account.
  const back = asked.startsWith(`/app/w/${wid}/`) && !asked.includes("//") && !asked.includes("\\") ? asked : `/app/w/${wid}/settings`;
  const skoolUrl = field(fd, "skoolUrl", 300);
  if (!skoolUrl) go(back, { error: "Paste your Skool group link first, then press Save." });
  if (!isSkoolUrl(skoolUrl)) go(back, { error: SKOOL_URL_ERROR });
  await setAccountSkoolUrl(wid, skoolUrl);
  go(back, { ok: "Saved. Every Join button on your websites now goes to your Skool group." });
}

/** Ask Meta about the saved Pixel ID and token, at most a few times a minute. */
async function runPixelCheck(wid: string, email: string): Promise<PixelTestResult | { outcome: "not-ready" }> {
  if (!(await takeRateLimit(`pixel-test:${wid}`, [{ seconds: 60, max: 6 }]))) {
    return { outcome: "no-answer", reason: "That's a lot of tests in one minute. Wait a moment, then press the test button." };
  }
  const h = await headers();
  return checkPixel(wid, { email, ip: clientIp(h), userAgent: h.get("user-agent") });
}

export async function saveTrackingAction(wid: string, fd: FormData) {
  const { workspace, user } = await requireWorkspace(wid, "admin");
  const back = `/app/w/${wid}/settings`;
  const cleaned = cleanPixelId(field(fd, "metaPixelId", 80));
  if (!cleaned.ok) go(back, { error: cleaned.error });
  const pixelId = cleaned.id;
  // Tokens are one long word; a paste can pick up spaces or a line break.
  const token = field(fd, "metaCapiToken", 1000).replace(/\s+/g, "");
  const clearToken = fd.get("clearToken") === "on";
  const next: TrackingSettings = {
    ...workspace.settings,
    metaPixelId: pixelId,
    metaTestEventCode: field(fd, "metaTestEventCode", 40),
    ...(token ? { metaCapiTokenEnc: encrypt(token) } : {}),
    ...(clearToken ? { metaCapiTokenEnc: undefined } : {}),
  };
  // Whatever Meta said before was about the old ID or token.
  if (pixelId !== (workspace.settings.metaPixelId ?? "") || token || clearToken) delete next.metaPixelCheck;
  const db = await getDb();
  await db.update(workspaces).set({ settings: settingsKeepingJourney(next) }).where(eq(workspaces.id, wid));

  if (!pixelId) go(back, { ok: "Saved. No Pixel is set." });
  if (!next.metaCapiTokenEnc) go(back, { ok: "Pixel ID saved. Add the access token and press Save, and we'll test it with Meta." });
  const res = await runPixelCheck(wid, user.email);
  if (res.outcome === "accepted") go(back, { ok: "Saved. Meta accepted the test." });
  if (res.outcome === "rejected") go(back, { error: `Saved, but Meta said no. ${res.reason}` });
  go(back, { warn: res.outcome === "no-answer" ? `Saved, but not tested yet. ${res.reason}` : "Saved." });
}

/** "Send a test to Meta": test the Pixel ID and token that are already saved. */
export async function testTrackingAction(wid: string) {
  const { user } = await requireWorkspace(wid, "admin");
  const back = `/app/w/${wid}/settings`;
  const res = await runPixelCheck(wid, user.email);
  if (res.outcome === "accepted") go(back, { ok: "Meta accepted the test." });
  if (res.outcome === "rejected") go(back, { error: `Meta said no. ${res.reason}` });
  if (res.outcome === "no-answer") go(back, { warn: res.reason });
  go(back, { error: "Save your Pixel ID and access token first, then test." });
}

export async function disconnectChannelAction(wid: string, connectionId: string) {
  await requireWorkspace(wid, "admin");
  await disconnectChannel(wid, connectionId);
  go(`/app/w/${wid}/settings`, { ok: "Disconnected." });
}

export async function searchNumbersAction(wid: string, fd: FormData) {
  const { workspace } = await requireWorkspace(wid, "admin");
  if (!hasFeature(workspace.plan, "sms")) go(`/app/w/${wid}/settings`, { error: "SMS is on the Growth plan." });
  const country = field(fd, "country", 2) || "US";
  const area = field(fd, "areaCode", 5);
  go(`/app/w/${wid}/settings?numbers=${encodeURIComponent(`${country}:${area}`)}#sms`);
}

export async function buyNumberAction(wid: string, fd: FormData) {
  const { workspace } = await requireWorkspace(wid, "owner");
  if (!hasFeature(workspace.plan, "sms")) go(`/app/w/${wid}/settings`, { error: "SMS is on the Growth plan." });
  let msg: { ok?: string; error?: string };
  try {
    const n = await buyNumber(wid, field(fd, "phoneNumber", 20));
    msg = { ok: `${n} is yours. Inbound texts land in your inbox.` };
  } catch (err) {
    msg = { error: errMsg(err) };
  }
  go(`/app/w/${wid}/settings`, msg);
}

export async function listNumbers(wid: string, query: string) {
  await requireWorkspace(wid, "admin");
  const [country, area] = query.split(":");
  try {
    return { ok: true as const, numbers: await searchNumbers(country || "US", area || undefined) };
  } catch (err) {
    return { ok: false as const, error: errMsg(err) };
  }
}

export async function topupAction(wid: string, fd: FormData) {
  const { user } = await requireWorkspace(wid, "owner", { allowPaused: true });
  if (!stripeConfigured()) go(`/app/w/${wid}/billing`, { error: "Payments aren't set up on this platform yet." });
  const { wallet } = await billingWalletFor(wid);
  const amount = Number(field(fd, "amount")) || 25;
  let url: string;
  try {
    url = await createCheckout({ kind: "topup", ownerType: wallet.ownerType, ownerId: wallet.ownerId, amountUsd: amount, email: user.email, returnPath: `/app/w/${wid}/billing` });
  } catch (err) {
    go(`/app/w/${wid}/billing`, { error: errMsg(err) });
  }
  go(url);
}

export async function upgradeAction(wid: string) {
  const { user, agency } = await requireWorkspace(wid, "owner");
  if (!agency.isPlatform) go(`/app/w/${wid}/billing`, { error: "Your agency manages your plan." });
  let url: string;
  try {
    url = await createCheckout({ kind: "growth", ownerType: "workspace", ownerId: wid, email: user.email, returnPath: `/app/w/${wid}/billing` });
  } catch (err) {
    go(`/app/w/${wid}/billing`, { error: errMsg(err) });
  }
  go(url);
}

export async function inviteMemberAction(wid: string, fd: FormData) {
  const { workspace, agency } = await requireWorkspace(wid, "admin");
  const email = field(fd, "email", 200);
  if (!isEmail(email)) go(`/app/w/${wid}/settings#team`, { error: "Enter a valid email." });
  const role = field(fd, "role") === "admin" ? "admin" : "user";
  const { inviteMember } = await import("@/server/team");
  await inviteMember({ workspaceId: wid, workspaceName: workspace.name, email, name: field(fd, "name", 80), role, brandName: agency.isPlatform ? undefined : agency.brand.name });
  go(`/app/w/${wid}/settings`, { ok: `Invited ${email}.` });
}

export async function removeMemberAction(wid: string, userId: string) {
  const { user } = await requireWorkspace(wid, "admin");
  if (userId === user.id) go(`/app/w/${wid}/settings`, { error: "You can't remove yourself." });
  const { removeMember } = await import("@/server/team");
  await removeMember(wid, userId);
  go(`/app/w/${wid}/settings`, { ok: "Removed." });
}
