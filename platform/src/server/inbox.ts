import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { channelConnections, contacts, conversations, messages, workspaces, type ConversationChannel } from "@/lib/db/schema";
import { truncate } from "@/lib/util";
import { logActivity } from "./activity";
import { upsertContact } from "./contacts";
import { emitEvent } from "./events";
import { enqueue } from "./jobs/queue";
import { sendMetaMessage } from "./meta/send";
import { hasFeature } from "./plans";
import { sendSms } from "./sms";
import { chargeUsage } from "./wallet";

type Connection = typeof channelConnections.$inferSelect;

async function upsertConversation(input: {
  workspaceId: string;
  contactId: string;
  channel: ConversationChannel;
  connectionId: string;
  threadId: string;
}) {
  const db = await getDb();
  await db
    .insert(conversations)
    .values({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      channel: input.channel,
      connectionId: input.connectionId,
      externalThreadId: input.threadId,
    })
    .onConflictDoNothing();
  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, input.workspaceId),
        eq(conversations.channel, input.channel),
        eq(conversations.externalThreadId, input.threadId),
      ),
    )
    .limit(1);
  return conv;
}

export async function ingestInbound(input: {
  connection: Connection;
  channel: ConversationChannel;
  threadId: string;
  externalId: string | null;
  body: string;
  at: Date;
  name?: string;
  phone?: string;
}) {
  const db = await getDb();
  const ws = input.connection.workspaceId;
  const [firstName, ...rest] = (input.name ?? "").trim().split(/\s+/);
  const channelKind = input.channel === "facebook" || input.channel === "instagram" || input.channel === "whatsapp" ? input.channel : undefined;
  const { contact } = await upsertContact({
    workspaceId: ws,
    phone: input.phone ?? null,
    firstName: firstName ?? "",
    lastName: rest.join(" "),
    source: input.channel === "facebook" ? "facebook" : input.channel === "instagram" ? "instagram" : input.channel === "whatsapp" ? "whatsapp" : "sms",
    channel: channelKind ? { kind: channelKind, id: input.threadId } : undefined,
    tags: [input.channel],
  });
  const conv = await upsertConversation({ workspaceId: ws, contactId: contact.id, channel: input.channel, connectionId: input.connection.id, threadId: input.threadId });

  const [inserted] = await db
    .insert(messages)
    .values({ workspaceId: ws, conversationId: conv.id, direction: "in", body: input.body.slice(0, 4000), externalId: input.externalId, status: "received", createdAt: input.at })
    .onConflictDoNothing()
    .returning({ id: messages.id });
  if (!inserted) return; // duplicate webhook delivery

  await db
    .update(conversations)
    .set({
      lastMessageAt: input.at,
      lastInboundAt: input.at,
      lastMessagePreview: truncate(input.body, 140),
      unread: sql`${conversations.unread} + 1`,
      status: "open",
      suggestedReply: null,
    })
    .where(eq(conversations.id, conv.id));
  await logActivity({ workspaceId: ws, contactId: contact.id, type: "message_in", refId: conv.id, data: { channel: input.channel, preview: truncate(input.body, 140) } });
  await emitEvent({ type: "message_received", workspaceId: ws, contactId: contact.id, conversationId: conv.id, channel: input.channel });

  const [w] = await db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, ws)).limit(1);
  if (w && hasFeature(w.plan, "ai_scoring")) {
    const bucket = Math.floor(Date.now() / 120_000); // at most one score per contact every 2 minutes
    await enqueue("ai.score", { contactId: contact.id }, { dedupeKey: `score:${contact.id}:${bucket}`, runAt: new Date(Date.now() + 15_000) });
  }
}

// A reply sent from Meta's own inbox (or our API) echoed back to us.
export async function ingestOutboundEcho(input: { connection: Connection; channel: ConversationChannel; threadId: string; externalId: string | null; body: string; at: Date }) {
  const db = await getDb();
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.workspaceId, input.connection.workspaceId), eq(conversations.channel, input.channel), eq(conversations.externalThreadId, input.threadId)))
    .limit(1);
  if (!conv) return;
  const [inserted] = await db
    .insert(messages)
    .values({ workspaceId: conv.workspaceId, conversationId: conv.id, direction: "out", body: input.body.slice(0, 4000), externalId: input.externalId, status: "sent", createdAt: input.at })
    .onConflictDoNothing()
    .returning({ id: messages.id });
  if (inserted) {
    await db.update(conversations).set({ lastMessageAt: input.at, lastMessagePreview: truncate(input.body, 140) }).where(eq(conversations.id, conv.id));
  }
}

