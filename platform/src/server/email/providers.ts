import { env } from "@/lib/env";

export type OutgoingEmail = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  stream?: "transactional" | "broadcast";
  /** base64 content */
  attachments?: { name: string; contentType: string; content: string }[];
};

export class EmailProviderError extends Error {
  constructor(message: string, public permanent = false) {
    super(message);
  }
}

export async function sendEmail(msg: OutgoingEmail): Promise<{ provider: string; id: string }> {
  switch (env.emailProvider) {
    case "postmark":
      return sendPostmark(msg);
    case "resend":
      return sendResend(msg);
    default:
      console.info(`[email:console] to=${msg.to} subject="${msg.subject}"${msg.attachments?.length ? ` attachments=${msg.attachments.map((a) => a.name).join(",")}` : ""}`);
      return { provider: "console", id: `console-${Date.now().toString(36)}` };
  }
}

async function sendPostmark(msg: OutgoingEmail) {
  if (!env.postmarkToken) throw new EmailProviderError("POSTMARK_SERVER_TOKEN is not set", true);
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": env.postmarkToken,
    },
    body: JSON.stringify({
      From: msg.from,
      To: msg.to,
      ReplyTo: msg.replyTo,
      Subject: msg.subject,
      HtmlBody: msg.html,
      TextBody: msg.text,
      MessageStream: msg.stream === "broadcast" ? (process.env.POSTMARK_BROADCAST_STREAM ?? "broadcast") : "outbound",
      Headers: Object.entries(msg.headers ?? {}).map(([Name, Value]) => ({ Name, Value })),
      ...(msg.attachments?.length ? { Attachments: msg.attachments.map((a) => ({ Name: a.name, Content: a.content, ContentType: a.contentType })) } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { MessageID?: string; ErrorCode?: number; Message?: string };
  if (!res.ok || (data.ErrorCode && data.ErrorCode !== 0)) {
    // 406 = inactive recipient (bounced/unsubscribed); don't retry those.
    throw new EmailProviderError(`Postmark: ${data.Message ?? res.statusText}`, data.ErrorCode === 406 || res.status === 422);
  }
  return { provider: "postmark", id: data.MessageID ?? "" };
}

async function sendResend(msg: OutgoingEmail) {
  if (!env.resendKey) throw new EmailProviderError("RESEND_API_KEY is not set", true);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: msg.from,
      to: [msg.to],
      reply_to: msg.replyTo,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      headers: msg.headers,
      ...(msg.attachments?.length ? { attachments: msg.attachments.map((a) => ({ filename: a.name, content: a.content, content_type: a.contentType })) } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) throw new EmailProviderError(`Resend: ${data.message ?? res.statusText}`, res.status === 422);
  return { provider: "resend", id: data.id ?? "" };
}
