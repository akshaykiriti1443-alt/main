"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/server/tenancy";
import { errMsg, go } from "@/actions/helpers";
import { scriptCarousel, writeCarousel } from "@/server/ai/carouselWrite";
import { GYM_EXAMPLE, parseCarouselLook, type CarouselSlide } from "@/server/carousel/shape";
import { deleteCarousel, saveCarousel, setCarouselLook } from "@/server/carousel/store";
import { toView, type CarouselView } from "./view";

export type CarouselActionResult = { ok: true; carousel: CarouselView; note?: string; usedAi?: boolean } | { ok: false; error: string };

/** Write it for me: slides from a topic, on the member's own AI (or a starter), saved at once so they can see them. */
export async function writeCarouselAction(wid: string, topic: string, handle: string): Promise<CarouselActionResult> {
  await requireWorkspace(wid, "admin");
  try {
    const res = await writeCarousel(wid, topic);
    if (!res.ok) return res;
    const saved = await saveCarousel(wid, { slides: res.slides, handle }, { source: res.usedAi ? "ai" : "starter", topic, model: res.model });
    if (!saved.ok) return saved;
    revalidatePath(`/app/w/${wid}`, "layout");
    return { ok: true, carousel: toView(saved.carousel), note: res.note, usedAi: res.usedAi };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

/** Turn my script into slides: a pasted ReelVault script as a carousel, saved at once. */
export async function scriptCarouselAction(wid: string, script: string, handle: string): Promise<CarouselActionResult> {
  await requireWorkspace(wid, "admin");
  try {
    const res = await scriptCarousel(wid, script);
    if (!res.ok) return res;
    const saved = await saveCarousel(wid, { slides: res.slides, handle }, { source: "script", model: res.model });
    if (!saved.ok) return saved;
    revalidatePath(`/app/w/${wid}`, "layout");
    return { ok: true, carousel: toView(saved.carousel), note: res.note, usedAi: res.usedAi };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

/** Show me an example: the course's gym carousel, saved so its slides can be seen and downloaded. */
export async function exampleCarouselAction(wid: string, handle: string): Promise<CarouselActionResult> {
  await requireWorkspace(wid, "admin");
  try {
    const saved = await saveCarousel(wid, { ...GYM_EXAMPLE, title: `Example: ${GYM_EXAMPLE.title}`, handle }, { source: "example", topic: "Example: 3 gym days for busy dads" });
    if (!saved.ok) return saved;
    revalidatePath(`/app/w/${wid}`, "layout");
    return { ok: true, carousel: toView(saved.carousel) };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

/** Save changes: the slides as the member edited them (a new carousel when id is null). */
export async function saveCarouselAction(
  wid: string,
  id: string | null,
  draft: { title?: string; handle: string; look: string; slides: CarouselSlide[] },
): Promise<CarouselActionResult> {
  await requireWorkspace(wid, "admin");
  try {
    const saved = await saveCarousel(wid, { ...draft, look: parseCarouselLook(draft.look) }, { id, source: "hand" });
    if (!saved.ok) return saved;
    revalidatePath(`/app/w/${wid}`, "layout");
    return { ok: true, carousel: toView(saved.carousel) };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

/** Try another look: remembered on the carousel, so downloads and the list show it. */
export async function setCarouselLookAction(wid: string, id: string, look: string): Promise<{ ok: boolean }> {
  await requireWorkspace(wid, "admin");
  return { ok: await setCarouselLook(wid, id, parseCarouselLook(look)) };
}

export async function deleteCarouselAction(wid: string, id: string) {
  await requireWorkspace(wid, "admin");
  const gone = await deleteCarousel(wid, id);
  revalidatePath(`/app/w/${wid}`, "layout");
  go(`/app/w/${wid}/carousel`, gone ? { ok: "Carousel deleted." } : { error: "That carousel doesn't exist any more." });
}
