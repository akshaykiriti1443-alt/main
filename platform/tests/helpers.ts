import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { createUser } from "@/server/auth";
import { getPlatformAgency } from "@/server/tenancy";
import { createWorkspace } from "@/server/workspace";

let n = 0;
export async function makeWorkspace(opts: { plan?: "starter" | "growth" } = {}) {
  n++;
  const agency = await getPlatformAgency();
  const user = await createUser({ email: `owner${n}-${Date.now()}@example.com`, name: "Sam Owner", password: "password123" });
  const ws = await createWorkspace({
    agencyId: agency.id,
    name: `Fit Dads Club ${n}`,
    ownerUserId: user.id,
    plan: opts.plan ?? "starter",
    accessSource: "skool_code",
    accessVerifiedUntil: new Date(Date.now() + 30 * 86_400_000),
    isPlatformAgency: true,
    settings: { businessName: "Fit Dads Club", skoolUrl: "https://www.skool.com/fit-dads" },
  });
  return { user, ws, agency };
}

export async function setPlan(workspaceId: string, plan: "starter" | "growth") {
  const db = await getDb();
  await db.update(workspaces).set({ plan }).where(eq(workspaces.id, workspaceId));
}
