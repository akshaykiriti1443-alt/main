// ReelVault inside OneX: the addresses, the menu table and the messages between the page and its frame.
// Client-safe on purpose: no secrets, no server imports. The secret lives in src/lib/reelvault.ts (server only).

/**
 * Every screen ReelVault lets OneX open, as its hash route without "#". Character for character the same
 * as ReelVault's ROUTE_RE (Python and JS). admin, login, join, reset and verify are left out on purpose.
 */
export const ROUTE_RE =
  /^(home|onboarding|competitors|competitor|discover|reels|reel|working|format|banks|create|outputs|output|settings|help|privacy)(\/[A-Za-z0-9_-]{1,64}){0,2}(\?[A-Za-z0-9_.~%+=&-]{1,200})?$/;
export const ROUTE_MAX = 300;
const SEGMENT_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isReelVaultRoute(r: unknown): r is string {
  return typeof r === "string" && r.length > 0 && r.length <= ROUTE_MAX && ROUTE_RE.test(r);
}

/** Percent-encodes every query character ROUTE_RE refuses (URLSearchParams leaves * as is; encodeURIComponent leaves ! ' ( ) *). */
function encodeQueryForRoute(q: string): string | null {
  try {
    return q.replace(/[^A-Za-z0-9_.~%+=&-]/gu, (c) =>
      encodeURIComponent(c).replace(/[!'()*]/g, (x) => `%${x.charCodeAt(0).toString(16).toUpperCase()}`),
    );
  } catch {
    return null; // a lone surrogate
  }
}

/**
 * A route the frame reported, in a form OneX can mirror:
 * - the route itself if it passes ROUTE_RE;
 * - else the same screen and query, with the characters ROUTE_RE refuses percent-encoded
 *   (ReelVault's own searches can hold * or !). sameRoute() counts both as the same screen;
 * - else (a query too long even for that) the screen without its query;
 * - else null.
 */
export function mirrorableRoute(r: unknown): string | null {
  if (isReelVaultRoute(r)) return r;
  if (typeof r !== "string" || r.length > ROUTE_MAX) return null;
  const at = r.indexOf("?");
  if (at === -1) return null;
  const path = r.slice(0, at);
  if (!isReelVaultRoute(path)) return null;
  const q = encodeQueryForRoute(r.slice(at + 1));
  const withQuery = q ? `${path}?${q}` : path;
  return isReelVaultRoute(withQuery) ? withQuery : path;
}

/**
 * The ReelVault route for a OneX address: /app/w/W/reelvault/<name>[/<a>[/<b>]][?q] -> <name>[/<a>[/<b>]][?q].
 * /app/w/W/reelvault is "home". `search` is a query string with or without its "?". Anything else is "home".
 */
export function routeFromPath(pathname: string, search: string, base: string): string {
  const root = `${base}/reelvault`;
  let rest: string;
  if (pathname === root || pathname === `${root}/`) rest = "";
  else if (pathname.startsWith(`${root}/`)) rest = pathname.slice(root.length + 1).replace(/\/$/, "");
  else return "home";
  const segments = rest ? rest.split("/") : [];
  if (!segments.every((s) => SEGMENT_RE.test(s))) return "home";
  const q = search.replace(/^\?/, "");
  const route = (segments.length ? segments.join("/") : "home") + (q ? `?${q}` : "");
  return isReelVaultRoute(route) ? route : "home";
}

/** The OneX address for a ReelVault route. "home" is /app/w/W/reelvault itself. */
export function oneXUrl(route: string, base: string): string {
  const root = `${base}/reelvault`;
  if (!isReelVaultRoute(route)) return root;
  const at = route.indexOf("?");
  const path = at === -1 ? route : route.slice(0, at);
  const query = at === -1 ? "" : route.slice(at);
  return (path === "home" ? root : `${root}/${path}`) + query;
}

/**
 * Two routes for the same screen? The query is compared the way the address bar re-writes it
 * (URLSearchParams), so "reels?q=a%20b" and "reels?q=a+b" never bounce between page and frame.
 */
export function sameRoute(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return a === b;
  const norm = (r: string) => {
    const at = r.indexOf("?");
    if (at === -1) return r;
    const q = new URLSearchParams(r.slice(at + 1)).toString();
    return q ? `${r.slice(0, at)}?${q}` : r.slice(0, at);
  };
  return a === b || norm(a) === norm(b);
}

/** The ReelVault sub-items in the OneX sidebar: label, first path segment, and segments that also light it up. */
export const RV_SUBNAV = [
  { label: "Competitors", path: "competitors", also: ["competitor", "discover"] },
  { label: "Reels", path: "reels", also: ["reel"] },
  { label: "What works", path: "working", also: ["format", "banks"] },
  { label: "Create", path: "create", also: [] },
  { label: "Outputs", path: "outputs", also: ["output"] },
  { label: "Settings", path: "settings", also: [] },
] as const satisfies readonly { label: string; path: string; also: readonly string[] }[];

export type RvSubItem = { href: string; label: string; also?: string[] };

/** RV_SUBNAV as sidebar children for a workspace: full hrefs and full "also active" prefixes. */
export function reelVaultSubnav(base: string): RvSubItem[] {
  return RV_SUBNAV.map((s) => ({
    href: `${base}/reelvault/${s.path}`,
    label: s.label,
    also: s.also.map((a) => `${base}/reelvault/${a}`),
  }));
}

/** The whole ReelVault menu item, ready for the workspace menu (once NavItem has `children`). */
export function reelVaultNavItem(base: string) {
  return {
    href: `${base}/reelvault`,
    label: "ReelVault",
    icon: "reel" as const,
    hint: "Study your competitors' reels and turn the winners into your scripts.",
    children: reelVaultSubnav(base),
  };
}

/** Segment-exact prefix match: /reelvault/reel matches /reelvault/reel/x, never /reelvault/reels. */
export function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** The sidebar child for an address (its href or one of its `also` prefixes), if any. */
export function activeSubItem<T extends RvSubItem>(pathname: string, children: readonly T[]): T | undefined {
  return children.find((c) => matchesPrefix(pathname, c.href) || (c.also ?? []).some((p) => matchesPrefix(pathname, p)));
}

// ---- Messages (window.postMessage). Never a ticket, cookie, token, secret or email. ----

export const RV_ERROR_CODES = ["not_set_up", "bad_link", "expired", "used", "turned_off", "too_many"] as const;
export type RvErrorCode = (typeof RV_ERROR_CODES)[number];

/** From the ReelVault frame up to OneX. */
export type RvToOneX =
  | { type: "rv:ready"; route: string; title: string }
  | { type: "rv:route"; route: string; title: string }
  | { type: "rv:height"; height: number }
  | { type: "rv:toast"; text: string }
  | { type: "rv:signed-out" }
  | { type: "rv:error"; code: string; message: string };

/** From OneX down to the ReelVault frame. */
export type OneXToRv = { type: "onex:theme"; theme: "light" | "dark" } | { type: "onex:navigate"; route: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * A message from the frame, checked field by field, or null to ignore it silently.
 * The caller checks event.origin and event.source first. Routes are checked again by the caller (ROUTE_RE).
 */
export function parseRvMessage(data: unknown): RvToOneX | null {
  if (!isPlainObject(data) || typeof data.type !== "string" || !data.type.startsWith("rv:")) return null;
  switch (data.type) {
    case "rv:ready":
    case "rv:route":
      if (typeof data.route !== "string" || data.route.length > ROUTE_MAX) return null;
      return { type: data.type, route: data.route, title: str(data.title, 120) };
    case "rv:height": {
      const h = data.height;
      return typeof h === "number" && Number.isInteger(h) && h >= 0 && h <= 100_000 ? { type: "rv:height", height: h } : null;
    }
    case "rv:toast": {
      const text = str(data.text, 300).trim();
      return text ? { type: "rv:toast", text } : null;
    }
    case "rv:signed-out":
      return { type: "rv:signed-out" };
    case "rv:error": {
      const code = typeof data.code === "string" && /^[a-z_]{1,40}$/.test(data.code) ? data.code : null;
      return code ? { type: "rv:error", code, message: str(data.message, 300) } : null;
    }
    default:
      return null;
  }
}
