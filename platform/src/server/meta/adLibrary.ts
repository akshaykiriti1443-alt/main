import { env } from "@/lib/env";
import { graph } from "./graph";

// Meta Ad Library: see what ads competitors are running right now.
//
// The API (graph.facebook.com/ads_archive) needs a user access token from someone who has
// confirmed their identity for the Ad Library API (META_AD_LIBRARY_TOKEN). One caveat Meta states
// plainly: ads that didn't reach any EU country only come back if they are about social issues,
// elections or politics. So for ads shown only in the US, India etc. the API is blind, and the
// Ad Library website (adLibraryWebUrl) is the complete view. We always offer both.

export type LibraryAd = {
  id: string;
  pageId: string;
  pageName: string;
  bodies: string[];
  titles: string[];
  descriptions: string[];
  startedAt: string | null;
  stoppedAt: string | null;
  daysRunning: number;
  platforms: string[];
  snapshotUrl: string;
  euReach: number | null;
};

export const adLibraryConfigured = () => Boolean(env.metaAdLibraryToken);

/** The Ad Library website search: shows every active ad, in any country. */
export function adLibraryWebUrl(input: { q?: string; pageId?: string; country?: string }) {
  const u = new URL("https://www.facebook.com/ads/library/");
  u.searchParams.set("active_status", "active");
  u.searchParams.set("ad_type", "all");
  u.searchParams.set("country", (input.country || "ALL").toUpperCase());
  u.searchParams.set("media_type", "all");
  if (input.pageId) {
    u.searchParams.set("view_all_page_id", input.pageId);
    u.searchParams.set("search_type", "page");
  } else {
    u.searchParams.set("q", input.q ?? "");
    u.searchParams.set("search_type", "keyword_unordered");
  }
  return u.toString();
}

type RawAd = {
  id: string;
  page_id?: string;
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  publisher_platforms?: string[];
  eu_total_reach?: number;
};

const FIELDS = [
  "id",
  "page_id",
  "page_name",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "ad_creative_link_descriptions",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "publisher_platforms",
  "eu_total_reach",
].join(",");

export function normalizeAd(a: RawAd, now = Date.now()): LibraryAd {
  const start = a.ad_delivery_start_time ? Date.parse(a.ad_delivery_start_time) : NaN;
  const stop = a.ad_delivery_stop_time ? Date.parse(a.ad_delivery_stop_time) : NaN;
  const end = Number.isFinite(stop) ? stop : now;
  return {
    id: a.id,
    pageId: a.page_id ?? "",
    pageName: a.page_name ?? "",
    bodies: (a.ad_creative_bodies ?? []).filter(Boolean),
    titles: (a.ad_creative_link_titles ?? []).filter(Boolean),
    descriptions: (a.ad_creative_link_descriptions ?? []).filter(Boolean),
    startedAt: a.ad_delivery_start_time ?? null,
    stoppedAt: a.ad_delivery_stop_time ?? null,
    daysRunning: Number.isFinite(start) ? Math.max(0, Math.round((end - start) / 86_400_000)) : 0,
    platforms: a.publisher_platforms ?? [],
    // The API's snapshot URL needs our token, so link to the public Ad Library page instead.
    snapshotUrl: `https://www.facebook.com/ads/library/?id=${encodeURIComponent(a.id)}`,
    euReach: a.eu_total_reach ?? null,
  };
}

/**
 * Search active ads by keyword or by competitor Page id(s). Longest-running first: an ad that has
 * run for months is usually one that pays for itself.
 */
export async function searchAdLibrary(input: { q?: string; pageIds?: string[]; countries?: string[]; limit?: number }): Promise<LibraryAd[]> {
  if (!env.metaAdLibraryToken) throw new Error("The Ad Library API isn't connected on this server (META_AD_LIBRARY_TOKEN). Use the Ad Library link instead.");
  const q = (input.q ?? "").trim().slice(0, 100);
  const pageIds = (input.pageIds ?? []).filter((p) => /^\d{3,30}$/.test(p)).slice(0, 10);
  if (!q && pageIds.length === 0) return [];
  const res = await graph<{ data?: RawAd[] }>("ads_archive", {
    token: env.metaAdLibraryToken,
    params: {
      ad_reached_countries: JSON.stringify(input.countries?.length ? input.countries : ["ALL"]),
      ad_active_status: "ACTIVE",
      ad_type: "ALL",
      fields: FIELDS,
      limit: String(Math.min(50, input.limit ?? 30)),
      ...(q ? { search_terms: q, search_type: "KEYWORD_UNORDERED" } : {}),
      ...(pageIds.length ? { search_page_ids: JSON.stringify(pageIds) } : {}),
    },
  });
  return (res.data ?? []).map((a) => normalizeAd(a)).sort((a, b) => b.daysRunning - a.daysRunning);
}
