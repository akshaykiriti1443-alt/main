// Which booking stack /apply uses. The page is the GoHighLevel original ported verbatim
// (ported/apply.ts); this file only swaps a handful of exact strings in it, so the page itself is
// never rewritten. Pure (no server imports): the page and the tests both use it.
//
//   booking null -> the ported page untouched: leads go to the GoHighLevel inbound webhook and the
//                   card embeds the GoHighLevel calendar (link.scaleitads.com). Today's behaviour.
//   booking set  -> leads go to POST /api/scaleitads/apply (our CRM) and the card embeds our own
//                   booking page, /b/<workspace>/<calendar>?embed=1&next=/booked, on the same host.
//
// The swaps (each must match exactly once, or nothing is swapped and the page stays on GHL):
//   1. CONFIG.LEAD_WEBHOOK_URL and CONFIG.CALENDAR_URL get our same-origin paths;
//   2. isSet() also accepts a same-origin path ("/x", never "//x"), so those two count as set;
//   3. GoHighLevel's iframe script (link.msgsndr.com/js/form_embed.js) is no longer loaded;
//   4. the "Open it in a new tab" link drops embed=1, so the new tab gets the full booking page;
//   5. a hidden honeypot field joins the form and its value rides along in the lead (as `hp`);
//   6. the static fallback href of that link points at our calendar too;
//   and a small listener is appended: the embedded booking page posts "onex:booking-confirmed" to
//   this window when someone books, which fires the Meta Pixel "Schedule" event (via __siaQ).

export const GHL_LEAD_WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/MZy9LUdfAB1KoJXc5Nfe/webhook-trigger/ccff24aa-bc1c-4d15-b4c9-81906bc1838a";
export const GHL_CALENDAR_URL = "https://link.scaleitads.com/widget/booking/7R3CkgkWmW8DNYUQco7S";

/** Where /apply posts leads when it runs on our own stack (same origin as the page). */
export const APPLY_LEAD_PATH = "/api/scaleitads/apply";
/** Where the booking page sends the visitor once they've booked. */
export const APPLY_NEXT_PATH = "/booked";

export type ApplyBooking = { workspaceSlug: string; calendarSlug: string };
export type ApplyPort = { html: string; js: string };

/** The embedded booking page: chrome-light, prefilled by the page's script, then on to /booked. */
export function applyCalendarPath(b: ApplyBooking) {
  return `/b/${encodeURIComponent(b.workspaceSlug)}/${encodeURIComponent(b.calendarSlug)}?embed=1&next=${encodeURIComponent(APPLY_NEXT_PATH)}`;
}

const SLUG = /^[a-z0-9-]{1,80}$/;

/** Fires the Pixel "Schedule" event when the embedded booking page says someone booked. */
const SCHEDULE_LISTENER = `
;(function () {
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin || !e.data || e.data.type !== "onex:booking-confirmed") return;
    var mine = Array.prototype.some.call(document.querySelectorAll("iframe.cal"), function (f) { return f.contentWindow === e.source; });
    if (!mine) return;
    window.__siaQ = window.__siaQ || [];
    window.__siaQ.push(["std", "Schedule", { content_name: "Free ad account check" }, { once: true }]);
  });
})();
`;

/** Replaces `from` with `to`, and insists `from` appears exactly once. */
function swap(src: string, from: string, to: string, what: string) {
  const at = src.indexOf(from);
  if (at < 0 || src.indexOf(from, at + 1) >= 0) throw new Error(`apply page: can't find exactly one ${what} to swap (was ported/apply.ts regenerated?)`);
  return src.slice(0, at) + to + src.slice(at + from.length);
}

/**
 * The /apply page's markup and script for a booking stack. With no booking, the port comes back
 * exactly as it is (GoHighLevel). Throws if the port no longer contains a string it expects, so a
 * regenerated port fails the tests instead of half-switching the live page.
 */
export function applyPageFor(port: ApplyPort, booking: ApplyBooking | null): ApplyPort {
  if (!booking) return port;
  if (!SLUG.test(booking.workspaceSlug) || !SLUG.test(booking.calendarSlug)) throw new Error("apply page: bad workspace or calendar slug");
  const cal = applyCalendarPath(booking);

  let js = port.js;
  js = swap(
    js,
    `LEAD_WEBHOOK_URL: ${JSON.stringify(GHL_LEAD_WEBHOOK_URL)},   // GHL > Automation > Workflow > Inbound Webhook trigger > copy URL`,
    `LEAD_WEBHOOK_URL: ${JSON.stringify(APPLY_LEAD_PATH)},   // OneX: the lead goes into the CRM (src/server/scaleitads.ts)`,
    "LEAD_WEBHOOK_URL",
  );
  js = swap(js, `CALENDAR_URL: ${JSON.stringify(GHL_CALENDAR_URL)},`, `CALENDAR_URL: ${JSON.stringify(cal)},`, "CALENDAR_URL");
  js = swap(
    js,
    `function isSet(v) { return typeof v === "string" && /^https:\\/\\//.test(v); }`,
    `function isSet(v) { return typeof v === "string" && /^(https:\\/\\/|\\/(?!\\/))/.test(v); }`,
    "isSet()",
  );
  js = swap(
    js,
    `    if (!d.getElementById("sia-ghl-embed")) { var sc = d.createElement("script"); sc.id = "sia-ghl-embed"; sc.async = true; sc.src = "https://link.msgsndr.com/js/form_embed.js"; d.body.appendChild(sc); }\n`,
    "",
    "GoHighLevel embed script",
  );
  js = swap(js, `if (link) link.href = src;`, `if (link) link.href = src.replace("?embed=1&", "?");`, "calendar link");
  js = swap(js, `source: "apply", page: location.pathname`, `source: "apply", page: location.pathname, hp: val("hp")`, "lead payload");
  js += SCHEDULE_LISTENER;

  let html = port.html;
  html = swap(
    html,
    `<p class="s-err" data-err hidden></p>`,
    `<input type="text" name="hp_url" data-f="hp" tabindex="-1" autocomplete="off" aria-hidden="true" hidden><p class="s-err" data-err hidden></p>`,
    "form error line",
  );
  html = swap(html, `href="${GHL_CALENDAR_URL}"`, `href="${cal.replace("?embed=1&", "?").replace(/&/g, "&amp;")}"`, "calendar link href");
  return { html, js };
}
