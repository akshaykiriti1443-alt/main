import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import type { WorkspaceSettings } from "@/lib/db/types";
import { decrypt, randomToken, sha256hex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { normalizePhone, truncate } from "@/lib/util";
import { graph, GraphApiError } from "./graph";
import { PermanentJobError } from "../jobs/runner";

// Meta Conversions API: a server-side copy of pixel events. The browser pixel and
// this call share event_id, so Meta de-duplicates them.

/** The name of the one test event the Pixel card sends. Not a real event, so it can't be mistaken for a lead. */
export const PIXEL_TEST_EVENT = "ConnectionTest";

export type CapiEventInput = {
  workspaceId: string;
  // Subscribe + StartTrial let ad campaigns optimize for paying members, not just signups.
  eventName: "Lead" | "CompleteRegistration" | "Purchase" | "PageView" | "Subscribe" | "StartTrial" | "ViewContent" | typeof PIXEL_TEST_EVENT;
  eventId: string;
  eventTime: number; // unix seconds
  eventSourceUrl: string;
  // Default "website"; a server-confirmed conversion with no browser uses "system_generated".
  actionSource?: "website" | "system_generated";
  value?: number | null;
  currency?: string | null;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  externalId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
};

const h = (v: string | null | undefined) => (v ? [sha256hex(v.trim().toLowerCase())] : undefined);

export function buildCapiPayload(e: Omit<CapiEventInput, "workspaceId"> & { workspaceId?: string }, testEventCode?: string) {
  const phoneDigits = e.phone ? normalizePhone(e.phone).replace(/\D/g, "") : null;
  const actionSource = e.actionSource ?? "website";
  return {
    data: [
      {
        event_name: e.eventName,
        event_time: e.eventTime,
        event_id: e.eventId,
        action_source: actionSource,
        // event_source_url is required for website events; optional otherwise.
        ...(actionSource === "website" || e.eventSourceUrl ? { event_source_url: e.eventSourceUrl } : {}),
        ...(e.value != null ? { custom_data: { value: e.value, currency: e.currency || "USD" } } : {}),
        user_data: {
          em: h(e.email),
          ph: phoneDigits ? [sha256hex(phoneDigits)] : undefined,
          fn: h(e.firstName),
          ln: h(e.lastName),
          external_id: h(e.externalId),
          client_ip_address: e.ip ?? undefined,
          client_user_agent: e.userAgent ?? undefined,
          fbp: e.fbp ?? undefined,
          fbc: e.fbc ?? undefined,
        },
      },
    ],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };
}

export async function processCapiJob(payload: Record<string, unknown>) {
  const event = payload as unknown as CapiEventInput;
  const db = await getDb();
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, event.workspaceId)).limit(1);
  const pixelId = ws?.settings.metaPixelId;
  const tokenEnc = ws?.settings.metaCapiTokenEnc;
  if (!pixelId || !tokenEnc) return; // pixel not configured: nothing to send
  let token: string;
  try {
    token = decrypt(tokenEnc);
  } catch {
    throw new PermanentJobError("Stored Conversions API token can't be decrypted. Re-enter it in Settings.");
  }
  await graph(`${pixelId}/events`, {
    method: "POST",
    token,
    body: buildCapiPayload(event, ws.settings.metaTestEventCode || undefined),
  });
}

// ---------------------------------------------------------------------------
// "Did Meta accept it?": the Pixel card in Settings never says connected on a guess.
// It sends Meta one test event with the member's own Pixel ID and token, and shows Meta's answer.
// ---------------------------------------------------------------------------

/** Tidy what was pasted into the Pixel ID box, or say in plain words why it can't be a Pixel ID. */
export function cleanPixelId(raw: string): { ok: true; id: string } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: true, id: "" };
  if (/^act_/i.test(text)) {
    return { ok: false, error: "That's your ad account number (it starts with act_). Your Pixel ID is in Meta Events Manager: open your Pixel, go to Settings and copy the Dataset ID." };
  }
  if (/^EAA/i.test(text) || (text.length > 30 && /[a-z]/i.test(text))) {
    return { ok: false, error: "That looks like the access token. It goes in the second box. The first box takes the Dataset ID, which is a long number." };
  }
  // Copied numbers sometimes carry spaces or dashes.
  const digits = text.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) {
    return { ok: false, error: "The Pixel ID is numbers only, like 123456789012345. In Meta Events Manager, open your Pixel, go to Settings and copy the Dataset ID." };
  }
  if (digits.length < 14 || digits.length > 17) {
    return { ok: false, error: `The Pixel ID is about 15 digits long, like 123456789012345. You pasted ${digits.length}. Copy the Dataset ID again from your Pixel's Settings tab.` };
  }
  return { ok: true, id: digits };
}

/** What Meta last said about this Pixel ID. Kept in the workspace settings. */
export type PixelCheck = { ok: boolean; at: string; pixelId: string; reason?: string };
export type TrackingSettings = WorkspaceSettings & { metaPixelCheck?: PixelCheck };

export type PixelStatus =
  | { state: "none" } // no Pixel ID
  | { state: "saved" } // an ID but no token, so there is nothing to ask Meta with
  | { state: "untested" } // ID and token saved, Meta not asked yet (or its answer was about other details)
  | { state: "accepted"; at: Date }
  | { state: "rejected"; at: Date; reason: string };

