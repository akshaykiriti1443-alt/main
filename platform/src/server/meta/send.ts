import { decrypt } from "@/lib/crypto";
import type { channelConnections } from "@/lib/db/schema";
import { graph } from "./graph";

type Connection = typeof channelConnections.$inferSelect;
const DAY = 86_400_000;

export class OutsideWindowError extends Error {}

export async function sendMetaMessage(input: { connection: Connection; threadId: string; body: string; lastInboundAt: Date | null }) {
  const token = decrypt(input.connection.accessTokenEnc ?? "");
  const withinDay = input.lastInboundAt ? Date.now() - input.lastInboundAt.getTime() < DAY : false;

  if (input.connection.kind === "whatsapp") {
    if (!withinDay) {
      throw new OutsideWindowError("WhatsApp only allows free-form replies within 24 hours of the customer's last message. Send an approved template instead.");
    }
    const res = await graph<{ messages?: { id: string }[] }>(`${input.connection.externalId}/messages`, {
      method: "POST",
      token,
      body: { messaging_product: "whatsapp", recipient_type: "individual", to: input.threadId, type: "text", text: { preview_url: false, body: input.body } },
    });
    return res.messages?.[0]?.id ?? null;
  }

  // Messenger and Instagram both send through the Page's messages endpoint.
  const pageId = input.connection.kind === "instagram" ? input.connection.meta.pageId : input.connection.externalId;
  const withinWeek = input.lastInboundAt ? Date.now() - input.lastInboundAt.getTime() < 7 * DAY : false;
  if (!withinDay && !withinWeek) {
    throw new OutsideWindowError("Meta only allows replies within 7 days of the customer's last message.");
  }
  const res = await graph<{ message_id?: string }>(`${pageId}/messages`, {
    method: "POST",
    token,
    body: {
      recipient: { id: input.threadId },
      message: { text: input.body },
      ...(withinDay ? { messaging_type: "RESPONSE" } : { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" }),
    },
  });
  return res.message_id ?? null;
}

export async function publishToInstagram(connection: Connection, input: { caption: string; imageUrl: string }) {
  if (!input.imageUrl) throw new Error("Instagram posts need an image URL.");
  const token = decrypt(connection.accessTokenEnc ?? "");
  const container = await graph<{ id: string }>(`${connection.externalId}/media`, {
    method: "POST",
    token,
    params: { image_url: input.imageUrl, caption: input.caption },
  });
  const published = await graph<{ id: string }>(`${connection.externalId}/media_publish`, {
    method: "POST",
    token,
    params: { creation_id: container.id },
  });
  return published.id;
}

export async function publishToFacebookPage(connection: Connection, input: { caption: string; imageUrl: string }) {
  const token = decrypt(connection.accessTokenEnc ?? "");
  if (input.imageUrl) {
    const res = await graph<{ id: string; post_id?: string }>(`${connection.externalId}/photos`, {
      method: "POST",
      token,
      params: { url: input.imageUrl, caption: input.caption },
    });
    return res.post_id ?? res.id;
  }
  const res = await graph<{ id: string }>(`${connection.externalId}/feed`, { method: "POST", token, params: { message: input.caption } });
  return res.id;
}
