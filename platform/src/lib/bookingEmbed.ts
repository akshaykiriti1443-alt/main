// Query options of the public booking page (/b/<workspace>/<calendar>), shared by the page (server)
// and the widget (browser). Pure.
//
//   ?name=Jane Smith | ?first_name=Jane&last_name=Smith, ?email=, ?phone=
//       fill the details form (the visitor can still change them).
//   ?embed=1   a chrome-light layout for an iframe on the same site (the ScaleitAds /apply card).
//   ?next=/x   after booking, send the visitor (the top window when framed) to that same-site path,
//              with ?name=<their name> added. Only relative paths: never another site.

export type SearchParams = Record<string, string | string[] | undefined>;
export type BookingPrefill = { name: string; email: string; phone: string };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Trims, drops control characters, collapses runs of spaces and caps the length. */
function clean(v: string, max: number) {
  return v
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function bookingPrefill(sp: SearchParams): BookingPrefill {
  const full = clean(one(sp.name), 120) || clean(`${clean(one(sp.first_name), 60)} ${clean(one(sp.last_name), 60)}`, 120);
  return { name: full, email: clean(one(sp.email), 200).replace(/\s/g, ""), phone: clean(one(sp.phone), 40) };
}

export const isEmbed = (sp: SearchParams) => one(sp.embed) === "1";

const BASE = "https://same-site.invalid";

/**
 * A same-site path to go to after booking, or null. Accepts "/booked", "/thanks?x=1#top"; refuses
 * anything that could leave the site: absolute URLs, "//host", "/\host", "javascript:", control
 * characters or spaces, a path that doesn't start with "/", and dot segments that collapse into
 * "//host" ("/..//evil.com", "/%2e%2e//evil.com").
 */
export function safeNextPath(raw: string | string[] | undefined): string | null {
  const v = one(raw);
  if (!v || v.length > 500 || !v.startsWith("/") || v.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f\s]/.test(v)) return null;
  let u: URL;
  try {
    u = new URL(v, BASE);
  } catch {
    return null;
  }
  if (u.origin !== BASE || !u.pathname.startsWith("/") || u.pathname.startsWith("//")) return null;
  return `${u.pathname}${u.search}${u.hash}`;
}

/** The next path with the booker's name added (?name=), so the page after can greet them. */
export function nextWithName(next: string, name: string): string {
  const safe = safeNextPath(next) ?? "/";
  const u = new URL(safe, BASE);
  const n = clean(name, 120);
  if (n) u.searchParams.set("name", n);
  return `${u.pathname}${u.search}${u.hash}`;
}
