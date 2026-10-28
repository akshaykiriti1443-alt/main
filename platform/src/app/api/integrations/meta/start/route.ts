import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@/server/tenancy";
import { metaConfigured } from "@/server/meta/graph";
import { metaLoginUrl } from "@/server/meta/oauth";
import { hasFeature } from "@/server/plans";

export async function GET(req: NextRequest) {
  const wid = req.nextUrl.searchParams.get("w") ?? "";
  const { workspace, user } = await requireWorkspace(wid, "admin");
  const back = new URL(`/app/w/${wid}/settings`, req.url);
  if (!hasFeature(workspace.plan, "inbox")) {
    back.searchParams.set("error", "Connecting Instagram and Facebook needs the Growth plan.");
    return NextResponse.redirect(back);
  }
  if (!metaConfigured()) {
    back.searchParams.set("error", "The platform owner hasn't added the Meta app keys yet (META_APP_ID / META_APP_SECRET).");
    return NextResponse.redirect(back);
  }
  return NextResponse.redirect(metaLoginUrl(wid, user.id));
}
