import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { grantWelcomeAccess, membershipFor } from "@/server/access";
import { makeWorkspace } from "./helpers";

describe("switching from member codes", () => {
  it("carries every code-era member over, so nobody is locked out by the switch", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    // A member whose last monthly code already ran out and who got paused.
    await db.update(workspaces).set({ accessVerifiedUntil: new Date(Date.now() - 10 * 86_400_000), status: "paused", pauseReason: "access" }).where(eq(workspaces.id, ws.id));
    // Admin pauses must survive.
    const other = await makeWorkspace();
    await db.update(workspaces).set({ status: "paused", pauseReason: "admin" }).where(eq(workspaces.id, other.ws.id));

    const file = readFileSync(path.join(process.cwd(), "drizzle", "0004_carry_over_members.sql"), "utf8");
    for (const stmt of file.split("--> statement-breakpoint")) await db.execute(sql.raw(stmt));

    const m = await membershipFor(user.email);
    expect(m.active).toBe(true);
    expect(m.channels).toContain("skool_export");
    const [w] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(w.status).toBe("active");
    expect(w.accessVerifiedUntil!.getTime()).toBeGreaterThan(Date.now() + 30 * 86_400_000);
    const [o] = await db.select().from(workspaces).where(eq(workspaces.id, other.ws.id));
    expect(o.pauseReason).toBe("admin");
  });

  it("gives a new signup welcome days once per email", async () => {
    const email = `welcome-${Date.now()}@example.com`;
    expect(await grantWelcomeAccess(email)).toBe(true);
    expect((await membershipFor(email)).channels).toEqual(["welcome"]);
    expect(await grantWelcomeAccess(email)).toBe(false);
  });
});
