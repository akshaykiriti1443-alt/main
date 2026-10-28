import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { channelConnections, webhookEvents } from "@/lib/db/schema";
import { hmacHex, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { ingestInbound, ingestOutboundEcho, updateMessageStatus } from "../inbox";

export function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  if (!env.metaAppSecret || !header?.startsWith("sha256=")) return false;
  return safeEqual(`sha256=${hmacHex(env.metaAppSecret, rawBody)}`, header);
}

type MessagingEvent = {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: { type?: string }[] };
  postback?: { title?: string; payload?: string; mid?: string };
};

type WaValue = {
  metadata?: { phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: { from: string; id: string; timestamp?: string; type?: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }[];
  statuses?: { id: string; status: string; errors?: { title?: string }[] }[];
};

type MetaPayload = {
  object?: string;
  entry?: { id?: string; messaging?: MessagingEvent[]; changes?: { field?: string; value?: WaValue }[] }[];
};

async function findConnection(kind: "facebook_page" | "instagram" | "whatsapp", externalId: string) {
  const db = await getDb();
  const [conn] = await db
    .select()
    .from(channelConnections)
    .where(and(eq(channelConnections.kind, kind), eq(channelConnections.externalId, externalId), eq(channelConnections.status, "active")))
    .limit(1);
  return conn ?? null;
}

function messageText(m: MessagingEvent["message"]) {
  if (!m) return "";
  if (m.text) return m.text;
  const kind = m.attachments?.[0]?.type;
  return kind ? `[${kind}]` : "[message]";
}

export async function processMetaPayload(payload: MetaPayload) {
  if (payload.object === "page" || payload.object === "instagram") {
    const kind = payload.object === "page" ? "facebook_page" : "instagram";
    const channel = payload.object === "page" ? "facebook" : "instagram";
    for (const entry of payload.entry ?? []) {
      for (const ev of entry.messaging ?? []) {
        const senderId = ev.sender?.id;
        const recipientId = ev.recipient?.id;
        if (!senderId || !recipientId) continue;
        const echo = Boolean(ev.message?.is_echo);
        // For echoes the business is the sender; the thread is the recipient.
        const businessId = echo ? senderId : recipientId;
        const threadId = echo ? recipientId : senderId;
        const conn = await findConnection(kind, businessId);
        if (!conn) continue;
        const at = ev.timestamp ? new Date(ev.timestamp) : new Date();
        if (echo) {
          await ingestOutboundEcho({ connection: conn, channel, threadId, externalId: ev.message?.mid ?? null, body: messageText(ev.message), at });
        } else if (ev.message || ev.postback) {
          const body = ev.message ? messageText(ev.message) : `[button] ${ev.postback?.title ?? ev.postback?.payload ?? ""}`;
          await ingestInbound({ connection: conn, channel, threadId, externalId: ev.message?.mid ?? ev.postback?.mid ?? null, body, at });
        }
      }
    }
    return;
  }

  if (payload.object === "whatsapp_business_account") {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!value || !phoneNumberId) continue;
        const conn = await findConnection("whatsapp", phoneNumberId);
        if (!conn) continue;
        const names = new Map((value.contacts ?? []).map((c) => [c.wa_id ?? "", c.profile?.name ?? ""]));
        for (const m of value.messages ?? []) {
          const body =
            m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? `[${m.type ?? "message"}]`;
          await ingestInbound({
            connection: conn,
            channel: "whatsapp",
            threadId: m.from,
            externalId: m.id,
            body,
            at: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
            name: names.get(m.from) ?? "",
            phone: `+${m.from}`,
          });
        }
        for (const s of value.statuses ?? []) {
          await updateMessageStatus(conn.workspaceId, s.id, s.status, s.errors?.[0]?.title);
        }
      }
    }
  }
}

export async function processWebhookEvent(webhookEventId: string) {
  const db = await getDb();
  const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, webhookEventId)).limit(1);
  if (!row || row.processedAt) return;
  try {
    await processMetaPayload(row.payload as MetaPayload);
    await db.update(webhookEvents).set({ processedAt: new Date(), error: null }).where(eq(webhookEvents.id, row.id));
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({ error: err instanceof Error ? err.message : String(err) })
      .where(eq(webhookEvents.id, row.id));
    throw err;
  }
}
