"use server";

import { requireUser } from "@/server/auth";
import { requireAgency, requireWorkspace } from "@/server/tenancy";
import { createAgency, createSubAccount, setSubAccountStatus, updateAgencySettings } from "@/server/agency";
import { createCheckout, stripeConfigured } from "@/server/billing/stripe";
import { deleteTemplate, saveTemplate } from "@/server/templates";
import { safeUrl } from "@/lib/html";
import { errMsg, field, go } from "./helpers";

export async function createAgencyAction(fd: FormData) {
  const user = await requireUser();
  const name = field(fd, "name", 80);
  if (!name) go("/app/agency/new", { error: "Name your agency." });
  const agency = await createAgency(user.id, name);
  go(`/app/agency/${agency.id}/billing`, { ok: "Agency created. Activate the Agency plan to add clients." });
}

export async function agencyCheckoutAction(aid: string) {
  const { user } = await requireAgency(aid);
  if (!stripeConfigured()) go(`/app/agency/${aid}/billing`, { error: "Payments aren't set up on this platform yet. The platform owner can activate your plan." });
  let url: string;
  try {
    url = await createCheckout({ kind: "agency", ownerType: "agency", ownerId: aid, email: user.email, returnPath: `/app/agency/${aid}/billing` });
  } catch (err) {
    go(`/app/agency/${aid}/billing`, { error: errMsg(err) });
  }
  go(url);
}

export async function agencyTopupAction(aid: string, fd: FormData) {
  const { user } = await requireAgency(aid);
  if (!stripeConfigured()) go(`/app/agency/${aid}/billing`, { error: "Payments aren't set up on this platform yet." });
  let url: string;
  try {
    url = await createCheckout({ kind: "topup", ownerType: "agency", ownerId: aid, amountUsd: Number(field(fd, "amount")) || 50, email: user.email, returnPath: `/app/agency/${aid}/billing` });
  } catch (err) {
    go(`/app/agency/${aid}/billing`, { error: errMsg(err) });
  }
  go(url);
}

export async function createSubAccountAction(aid: string, fd: FormData) {
  const { agency } = await requireAgency(aid);
  if (agency.plan !== "agency") go(`/app/agency/${aid}`, { error: "Activate the Agency plan to add client accounts." });
  if (agency.status === "paused") go(`/app/agency/${aid}`, { error: "Your agency is paused. Update billing to continue." });
  const name = field(fd, "name", 80);
  if (!name) go(`/app/agency/${aid}`, { error: "Name the client account." });
  try {
    await createSubAccount({
      agencyId: aid,
      agencyName: agency.brand.name || agency.name,
      name,
      ownerEmail: field(fd, "ownerEmail", 200) || undefined,
      ownerName: field(fd, "ownerName", 80) || undefined,
      templateId: field(fd, "templateId") || undefined,
    });
  } catch (err) {
    go(`/app/agency/${aid}`, { error: errMsg(err) });
  }
  go(`/app/agency/${aid}`, { ok: `${name} is ready.${field(fd, "ownerEmail") ? " We emailed the owner a login link." : ""}` });
}

export async function setSubAccountStatusAction(aid: string, wid: string, status: "active" | "paused") {
  await requireAgency(aid);
  if (!(await setSubAccountStatus(aid, wid, status))) {
    go(`/app/agency/${aid}`, { error: "The platform paused this account. Contact platform support to turn it back on." });
  }
  go(`/app/agency/${aid}`, { ok: status === "paused" ? "Account paused. Its pages and automations are off." : "Account active again." });
}

export async function saveAgencySettingsAction(aid: string, fd: FormData) {
  await requireAgency(aid);
  const logo = field(fd, "logoUrl", 500);
  try {
    await updateAgencySettings(aid, {
      brand: {
        name: field(fd, "brandName", 80),
        logoUrl: logo ? safeUrl(logo) : "",
        color: /^#[0-9a-fA-F]{6}$/.test(field(fd, "color")) ? field(fd, "color") : undefined,
        supportEmail: field(fd, "supportEmail", 200),
      },
      appDomain: field(fd, "appDomain", 253) || null,
      markupPercent: Number(field(fd, "markupPercent")) || 0,
    });
  } catch (err) {
    go(`/app/agency/${aid}/settings`, { error: errMsg(err).includes("unique") ? "That app domain is already taken." : errMsg(err) });
  }
  go(`/app/agency/${aid}/settings`, { ok: "Saved." });
}

export async function saveTemplateFromWorkspaceAction(aid: string | null, fd: FormData) {
  const wid = field(fd, "workspaceId");
  const ctx = await requireWorkspace(wid, "admin");
  if (aid) await requireAgency(aid);
  else if (!ctx.user.isPlatformAdmin) go(`/app/w/${wid}/settings`, { error: "Only the platform owner can publish platform templates." });
  const name = field(fd, "name", 120) || `${ctx.workspace.name} template`;
  await saveTemplate({ agencyId: aid, name, description: field(fd, "description", 500), workspaceId: wid });
  go(aid ? `/app/agency/${aid}/templates` : "/app/admin/templates", { ok: `Template "${name}" saved.` });
}

export async function deleteTemplateAction(aid: string | null, templateId: string) {
  if (aid) await requireAgency(aid);
  else {
    const user = await requireUser();
    if (!user.isPlatformAdmin) go("/app", { error: "Not allowed." });
  }
  await deleteTemplate(aid, templateId);
  go(aid ? `/app/agency/${aid}/templates` : "/app/admin/templates", { ok: "Template deleted." });
}