export async function updateMessageStatus(workspaceId: string, externalId: string, status: string, error?: string) {
  const map: Record<string, "sent" | "delivered" | "read" | "failed"> = { sent: "sent", delivered: "delivered", read: "read", failed: "failed" };
  const next = map[status];
  if (!next) return;
  const db = await getDb();
  await db
    .update(messages)
    .set({ status: next, error: error ?? null })
    .where(and(eq(messages.workspaceId, workspaceId), eq(messages.externalId, externalId)));
}

export async function listConversations(workspaceId: string, filter: { status?: "open" | "closed"; channel?: ConversationChannel } = {}) {
  const db = await getDb();
  const conds = [eq(conversations.workspaceId, workspaceId)];
  if (filter.status) conds.push(eq(conversations.status, filter.status));
  if (filter.channel) conds.push(eq(conversations.channel, filter.channel));
  return db
    .select({ conversation: conversations, contact: contacts })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(and(...conds))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(100);
}

export async function getConversation(workspaceId: string, conversationId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ conversation: conversations, contact: contacts })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, workspaceId)))
    .limit(1);
  if (!row) return null;
  const history = await db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.createdAt)).limit(500);
  return { ...row, messages: history };
}

export async function markRead(workspaceId: string, conversationId: string) {
  const db = await getDb();
  await db.update(conversations).set({ unread: 0 }).where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, workspaceId)));
}

export async function setConversationStatus(workspaceId: string, conversationId: string, status: "open" | "closed") {
  const db = await getDb();
  await db.update(conversations).set({ status }).where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, workspaceId)));
}

/** Send a reply on the conversation's own channel. */
export async function sendReply(workspaceId: string, conversationId: string, body: string, userId: string | null) {
  const text = body.trim();
  if (!text) throw new Error("Write a message first.");
  const db = await getDb();
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, workspaceId)))
    .limit(1);
  if (!conv) throw new Error("Conversation not found");
  if (!conv.connectionId) throw new Error("This conversation's channel is disconnected.");
  const [connection] = await db.select().from(channelConnections).where(eq(channelConnections.id, conv.connectionId)).limit(1);
  if (!connection || connection.status !== "active") throw new Error("Reconnect this channel in Settings first.");

  let externalId: string | null;
  if (connection.kind === "sms") {
    await chargeUsage(workspaceId, "sms_segment", Math.max(1, Math.ceil(text.length / 153)), { description: "SMS reply" });
    externalId = await sendSms({ from: connection.externalId, to: conv.externalThreadId, body: text });
  } else {
    externalId = await sendMetaMessage({ connection, threadId: conv.externalThreadId, body: text, lastInboundAt: conv.lastInboundAt });
  }
  const now = new Date();
  await db
    .insert(messages)
    .values({ workspaceId, conversationId, direction: "out", body: text, externalId, status: "sent", sentByUserId: userId })
    .onConflictDoNothing();
  await db
    .update(conversations)
    .set({ lastMessageAt: now, lastMessagePreview: truncate(text, 140), unread: 0, suggestedReply: null })
    .where(eq(conversations.id, conversationId));
  await logActivity({ workspaceId, contactId: conv.contactId, type: "message_out", refId: conversationId, data: { channel: conv.channel } });
}

export async function latestConversationFor(workspaceId: string, contactId: string) {
  const db = await getDb();
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.workspaceId, workspaceId), eq(conversations.contactId, contactId)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  return conv ?? null;
}

export async function listConnections(workspaceId: string) {
  const db = await getDb();
  return db.select().from(channelConnections).where(eq(channelConnections.workspaceId, workspaceId)).orderBy(asc(channelConnections.createdAt));
}

export async function disconnectChannel(workspaceId: string, connectionId: string) {
  const db = await getDb();
  await db
    .update(channelConnections)
    .set({ status: "disconnected", accessTokenEnc: null })
    .where(and(eq(channelConnections.id, connectionId), eq(channelConnections.workspaceId, workspaceId)));
}
