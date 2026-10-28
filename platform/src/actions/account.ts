"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { safeUrl } from "@/lib/html";
import { isEmail } from "@/lib/util";
import { requireWorkspace } from "@/server/tenancy";
import { redeemCode } from "@/server/access";
import { createCheckout, stripeConfigured } from "@/server/billing/stripe";
import { billingWalletFor } from "@/server/wallet";
import { disconnectChannel } from "@/server/inbox";
import { buyNumber, searchNumbers } from "@/server/sms";
import { hasFeature } from "@/server/plans";
import { errMsg, field, go } from "./helpers";

export async function redeemCodeAction(wid: string, fd: FormData) {
  await requireWorkspace(wid, "user", { allowPaused: true });
  const res = await redeemCode(wid, field(fd, "code", 40));
  if (!res.ok) go(field(fd, "back") || `/app/w/${wid}`, { error: res.error });
  go(`/app/w/${wid}`, { ok: `Access confirmed until ${res.until.toDateString()}.` });
}

export async function saveBusinessAction(wid: string, fd: FormData) {
  const { workspace } = await requireWorkspace(wid, "admin");
  const replyTo = field(fd, "replyToEmail", 200);
  if (replyTo && !isEmail(replyTo)) go(`/app/w/${wid}/settings`, { error: "Reply-to must be a valid email." });
  const skoolUrl = field(fd, "skoolUrl", 300);
  const db = await getDb();
  await db
    .update(workspaces)
    .set({
      name: field(fd, "businessName", 80) || workspace.name,
      settings: {
        ...workspace.settings,
        businessName: field(fd, "businessName", 80),
        niche: field(fd, "niche", 160),
        offer: field(fd, "offer", 200),
        skoolUrl: skoolUrl ? safeUrl(skoolUrl) : "",
        mailingAddress: field(fd, "mailingAddress", 300),
        replyToEmail: replyTo,
      },
    })
    .where(eq(workspaces.id, wid));
  go(`/app/w/${wid}/settings`, { ok: "Business details saved." });
}

export async function saveTrackingAction(wid: string, fd: FormData) {
  const { workspace } = await requireWorkspace(wid, "admin");
  const pixelId = field(fd, "metaPixelId", 30);
  if (pixelId && !/^\d{5,20}$/.test(pixelId)) go(`/app/w/${wid}/settings`, { error: "The Pixel ID is a number, like 123456789012345." });
  const token = field(fd, "metaCapiToken", 1000);
  const db = await getDb();
  await db
    .update(workspaces)
    .set({
      settings: {
        ...workspace.settings,
        metaPixelId: pixelId,
        metaTestEventCode: field(fd, "metaTestEventCode", 40),
        ...(token ? { metaCapiTokenEnc: encrypt(token) } : {}),
        ...(fd.get("clearToken") === "on" ? { metaCapiTokenEnc: undefined } : {}),
      },
    })
    .where(eq(workspaces.id, wid));
  go(`/app/w/${wid}/settings`, { ok: "Tracking saved." });
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
