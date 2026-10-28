import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { channelConnections } from "@/lib/db/schema";
import { graph } from "./meta/graph";

// WhatsApp Cloud API through Meta's Embedded Signup. The platform must be a
// Meta "Tech Provider". Customers connect their own number in a popup; this
// finishes the setup on our side.

export async function completeWhatsAppSignup(input: { workspaceId: string; code: string; phoneNumberId: string; wabaId: string }) {
  const token = await graph<{ access_token: string }>("oauth/access_token", {
    params: { client_id: env.metaAppId, client_secret: env.metaAppSecret, code: input.code },
  });
  await graph(`${input.wabaId}/subscribed_apps`, { method: "POST", token: token.access_token });
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  try {
    await graph(`${input.phoneNumberId}/register`, {
      method: "POST",
      token: token.access_token,
      body: { messaging_product: "whatsapp", pin },
    });
  } catch (err) {
    // Numbers that are already registered return an error we can ignore.
    console.warn("[whatsapp] register returned", err instanceof Error ? err.message : err);
  }
  const info = await graph<{ display_phone_number?: string; verified_name?: string }>(input.phoneNumberId, {
    token: token.access_token,
    params: { fields: "display_phone_number,verified_name" },
  });
  const name = [info.verified_name, info.display_phone_number].filter(Boolean).join(" · ") || "WhatsApp";
  const db = await getDb();
  await db
    .insert(channelConnections)
    .values({
      workspaceId: input.workspaceId,
      kind: "whatsapp",
      externalId: input.phoneNumberId,
      name,
      accessTokenEnc: encrypt(token.access_token),
      meta: { wabaId: input.wabaId, pinEnc: encrypt(pin) },
    })
    .onConflictDoUpdate({
      target: [channelConnections.kind, channelConnections.externalId],
      set: { workspaceId: input.workspaceId, name, accessTokenEnc: encrypt(token.access_token), status: "active" },
    });
  return name;
}
