import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { decrypt, sha256hex } from "@/lib/crypto";
import { normalizePhone } from "@/lib/util";
import { graph } from "./graph";
import { PermanentJobError } from "../jobs/runner";

// Meta Conversions API: a server-side copy of pixel events. The browser pixel and
// this call share event_id, so Meta de-duplicates them.

export type CapiEventInput = {
  workspaceId: string;
  eventName: "Lead" | "CompleteRegistration" | "Purchase" | "PageView";
  eventId: string;
  eventTime: number; // unix seconds
  eventSourceUrl: string;
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

export function buildCapiPayload(e: CapiEventInput, testEventCode?: string) {
  const phoneDigits = e.phone ? normalizePhone(e.phone).replace(/\D/g, "") : null;
  return {
    data: [
      {
        event_name: e.eventName,
        event_time: e.eventTime,
        event_id: e.eventId,
        action_source: "website",
        event_source_url: e.eventSourceUrl,
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
