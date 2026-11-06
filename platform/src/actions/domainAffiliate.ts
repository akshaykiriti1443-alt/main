"use server";

import { requirePlatformAdmin } from "@/server/auth";
import { setDomainAffiliate } from "@/server/domainAffiliate";
import { isPublicHttpsUrl } from "@/lib/html";
import { field, go } from "./helpers";

const BACK = "/app/admin#domain-affiliate";

/** The platform owner's domain affiliate link, used by every member's "Get a domain" button. */
export async function saveDomainAffiliateAction(fd: FormData) {
  await requirePlatformAdmin();
  const url = field(fd, "url", 2000);
  const partner = field(fd, "partner", 60);
  if (!isPublicHttpsUrl(url.replace(/\{domain\}/g, "example.com"))) {
    go(BACK, { error: "Paste your full https:// affiliate link from Namecheap, Hostinger, GoDaddy or similar." });
  }
  await setDomainAffiliate({ url, partner: partner || "our domain partner" });
  go(BACK, { ok: "Saved. Every member now sees a Get a domain button on their funnel's page." });
}

export async function removeDomainAffiliateAction() {
  await requirePlatformAdmin();
  await setDomainAffiliate(null);
  go(BACK, { ok: "Removed. The Get a domain button is hidden until you add a link again." });
}
