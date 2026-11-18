// Pure helpers for the Skool group link a member pastes. Safe in the browser and on the server.

/** Skool pages that sit at the top level but aren't a group. */
const NOT_A_GROUP = new Set(["discovery", "settings", "signup", "login", "chat", "notifications", "pricing", "about", "terms", "privacy"]);

/**
 * A pasted skool.com group link, tidied to the group's About page:
 * "skool.com/fit-dads/classroom?x=1" becomes "https://www.skool.com/fit-dads/about".
 * Anything that isn't a skool.com group link comes back as typed (trimmed), so the save step
 * can still say what's wrong with it.
 */
export function skoolAboutLink(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  const withScheme = /^(www\.)?skool\.com(\/|$)/i.test(text) ? `https://${text}` : text;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return text;
  }
  if (!/^https?:$/.test(u.protocol) || !/(^|\.)skool\.com$/i.test(u.hostname)) return text;
  const group = u.pathname.split("/").filter(Boolean)[0] ?? "";
  if (!group || group.startsWith("@") || NOT_A_GROUP.has(group.toLowerCase())) return text;
  return `https://www.skool.com/${group}/about`;
}