/** Only "accepted" means Meta took an event sent with exactly these details. */
export function pixelStatus(s: TrackingSettings): PixelStatus {
  if (!s.metaPixelId) return { state: "none" };
  if (!s.metaCapiTokenEnc) return { state: "saved" };
  const c = s.metaPixelCheck;
  if (!c || c.pixelId !== s.metaPixelId) return { state: "untested" };
  const at = new Date(c.at);
  return c.ok ? { state: "accepted", at } : { state: "rejected", at, reason: c.reason || "Meta didn't accept the test." };
}

class MetaTimeoutError extends Error {}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new MetaTimeoutError("Meta timed out")), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/**
 * Meta's error, in words a beginner can act on. `answered` is false when Meta never gave a real
 * answer (slow, down, rate limited): that is "ask again", never "Meta said no".
 */
export function explainMetaError(err: unknown): { answered: boolean; reason: string } {
  if (err instanceof GraphApiError) {
    const said = err.message.replace(/^Meta API:\s*/, "").trim();
    if (err.code === 190) {
      return { answered: true, reason: "Meta doesn't recognise that access token. It may be cut off or out of date. In Events Manager, press Generate access token again, copy all of it and paste it here." };
    }
    if (err.code === 4 || err.code === 17 || err.code === 32 || err.code === 613 || err.status === 429) {
      return { answered: false, reason: "Meta asked us to slow down. Wait a few minutes, then press the test button." };
    }
    if (err.code === 1 || err.code === 2 || err.status >= 500) {
      return { answered: false, reason: "Meta had a hiccup and didn't answer. Press the test button again in a minute." };
    }
    if (err.code === 100 && (err.subcode === 33 || /does not exist|missing permission|unsupported (post|get) request/i.test(said))) {
      return { answered: true, reason: "Meta can't find a Pixel with that ID for this token. Check the number is the Dataset ID (not your ad account or Page number), and that you made the token on that same Pixel." };
    }
    if (err.code === 10 || err.code === 200 || err.code === 3 || err.status === 403) {
      return { answered: true, reason: "This access token isn't allowed to send to that Pixel. Make the token on the same Pixel's Settings tab, then paste it here." };
    }
    return { answered: true, reason: said ? `Meta said: "${truncate(said, 220)}"` : "Meta didn't accept the test and gave no reason. Copy the Dataset ID and the token again." };
  }
  if (err instanceof MetaTimeoutError) return { answered: false, reason: "Meta took too long to answer. Press the test button again in a minute." };
  return { answered: false, reason: "We couldn't reach Meta just now. Press the test button again in a minute." };
}

export type PixelTestResult = { outcome: "accepted" } | { outcome: "rejected"; reason: string } | { outcome: "no-answer"; reason: string };

/** Send Meta one clearly named test event and report what it said. Never throws. */
export async function sendPixelTest(input: {
  pixelId: string;
  token: string;
  testEventCode?: string;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  timeoutMs?: number;
}): Promise<PixelTestResult> {
  const body = buildCapiPayload(
    {
      eventName: PIXEL_TEST_EVENT,
      eventId: `test:${randomToken(9)}`,
      eventTime: Math.floor(Date.now() / 1000),
      eventSourceUrl: env.appUrl,
      email: input.email,
      ip: input.ip,
      // Meta wants a browser name on website events.
      userAgent: input.userAgent || "Mozilla/5.0 (connection test)",
    },
    input.testEventCode || undefined,
  );
  try {
    const res = await withTimeout(graph<{ events_received?: number }>(`${input.pixelId}/events`, { method: "POST", token: input.token, body }), input.timeoutMs ?? 10_000);
    if ((res.events_received ?? 0) < 1) return { outcome: "no-answer", reason: "Meta answered but didn't count the test. Press the test button again in a minute." };
    return { outcome: "accepted" };
  } catch (err) {
    const { answered, reason } = explainMetaError(err);
    return answered ? { outcome: "rejected", reason } : { outcome: "no-answer", reason };
  }
}

/**
 * Test the saved Pixel ID and token with Meta and remember the answer. "No answer" leaves the last
 * real answer alone. Returns "not-ready" when there is no ID or no token to test with.
 */
export async function checkPixel(
  workspaceId: string,
  who: { email?: string | null; ip?: string | null; userAgent?: string | null } = {},
): Promise<PixelTestResult | { outcome: "not-ready" }> {
  const db = await getDb();
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const pixelId = ws?.settings.metaPixelId;
  const tokenEnc = ws?.settings.metaCapiTokenEnc;
  if (!pixelId || !tokenEnc) return { outcome: "not-ready" };

  let token: string | null = null;
  try {
    token = decrypt(tokenEnc);
  } catch {
    // Falls through to "rejected" below: the member has to paste the token again.
  }
  const result: PixelTestResult = token
    ? await sendPixelTest({ pixelId, token, testEventCode: ws.settings.metaTestEventCode, ...who })
    : { outcome: "rejected", reason: "We couldn't read your saved access token. Paste it again and press Save." };
  if (result.outcome === "no-answer") return result;

  const check: PixelCheck = { ok: result.outcome === "accepted", at: new Date().toISOString(), pixelId, ...(result.outcome === "rejected" ? { reason: result.reason } : {}) };
  // One key, written in place: Meta can take seconds to answer, and a settings save in the
  // meantime must not be overwritten with what we read before asking.
  await db
    .update(workspaces)
    .set({ settings: sql`jsonb_set(${workspaces.settings}, '{metaPixelCheck}', ${JSON.stringify(check)}::jsonb, true)` })
    .where(eq(workspaces.id, workspaceId));
  return result;
}
