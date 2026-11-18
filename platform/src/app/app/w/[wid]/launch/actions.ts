"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/server/tenancy";
import { kitSite, runLaunchKit, setKitCoverHeadline } from "@/server/ai/launchKit";
import { COVER_PHOTO_MAX_BYTES, deleteCoverPhoto, saveCoverPhoto } from "@/server/cover/photo";
import { COVER_HEADLINE_MAX, cleanCoverText } from "@/server/cover/cleanText";
import { accountSkoolUrl, listSites, syncSkoolUrlToSites } from "@/server/sites";
import { PLANS } from "@/server/plans";
import { isSkoolUrl } from "@/server/growth";
import { safeUrl } from "@/lib/html";
import { errMsg, field, go } from "@/actions/helpers";
import { suggestKitAnswer, type KitSuggestRequest, type KitSuggestResult } from "@/server/ai/kitSuggest";
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

export type CoverActionResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * "Add my photo": the member's photo for their Skool cover, one per workspace (a new one replaces it).
 * The browser shrinks it first; the server checks the real bytes (PNG or JPEG only, never SVG) and
 * drops camera and location data before saving.
 */
export async function uploadCoverPhotoAction(wid: string, fd: FormData): Promise<CoverActionResult> {
  const { workspace } = await requireWorkspace(wid, "admin");
  const file = fd.get("photo");
  if (!(file instanceof Blob) || !file.size) return { ok: false, error: "Pick a photo first." };
  if (file.size > COVER_PHOTO_MAX_BYTES) return { ok: false, error: "That photo is too big. Try a smaller one (under 1.5 MB), or a screenshot of it." };
  try {
    const res = await saveCoverPhoto(workspace.id, new Uint8Array(await file.arrayBuffer()), { cutout: fd.get("cutout") !== "0" });
    if (!res.ok) return res;
    revalidatePath(`/app/w/${wid}/launch`);
    return { ok: true, message: res.photo.cutout ? "Your photo is on your cover, no background. Nice." : "Your photo is on your cover." };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function removeCoverPhotoAction(wid: string): Promise<CoverActionResult> {
  const { workspace } = await requireWorkspace(wid, "admin");
  await deleteCoverPhoto(workspace.id);
  revalidatePath(`/app/w/${wid}/launch`);
  return { ok: true, message: "Your photo is off your cover." };
}

/** The cover's big words, saved on this kit (and as its answer, so a rebuild keeps them word for word). */
export async function saveCoverHeadlineAction(wid: string, kitId: string, raw: string): Promise<CoverActionResult> {
  const { workspace } = await requireWorkspace(wid, "admin");
  const text = cleanCoverText(raw, COVER_HEADLINE_MAX + 8);
  if (text.length < 3) return { ok: false, error: "Type your cover headline first: the result, in 4 to 8 words." };
  const saved = await setKitCoverHeadline(workspace.id, kitId, text);
  if (!saved) return { ok: false, error: "That kit doesn't exist any more. Reload the page." };
  revalidatePath(`/app/w/${wid}/launch`);
  return { ok: true, message: "Saved. Your cover uses it now." };
}

/** "Suggest" beside a launch kit box: 2 or 3 answers to pick from. Nothing is saved; a click only fills the box. */
export async function suggestKitAnswerAction(wid: string, req: KitSuggestRequest): Promise<KitSuggestResult> {
  await requireWorkspace(wid, "admin");
  try {
    return await suggestKitAnswer(wid, req);
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}
