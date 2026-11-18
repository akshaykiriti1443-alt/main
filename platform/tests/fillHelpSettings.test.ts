import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { apiTokens, workspaces } from "@/lib/db/schema";
import type { WorkspaceSettings } from "@/lib/db/types";
import { skoolAboutLink } from "@/lib/skoolLink";
import { cleanPixelId } from "@/lib/pixel";
import { saveBusinessAction, saveTrackingAction } from "@/actions/account";
import { createConnectorAction } from "@/actions/connectors";
import { businessContext, contextLines, latestKitAnswers } from "@/server/ai/businessContext";
import { runLaunchKit } from "@/server/ai/launchKit";
import { makeWorkspace } from "./helpers";

// "Whatever we ask members to fill out, the app helps them fill it out": Settings, Your AI and the Pixel box.

const h = vi.hoisted(() => ({ userId: "" }));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/tenancy", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/tenancy")>();
  return {
    ...real,
    requireWorkspace: async (wid: string) => {
      const { getDb: db } = await import("@/lib/db");
      const { workspaces: table } = await import("@/lib/db/schema");
      const { eq: is } = await import("drizzle-orm");
      const [workspace] = await (await db()).select().from(table).where(is(table.id, wid));
      if (!workspace) throw new Error("not found");
      return { workspace, user: { id: h.userId, email: "owner@example.com" }, role: "owner" };
    },
  };
});

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
async function run(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    const url = (e as { url?: string }).url;
    if (!url) throw e;
    const u = new URL(url, "http://x");
    return { ok: u.searchParams.get("ok"), error: u.searchParams.get("error") };
  }
  throw new Error("expected a redirect");
}
const settingsOf = async (wid: string) => {
  const [row] = await (await getDb()).select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, wid));
  return row.settings as WorkspaceSettings;
};

describe("Skool group link: pasted any way, saved as the About page", () => {
  it("turns any page of a group into its About page", () => {
    expect(skoolAboutLink("https://www.skool.com/fit-dads")).toBe("https://www.skool.com/fit-dads/about");
    expect(skoolAboutLink("  https://www.skool.com/fit-dads/classroom/abc?md=1 ")).toBe("https://www.skool.com/fit-dads/about");
    expect(skoolAboutLink("skool.com/fit-dads")).toBe("https://www.skool.com/fit-dads/about");
    expect(skoolAboutLink("www.skool.com/fit-dads/about")).toBe("https://www.skool.com/fit-dads/about");
  });

  it("leaves anything that isn't a group link as typed, so Save can say what's wrong", () => {
    expect(skoolAboutLink("")).toBe("");
    expect(skoolAboutLink("https://example.com/fit-dads")).toBe("https://example.com/fit-dads");
    expect(skoolAboutLink("https://www.skool.com/")).toBe("https://www.skool.com/");
    expect(skoolAboutLink("https://www.skool.com/discovery")).toBe("https://www.skool.com/discovery");
    expect(skoolAboutLink("https://www.skool.com/@sam-owner")).toBe("https://www.skool.com/@sam-owner");
    expect(skoolAboutLink("not a link")).toBe("not a link");
  });

  it("Save in Business details stores the About page link", async () => {
    const { ws, user } = await makeWorkspace();
    h.userId = user.id;
    const r = await run(saveBusinessAction(ws.id, form({ businessName: "Fit Dads Club", skoolUrl: "https://www.skool.com/fit-dads/classroom", niche: "", offer: "" })));
    expect(r.ok).toBe("Business details saved.");
    expect((await settingsOf(ws.id)).skoolUrl).toBe("https://www.skool.com/fit-dads/about");
    const bad = await run(saveBusinessAction(ws.id, form({ businessName: "Fit Dads Club", skoolUrl: "https://example.com/x" })));
    expect(bad.error).toMatch(/skool\.com link/);
  });
});

