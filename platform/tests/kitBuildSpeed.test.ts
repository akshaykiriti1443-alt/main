import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { env } from "@/lib/env";
import { runLaunchKit } from "@/server/ai/launchKit";
import { listSites } from "@/server/sites";
import { GET as companionGet } from "@/app/api/companion/route";
import { KitButtons, buildingLabel } from "@/app/app/w/[wid]/launch/kit-buttons";
import { makeWorkspace } from "./helpers";

// Building the launch kit with no AI is near-instant, and nothing in the browser can hold it up:
// Penny's look-up after every page change is a plain GET, not a server action (the browser runs server
// actions one at a time, so Build my launch kit used to queue behind hers, and its redirect could stall).

const src = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", ...p), "utf8");
const GYM = {
  businessName: "The 45-Minute Dad",
  ownerName: "Dad Coach Demo",
  niche: "Getting strong in 3 gym sessions a week",
  audience: "Busy dads over 35",
  outcome: "Get strong without living in the gym",
  leadMagnetIdea: "The 3-Day Dad Strength Plan",
  price: "$29",
  trialDays: 7,
};

describe("the no-AI launch kit", () => {
  it("builds the website on the server in well under a few seconds", async () => {
    const { ws } = await makeWorkspace();
    const aiWas = env.aiEnabled;
    env.aiEnabled = false;
    try {
      const t = Date.now();
      const res = await runLaunchKit(ws.id, GYM);
      // Under a second on its own; the margin is for a busy machine running every test file at once.
      expect(Date.now() - t).toBeLessThan(8000);
      expect(res).toMatchObject({ ok: true, usedAi: false });
      expect(await listSites(ws.id)).toHaveLength(1);
    } finally {
      env.aiEnabled = aiWas;
    }
  });
});

describe("Penny never queues in front of the member's buttons", () => {
  it("fetches her snapshot with a GET, not a server action", () => {
    const companion = src("components", "companion.tsx");
    expect(companion).toContain("/api/companion?w=");
    expect(companion).not.toMatch(/companionSnapshotAction|from "@\/actions\/companion"/);
    expect(existsSync(path.join(process.cwd(), "src", "actions", "companion.ts"))).toBe(false);
  });

  it("the snapshot route answers null, never an error page, for a bad or foreign workspace", async () => {
    for (const w of ["", "not-a-uuid", "00000000-0000-4000-8000-000000000000"]) {
      const res = await companionGet(new Request(`http://localhost/api/companion?w=${w}`));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(await res.json()).toBeNull();
    }
  });
});

describe("the build buttons", () => {
  it("say what is really happening: no AI is a quick build, not 'up to a minute'", () => {
    expect(buildingLabel(true)).toBe("Building your kit…");
    expect(buildingLabel(false)).toBe("Writing your kit… (up to a minute)");
    expect(src("app", "app", "w", "[wid]", "launch", "page.tsx")).toContain('noAi={runs.kind === "off"}');
  });

  it("the first press of a rebuild only arms: it can't also submit", () => {
    const buttons = src("app", "app", "w", "[wid]", "launch", "kit-buttons.tsx");
    expect(buttons).toContain("e.preventDefault()");
    const html = renderToStaticMarkup(createElement(KitButtons, { starterAction: async () => {}, rebuild: true, aiDisabled: false, offerStarter: true, noAi: true }));
    expect(html).toContain("Build my launch kit");
    expect(html).toContain("Use the starter template instead");
  });
});
