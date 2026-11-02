"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { syncSkoolMembers } from "@/server/skool";
import { errMsg, field, go } from "./helpers";

export async function syncSkoolAction(wid: string, fd: FormData) {
  await requireWorkspace(wid);
  const base = `/app/w/${wid}/skool`;
  // Up to ~2MB of pasted/exported text: enough for tens of thousands of members.
  const raw = field(fd, "members", 2_000_000);
  if (!raw) go(base, { error: "Paste your member list or upload your Skool export first." });

  // "Full export" means absent members are treated as churned. A partial paste never churns anyone.
  const churnMissing = fd.get("mode") === "full";

  // Note: don't wrap go()/redirect() in try/catch — redirect() throws NEXT_REDIRECT by design.
  let msg: { ok?: string; error?: string };
  try {
    const r = await syncSkoolMembers(wid, raw, { churnMissing });
    if (r.total === 0 && r.churned === 0) {
      msg = { error: `No valid members found. ${r.skipped ? `${r.skipped} row(s) had no usable email.` : "Check the file has an email column."}` };
    } else {
      const parts = [
        r.created ? `${r.created} new` : "",
        r.converted ? `${r.converted} converted to paid` : "",
        r.joinedTrial ? `${r.joinedTrial} on trial` : "",
        r.churned ? `${r.churned} churned` : "",
        r.skipped ? `${r.skipped} skipped` : "",
      ].filter(Boolean);
      msg = { ok: `Synced ${r.total} member${r.total === 1 ? "" : "s"}.${parts.length ? " " + parts.join(", ") + "." : ""}` };
    }
  } catch (err) {
    msg = { error: errMsg(err) };
  }
  go(base, msg);
}

export async function saveSkoolPriceAction(wid: string, fd: FormData) {
  await requireWorkspace(wid);
  const price = Math.max(0, Math.min(100000, Number(field(fd, "price", 12)) || 0));
  const db = await getDb();
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, wid)).limit(1);
  await db
    .update(workspaces)
    .set({ settings: { ...(ws?.settings ?? {}), skoolMemberPrice: price } })
    .where(eq(workspaces.id, wid));
  revalidatePath(`/app/w/${wid}/skool`);
  go(`/app/w/${wid}/skool`, { ok: `Saved your member price at $${price}/month. New paid members now send Meta a Subscribe event with this value.` });
}

export type SkoolDraftResult = { ok: true; text: string; intent: string } | { ok: false; error: string };

export async function draftSkoolMessageAction(wid: string, contactId: string, intent?: string): Promise<SkoolDraftResult> {
  await requireWorkspace(wid);
  const { draftSkoolMessage, INTENT_LABEL } = await import("@/server/ai/skoolMessages");
  const valid = intent && intent in INTENT_LABEL ? (intent as keyof typeof INTENT_LABEL) : undefined;
  try {
    const r = await draftSkoolMessage(wid, contactId, valid);
    return { ok: true, text: r.text, intent: r.intent };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}
