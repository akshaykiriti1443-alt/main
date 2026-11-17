import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailMessages, emailSequenceSteps, emailSequences, jobs, rateLimits, sessions } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { createUser } from "@/server/auth";
import { accessGap, grantWelcomeAccess, recordSkoolPaidMember, revokeAccess } from "@/server/access";
import { upsertContact } from "@/server/contacts";
import { VERIFY_EMAILS_OFF, VERIFY_SEND_FAILED, emailVerifyLinkFor, sendVerifyEmail, verifyEmail, verifyWaitState, verifyWaitTicket } from "@/server/emailVerify";
import { EMAIL_OFF, emailSendingOn, isLiveSite } from "@/server/email/providers";
import { processEmailSend, queueEmail } from "@/server/email/send";
import { enrollContact } from "@/server/email/sequences";
import { makeWorkspace } from "./helpers";

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const tokenOf = (link: string) => new URL(link).searchParams.get("token")!;

// The front door: a new member's confirm email and a lead's free checklist go out at once, the
// wait screen moves on by itself, and nothing that was only logged is ever called "sent".

type MutableEnv = { isProd: boolean; appUrl: string; emailProvider: string; resendKey: string };
const real = { ...(env as MutableEnv) };
const setEnv = (patch: Partial<MutableEnv>) => Object.assign(env as MutableEnv, patch);
const goLive = () => setEnv({ isProd: true, appUrl: "https://app.example.com" });
afterEach(() => {
  setEnv({ isProd: real.isProd, appUrl: real.appUrl, emailProvider: real.emailProvider, resendKey: real.resendKey });
  vi.unstubAllGlobals();
});

