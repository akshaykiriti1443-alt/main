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

/** What the person reads when a message could not go out because sending was never set up. */
export const EMAIL_OFF = "Not sent. Email sending isn't switched on yet.";

/**
 * The real site people use, as opposed to a laptop or the e2e run, which start the production build
 * on localhost with console email on purpose. Vercel always counts as live, so a deploy missing
 * APP_URL can't pass for a laptop.
 */
export function isLiveSite() {
  if (!env.isProd) return false;
  if (process.env.VERCEL) return true;
  try {
    return !["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(new URL(env.appUrl).hostname);
  } catch {
    return true;
  }
}

/**
 * True only when emails can really leave: a real provider with its key. "console" only logs, so a
 * screen must never say "we sent you a link" while this is false.
 */
export function emailSendingOn() {
  if (env.emailProvider === "resend") return Boolean(env.resendKey);
  if (env.emailProvider === "postmark") return Boolean(env.postmarkToken);
  return false;
}

// A send that gets no answer must not hold up the page that asked for it (a lead's sign-up, a
// new account). It fails here and the queue tries again.
const SEND_TIMEOUT_MS = 15_000;

export async function sendEmail(msg: OutgoingEmail): Promise<{ provider: string; id: string }> {
  switch (env.emailProvider) {
    case "postmark":
      return sendPostmark(msg);
    case "resend":
      return sendResend(msg);
    default:
      // Logging stands in for sending on a laptop (and in the e2e run). On the live site it would
      // mean nobody gets their email while every screen says "sent", so there it fails out loud.
      if (isLiveSite()) {
        console.error(`[email] NOT SENT to=${msg.to} subject="${msg.subject}": EMAIL_PROVIDER is "console", which only logs. Set EMAIL_PROVIDER to resend or postmark, with its key.`);
        throw new EmailProviderError(EMAIL_OFF, true);
      }
      console.info(`[email:console] to=${msg.to} subject="${msg.subject}"${msg.attachments?.length ? ` attachments=${msg.attachments.map((a) => a.name).join(",")}` : ""}`);
      return { provider: "console", id: `console-${Date.now().toString(36)}` };
  }
}

function missingKey(name: string) {
  console.error(`[email] NOT SENT: ${name} is not set.`);
  return new EmailProviderError(EMAIL_OFF, true);
}

async function sendPostmark(msg: OutgoingEmail) {
  if (!env.postmarkToken) throw missingKey("POSTMARK_SERVER_TOKEN");
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
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
  if (!env.resendKey) throw missingKey("RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
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
