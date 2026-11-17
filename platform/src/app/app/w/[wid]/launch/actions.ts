"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/server/tenancy";
import { kitSite, runLaunchKit } from "@/server/ai/launchKit";
import { accountSkoolUrl, listSites, syncSkoolUrlToSites } from "@/server/sites";
import { PLANS } from "@/server/plans";
import { isSkoolUrl } from "@/server/growth";
import { safeUrl } from "@/lib/html";
import { field, go } from "@/actions/helpers";
import { KIT_FIELDS, readDeal, type KitField } from "./deal";

async function build(wid: string, fd: FormData, useAi: boolean) {
  const { workspace } = await requireWorkspace(wid, "admin");
  const answers = Object.fromEntries(KIT_FIELDS.map(([k, max]) => [k, field(fd, k, max)])) as Record<KitField, string>;
  // Every error comes back to the form with what they typed.
  const back = `/app/w/${wid}/launch?${new URLSearchParams({ new: "1", ...answers }).toString()}`;

  const deal = readDeal(answers.price, answers.trialDays);
  if (!deal.ok) go(back, { error: deal.error });
  if (answers.skoolUrl && !isSkoolUrl(answers.skoolUrl)) go(back, { error: "Your Skool link must be a skool.com link, like https://www.skool.com/your-group" });
  // Building again rewrites the website the last kit made, so only a first kit needs a free slot.
  const max = PLANS[workspace.plan].maxSites;
  if (!(await kitSite(wid)) && (await listSites(wid)).length >= max) {
    go(back, { error: `You already have ${max} websites, the most your account holds. Delete one in Funnels & pages, then build your kit.` });
  }
  // A blank box keeps the link the account already has.
  const skoolUrl = safeUrl(answers.skoolUrl) || (await accountSkoolUrl(wid, workspace.settings.skoolUrl));

  const res = await runLaunchKit(
    wid,
    { ...answers, price: deal.price, trialDays: deal.trialDays, offer: "", skoolUrl, tone: answers.tone || "friendly", brandColor: answers.brandColor || "#2A44EE" },
    useAi ? {} : { useAi: false },
  );
  // When AI couldn't run, the form comes back offering the starter template, so Day 1 never stalls on it.
  if (!res.ok) go(res.code ? `${back}&failed=1` : back, { error: res.error });
  if (skoolUrl) await syncSkoolUrlToSites(wid, skoolUrl);
  revalidatePath(`/app/w/${wid}`, "layout");
  go(`/app/w/${wid}/launch?kit=${res.generationId}`, {
    ok: res.replaced ? "Your kit is rebuilt. Your website's draft and your 3 emails now use it." : "Your launch kit is ready. Your website is built.",
    ...(res.warning ? { warn: res.warning } : {}),
  });
}

/** Build my launch kit: written by AI on the member's key or their included runs. */
export async function buildLaunchKitAction(wid: string, fd: FormData) {
  await build(wid, fd, true);
}

/** The starter template, for a member out of AI runs who wants to keep going now. */
export async function buildStarterKitAction(wid: string, fd: FormData) {
  await build(wid, fd, false);
}