describe("the front door", () => {
  it("sends the confirm email in the same request, with nothing left for the scheduler", async () => {
    const user = await createUser({ email: `door-${stamp()}@example.com`, name: "Dee Door", password: "password123", emailVerified: false });
    const db = await getDb();
    const before = (await db.select({ id: jobs.id }).from(jobs)).length;
    await sendVerifyEmail(user.id);
    expect((await db.select({ id: jobs.id }).from(jobs)).length).toBe(before);
    // A second press within the minute is refused in plain words.
    await expect(sendVerifyEmail(user.id)).rejects.toThrow(/Promotions and Spam/);
  });

  it("sends a lead's free checklist straight away, without waiting for the scheduler", async () => {
    const { ws } = await makeWorkspace();
    const db = await getDb();
    const [seq] = await db.insert(emailSequences).values({ workspaceId: ws.id, name: "Checklist", trigger: "manual" }).returning();
    await db.insert(emailSequenceSteps).values([
      { sequenceId: seq.id, position: 0, delayMinutes: 0, subject: "Your free checklist", body: "Here it is." },
      { sequenceId: seq.id, position: 1, delayMinutes: 60 * 24, subject: "Day two", body: "Next up." },
    ]);
    const { contact } = await upsertContact({ workspaceId: ws.id, email: `lead-${stamp()}@example.com`, source: "manual" });
    await enrollContact(ws.id, seq.id, contact.id);
    // No runDueJobs here: the first email is already done.
    const msgs = await db.select().from(emailMessages).where(eq(emailMessages.contactId, contact.id));
    expect(msgs).toHaveLength(1);
    expect(msgs[0].subject).toBe("Your free checklist");
    expect(msgs[0].status).toBe("sent");
    // The second one waits its turn on the queue.
    const later = await db.select().from(jobs).where(and(eq(jobs.type, "email.sequence_step"), eq(jobs.status, "pending")));
    expect(later.some((j) => j.runAt.getTime() > Date.now() + 23 * 3600_000)).toBe(true);
  });

  it("on the live site, an email that would only be logged is marked failed, never sent", async () => {
    expect(emailSendingOn()).toBe(false);
    const { ws } = await makeWorkspace();
    goLive();
    const id = await queueEmail({ workspaceId: ws.id, to: `x-${stamp()}@example.com`, subject: "Hi", body: "Hello", vars: {}, sendNow: true });
    await processEmailSend(id);
    const db = await getDb();
    const [msg] = await db.select().from(emailMessages).where(eq(emailMessages.id, id));
    expect(msg.status).toBe("failed");
    expect(msg.sentAt).toBeNull();
    expect(msg.error).toBe(EMAIL_OFF);
  });

  it("a production build on localhost (the e2e run) still only logs, and counts that as sent", async () => {
    setEnv({ isProd: true });
    expect(isLiveSite()).toBe(false);
    const { ws } = await makeWorkspace();
    const id = await queueEmail({ workspaceId: ws.id, to: `e2e-${stamp()}@example.com`, subject: "Hi", body: "Hello", vars: {}, sendNow: true });
    await processEmailSend(id);
    const db = await getDb();
    const [msg] = await db.select().from(emailMessages).where(eq(emailMessages.id, id));
    expect(msg.status).toBe("sent");
    goLive();
    expect(isLiveSite()).toBe(true);
  });

  it("with emails off on the live site, a confirm press says so and doesn't use up a try", async () => {
    const user = await createUser({ email: `off-${stamp()}@example.com`, name: "Otto Off", password: "password123", emailVerified: false });
    goLive();
    for (let i = 0; i < 6; i++) await expect(sendVerifyEmail(user.id)).rejects.toThrow(VERIFY_EMAILS_OFF);
    setEnv({ isProd: real.isProd, appUrl: real.appUrl });
    await sendVerifyEmail(user.id);
  });

  it("a confirm email that failed to send can be sent again at once, and never claims it was sent", async () => {
    const user = await createUser({ email: `fail-${stamp()}@example.com`, name: "Faye Fail", password: "password123", emailVerified: false });
    setEnv({ emailProvider: "resend", resendKey: "re_test" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const first = await sendVerifyEmail(user.id).catch((e: Error) => e.message);
    expect(first).toBe(VERIFY_SEND_FAILED);
    expect(first).not.toMatch(/we sent/i);
    // Ten seconds later the member presses Send the link again: it goes out, not "we sent you one".
    vi.unstubAllGlobals();
    setEnv({ emailProvider: "console", resendKey: "" });
    await sendVerifyEmail(user.id);
    // Only now that one really went out does the minute limit apply.
    await expect(sendVerifyEmail(user.id)).rejects.toThrow(/less than a minute/);
  });

  it("after five links in a day, the refusal says so instead of 'less than a minute ago'", async () => {
    const user = await createUser({ email: `five-${stamp()}@example.com`, name: "Fifi Five", password: "password123", emailVerified: false });
    const db = await getDb();
    await db.insert(rateLimits).values({ key: `verify-email:${user.id}:86400`, windowStart: new Date(), count: 5 });
    await expect(sendVerifyEmail(user.id)).rejects.toThrow(/5 links today/);
  });

  it("the wait screen sees a confirm on another device, and is told to log in again, not let in", async () => {
    const user = await createUser({ email: `wait-${stamp()}@example.com`, name: "Wren Wait", password: "password123", emailVerified: false });
    const ticket = verifyWaitTicket(user.id);
    expect(await verifyWaitState(ticket, user.id)).toBe("waiting");
    expect(await verifyWaitState(ticket, null)).toBe("signed-out");
    expect(await verifyWaitState("forged.ticket", user.id)).toBe("stop");
    // A confirm link is not a wait ticket, and a wait ticket is not a confirm link.
    const link = await emailVerifyLinkFor(user.id);
    expect(await verifyWaitState(tokenOf(link), user.id)).toBe("stop");
    expect((await verifyEmail(ticket, { userId: user.id })).ok).toBe(false);

    // Confirmed on the phone: every session ends, the laptop's too, so the laptop hears "confirmed".
    const db = await getDb();
    await db.insert(sessions).values({ id: `s-${stamp()}`, userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) });
    expect((await verifyEmail(tokenOf(link), { userId: user.id })).ok).toBe(true);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
    expect(await verifyWaitState(ticket, null)).toBe("confirmed");
    // Confirmed in this same browser (signed back in): the screen opens the app.
    expect(await verifyWaitState(ticket, user.id)).toBe("open");
  });

  it("a member who only had the welcome days is still being matched; one whose membership ended has lapsed", async () => {
    const { user } = await makeWorkspace();
    await grantWelcomeAccess(user.email);
    expect(await accessGap(user.email)).toBe("matching");

    await recordSkoolPaidMember({ email: user.email });
    await revokeAccess(user.email, "skool_zapier");
    expect(await accessGap(user.email)).toBe("lapsed");
  });
});
