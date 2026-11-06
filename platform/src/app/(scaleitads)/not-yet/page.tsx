import { WATCH_VIDEO } from "../_site/config";
import { LegacyPage } from "../_site/legacy";
import { css, html, js } from "../_site/ported/not-yet";
import { pageMetadata } from "../_site/parts";

// /not-yet: the free plan for visitors spending under $50 a day (linked from /apply). Ported
// verbatim from GoHighLevel. It plays the same 5-minute video as /watch, straight from
// WATCH_VIDEO.src in a <video> tag (so keep an MP4 or HLS URL there when the video moves).
export const metadata = pageMetadata({ title: "Run Meta ads on $15 to $30 a day | ScaleitAds", description: "A free video on running Meta ads yourself on a small budget.", path: "/not-yet" });

export default function NotYetPage() {
  return <LegacyPage rootId="sia-notyet" css={css} html={html.replace("__WATCH_VIDEO_SRC__", WATCH_VIDEO.src)} js={js} />;
}
