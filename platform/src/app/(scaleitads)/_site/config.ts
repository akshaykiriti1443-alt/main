// ScaleitAds agency site (scaleitads.com): one place for the links and media the pages use.
// The pages were rebuilt from the GoHighLevel originals (Nov 2026) and keep their look and copy.

export const SITE_URL = "https://scaleitads.com";
export const SITE_NAME = "ScaleitAds";
export const CONTACT_EMAIL = "akshay@scaleitads.com";

/**
 * Where every "book a call" points: /apply, the qualifying form + the booking calendar in one card,
 * ported unchanged from the old site. It runs on GoHighLevel (webhook + calendar) until
 * SCALEITADS_WORKSPACE and SCALEITADS_CALENDAR are set, then on the app's own CRM and booking page
 * (see apply/page.tsx and src/server/scaleitads.ts). Either way this stays "/apply".
 */
export const BOOKING_URL = "/apply";

/** The Skool Growth Program page (the course + the app), linked from the footer. */
export const SKOOL_PAGE_URL = "/skool";

/**
 * The 5-minute video on /watch.
 * MOVE BEFORE LEAVING GOHIGHLEVEL: `src` is still on GoHighLevel's file host (29.4 MB MP4, 1280x720).
 * Upload it to Bunny Stream, Vimeo or YouTube (unlisted), then:
 *  - /watch: set `embedUrl` to the player URL (e.g. "https://www.youtube-nocookie.com/embed/<id>",
 *    Bunny's "https://iframe.mediadelivery.net/embed/<lib>/<id>") and it switches to an iframe player;
 *  - /not-yet plays `src` in a plain <video>, so point `src` at a direct MP4/HLS URL (Bunny Stream
 *    and Vimeo Pro give one; YouTube doesn't).
 */
export const WATCH_VIDEO: { src: string; poster: string; embedUrl?: string } = {
  src: "https://assets.cdn.filesafe.space/MZy9LUdfAB1KoJXc5Nfe/media/6ac946ff4770fb500bbf7cac.mp4",
  poster: "/scaleitads/watch-poster.jpg",
  embedUrl: undefined,
};

/** Meta Pixel + Microsoft Clarity, loaded by the cookie banner (same IDs as the old site). */
export const PIXEL_ID = "1998614557493094";
export const CLARITY_ID = "yv15rrv82j";
