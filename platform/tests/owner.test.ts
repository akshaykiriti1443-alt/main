import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, workspaces } from "@/lib/db/schema";
import { hasFeature, PLANS } from "@/server/plans";
import { chargeUsage } from "@/server/wallet";
import { previewWorkspace } from "@/server/viewAs";
import { computePath } from "@/server/path";
import { saveCheckin } from "@/server/growth";
import { makeWorkspace } from "./helpers";

describe("the platform owner gets everything", () => {
  it("the Owner plan has every feature and is never billed", async () => {
    for (const f of PLANS.growth.features) expect(hasFeature("owner", f)).toBe(true);
    const { ws } = await makeWorkspace();
    const db = await getDb();
    await db.update(workspaces).set({ plan: "owner" }).where(eq(workspaces.id, ws.id));
    for (let i = 0; i < 5; i++) expect((await chargeUsage(ws.id, "ai_generation")).billedMicros).toBe(0);
  });

  it("the migration moves the owner's existing workspace to the Owner plan", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, user.id));
    const file = readFileSync(path.join(process.cwd(), "drizzle", "0008_owner_plan.sql"), "utf8");
    await db.execute(sql.raw(file));
    const [after] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(after).toMatchObject({ plan: "owner", accessSource: "admin", status: "active" });
    await db.update(users).set({ isPlatformAdmin: false }).where(eq(users.id, user.id));
  });
});

describe("View as: preview a member's experience", () => {
  it("adjusts plan, status and access for each kind of member without touching data", async () => {
    const { ws } = await makeWorkspace();
    const owner = { ...ws, plan: "owner" as const, accessSource: "admin" as const };
    expect(previewWorkspace(owner, "member")).toMatchObject({ plan: "starter", status: "active", accessSource: "member" });
    expect(hasFeature(previewWorkspace(owner, "member").plan, "automations")).toBe(false);
    expect(hasFeature(previewWorkspace(owner, "growth").plan, "automations")).toBe(true);
    expect(previewWorkspace(owner, "waiting")).toMatchObject({ status: "paused", pauseReason: "access", accessVerifiedUntil: null });
    expect(previewWorkspace(owner, "lapsed").status).toBe("grace");
    expect(previewWorkspace({ ...owner, settings: { entryClaimedAt: "x" } }, "entry").settings.entryClaimedAt).toBeUndefined();
    expect(owner.plan).toBe("owner");
  });
});

describe("Your path: the course as a guided flow", () => {
  it("starts at the launch kit, ticks steps off from real data and moves the next step on", async () => {
    const { ws, user } = await makeWorkspace();
    const fresh = await computePath({ ...ws, settings: { ...ws.settings, skoolUrl: "" } }, user.id);
    expect(fresh.next?.key).toBe("kit");
    expect(fresh.total).toBeGreaterThan(15);
    expect(fresh.stages.find((s) => s.key === "keep")?.steps.find((s) => s.key === "automations")?.locked).toBe("Growth plan");

    await saveCheckin(ws.id, { aboutVisitors: 140, newPaid: 1, networkSignups: 0, linkInBio: true, skoolLevel: 2 });
    const later = await computePath({ ...ws, settings: { ...ws.settings, skoolMemberPrice: 29 } }, user.id);
    const step = (k: string) => later.stages.flatMap((s) => s.steps).find((s) => s.key === k);
    expect(step("checkin")?.done).toBe(true);
    expect(step("l2")?.done).toBe(true);
    expect(step("bio")?.done).toBe(true);
    expect(step("price")?.done).toBe(true);
    expect(later.level).toBe(2);
    expect(later.done).toBeGreaterThan(fresh.done);
  });
});
