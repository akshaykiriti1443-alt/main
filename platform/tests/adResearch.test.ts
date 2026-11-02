import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/env";
import { adLibraryWebUrl, normalizeAd, searchAdLibrary } from "@/server/meta/adLibrary";
import { analyzeCompetitorAds, parsePastedAds } from "@/server/ai/adResearch";
import { makeWorkspace } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  env.metaAdLibraryToken = "";
});

describe("competitor ad research", () => {
  it("builds Ad Library website links for keywords and pages", () => {
    const k = new URL(adLibraryWebUrl({ q: "fat loss dads", country: "us" }));
    expect(k.searchParams.get("q")).toBe("fat loss dads");
    expect(k.searchParams.get("country")).toBe("US");
    const p = new URL(adLibraryWebUrl({ pageId: "12345" }));
    expect(p.searchParams.get("view_all_page_id")).toBe("12345");
  });

  it("normalises API ads, counts days running and never leaks the token", () => {
    const now = Date.parse("2026-11-03T00:00:00Z");
    const ad = normalizeAd({ id: "99", page_name: "Coach Co", ad_creative_bodies: ["Hi"], ad_delivery_start_time: "2026-09-04", publisher_platforms: ["facebook"] }, now);
    expect(ad.daysRunning).toBe(60);
    expect(ad.snapshotUrl).toBe("https://www.facebook.com/ads/library/?id=99");
  });

  it("searches the API longest-running first, with EU-aware params", async () => {
    env.metaAdLibraryToken = "tok";
    const fetchMock = vi.fn(async (_url: URL) =>
      new Response(
        JSON.stringify({
          data: [
            { id: "1", page_name: "New", ad_creative_bodies: ["new ad"], ad_delivery_start_time: new Date(Date.now() - 2 * 86_400_000).toISOString() },
            { id: "2", page_name: "Old", ad_creative_bodies: ["old ad"], ad_delivery_start_time: new Date(Date.now() - 90 * 86_400_000).toISOString() },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const ads = await searchAdLibrary({ q: "skool coaching" });
    expect(ads.map((a) => a.pageName)).toEqual(["Old", "New"]);
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.pathname).toContain("ads_archive");
    expect(url.searchParams.get("ad_reached_countries")).toBe('["ALL"]');
    expect(url.searchParams.get("search_terms")).toBe("skool coaching");
  });

  it("parses pasted ads and gives a useful read even without AI", async () => {
    const pasted = parsePastedAds("[62 days] Tired of guessing what to eat? Join us.\n\n[3 days] Dads: 20 minutes, 3 times a week.\n---\nshort");
    expect(pasted.map((a) => a.daysRunning)).toEqual([62, 3]);
    const { ws } = await makeWorkspace();
    const res = await analyzeCompetitorAds(ws.id, { ads: pasted, query: "pasted" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.analysis.winners[0].daysRunning).toBe(62);
      expect(res.analysis.drafts.length).toBeGreaterThan(0);
    }
  });
});
