// Which win to show on the home page, from what the member has already seen. Pure, for tests.

export const WINS_COOKIE = "onx_wins";
export const WEEK_SEEN_COOKIE = "onx_week_seen";

export const eventKey = (k: string) => `ev:${k}`;

/**
 * `all` is every done step key, then every real event that happened (as ev:<name>). The cookie
 * holds "<last shown>|<every key seen>". With no cookie yet, everything is marked seen and
 * nothing shows, so a first visit never fakes a win. The newest unseen key wins; with none, the
 * last one shown stays until a new one replaces it.
 */
export function pickWin(all: string[], cookie: string | undefined): { show: string | null; write: string } {
  if (cookie === undefined) return { show: null, write: `|${all.join(",")}` };
  const [last = "", list = ""] = cookie.split("|");
  const seen = new Set(list.split(",").filter(Boolean));
  const missing = all.filter((k) => !seen.has(k));
  const show = missing.at(-1) ?? (last && all.includes(last) ? last : null);
  return { show, write: `${show ?? ""}|${all.join(",")}` };
}
