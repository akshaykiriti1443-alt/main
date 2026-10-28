import { escapeHtml, htmlToText, textToHtml } from "@/lib/html";
import { env } from "@/lib/env";
import { sign } from "@/lib/crypto";
import { fillTemplate } from "@/lib/util";

export function unsubscribeUrl(contactId: string) {
  return `${env.appUrl}/api/public/unsubscribe?c=${contactId}&s=${sign(`unsub:${contactId}`)}`;
}

export function renderEmail(input: {
  subject: string;
  body: string;
  vars: Record<string, string | undefined>;
  businessName: string;
  mailingAddress?: string;
  contactId?: string | null;
}) {
  const subject = fillTemplate(input.subject, input.vars).slice(0, 250);
  const bodyText = fillTemplate(input.body, input.vars);
  const unsub = input.contactId ? unsubscribeUrl(input.contactId) : "";
  const footerParts = [escapeHtml(input.businessName), input.mailingAddress ? escapeHtml(input.mailingAddress) : ""].filter(Boolean);
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;padding:28px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#141a2e">
<tr><td>${textToHtml(bodyText)}</td></tr>
</table>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#6b7287;margin:16px 0 0">${footerParts.join(" · ")}${
    unsub ? `<br><a href="${unsub}" style="color:#6b7287">Unsubscribe</a>` : ""
  }</p>
</td></tr></table></body></html>`;
  const text = `${htmlToText(textToHtml(bodyText))}\n\n--\n${input.businessName}${input.mailingAddress ? `\n${input.mailingAddress}` : ""}${
    unsub ? `\nUnsubscribe: ${unsub}` : ""
  }`;
  const headers: Record<string, string> = unsub
    ? { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : {};
  return { subject, html, text, headers };
}
