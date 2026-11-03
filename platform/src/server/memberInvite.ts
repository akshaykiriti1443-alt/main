import { platformInviteUrl, postSkoolInvite } from "./skoolInvite";

// After a direct purchase on /join, invite the buyer into the platform owner's Skool community
// through an official path: Skool's own Webhook plugin or a Zapier hook wired to "Invite Member".
// The URL is set in Admin › Members (or SKOOL_INVITE_WEBHOOK_URL). Retries come from the job queue.
export async function sendSkoolInvite(payload: Record<string, unknown>) {
  const url = await platformInviteUrl();
  if (!url) return;
  const r = await postSkoolInvite(url, { email: String(payload.email ?? ""), name: String(payload.name ?? "") });
  if (!r.ok) throw new Error(`Skool invite webhook answered ${r.status || "nothing"}`);
}
