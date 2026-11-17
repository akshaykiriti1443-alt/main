"use server";

import { requireWorkspace } from "@/server/tenancy";
import {
  accountSkoolUrl,
  addPage,
  createSite,
  defaultSection,
  deletePage,
  deleteSite,
  listSites,
  publishSite,
  savePageContent,
  siteBaseUrl,
  unpublishSite,
  updateSite,
} from "@/server/sites";
import { connectDomain, removeDomain } from "@/server/domains";
import { siteThemeSchema } from "@/lib/db/types";
import { safeUrl } from "@/lib/html";
import { PLANS, hasFeature } from "@/server/plans";
import { errMsg, field, go } from "./helpers";

export async function createSiteAction(wid: string, fd: FormData) {
  const { workspace } = await requireWorkspace(wid, "admin");
  const sites = await listSites(wid);
  if (sites.length >= PLANS[workspace.plan].maxSites) go(`/app/w/${wid}/sites`, { error: "You already have as many funnels as your account holds. Delete one to start another." });
  const name = field(fd, "name", 80) || "New funnel";
  const site = await createSite({
    workspaceId: wid,
    name,
    skoolUrl: await accountSkoolUrl(wid, workspace.settings.skoolUrl),
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
  const leadMagnetUrl = field(fd, "leadMagnetUrl", 500);
  if (leadMagnetUrl && !leadMagnetUrl.startsWith("/") && !safeUrl(leadMagnetUrl)) {
    go(`/app/w/${wid}/sites/${siteId}`, { error: "The lead magnet link must start with https:// or be a page like /guide" });
  }
  // The Skool link is not set here: there is one per account, saved in Settings.
  await updateSite(wid, siteId, {
    name: field(fd, "name", 80) || "Funnel",
    leadMagnetName: field(fd, "leadMagnetName", 120),
    leadMagnetUrl,
    ...(theme.success ? { theme: theme.data } : {}),
  });
  go(`/app/w/${wid}/sites/${siteId}`, { ok: "Saved." });
}

export async function publishSiteAction(wid: string, siteId: string) {
  await requireWorkspace(wid, "admin");
  const site = await publishSite(wid, siteId);
  go(`/app/w/${wid}/sites/${siteId}`, { ok: `Published. Your website is live at ${siteBaseUrl(site).replace(/^https?:\/\//, "")}` });
}

export async function unpublishSiteAction(wid: string, siteId: string) {
  await requireWorkspace(wid, "admin");
  await unpublishSite(wid, siteId);
  go(`/app/w/${wid}/sites/${siteId}`, { ok: "Unpublished. Visitors now see a short 'not live yet' note." });
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
