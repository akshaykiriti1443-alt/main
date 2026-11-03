"use server";

import { requireWorkspace } from "@/server/tenancy";
import { searchAdLibraryFor } from "@/server/meta/adLibrary";
import { analyzeCompetitorAds, parsePastedAds, type ResearchAd } from "@/server/ai/adResearch";
import { errMsg, field, go } from "./helpers";

/** Analyse competitor ads: from an Ad Library search, or ads the owner pasted from the website. */
export async function adResearchAction(wid: string, fd: FormData) {
  await requireWorkspace(wid);
  const q = field(fd, "q", 100);
  const pageId = field(fd, "pageId", 30);
  const country = field(fd, "country", 3) || "ALL";
  const back = `/app/w/${wid}/ads/research?${new URLSearchParams({ q, pageId, country }).toString()}`;

  let ads: ResearchAd[] = [];
  if (fd.get("source") === "paste") {
    ads = parsePastedAds(field(fd, "paste", 30_000));
    if (ads.length === 0) go(back, { error: "Paste at least one ad. Separate ads with a blank line." });
  } else {
    try {
      const found = await searchAdLibraryFor(wid, { q, pageIds: pageId ? [pageId] : [], countries: [country] });
      ads = found.slice(0, 20).map((a) => ({ page: a.pageName, text: [...a.bodies.slice(0, 1), ...a.titles.slice(0, 1)].join(" · "), daysRunning: a.daysRunning }));
    } catch (err) {
      go(back, { error: errMsg(err) });
    }
    if (ads.length === 0) go(back, { error: "No ads to analyse for that search. Try a broader keyword, or paste ads from the Ad Library website." });
  }

  const res = await analyzeCompetitorAds(wid, { ads, query: q || pageId || "pasted ads" });
  if (!res.ok) go(back, { error: res.error });
  go(`${back}&analysis=${res.id}`, { ok: "Your ad research is ready.", ...(res.warning ? { warn: res.warning } : {}) });
}
