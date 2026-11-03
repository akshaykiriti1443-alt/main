import { cookies } from "next/headers";
import { addDays } from "@/lib/util";

// "View as": the platform owner can preview the app the way each kind of member sees it,
// without changing any data. Only the in-memory workspace for this request is adjusted
// (plan, status, access), so menus, locks, banners and gates all behave like the real thing.

export const VIEW_AS_COOKIE = "onx_view_as";

export const VIEW_AS = {
  owner: { label: "Owner", hint: "You. Everything on, no limits." },
  member: { label: "Member", hint: "Included with the Skool membership (Member plan)." },
  growth: { label: "Growth member", hint: "A member who upgraded to Growth." },
  waiting: { label: "Waiting for membership", hint: "Signed up, not confirmed as a member yet." },
  lapsed: { label: "Membership ending", hint: "Left Skool: inside the 7-day grace period." },
  entry: { label: "Entry ticket", hint: "Must post an intro in the community first." },
} as const;
export type ViewAs = keyof typeof VIEW_AS;
export const isViewAs = (v: unknown): v is ViewAs => typeof v === "string" && v in VIEW_AS;

/** The preview mode for this request, or null when the owner sees their own view. */
export async function currentViewAs(): Promise<Exclude<ViewAs, "owner"> | null> {
  try {
    const v = (await cookies()).get(VIEW_AS_COOKIE)?.value;
    return isViewAs(v) && v !== "owner" ? v : null;
  } catch {
    return null; // outside a request (jobs, tests)
  }
}

type WsLike = {
  plan: "starter" | "growth" | "owner";
  status: "active" | "grace" | "paused";
  accessSource: "member" | "agency" | "admin";
  accessVerifiedUntil: Date | null;
  graceEndsAt: Date | null;
  pauseReason: "access" | "admin" | "agency" | "verify" | null;
  settings: Record<string, unknown>;
};

/** A copy of the workspace as the chosen kind of member would have it. Never saved. */
export function previewWorkspace<W extends WsLike>(ws: W, mode: Exclude<ViewAs, "owner">, now = new Date()): W {
  const base = { ...ws, accessSource: "member" as const, settings: { ...ws.settings } };
  switch (mode) {
    case "member":
      return { ...base, plan: "starter", status: "active", pauseReason: null, accessVerifiedUntil: addDays(now, 30) };
    case "growth":
      return { ...base, plan: "growth", status: "active", pauseReason: null, accessVerifiedUntil: addDays(now, 30) };
    case "waiting":
      return { ...base, plan: "starter", status: "paused", pauseReason: "access", accessVerifiedUntil: null };
    case "lapsed":
      return { ...base, plan: "starter", status: "grace", pauseReason: null, graceEndsAt: addDays(now, 5), accessVerifiedUntil: addDays(now, -2) };
    case "entry":
      return { ...base, plan: "starter", status: "active", pauseReason: null, accessVerifiedUntil: addDays(now, 30), settings: { ...base.settings, entryClaimedAt: undefined } };
  }
}