describe("Pixel ID: 15 or 16 digits, checked before it saves", () => {
  it("takes 15 and 16 digits and says plainly when it's not", () => {
    expect(cleanPixelId("123456789012345")).toEqual({ ok: true, id: "123456789012345" });
    expect(cleanPixelId("1234567890123456")).toEqual({ ok: true, id: "1234567890123456" });
    for (const n of [14, 17]) {
      const res = cleanPixelId("1".repeat(n));
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("15 or 16 digits");
        expect(res.error).toContain(`You pasted ${n}`);
      }
    }
  });

  it("Save refuses a short ID and keeps the old one", async () => {
    const { ws, user } = await makeWorkspace();
    h.userId = user.id;
    const r = await run(saveTrackingAction(ws.id, form({ metaPixelId: "12345678901234" })));
    expect(r.error).toContain("15 or 16 digits");
    expect((await settingsOf(ws.id)).metaPixelId).toBeUndefined();
    const ok = await run(saveTrackingAction(ws.id, form({ metaPixelId: "1234 5678 9012 345" })));
    expect(ok.ok).toMatch(/Pixel ID saved/);
    expect((await settingsOf(ws.id)).metaPixelId).toBe("123456789012345");
  });

  it("the Settings box runs the same check as Save", () => {
    const helper = readFileSync(join(process.cwd(), "src/app/app/w/[wid]/settings/fill-help.tsx"), "utf8");
    expect(helper).toContain('from "@/lib/pixel"');
    expect(helper).toContain("setCustomValidity");
    expect(helper).toContain("navigator.clipboard.readText");
  });
});

describe("Your AI: the connector is called OneX unless they name it", () => {
  it("names a blank connector OneX", async () => {
    const { ws, user } = await makeWorkspace();
    h.userId = user.id;
    const res = await createConnectorAction(ws.id, {}, form({ name: "" }));
    expect(res.url).toBeTruthy();
    const rows = await (await getDb()).select({ name: apiTokens.name }).from(apiTokens).where(eq(apiTokens.workspaceId, ws.id));
    expect(rows.map((r) => r.name)).toEqual(["OneX"]);
    const box = readFileSync(join(process.cwd(), "src/app/app/w/[wid]/settings/connector.tsx"), "utf8");
    expect(box).toContain('defaultValue="OneX"');
  });
});

describe("Business context: what they already told us, for prefill and every write-it-for-me button", () => {
  it("is empty-safe before a launch kit, and reads the kit's answers after one", async () => {
    const { ws } = await makeWorkspace();
    expect(await latestKitAnswers(ws.id)).toBeNull();
    const before = await businessContext(ws.id);
    expect(before.businessName).toBe("Fit Dads Club");
    expect(before.outcome).toBe("");
    expect(contextLines(before)).not.toMatch(/undefined|null|\(none\)/);

    const built = await runLaunchKit(
      ws.id,
      { businessName: "Fit Dads Club", ownerName: "Sam Owner", niche: "fat loss for busy dads", audience: "dads with desk jobs", outcome: "lose 10 lbs in 8 weeks", leadMagnetIdea: "The 7-Day Dad Reset", price: "$29", trialDays: 7 },
      { useAi: false },
    );
    expect(built.ok).toBe(true);
    const kit = await latestKitAnswers(ws.id);
    expect(kit?.input.niche).toBe("fat loss for busy dads");
    expect(kit?.leadMagnetName).toBe("7-Day Dad Reset");
    const ctx = await businessContext(ws.id);
    expect(ctx).toMatchObject({ niche: "fat loss for busy dads", audience: "dads with desk jobs", outcome: "lose 10 lbs in 8 weeks", ownerName: "Sam Owner", offer: "$29 a month with a 7-day free trial" });
    expect(contextLines(ctx)).toContain("Main outcome members want: lose 10 lbs in 8 weeks");
  });

  it("Settings prefills What you help with and Your offer from the kit, with examples", () => {
    const page = readFileSync(join(process.cwd(), "src/app/app/w/[wid]/settings/page.tsx"), "utf8");
    expect(page).toContain("latestKitAnswers(wid)");
    expect(page).toContain('placeholder="Fat loss for busy dads"');
    expect(page).toContain('placeholder="$29 a month with a 7-day free trial"');
    expect(page).toContain("<SkoolLinkInput");
    expect(page).toContain("<PixelIdInput");
  });
});
