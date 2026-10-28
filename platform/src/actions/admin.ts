"use server";

import { requirePlatformAdmin } from "@/server/auth";
import { createAccessCode } from "@/server/access";
import { adminAdjustWallet, adminSetAgency, adminSetWorkspace, retryJob } from "@/server/admin";
import { runDueJobs } from "@/server/jobs/runner";
import { tick } from "@/server/maintenance";
import { errMsg, field, go } from "./helpers";

export async function createCodeAction(fd: FormData) {
  await requirePlatformAdmin();
  const code = field(fd, "code", 40).toUpperCase().replace(/\s+/g, "");
  const from = new Date(field(fd, "validFrom") || Date.now());
  const until = new Date(field(fd, "validUntil"));
  if (!code || code.length < 4) go("/app/admin/codes", { error: "Use a code with at least 4 characters." });
  if (isNaN(until.getTime()) || until <= from) go("/app/admin/codes", { error: "Pick an end date after the start date." });
  try {
    await createAccessCode({ code, label: field(fd, "label", 80), validFrom: from, validUntil: until });
  } catch (err) {
    go("/app/admin/codes", { error: errMsg(err).includes("unique") ? "That code already exists." : errMsg(err) });
  }
  go("/app/admin/codes", { ok: `Code ${code} is live. Post it in your Skool classroom.` });
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
