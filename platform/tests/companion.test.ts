import { describe, expect, it } from "vitest";
import { companionSnapshot } from "@/server/companion";
import { computePath } from "@/server/path";
import { canBeUpNext, PAGE_GUIDES, pageGuideFor, STEP_HOWTO } from "@/lib/guides";
import { makeWorkspace } from "./helpers";

describe("Penny, the step-by-step guide", () => {
  it("knows how to do every step on Your path", async () => {
    const { ws, user } = await makeWorkspace();
    const path = await computePath({ ...ws, accessSource: "member" }, user.id, { entryTicketOn: true });
    const keys = path.stages.flatMap((s) => s.steps.map((x) => x.key)).filter((k) => k !== "app");
    for (const k of keys) expect(STEP_HOWTO[k]?.how.length, k).toBeGreaterThan(0);
    // ...and nothing about the removed Skool member CRM.
    expect(STEP_HOWTO).not.toHaveProperty("price");
    expect(STEP_HOWTO).not.toHaveProperty("sync");
    expect(PAGE_GUIDES).not.toHaveProperty("skool");
    expect(JSON.stringify({ STEP_HOWTO, PAGE_GUIDES })).not.toMatch(/four piles|member export|Hobby way/i);
    // v6: no 3-Pack to launch, no Pixel lesson, and the lesson numbers Penny quotes are current.
    expect(JSON.stringify({ STEP_HOWTO, PAGE_GUIDES })).not.toMatch(/3-Pack|Lesson 4\.2|lesson 5\.2|lesson 1\.3 covers|Hook, Turn or Door/);
    expect(STEP_HOWTO.lead1.how.join(" ")).toMatch(/own email/);
    expect(STEP_HOWTO.bio.how.join(" ")).toContain("(Instagram, TikTok or YouTube)");
  });

  it("starts a new member on the launch kit (your own AI is optional), with where to go and how far along they are", async () => {
    const { ws, user } = await makeWorkspace();
    const snap = await companionSnapshot(ws, user.id);
    // Penny's rule matches Up next: optional steps, outcomes and plan-locked steps never hold you up.
    const next = snap.steps.find(canBeUpNext);
    expect(next).toMatchObject({ key: "kit", lesson: "1.3", href: `/app/w/${ws.id}/launch`, stage: "Day 1" });
    expect(snap.steps.find((s) => s.key === "ai")).toMatchObject({ kind: "optional", done: false, stage: "Day 8" });
    expect(snap.done).toBe(snap.steps.filter((s) => s.done).length); // "Open your app", plus the Skool link the helper sets
    expect(snap.total).toBe(snap.steps.length);
  });

  it("walks past a step locked to another plan, like Up next does", async () => {
    const { ws, user } = await makeWorkspace(); // Member plan: lead follow-ups need the Growth plan
    const snap = await companionSnapshot(ws, user.id);
    const follow = snap.steps.find((s) => s.key === "automations");
    expect(follow).toMatchObject({ locked: "Growth plan", done: false, stage: "Rhythm" });
    expect(canBeUpNext(follow!)).toBe(false);
    // Everything before the follow-ups done: Penny walks past them to the check-ins.
    const at = snap.steps.findIndex((s) => s.key === "automations");
    const later = snap.steps.map((s, i) => ({ ...s, done: s.done || i < at }));
    expect(later.find(canBeUpNext)?.key).toBe("weeks");
    expect(later.map((s) => (s.key === "weeks" ? { ...s, done: true } : s)).find(canBeUpNext)?.key).toBe("bio");
    // One rule for Penny and Your path.
    expect(snap.steps.find(canBeUpNext)?.key).toBe((await computePath(ws, user.id)).next?.key);
  });

  it("explains the page you're on, including deeper pages", () => {
    const wid = "00000000-0000-4000-8000-000000000000";
    expect(pageGuideFor(`/app/w/${wid}`, wid)?.title).toBe("Dashboard");
    expect(pageGuideFor(`/app/w/${wid}/ads/research`, wid)?.title).toBe("Ad research");
    expect(pageGuideFor(`/app/w/${wid}/ads`, wid)?.title).toBe("Ad review");
    expect(pageGuideFor(`/app/w/${wid}/sites/abc`, wid)?.title).toBe("Funnels & pages");
    expect(pageGuideFor(`/app/w/${wid}/automations/new`, wid)?.title).toBe("Automations");
    expect(pageGuideFor(`/app/agency/x`, wid)).toBeNull();
    // Every guide is short enough to read at a glance.
    for (const g of Object.values(PAGE_GUIDES)) expect(g.what.length, g.title).toBeLessThan(130);
  });
});
