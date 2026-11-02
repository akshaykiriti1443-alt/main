import { env } from "@/lib/env";

// After a direct purchase, invite the buyer into the Skool community through an official path:
// a Zapier catch hook wired to Skool's "Invite Member" action, or Skool's own Webhook plugin.
// No Skool login is stored or used. Retries come from the job queue.
export async function sendSkoolInvite(payload: Record<string, unknown>) {
  if (!env.skoolInviteWebhookUrl) return;
  const email = String(payload.email ?? "");
  const [first, ...rest] = String(payload.name ?? "").trim().split(/\s+/);
  const res = await fetch(env.skoolInviteWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, first_name: first ?? "", last_name: rest.join(" ") }),
  });
  if (!res.ok) throw new Error(`Skool invite webhook answered ${res.status}`);
}
