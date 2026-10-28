"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/server/tenancy";
import { runLaunchKit } from "@/server/ai/launchKit";
import {
  addPage,
  createSite,
  defaultSection,
  deletePage,
  deleteSite,
  listSites,
  publishSite,
  savePageContent,
  unpublishSite,
  updateSite,
} from "@/server/sites";
import { connectDomain, removeDomain } from "@/server/domains";
import { siteThemeSchema } from "@/lib/db/types";
import { safeUrl } from "@/lib/html";
import { PLANS, hasFeature } from "@/server/plans";
import { errMsg, field, go } from "./helpers";

export async function launchKitAction(wid: string, fd: FormData) {
  const { workspace } = await requireWorkspace(wid, "admin");
  const sites = await listSites(wid);
  if (sites.length >= PLANS[workspace.plan].maxSites) {
    go(`/app/w/${wid}/launch`, { error: `Your plan includes ${PLANS[workspace.plan].maxSites} sites. Delete one or upgrade to add more.` });
  }
  const res = await runLaunchKit(wid, {
    businessName: field(fd, "businessName", 80),
    ownerName: field(fd, "ownerName", 60),
    niche: field(fd, "niche", 160),
    audience: field(fd, "audience", 200),
    outcome: field(fd, "outcome", 200),
    leadMagnetIdea: field(fd, "leadMagnetIdea", 200),
    offer: field(fd, "offer", 200),
    skoolUrl: safeUrl(field(fd, "skoolUrl", 300)),
    tone: field(fd, "tone") || "friendly",
    brandColor: field(fd, "brandColor") || "#2A44EE",
  });
  if (!res.ok) go(`/app/w/${wid}/launch`, { error: res.error });
  revalidatePath(`/app/w/${wid}`, "layout");
  go(`/app/w/${wid}/launch?kit=${res.generationId}`, { ok: "Your launch kit is ready. Your funnel is built.", ...(res.warning ? { warn: res.warning } : {}) });
}

export async function createSiteAction(wid: string, fd: FormData) {
  const { workspace } = await requireWorkspace(wid, "admin");
  const sites = await listSites(wid);
  if (sites.length >= PLANS[workspace.plan].maxSites) go(`/app/w/${wid}/sites`, { error: "You've reached your plan's site limit." });
  const name = field(fd, "name", 80) || "New funnel";
  const site = await createSite({
    workspaceId: wid,
    name,
    skoolUrl: workspace.settings.skoolUrl ?? "",
    pages: [
      { slug: "", title: "Opt-in page", kind: "optin", content: { sections: [defaultSection("hero"), defaultSection("benefits"), defaultSection("faq"), defaultSection("form")] } },
      { slug: "thank-you", title: "Thank-you page", kind: "thankyou", content: { sections: [defaultSection("cta")] } },
    ],
  });
  go(`/app/w/${wid}/sites/${site.id}`, { ok: "Funnel created. Edit the pages, then publish." });
}

export async function updateSiteAction(wid: string, siteId: string, fd: FormData) {
  await requireWorkspace(wid, "admin");
  const theme = siteThemeSchema.safeParse({ style: field(fd, "style"), brandColor: field(fd, "brandColor"), font: field(fd, "font") });
  const skoolUrl = field(fd, "skoolUrl", 300);
  const leadMagnetUrl = field(fd, "leadMagnetUrl", 500);
  if (skoolUrl && !safeUrl(skoolUrl)) go(`/app/w/${wid}/sites/${siteId}`, { error: "Your Skool link must start with https://" });
  if (leadMagnetUrl && !leadMagnetUrl.startsWith("/") && !safeUrl(leadMagnetUrl)) {
    go(`/app/w/${wid}/sites/${siteId}`, { error: "The lead magnet link must start with https:// or be a page like /guide" });
  }
  await updateSite(wid, siteId, {
    name: field(fd, "name", 80) || "Funnel",
    skoolUrl: skoolUrl ? safeUrl(skoolUrl) : "",
    leadMagnetName: field(fd, "leadMagnetName", 120),
    leadMagnetUrl,
    ...(theme.success ? { theme: theme.data } : {}),
  });
  go(`/app/w/${wid}/sites/${siteId}`, { ok: "Saved." });
}

export async function publishSiteAction(wid: string, siteId: string) {
  await requireWorkspace(wid, "admin");
  await publishSite(wid, siteId);
  go(`/app/w/${wid}/sites/${siteId}`, { ok: "Published. Your pages are live." });
}

export async function unpublishSiteAction(wid: string, siteId: string) {
  await requireWorkspace(wid, "admin");
  await unpublishSite(wid, siteId);
  go(`/app/w/${wid}/sites/${siteId}`, { ok: "Unpublished. Visitors see a 'not live' notice." });
}

export async function deleteSiteAction(wid: string, siteId: string) {
  await requireWorkspace(wid, "admin");
  await removeDomain(wid, siteId).catch(() => undefined);
  await deleteSite(wid, siteId);
  go(`/app/w/${wid}/sites`, { ok: "Funnel deleted." });
}

export async function addPageAction(wid: string, siteId: string, fd: FormData) {
  await requireWorkspace(wid, "admin");
  let pageId: string | null = null;
  let error: string | null = null;
  try {
    const page = await addPage(wid, siteId, {
      title: field(fd, "title", 120) || "New page",
      slug: field(fd, "slug", 60) || "page",
      kind: (field(fd, "kind") as "custom" | "thankyou" | "sales") || "custom",
    });
    pageId = page.id;
  } catch (err) {
    error = errMsg(err).includes("unique") ? "A page with that address already exists." : errMsg(err);
  }
  if (error || !pageId) go(`/app/w/${wid}/sites/${siteId}`, { error: error ?? "Couldn't add the page." });
  go(`/app/w/${wid}/sites/${siteId}/pages/${pageId}`);
}

export async function deletePageAction(wid: string, siteId: string, pageId: string) {
  await requireWorkspace(wid, "admin");
  await deletePage(wid, pageId);
  go(`/app/w/${wid}/sites/${siteId}`, { ok: "Page deleted." });
}

// Called from the client editor with structured content.
export async function savePageAction(wid: string, pageId: string, content: unknown, title: string): Promise<{ ok: boolean; error?: string }> {
  await requireWorkspace(wid, "admin");
  try {
    await savePageContent(wid, pageId, content, title.slice(0, 120) || undefined);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name === "ZodError" ? "Some fields are too long. Shorten them and save again." : errMsg(err) };
  }
}

export async function connectDomainAction(wid: string, siteId: string, fd: FormData) {
  const { workspace } = await requireWorkspace(wid, "admin");
  if (!hasFeature(workspace.plan, "custom_domains")) go(`/app/w/${wid}/sites/${siteId}`, { error: "Custom domains are on the Growth plan." });
  let msg: { ok?: string; error?: string };
  try {
    const res = await connectDomain(wid, siteId, field(fd, "domain", 253));
    msg = { ok: `Add a ${res.dns.type} record: ${res.dns.name} → ${res.dns.value}. We'll check it automatically.` };
  } catch (err) {
    msg = { error: errMsg(err) };
  }
  go(`/app/w/${wid}/sites/${siteId}`, msg);
}

export async function removeDomainAction(wid: string, siteId: string) {
  await requireWorkspace(wid, "admin");
  await removeDomain(wid, siteId);
  go(`/app/w/${wid}/sites/${siteId}`, { ok: "Domain removed." });
}
