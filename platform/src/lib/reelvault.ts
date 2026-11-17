// Server only (reads ONEX_SSO_SECRET): import this from server routes and layouts, never from a client component.
// Client code that needs ReelVault's routes or messages imports src/components/reelvault/routes.ts instead.
import crypto from "node:crypto";
import { env } from "@/lib/env";

/** The shared secret without surrounding whitespace (a stray newline in .env must not break signing). */
function ssoSecret(): string {
  return env.onexSsoSecret.trim();
}

/** ReelVault only accepts tickets signed with a secret of 32+ characters. */
export function reelVaultConfigured(): boolean {
  return ssoSecret().length >= 32;
}

/** ReelVault's origin (scheme://host[:port]): the only origin the embedded frame may talk to. Not a secret. */
export function reelVaultOrigin(): string {
  return new URL(env.reelVaultUrl).origin;
}

/**
 * A single-use sign-in ticket for ReelVault Members:
 * v1.<base64url(JSON)>.<base64url(HMAC-SHA256(secret, "v1." + base64url(JSON)))>
 * ReelVault checks the signature, the expiry and that the nonce is new.
 */
export function makeReelVaultTicket(user: { email: string; name?: string | null }): string {
  const secret = ssoSecret();
  if (!secret || secret.length < 32) throw new Error("ONEX_SSO_SECRET is missing or too short");
  const payload = Buffer.from(
    JSON.stringify({
      email: user.email.trim().toLowerCase(),
      name: user.name ?? "",
      exp: Math.floor(Date.now() / 1000) + 120,
      nonce: crypto.randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(`v1.${payload}`).digest("base64url");
  return `v1.${payload}.${sig}`;
}

/** Inside the OneX page: the frame's parent origin, OneX's theme and the ReelVault route to land on. */
export type ReelVaultEmbed = { parent: string; theme?: "light" | "dark"; to: string };

/**
 * Where the browser goes to be signed in to ReelVault. With `embed`, ReelVault lands in its
 * frame mode (no own navigation) and checks every extra parameter itself; the ticket is the same.
 */
export function reelVaultSignInUrl(user: { email: string; name?: string | null }, embed?: ReelVaultEmbed): string {
  const q = new URLSearchParams({ t: makeReelVaultTicket(user) });
  if (embed) {
    q.set("embed", "1");
    q.set("parent", embed.parent);
    if (embed.theme) q.set("theme", embed.theme);
    q.set("to", embed.to);
  }
  return `${env.reelVaultUrl}/sso/onex?${q.toString()}`;
}

// ---- The findings API (server to server): GET /api/onex/v1/findings on REELVAULT_URL ----

/** Always this literal in the signed string, whatever base URL or proxy is in front of ReelVault. */
export const FINDINGS_PATH = "/api/onex/v1/findings";

export type FindingsHeaders = {
  "X-OneX-Email": string;
  "X-OneX-Timestamp": string;
  "X-OneX-Nonce": string;
  "X-OneX-Signature": string;
};

/** The member email as the API wants it: trimmed and lower-cased, printable ASCII only (else null: don't call). */
export function findingsEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  return /^[\x21-\x7e]+$/.test(e) && e.length <= 254 ? e : null;
}

/**
 * Signs one findings request: HMAC-SHA256 over the 6 lines
 * "onex-api-v1\nGET\n/api/onex/v1/findings\n<email>\n<unix seconds>\n<nonce>" with ONEX_SSO_SECRET,
 * sent as "v1=" + base64url (no padding). `nonce` is only passed by tests; real calls get 16 random bytes.
 */
export function signFindingsRequest(email: string, now: number = Date.now(), nonce: string = crypto.randomBytes(16).toString("hex")): FindingsHeaders {
  const secret = ssoSecret();
  if (secret.length < 32) throw new Error("ONEX_SSO_SECRET is missing or too short");
  const e = findingsEmail(email);
  if (!e) throw new Error("That email can't be sent to ReelVault.");
  if (!/^[0-9a-f]{32}$/.test(nonce)) throw new Error("The nonce must be 32 lowercase hex characters.");
  const ts = String(Math.floor(now / 1000));
  const msg = ["onex-api-v1", "GET", FINDINGS_PATH, e, ts, nonce].join("\n");
  const sig = crypto.createHmac("sha256", secret).update(msg, "utf8").digest("base64url");
  return { "X-OneX-Email": e, "X-OneX-Timestamp": ts, "X-OneX-Nonce": nonce, "X-OneX-Signature": `v1=${sig}` };
}
