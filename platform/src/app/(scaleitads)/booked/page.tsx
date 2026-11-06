import { LegacyPage } from "../_site/legacy";
import { css, html, js } from "../_site/ported/booked";
import { pageMetadata } from "../_site/parts";

// /booked: the page the calendar sends people to after booking. Ported verbatim from GoHighLevel.
export const metadata = pageMetadata({ title: "You're booked | ScaleitAds", description: "Two quick steps before your call with Akshay.", path: "/booked" });

export default function BookedPage() {
  return <LegacyPage rootId="sia-booked" css={css} html={html} js={js} />;
}
