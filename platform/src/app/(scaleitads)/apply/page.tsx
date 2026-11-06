import { scaleitadsBooking } from "@/server/scaleitads";
import { applyPageFor } from "../_site/applyConfig";
import { LegacyPage } from "../_site/legacy";
import { css, html, js } from "../_site/ported/apply";
import { pageMetadata } from "../_site/parts";

// /apply: the free ad account check (qualifying questions, then the booking calendar in the same
// card). This is where every "book a call" goes (BOOKING_URL). Ported verbatim from GoHighLevel.
// Which stack it runs on is decided per request (see _site/applyConfig.ts):
//   SCALEITADS_WORKSPACE + SCALEITADS_CALENDAR set, calendar open -> leads go into our CRM
//     (POST /api/scaleitads/apply) and the card embeds our booking page /b/<workspace>/<calendar>;
//   otherwise -> the GoHighLevel webhook and calendar (link.scaleitads.com), exactly as before.
export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Free ad account check | ScaleitAds",
  description: "45 minutes with me on a screen share. You'll see which number costs you the most, and what fixing it is worth on the budget you already spend.",
  path: "/apply",
});

async function applyPage() {
  const booking = await scaleitadsBooking();
  try {
    return applyPageFor({ html, js }, booking);
  } catch (err) {
    console.error("[scaleitads] /apply stays on GoHighLevel:", err);
    return { html, js };
  }
}

export default async function ApplyPage() {
  const page = await applyPage();
  return <LegacyPage rootId="sia-apply" css={css} html={page.html} js={page.js} />;
}
