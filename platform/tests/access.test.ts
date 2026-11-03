import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sessions, users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { inviteMember } from "@/server/team";
import { WELCOME_PER_IP_PER_DAY, applyRoster, grantAccess, grantWelcomeAccess, membershipFor, parseRoster, previewRoster, recordSkoolPaidMember, revokeAccess } from "@/server/access";
import { compactRoster } from "@/lib/roster";
import { emailVerifyLinkFor, isEmailVerified, sendVerifyEmail, verifyEmail } from "@/server/emailVerify";
import { passwordLinkFor, resetPassword } from "@/server/passwords";
import { EMAIL_SEND_LIMIT, takeRateLimit } from "@/server/rateLimit";
import { canonicalEmail } from "@/lib/util";
import { getPlatformAgency } from "@/server/tenancy";
import { createWorkspace } from "@/server/workspace";
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
    // The browser trims big exports to names and emails; the server reads them the same.
    const quirky = `${csv}\n"Smith, ""Al""",Jones,al@x.test,,Active`;
    expect(parseRoster(compactRoster(quirky))).toEqual(parseRoster(quirky));
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

  it("late or retried Stripe events never turn a cancelled membership back on", async () => {
    const { user } = await makeWorkspace();
    const sub = `sub_${stamp()}`;
    const metadata = { kind: "member", member_email: user.email };
    const t = Math.floor(Date.now() / 1000);
    const checkout = { id: "evt_c", type: "checkout.session.completed", created: t, data: { object: { id: "cs_x", payment_status: "paid" as const, subscription: sub, metadata } } };
    await handleStripeEvent(checkout);
    await handleStripeEvent({ id: "evt_d", type: "customer.subscription.deleted", created: t + 20, data: { object: { id: sub, status: "canceled", metadata } } });
    // An "active" update from before the cancel, delivered late.
    await handleStripeEvent({ id: "evt_u", type: "customer.subscription.updated", created: t + 10, data: { object: { id: sub, status: "active", current_period_end: t + 30 * 86_400, metadata } } });
    expect((await membershipFor(user.email)).active).toBe(false);
    // Stripe retrying the original checkout.
    await handleStripeEvent(checkout);
    expect((await membershipFor(user.email)).active).toBe(false);
    // A brand-new subscription still works.
    await handleStripeEvent({ id: "evt_c2", type: "checkout.session.completed", created: t + 60, data: { object: { id: "cs_y", payment_status: "paid", subscription: `${sub}_2`, metadata } } });
    expect((await membershipFor(user.email)).active).toBe(true);
  });

  it("a self-signup stays shut until the email is confirmed, then membership or the welcome window opens it", async () => {
    const email = `signup-${stamp()}@example.com`;
    const user = await createUser({ email, name: "Nia New", password: "password123", emailVerified: false });
    const agency = await getPlatformAgency();
    const ws = await createWorkspace({ agencyId: agency.id, name: "Nia's club", ownerUserId: user.id, accessSource: "member", accessVerifiedUntil: null, isPlatformAgency: true });
    const db = await getDb();
    await db.update(workspaces).set({ status: "paused", pauseReason: "verify" }).where(eq(workspaces.id, ws.id));

    // Someone else's membership on this email can't open an unconfirmed account.
    await grantAccess({ email, channel: "admin", until: null });
    expect(await statusOf(ws.id)).toBe("paused");

    const link = await emailVerifyLinkFor(user.id);
    expect((await verifyEmail("bad.token", { userId: user.id })).ok).toBe(false);
    // A link alone never confirms: the clicker must be logged in as this account.
    const stranger = await createUser({ email: `stranger-${stamp()}@example.com`, name: "Str Anger", password: "password123" });
    expect((await verifyEmail(new URL(link).searchParams.get("token")!, { userId: stranger.id })).ok).toBe(false);
    expect(await statusOf(ws.id)).toBe("paused");
    const res = await verifyEmail(new URL(link).searchParams.get("token")!, { userId: user.id });
    expect(res).toEqual({ ok: true, userId: user.id, alreadyVerified: false });
    // Opening it again changes nothing and is never a fresh sign-in.
    expect(await verifyEmail(new URL(link).searchParams.get("token")!, { userId: user.id })).toEqual({ ok: true, userId: user.id, alreadyVerified: true });
    expect(await statusOf(ws.id)).toBe("active");
  });

  it("a late event from an older Stripe subscription never revokes the newer one", async () => {
    const { user } = await makeWorkspace();
    const metadata = { kind: "member", member_email: user.email };
    const t = Math.floor(Date.now() / 1000);
    const subA = `sub_a_${stamp()}`;
    const subB = `sub_b_${stamp()}`;
    await handleStripeEvent({ id: "evt_a", type: "checkout.session.completed", created: t, data: { object: { id: "cs_a", payment_status: "paid", subscription: subA, metadata } } });
    await handleStripeEvent({ id: "evt_b", type: "checkout.session.completed", created: t + 10, data: { object: { id: "cs_b", payment_status: "paid", subscription: subB, metadata } } });
    await handleStripeEvent({ id: "evt_ad", type: "customer.subscription.deleted", created: t + 20, data: { object: { id: subA, status: "canceled", metadata } } });
    expect((await membershipFor(user.email)).active).toBe(true);
    await handleStripeEvent({ id: "evt_bd", type: "customer.subscription.deleted", created: t + 30, data: { object: { id: subB, status: "canceled", metadata } } });
    expect((await membershipFor(user.email)).active).toBe(false);
  });

  it("confirming an email (or resetting the password) signs out every earlier session", async () => {
    const email = `hijack-${stamp()}@example.com`;
    const user = await createUser({ email, name: "Vic Tim", password: "password123", emailVerified: false });
    const db = await getDb();
    await db.insert(sessions).values({ id: `s-${stamp()}`, userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) });
    const link = await emailVerifyLinkFor(user.id);
    expect((await verifyEmail(new URL(link).searchParams.get("token")!, { userId: user.id })).ok).toBe(true);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);

    // A reset link proves the inbox too: it confirms the email and signs everyone out.
    const other = await createUser({ email: `reset-${stamp()}@example.com`, name: "Rae Set", password: "password123", emailVerified: false });
    await db.insert(sessions).values({ id: `s-${stamp()}`, userId: other.id, expiresAt: new Date(Date.now() + 86_400_000) });
    const reset = await passwordLinkFor(other.id);
    expect((await resetPassword(new URL(reset).searchParams.get("token")!, "newpassword1")).ok).toBe(true);
    expect(await db.select().from(sessions).where(eq(sessions.userId, other.id))).toHaveLength(0);
    expect(await isEmailVerified(other.id)).toBe(true);
  });

  it("a reset link obeys the per-network welcome limit, and an invite never pre-confirms an address", async () => {
    const email = `resetip-${stamp()}@example.com`;
    const user = await createUser({ email, name: "Rex Ip", password: "password123", emailVerified: false });
    const agency = await getPlatformAgency();
    const ws = await createWorkspace({ agencyId: agency.id, name: "Rex club", ownerUserId: user.id, accessSource: "member", accessVerifiedUntil: null, isPlatformAgency: true });
    const db = await getDb();
    await db.update(workspaces).set({ status: "paused", pauseReason: "verify" }).where(eq(workspaces.id, ws.id));
    const ip = `10.8.${stamp().slice(-3)}.2`;
    for (let i = 0; i < WELCOME_PER_IP_PER_DAY; i++) await takeRateLimit(`welcome-ip:${ip}`, [{ seconds: 86_400, max: WELCOME_PER_IP_PER_DAY }]);
    const reset = await passwordLinkFor(user.id);
    expect((await resetPassword(new URL(reset).searchParams.get("token")!, "newpassword1", { ip })).ok).toBe(true);
    expect(await isEmailVerified(user.id)).toBe(true);
    expect((await membershipFor(email)).active).toBe(false);
    expect(await statusOf(ws.id)).toBe("paused");

    const { ws: team } = await makeWorkspace();
    const invited = `invited-${stamp()}@example.com`;
    await inviteMember({ workspaceId: team.id, workspaceName: team.name, email: invited, name: "In Vited", role: "user" });
    const [row] = await db.select().from(users).where(eq(users.email, invited));
    expect(row.emailVerifiedAt).toBeNull();
  });

  it("the welcome window is once per mailbox, not per spelling", async () => {
    const tag = stamp();
    expect(canonicalEmail(`Me.Name+promo@GoogleMail.com`)).toBe("mename@gmail.com");
    expect(canonicalEmail(`me+1@example.com`)).toBe("me@example.com");
    expect(await grantWelcomeAccess(`w${tag}+1@example.com`)).toBe(true);
    expect(await grantWelcomeAccess(`w${tag}+2@example.com`)).toBe(false);
    expect(await grantWelcomeAccess(`w${tag}@example.com`)).toBe(false);
    // One network can only start a few welcome windows a day.
    const ip = `10.0.${tag.slice(-3)}.1`;
    const results = [];
    for (let i = 0; i < WELCOME_PER_IP_PER_DAY + 1; i++) results.push(await grantWelcomeAccess(`ip${i}-${tag}@example.com`, "", { ip }));
    expect(results.filter(Boolean)).toHaveLength(WELCOME_PER_IP_PER_DAY);
  });

  it("confirm emails are throttled: one a minute, five a day", async () => {
    const user = await createUser({ email: `throttle-${stamp()}@example.com`, name: "Tho Ttle", password: "password123", emailVerified: false });
    await sendVerifyEmail(user.id);
    await expect(sendVerifyEmail(user.id)).rejects.toThrow(/Wait a minute/);
    const key = `t-${stamp()}`;
    const at = new Date();
    expect(await takeRateLimit(key, EMAIL_SEND_LIMIT, at)).toBe(true);
    expect(await takeRateLimit(key, EMAIL_SEND_LIMIT, new Date(at.getTime() + 30_000))).toBe(false);
    for (let i = 1; i <= 4; i++) expect(await takeRateLimit(key, EMAIL_SEND_LIMIT, new Date(at.getTime() + i * 61_000 + 30_000))).toBe(true);
    // Five sent today (the refused hit didn't count), so the daily cap is reached.
    expect(await takeRateLimit(key, EMAIL_SEND_LIMIT, new Date(at.getTime() + 10 * 61_000))).toBe(false);
  });

  it("blocked \"send again\" clicks don't use up the day", async () => {
    const key = `t-${stamp()}`;
    const at = new Date();
    expect(await takeRateLimit(key, EMAIL_SEND_LIMIT, at)).toBe(true);
    for (let i = 1; i <= 4; i++) expect(await takeRateLimit(key, EMAIL_SEND_LIMIT, new Date(at.getTime() + i * 5_000))).toBe(false);
    expect(await takeRateLimit(key, EMAIL_SEND_LIMIT, new Date(at.getTime() + 61_000))).toBe(true);
  });
});
