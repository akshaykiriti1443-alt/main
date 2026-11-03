"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { requirePlatformAdmin } from "@/server/auth";
import { isUuid } from "@/lib/util";
import { isViewAs, VIEW_AS_COOKIE } from "@/server/viewAs";

/** Platform owner only: preview the app as a kind of member, or go back to the owner view. */
export async function setViewAsAction(wid: string, mode: string) {
  await requirePlatformAdmin();
  if (!isUuid(wid)) redirect("/app");
  const jar = await cookies();
  if (!isViewAs(mode) || mode === "owner") jar.delete(VIEW_AS_COOKIE);
  else jar.set(VIEW_AS_COOKIE, mode, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 12 * 3600, secure: env.isProd });
  const base = `/app/w/${wid}`;
  redirect(mode === "waiting" ? `${base}/paused` : mode === "entry" ? `${base}/hello` : `${base}/path`);
}
