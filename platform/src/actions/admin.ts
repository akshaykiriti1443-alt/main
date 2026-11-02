"use server";

import { requirePlatformAdmin } from "@/server/auth";
import { applyRoster, grantAccess, previewRoster, revokeAccess, type RosterPreview } from "@/server/access";
import { isEmail } from "@/lib/util";
import { adminAdjustWallet, adminSetAgency, adminSetWorkspace, retryJob } from "@/server/admin";
import { runDueJobs } from "@/server/jobs/runner";
import { tick } from "@/server/maintenance";
import { errMsg, field, go } from "./helpers";

export type RosterState = { preview?: RosterPreview; error?: string; ok?: string };

/** Step 1 of a roster upload: show who would be added and removed. Changes nothing. */
export async function rosterAction(_prev: RosterState, fd: FormData): Promise<RosterState> {
  const admin = await requirePlatformAdmin();
  const raw = String(fd.get("members") ?? "").slice(0, 5_000_000);
  if (!raw.trim()) return { error: "Upload or paste your Skool member export first." };
  try {
    if (fd.get("apply") !== "1") return { preview: await previewRoster(raw) };
    const res = await applyRoster(raw, { byUserId: admin.id, confirmLargeDrop: fd.get("confirmLargeDrop") === "on" });
    return { ok: `Synced ${res.emails} members: ${res.added.length} new, ${res.removed.length} removed.` };
  } catch (err) {
    return { error: errMsg(err), preview: await previewRoster(raw).catch(() => undefined) };
  }
}

export async function grantMemberAction(fd: FormData) {
  await requirePlatformAdmin();
  const email = field(fd, "email", 200);
  if (!isEmail(email)) go("/app/admin/members", { error: "Enter a valid email." });
  const days = Number(field(fd, "days"));
  const until = days > 0 ? new Date(Date.now() + days * 86_400_000) : null;
  await grantAccess({ email, name: field(fd, "name", 120), channel: "admin", until });
  go("/app/admin/members", { ok: `${email} has access ${until ? `until ${until.toDateString()}` : "for life"}.` });
}

export async function revokeMemberAction(email: string, channel: "skool_zapier" | "skool_export" | "stripe" | "admin") {
  await requirePlatformAdmin();
  await revokeAccess(email, channel, "admin");
  go("/app/admin/members", { ok: `Removed ${email} (${channel.replace("_", " ")}). Their account pauses after the 7-day grace unless another membership is active.` });
}

export async function setWorkspaceAction(wid: string, fd: FormData) {
  await requirePlatformAdmin();
  const plan = field(fd, "plan");
  const status = field(fd, "status");
  await adminSetWorkspace(wid, {
    ...(plan === "starter" || plan === "growth" ? { plan } : {}),
    ...(status === "active" || status === "grace" || status === "paused" ? { status } : {}),
    ...(fd.get("lifetime") === "on" ? { accessSource: "admin" as const } : {}),
  });
  go("/app/admin/workspaces", { ok: "Workspace updated." });
}

export async function setAgencyAction(aid: string, fd: FormData) {
  await requirePlatformAdmin();
  const plan = field(fd, "plan");
  const status = field(fd, "status");
  await adminSetAgency(aid, {
    ...(plan === "none" || plan === "agency" ? { plan } : {}),
    ...(status === "active" || status === "paused" ? { status } : {}),
  });
  go("/app/admin/agencies", { ok: "Agency updated." });
}

export async function adjustWalletAction(ownerType: "workspace" | "agency", ownerId: string, fd: FormData) {
  await requirePlatformAdmin();
  const amount = Number(field(fd, "amount"));
  if (!amount || Math.abs(amount) > 10_000) go(`/app/admin/${ownerType === "agency" ? "agencies" : "workspaces"}`, { error: "Enter an amount between -10,000 and 10,000." });
  await adminAdjustWallet(ownerType, ownerId, amount, field(fd, "note", 200));
  go(`/app/admin/${ownerType === "agency" ? "agencies" : "workspaces"}`, { ok: `Wallet adjusted by $${amount}.` });
}

export async function retryJobAction(jobId: string) {
  await requirePlatformAdmin();
  await retryJob(jobId);
  await runDueJobs();
  go("/app/admin/jobs", { ok: "Job retried." });
}

export async function runTickAction() {
  await requirePlatformAdmin();
  const res = await tick();
  go("/app/admin/jobs", { ok: `Processed ${res.jobs.processed} jobs (${res.jobs.failed} failed). ${res.access.grace} moved to grace, ${res.access.paused} paused.` });
}
