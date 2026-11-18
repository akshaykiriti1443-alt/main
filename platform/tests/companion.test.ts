import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { companionSnapshot, snapshotFromPath } from "@/server/companion";
import { computePath } from "@/server/path";
import { howFor, PAGE_GUIDES, pageGuideFor, STEP_HOWTO } from "@/lib/guides";
import { HELLO_STEP, POST_KEYS, WEEK, WEEK_STEPS } from "@/lib/week";
import { makeWorkspace } from "./helpers";

// The data-guide targets that exist on the app's pages, so "Show me where" always has something to glow.
const TARGETS = ["ai-key", "ai-connect", "skool-link", "kit-build", "site-publish", "pixel", "research-analyse", "ad-studio-make", "unlock-create", "ad-review", "checkin", "automation-ai", "agency-new"];

describe("Penny, the step-by-step guide", () => {
  it("knows how to do every step of the week, with the posts sharing one entry", () => {
    for (const s of [HELLO_STEP, ...WEEK_STEPS]) {
      if (POST_KEYS.includes(s.key)) {
        expect(STEP_HOWTO, s.key).not.toHaveProperty(s.key);
        continue;
      }
      expect(STEP_HOWTO[s.key]?.how.length, s.key).toBeGreaterThan(0);
    }
    expect(STEP_HOWTO.post.how.join(" ")).toContain("{section}");
    for (const d of WEEK) {
      const how = howFor(`post${d.day}`, d.section)!.how.join(" ");
      expect(how, `Day ${d.day}`).toContain(d.section);
      expect(how).not.toContain("{section}");
    }
    // One to four lines each, and every glow target is one that exists.
    for (const [k, h] of Object.entries(STEP_HOWTO)) {
      expect(h.how.length, k).toBeGreaterThanOrEqual(1);
      expect(h.how.length, k).toBeLessThanOrEqual(4);
      if (h.target) expect(TARGETS, k).toContain(h.target);
    }
    // Gone: the Day 3 tracking bundle, the removed Skool member CRM, and the old lesson numbers.
    expect(STEP_HOWTO).not.toHaveProperty("tracking");
    expect(STEP_HOWTO).not.toHaveProperty("price");
    expect(STEP_HOWTO).not.toHaveProperty("sync");
    expect(PAGE_GUIDES).not.toHaveProperty("skool");
    expect(JSON.stringify({ STEP_HOWTO, PAGE_GUIDES })).not.toMatch(/four piles|member export|Hobby way/i);
    expect(JSON.stringify({ STEP_HOWTO, PAGE_GUIDES })).not.toMatch(/3-Pack|\b[Ll]esson \d\.\d|Hook, Turn or Door|Day 8|Day 9|Optional: your Day 1/);
    expect(STEP_HOWTO.lead1.how.join(" ")).toMatch(/own email/);
    expect(STEP_HOWTO.bio.how.join(" ")).toContain("(Instagram, TikTok or YouTube)");
    // Day 1's AI step is Claude first, through the connector; the free Gemini key is the last line, the way round.
    expect(STEP_HOWTO.ai.target).toBe("ai-connect");
    expect(STEP_HOWTO.ai.how[0]).toMatch(/Create connector URL/);
    expect(STEP_HOWTO.ai.how.at(-1)).toMatch(/^No Claude\? .*Gemini key/);
    expect(PAGE_GUIDES.ai.tips[0]).toMatch(/Claude first.*connector/i);
    expect(PAGE_GUIDES.ai.tips.join(" ")).toMatch(/No Claude\? A free Google Gemini key works too/);
  });

  it("says nothing a Member can't use", () => {
    expect(PAGE_GUIDES.leads.tips.join(" ")).not.toMatch(/Inbox|Growth plan/);
    expect(PAGE_GUIDES.sites.tips.join(" ")).not.toMatch(/domain/i);
    expect(PAGE_GUIDES[""].what).toBe("Your one next step is the big card. Everything else can wait.");
  });

  it("reads the same next step as the big card, and never picks one herself", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath(ws, user.id);
    const snap = snapshotFromPath(p);
    expect(snap.current?.key).toBe(p.current?.key);
    expect(snap).toMatchObject({ mode: "week", state: p.state, dayTitle: "Your first win", doneKeys: p.doneKeys, waitingOnMeta: false });
    expect(snap.wins.skool).toBe("Done: your group's link is saved. Every Join button now goes there.");
    expect((await companionSnapshot(ws, user.id)).current?.key).toBe(p.current?.key);
  });

  it("has no progress bar, no step-of-28 counter and no skip cookie any more", () => {
    const src = readFileSync(path.join(process.cwd(), "src", "components", "companion.tsx"), "utf8");
    expect(src).not.toMatch(/guide-progress|progressbar|GUIDE_SKIP_COOKIE|Skip this step|Or follow the glowing dot/);
    expect(src).toContain("onx:guide-next");
  });

  it("explains the page you're on, including deeper pages", () => {
    const wid = "00000000-0000-4000-8000-000000000000";
    expect(pageGuideFor(`/app/w/${wid}`, wid)?.title).toBe("Dashboard");
    expect(pageGuideFor(`/app/w/${wid}/ads/research`, wid)?.title).toBe("Ad research");
    expect(pageGuideFor(`/app/w/${wid}/ads`, wid)?.title).toBe("Ad review");
    expect(pageGuideFor(`/app/w/${wid}/sites/abc`, wid)?.title).toBe("Funnels & pages");
    expect(pageGuideFor(`/app/w/${wid}/carousel`, wid)?.title).toBe("Make my carousel");
    expect(pageGuideFor(`/app/w/${wid}/automations/new`, wid)?.title).toBe("Automations");
    expect(pageGuideFor(`/app/agency/x`, wid)).toBeNull();
    // Every guide is short enough to read at a glance.
    for (const g of Object.values(PAGE_GUIDES)) expect(g.what.length, g.title).toBeLessThan(130);
  });
});
