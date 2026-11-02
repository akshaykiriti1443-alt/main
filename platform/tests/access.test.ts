import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaceMembers, workspaces } from "@/lib/db/schema";
import { applyRoster, membershipFor, parseRoster, previewRoster, recordSkoolPaidMember, revokeAccess } from "@/server/access";
import { handleStripeEvent } from "@/server/billing/stripe";
import { createUser } from "@/server/auth";
import { makeWorkspace } from "./helpers";

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const statusOf = async (id: string) => {
  const db = await getDb();
  const [w] = await db.select({ status: workspaces.status }).from(workspaces).where(eq(workspaces.id, id));
  return w.status;
};

describe("member access without codes", () => {
  it("reads every email in a Skool export row, skips churned rows, and accepts plain lists", () => {
    const csv = [
      "First Name,Last Name,Email,What email will you use for the app?,Status",
      "Jane,Doe,jane@skool.test,JANE.APP@example.com,Active",
      "Old,Member,old@skool.test,,Churned",
      "No,Email,,,Active",
    ].join("\n");
    const { rows, skipped } = parseRoster(csv);
    expect(rows).toEqual([{ emails: ["jane@skool.test", "jane.app@example.com"], name: "Jane Doe" }]);
    expect(skipped).toBe(1);
    expect(parseRoster("a@x.test\nb@x.test").rows).toHaveLength(2);
  });

  it("a roster upload grants access, removes whoever drops off, and guards big drops", async () => {
    const tag = stamp();
    const people = Array.from({ length: 10 }, (_, i) => `m${i}-${tag}@example.com`);
    await applyRoster(people.join("\n"), { confirmLargeDrop: true });
    expect((await membershipFor(people[0])).active).toBe(true);

    const keep = people.slice(0, 2).join("\n");
    expect((await previewRoster(keep)).largeDrop).toBe(true);
    await expect(applyRoster(keep)).rejects.toThrow(/remove/);
    await applyRoster(keep, { confirmLargeDrop: true });
    expect((await membershipFor(people[1])).active).toBe(true);
    expect((await membershipFor(people[5])).active).toBe(false);
  });

  it("an owner who leaves Skool goes to grace, and a staff member's membership never keeps it alive", async () => {
    const { ws, user } = await makeWorkspace();
    await applyRoster(`${user.email}\n`, { confirmLargeDrop: true });
    expect(await statusOf(ws.id)).toBe("active");

    const staff = await createUser({ email: `staff-${stamp()}@example.com`, name: "Staff", password: "password123" });
    const db = await getDb();
    await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: staff.id, role: "user" });
    await recordSkoolPaidMember({ email: staff.email });

    await revokeAccess(user.email, "skool_export");
    expect(await statusOf(ws.id)).toBe("grace");
    await recordSkoolPaidMember({ email: user.email });
    expect(await statusOf(ws.id)).toBe("active");
  });

  it("a direct purchase on /join turns the account on, and a cancelled subscription starts grace", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    await db.update(workspaces).set({ status: "paused", pauseReason: "access", accessVerifiedUntil: null }).where(eq(workspaces.id, ws.id));
    const sub = `sub_${stamp()}`;
    const metadata = { kind: "member", member_email: user.email };
    await handleStripeEvent({ id: "evt1", type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "paid", subscription: sub, metadata } } });
    expect(await statusOf(ws.id)).toBe("active");
    expect((await membershipFor(user.email)).channels).toContain("stripe");

    await handleStripeEvent({ id: "evt2", type: "customer.subscription.deleted", data: { object: { id: sub, status: "canceled", metadata } } });
    expect((await membershipFor(user.email)).active).toBe(false);
    expect(await statusOf(ws.id)).toBe("grace");
  });
});
