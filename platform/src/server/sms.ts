import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { channelConnections } from "@/lib/db/schema";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { monthKey } from "@/lib/util";
import { chargeUsage, InsufficientBalanceError } from "./wallet";

// Twilio, on one platform account. Numbers are bought into the platform account
// and assigned to a workspace. US numbers need A2P 10DLC registration before
// carriers deliver marketing traffic.

const api = (path: string) => `https://api.twilio.com/2010-04-01/Accounts/${env.twilioSid}${path}`;
const auth = () => `Basic ${Buffer.from(`${env.twilioSid}:${env.twilioToken}`).toString("base64")}`;
export const smsConfigured = () => Boolean(env.twilioSid && env.twilioToken);

async function twilio<T>(path: string, init: { method?: "GET" | "POST"; form?: Record<string, string> } = {}): Promise<T> {
  if (!smsConfigured()) throw new Error("SMS is not set up on this platform yet (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).");
  const res = await fetch(api(path), {
    method: init.method ?? (init.form ? "POST" : "GET"),
    headers: { Authorization: auth(), ...(init.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: init.form ? new URLSearchParams(init.form).toString() : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(`Twilio: ${data.message ?? res.statusText}`);
  return data;
}

export async function searchNumbers(country: string, areaCode?: string) {
  const qs = new URLSearchParams({ SmsEnabled: "true", PageSize: "10" });
  if (areaCode) qs.set("AreaCode", areaCode);
  const data = await twilio<{ available_phone_numbers: { phone_number: string; friendly_name: string; locality?: string; region?: string }[] }>(
    `/AvailablePhoneNumbers/${encodeURIComponent(country.toUpperCase())}/Local.json?${qs}`,
  );
  return data.available_phone_numbers;
}

export async function buyNumber(workspaceId: string, phoneNumber: string) {
  // Charge the first month up front; fails cleanly when the wallet is empty.
  await chargeUsage(workspaceId, "phone_number_month", 1, { description: `Phone number ${phoneNumber}` });
  const bought = await twilio<{ sid: string; phone_number: string }>("/IncomingPhoneNumbers.json", {
    form: { PhoneNumber: phoneNumber, SmsUrl: `${env.appUrl}/api/webhooks/twilio`, SmsMethod: "POST" },
  });
  const db = await getDb();
  await db
    .insert(channelConnections)
    .values({ workspaceId, kind: "sms", externalId: bought.phone_number, name: bought.phone_number, meta: { sid: bought.sid, billedPeriod: monthKey() } })
    .onConflictDoUpdate({ target: [channelConnections.kind, channelConnections.externalId], set: { workspaceId, status: "active" } });
  return bought.phone_number;
}

export async function sendSms(input: { from: string; to: string; body: string }) {
  const data = await twilio<{ sid: string }>("/Messages.json", { form: { From: input.from, To: input.to, Body: input.body } });
  return data.sid;
}

// https://www.twilio.com/docs/usage/security#validating-requests
export function verifyTwilioSignature(url: string, params: Record<string, string>, signature: string | null) {
  if (!env.twilioToken || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", env.twilioToken).update(data).digest("base64");
  return safeEqual(expected, signature);
}

export async function smsConnectionFor(toNumber: string) {
  const db = await getDb();
  const [conn] = await db
    .select()
    .from(channelConnections)
    .where(and(eq(channelConnections.kind, "sms"), eq(channelConnections.externalId, toNumber)))
    .limit(1);
  return conn ?? null;
}

// Monthly number rental. Runs from the maintenance tick.
export async function billPhoneNumbers() {
  const db = await getDb();
  const period = monthKey();
  const conns = await db.select().from(channelConnections).where(and(eq(channelConnections.kind, "sms"), eq(channelConnections.status, "active")));
  for (const c of conns) {
    if (c.meta.billedPeriod === period) continue;
    try {
      await chargeUsage(c.workspaceId, "phone_number_month", 1, { description: `Phone number ${c.externalId}` });
      await db.update(channelConnections).set({ meta: { ...c.meta, billedPeriod: period } }).where(eq(channelConnections.id, c.id));
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        await db.update(channelConnections).set({ status: "error" }).where(eq(channelConnections.id, c.id));
      } else throw err;
    }
  }
}
