import { afterEach, describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { chargeUsage } from "@/server/wallet";
import { createSite, listPages } from "@/server/sites";
import { COPY_FIELDS, COPY_NO_AI, COPY_NO_RUNS, cleanCopy, starterCopy, writePageCopy } from "@/server/ai/pageCopy";
import type { BusinessContext } from "@/server/ai/businessContext";
import { makeWorkspace } from "./helpers";

const aiWas = env.aiEnabled;
afterEach(() => {
  env.aiEnabled = aiWas;
});

async function pageFor(workspaceId: string) {
  const site = await createSite({
    workspaceId,
    name: "Fit Dads funnel",
    leadMagnetName: "7-Day Dad Reset",
    leadMagnetUrl: "/guide",
    pages: [{ slug: "", title: "Opt-in page", kind: "optin", content: { sections: [] } }],
  });
  const [page] = await listPages(site.id);
  return { site, page };
}

const ctx: BusinessContext = {
  businessName: "Fit Dads Club",
  ownerName: "Sam Owner",
  niche: "fat loss for busy dads",
  audience: "dads with desk jobs",
  outcome: "lose 10 lbs in 8 weeks",
  offer: "",
  leadMagnetName: "The 7-Day Dad Reset",
  skoolUrl: "",
  tone: "friendly",
};

describe("page editor: Write it for me", () => {
  it("has a sensible starter line for every box, built from what the member told us", () => {
    for (const field of COPY_FIELDS) {
      const line = starterCopy(field, "hero", ctx);
      expect(line.trim().length).toBeGreaterThan(0);
      expect(line).not.toMatch(/undefined|null|\{\{/);
    }
    expect(starterCopy("headline", "hero", ctx)).toBe("Lose 10 lbs in 8 weeks. Start today.");
    expect(starterCopy("subheadline", "hero", ctx)).toContain("7-Day Dad Reset");
    expect(starterCopy("subheadline", "hero", ctx)).not.toContain("The 7-Day");
    expect(starterCopy("button", "hero", ctx)).toBe("Send me the checklist");
    expect(starterCopy("button", "cta", ctx)).toBe("Join the group");
    expect(starterCopy("bullets", "hero", ctx).split("\n")).toHaveLength(3);
    expect(starterCopy("title", "steps", ctx)).toBe("How it works");
    expect(starterCopy("title", "text", ctx)).toBe("Hi, I'm Sam");
    // Nothing known yet: still a usable line, never a blank.
    const empty: BusinessContext = { ...ctx, ownerName: "", niche: "", audience: "", outcome: "", leadMagnetName: "", businessName: "" };
    expect(starterCopy("headline", "hero", empty)).toBe("Your first step starts here.");
    expect(starterCopy("body", "text", empty)).toContain("people like you");
  });

  it("cleans what the AI wrote so it drops into the box", () => {
    expect(cleanCopy("headline", '"Lose the dad bod."\nExtra line')).toBe("Lose the dad bod.");
    expect(cleanCopy("bullets", "- One\n- Two\n3. Three")).toBe("One\nTwo\nThree");
    expect(cleanCopy("button", "Send me the checklist please and thank you so much friend").length).toBeLessThanOrEqual(40);
  });

  it("with no AI: an empty box gets a starter line and a note on how to connect AI", async () => {
    env.aiEnabled = false;
    const { ws } = await makeWorkspace();
    const { page } = await pageFor(ws.id);
    const res = await writePageCopy(ws.id, page.id, { field: "subheadline", section: "hero", current: "", nearby: "" });
    expect(res).toMatchObject({ ok: true, usedAi: false, note: COPY_NO_AI });
    if (res.ok) expect(res.text).toContain("7-Day Dad Reset");
  });

  it("with no AI: words already in the box stay theirs (tidied), never swapped for a template", async () => {
    env.aiEnabled = false;
    const { ws } = await makeWorkspace();
    const { page } = await pageFor(ws.id);
    const res = await writePageCopy(ws.id, page.id, { field: "headline", section: "hero", current: "  Get   fit in 10 minutes a day  ", nearby: "" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.text).toBe("Get fit in 10 minutes a day");
      expect(res.usedAi).toBe(false);
      expect(res.note).toMatch(/Your AI/);
    }
  });

  it("free runs used up: says so plainly and still fills the box", async () => {
    env.aiEnabled = true;
    const { ws } = await makeWorkspace();
    const { page } = await pageFor(ws.id);
    for (let i = 0; i < 50; i++) {
      try {
        await chargeUsage(ws.id, "ai_assist", 1, { description: "test" });
      } catch {
        break;
      }
    }
    const res = await writePageCopy(ws.id, page.id, { field: "button", section: "form", current: "", nearby: "" });
    expect(res).toMatchObject({ ok: true, usedAi: false, note: COPY_NO_RUNS, text: "Send me the checklist" });
  });

  it("refuses another account's page and a box it doesn't know", async () => {
    env.aiEnabled = false;
    const a = await makeWorkspace();
    const b = await makeWorkspace();
    const { page } = await pageFor(a.ws.id);
    const res = await writePageCopy(b.ws.id, page.id, { field: "headline", section: "hero", current: "", nearby: "" });
    expect(res.ok).toBe(false);
    const bad = await writePageCopy(a.ws.id, page.id, { field: "password" as never, section: "hero", current: "", nearby: "" });
    expect(bad.ok).toBe(false);
    expect((await writePageCopy(a.ws.id, "not-a-page", { field: "headline", section: "hero", current: "", nearby: "" })).ok).toBe(false);
  });
});
