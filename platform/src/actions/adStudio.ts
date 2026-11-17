"use server";

import { requireWorkspace } from "@/server/tenancy";
import { updateWorkspaceSettings } from "@/server/workspace";
import { setAccountSkoolUrl } from "@/server/sites";
import { isSkoolUrl } from "@/server/growth";
import { isUuid } from "@/lib/util";
import { parsePastedAds, type ResearchAd } from "@/server/ai/adResearch";
import { latestResearchAds, makeAdStudioPack, STUDIO_DESTINATIONS, type StudioDestination } from "@/server/ai/adStudio";
import { provenHooksFromForm } from "@/server/reelvault";
import { field, go } from "./helpers";

/** "Make my 5 statics": the Ad studio form. */
export async function adStudioAction(wid: string, fd: FormData) {
  const { workspace, user } = await requireWorkspace(wid);
  const back = `/app/w/${wid}/ads/studio`;

  // $5, $10 or their own amount.
  const pick = field(fd, "budget", 10);
  const budget = Number(pick === "other" ? field(fd, "budgetOther", 10).replace(/[$,\s]/g, "") : pick);
  if (!Number.isFinite(budget) || budget < 1) go(back, { error: "Pick a daily budget: $5, $10 or your own amount (at least $1)." });

  // Long-running ads ticked from the last Ad research run, plus any pasted ones.
  let competitorAds: ResearchAd[] = [];
  const researchId = field(fd, "researchId", 60);
  const picked = fd.getAll("pick").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0);
  if (isUuid(researchId) && picked.length) {
    const research = await latestResearchAds(wid);
    if (research?.id === researchId) competitorAds = picked.map((i) => research.ads[i]).filter(Boolean);
  }
  competitorAds = [...competitorAds, ...parsePastedAds(field(fd, "paste", 20_000))]
    .map((a) => ({ page: a.page.slice(0, 80), text: a.text.replace(/\s+/g, " ").trim().slice(0, 1200), daysRunning: Math.max(0, Math.min(5000, Math.round(a.daysRunning) || 0)) }))
    .slice(0, 10);

  // ReelVault hooks the member ticked, re-read from ReelVault ([] when off, unconfirmed or nothing ticked).
  const provenHooks = await provenHooksFromForm(fd, user);

  const answers = {
    businessName: field(fd, "businessName", 80),
    niche: field(fd, "niche", 160),
    offer: field(fd, "offer", 200),
    audience: field(fd, "audience", 200),
    promise: field(fd, "promise", 200),
    proof: field(fd, "proof", 400),
    price: Number(field(fd, "price", 10).replace(/[$,\s]/g, "")) || 0,
    budget,
    country: field(fd, "country", 2) || "US",
    tone: field(fd, "tone", 10) || "friendly",
    destination: STUDIO_DESTINATIONS.find((d): d is StudioDestination => d === field(fd, "destination", 10)),
    competitorAds,
    provenHooks,
  };

  // First time they tell us these, keep them, so every other page knows too. The offer isn't kept:
  // the account's offer is the paid deal from the launch kit, and a pack's offer follows where its ads go.
  const s = workspace.settings;
  const skoolUrl = field(fd, "skoolUrl", 300);
  if (skoolUrl && !isSkoolUrl(skoolUrl)) go(back, { error: "Your Skool link must be a skool.com link, like https://www.skool.com/your-group" });
  const patch = {
    ...(!s.niche && answers.niche ? { niche: answers.niche } : {}),
    ...(!s.audience && answers.audience ? { audience: answers.audience } : {}),
  };
  if (Object.keys(patch).length) await updateWorkspaceSettings(wid, patch);
  // One link per account: the Join buttons on their website use it too.
  if (!s.skoolUrl && skoolUrl) await setAccountSkoolUrl(wid, skoolUrl);

  const res = await makeAdStudioPack(wid, answers, { researchId: competitorAds.length && isUuid(researchId) ? researchId : undefined });
  if (!res.ok) go(back, { error: res.error });
  go(`${back}?pack=${res.id}`, { ok: "Your 5 statics are ready.", ...(res.warning ? { warn: res.warning } : {}) });
}
