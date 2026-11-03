import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, workspaces } from "@/lib/db/schema";
import { renderEmail } from "@/server/email/render";
import { buildVars } from "@/server/email/send";
import { presetByKey } from "@/server/automationPresets";
import { answersFrom, parseSkoolMembers, syncSkoolMembers, withAnswers } from "@/server/skool";
import { hobbyStatus, markWelcomed, videoVars, WELCOMED_TAG, welcomeQueue } from "@/server/skoolHobby";
import { makeWorkspace } from "./helpers";

const EXPORT = [
  "First Name,Last Name,Email,Status,What's your #1 goal right now?,How did you find us?,Joined",
  "Jane,Doe,jane@example.com,trial,Lose 10 lbs before the wedding,Instagram ad,2026-11-01",
  "Raj,Patel,raj@example.com,active,,A friend,2026-11-02",
].join("\n");

describe("Skool Pro plugins, the Hobby way", () => {
  it("keeps membership-question answers from the export (Zapier's job, without Zapier)", () => {
    const { members } = parseSkoolMembers(EXPORT);
    const jane = members.find((m) => m.email === "jane@example.com")!;
    expect(jane.answers).toEqual([
      { q: "What's your #1 goal right now?", a: "Lose 10 lbs before the wedding" },
      { q: "How did you find us?", a: "Instagram ad" },
    ]);
    // Known columns (status, joined date) are never mistaken for answers; blank answers are dropped.
    expect(members.find((m) => m.email === "raj@example.com")!.answers).toEqual([{ q: "How did you find us?", a: "A friend" }]);

    // The block replaces itself on the next sync and never touches the owner's own notes.
    const once = withAnswers("Met at the gym.", jane.answers!);
    const twice = withAnswers(once, [{ q: "What's your #1 goal right now?", a: "Run a 5k" }]);
    expect(twice.startsWith("Met at the gym.")).toBe(true);
    expect(answersFrom(twice)).toEqual([{ q: "What's your #1 goal right now?", a: "Run a 5k" }]);
    expect(twice.match(/membership answers/g)).toHaveLength(1);
  });

  it("syncs answers onto members and lines new members up for a personal hello (Auto DM, by hand)", async () => {
    const { ws } = await makeWorkspace();
    const rows = EXPORT.replace(/@example\.com/g, `+${Date.now()}@example.com`);
    await syncSkoolMembers(ws.id, rows, { churnMissing: false });

    const queue = await welcomeQueue(ws.id);
    expect(queue.map((q) => q.firstName).sort()).toEqual(["Jane", "Raj"]);
    const jane = queue.find((q) => q.firstName === "Jane")!;
    expect(jane.answers[0]).toEqual({ q: "What's your #1 goal right now?", a: "Lose 10 lbs before the wedding" });

    await markWelcomed(ws.id, jane.id);
    expect((await welcomeQueue(ws.id)).map((q) => q.firstName)).toEqual(["Raj"]);
    const db = await getDb();
    const [row] = await db.select({ tags: contacts.tags }).from(contacts).where(eq(contacts.id, jane.id));
    expect(row.tags).toContain(WELCOMED_TAG);

    // Someone else's workspace can't tick your members.
    const other = await makeWorkspace();
    const raj = (await welcomeQueue(ws.id))[0];
    await markWelcomed(other.ws.id, raj.id);
    expect((await welcomeQueue(ws.id)).map((q) => q.firstName)).toEqual(["Raj"]);

    const status = await hobbyStatus(ws.id);
    expect(status).toMatchObject({ answers: 2, welcomeWaiting: 1, pixel: false, onboardingVideo: false });
  });

  it("puts the onboarding and cancellation videos in the Welcome and Save emails, and nothing when unset", async () => {
    expect(videoVars({})).toMatchObject({ onboarding_video_line: "", cancel_video_line: "" });
    expect(videoVars({ onboardingVideoUrl: "https://loom.com/share/abc" }).onboarding_video_line).toContain("https://loom.com/share/abc");

    const { ws } = await makeWorkspace();
    const welcome = presetByKey("skool-welcome")!.def.actions.find((a) => a.type === "send_email");
    if (welcome?.type !== "send_email") throw new Error("no welcome email");
    const render = async (settings: Record<string, string>) => {
      const db = await getDb();
      await db.update(workspaces).set({ settings: { ...ws.settings, ...settings } }).where(eq(workspaces.id, ws.id));
      const [fresh] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
      return renderEmail({ subject: welcome.subject, body: welcome.body, vars: await buildVars(fresh, null), businessName: "Fit Dads Club" });
    };
    const withVideo = await render({ onboardingVideoUrl: "https://loom.com/share/abc" });
    expect(withVideo.text).toContain("Start with this 2-minute welcome video: https://loom.com/share/abc");
    const without = await render({ onboardingVideoUrl: "" });
    expect(without.text).not.toContain("video");
    expect(without.html).not.toContain("<p></p>");
  });
});
