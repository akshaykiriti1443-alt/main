import { describe, expect, it } from "vitest";
import { companionSnapshot } from "@/server/companion";
import { computePath } from "@/server/path";
import { PAGE_GUIDES, pageGuideFor, STEP_HOWTO } from "@/lib/guides";
import { makeWorkspace } from "./helpers";

describe("Penny, the step-by-step guide", () => {
  it("knows how to do every step on Your path", async () => {
    const { ws, user } = await makeWorkspace();
    const path = await computePath({ ...ws, accessSource: "member" }, user.id, { entryTicketOn: true });
    const keys = path.stages.flatMap((s) => s.steps.map((x) => x.key)).filter((k) => k !== "app");
    for (const k of keys) expect(STEP_HOWTO[k]?.how.length, k).toBeGreaterThan(0);
  });

  it("starts a new member on Connect your AI, with where to go and how far along they are", async () => {
    const { ws, user } = await makeWorkspace();
    const snap = await companionSnapshot(ws, user.id);
    const next = snap.steps.find((s) => !s.done);
    expect(next).toMatchObject({ key: "ai", lesson: "0.4", href: `/app/w/${ws.id}/ai`, stage: "Start here" });
    expect(snap.done).toBe(snap.steps.filter((s) => s.done).length); // "Open your app", plus the Skool link the helper sets
    expect(snap.total).toBe(snap.steps.length);
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
