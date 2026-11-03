/**
 * The visitor's IP as our own proxy saw it. x-real-ip is set by the proxy (Vercel, nginx), and the
 * last X-Forwarded-For hop is the one our proxy appended. The first X-Forwarded-For value is
 * whatever the client sent, so it is never trusted for limits.
 */
export function clientIp(headers: { get(name: string): string | null }): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return hops.at(-1)?.slice(0, 64) ?? null;
}
