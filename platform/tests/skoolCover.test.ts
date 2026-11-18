import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { runLaunchKit } from "@/server/ai/launchKit";
import { COVER_LIMITS, COVER_LOOKS, cleanCoverText, coverData, loadCoverData, parseLook } from "@/server/cover/skoolCover";
import { makeWorkspace } from "./helpers";

// The route runs as whoever the session says; tenancy's own membership check stays real.
const who = vi.hoisted(() => ({ user: null as null | { id: string; email: string; name: string; isPlatformAdmin: boolean } }));
vi.mock("@/server/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth")>()),
  getCurrentUser: async () => who.user,
  requireUser: async () => {
    if (!who.user) throw new Error("NEXT_REDIRECT");
    return who.user;
  },
}));

const ANSWERS = {
  businessName: "Fit Dads Club",
  ownerName: "Sam",
  niche: "fat loss for dads",
  audience: "busy dads",
  outcome: "lose 10 lbs in 8 weeks without a gym",
  leadMagnetIdea: "Dad Reset",
  price: "$29",
  trialDays: 7,
  skoolUrl: "",
  tone: "friendly",
  brandColor: "#7c3aed",
};

async function member(answers: Partial<typeof ANSWERS> = {}) {
  const made = await makeWorkspace();
  const kit = await runLaunchKit(made.ws.id, { ...ANSWERS, ...answers }, { useAi: false });
  if (!kit.ok) throw new Error(kit.error);
  return { ...made, kitId: kit.generationId as string };
}
const signIn = (u: { id: string; email: string; name: string }) => (who.user = { id: u.id, email: u.email, name: u.name, isPlatformAdmin: false });

async function get(q: string) {
  const { GET } = await import("@/app/api/skool-cover/route");
  return GET(new Request(`http://localhost:3000/api/skool-cover?${q}`));
}

beforeEach(() => {
  who.user = null;
});

describe("cleanCoverText: only plain, short text reaches the picture", () => {
  it("drops tags, entities, emoji and control characters, and collapses spaces", () => {
    expect(cleanCoverText("<b>Fit</b> <script>alert(1)</script>Dads", 80)).toBe("Fit alert(1) Dads");
    expect(cleanCoverText("🚀  Fit\u0000 Dads\n\nClub 💪🏽", 80)).toBe("Fit Dads Club");
    expect(cleanCoverText("Tom &amp; Jerry <img src=x onerror=alert(1)", 80)).toBe("Tom Jerry");
    expect(cleanCoverText("a > b < c", 80)).toBe("a b c");
    expect(cleanCoverText("‮evil​", 80)).toBe("evil");
    expect(cleanCoverText("🔥 - Lose weight", 80)).toBe("Lose weight");
  });

  it("clamps on a word boundary with an ellipsis, never past the limit", () => {
    const long = "Bake a bakery-quality loaf every weekend with a starter that never dies and a schedule that fits a real life every week";
    const out = cleanCoverText(long, 60);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith("…")).toBe(true);
    expect(long.startsWith(out.slice(0, -1))).toBe(true);
    expect(cleanCoverText("x".repeat(500), 48)).toHaveLength(48);
    expect(cleanCoverText("short", 48)).toBe("short");
  });

  it("turns anything that isn't a string into nothing", () => {
    for (const v of [undefined, null, 42, {}, ["a"], true]) expect(cleanCoverText(v, 40)).toBe("");
  });

  it("parses the look and falls back to the first", () => {
    expect(COVER_LOOKS.map(parseLook)).toEqual([...COVER_LOOKS]);
    expect(parseLook("<x>")).toBe("glow");
    expect(parseLook(null)).toBe("glow");
  });
});

describe("coverData", () => {
  it("clamps every field and reads the trial only when the group has one", () => {
    const d = coverData({
      input: { businessName: "N".repeat(300), outcome: "o ".repeat(400), audience: "a ".repeat(100), ownerName: "Z".repeat(200), price: "$29", trialDays: 7, brandColor: "#123456" },
    });
    expect(d.name.length).toBeLessThanOrEqual(COVER_LIMITS.name);
    expect(d.line.length).toBeLessThanOrEqual(COVER_LIMITS.line);
    expect(d.eyebrow.length).toBeLessThanOrEqual(COVER_LIMITS.eyebrow);
    expect(d.owner.length).toBeLessThanOrEqual(COVER_LIMITS.owner);
    expect(d.trialDays).toBe(7);
    expect(d.brandColor).toBe("#123456");

    expect(coverData({ input: { businessName: "A Club", price: "$29", trialDays: 0 } }).trialDays).toBeNull();
    // Unknown: no price, no trial answer, no trial in the offer.
    expect(coverData({ input: { businessName: "A Club" } }).trialDays).toBeNull();
    expect(coverData({ input: { businessName: "A Club", offer: "$19/month after a 14-day free trial" } }).trialDays).toBe(14);
  });

  it("says who it's for, takes the website's colour, and falls back to the About page's first real line", () => {
    const d = coverData({
      input: { businessName: "Fit Dads Club", audience: "busy dads", brandColor: "#2A44EE" },
      kit: { skoolAboutPage: "🚀 Fit Dads Club\n\nWHAT YOU GET:\nGet strong in 20 minutes a day.\n" },
      siteBrandColor: "#E11D48",
    });
    expect(d.eyebrow).toBe("For busy dads");
    expect(d.line).toBe("Get strong in 20 minutes a day.");
    expect(d.brandColor).toBe("#E11D48");
    expect(coverData({ input: { businessName: "X Club", brandColor: "red" as never }, siteBrandColor: "javascript:" }).brandColor).toBe("#2A44EE");
    expect(coverData({ settings: { businessName: "<i>Settings</i> Name" }, workspaceName: "ws" }).name).toBe("Settings Name");
  });

  it("only ever reads a kit from its own workspace", async () => {
    const a = await member({ businessName: "Alpha Club" });
    const b = await member({ businessName: "Bravo Club" });
    const db = await getDb();
    const [wsA] = await db.select().from(workspaces).where(eq(workspaces.id, a.ws.id));
    expect((await loadCoverData(wsA, b.kitId)).name).toBe("Alpha Club");
    expect((await loadCoverData(wsA, a.kitId)).name).toBe("Alpha Club");
    expect((await loadCoverData(wsA, "not-a-uuid")).brandColor).toBe("#7c3aed");
  });
});

describe("GET /api/skool-cover", () => {
  it("asks for a sign-in first", async () => {
    const { ws } = await member();
    const res = await get(`w=${ws.id}`);
    expect(res.status).toBe(401);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
  });

  it("is 404 for a bad id and for someone else's workspace", async () => {
    const mine = await member();
    const theirs = await member();
    signIn(mine.user);
    expect((await get("w=not-a-uuid")).status).toBe(404);
    expect((await get(`w=${theirs.ws.id}&download=1`)).status).toBe(404);
    expect((await get(`w=${theirs.ws.id}&kit=${theirs.kitId}`)).status).toBe(404);
  });

  it("is closed for a paused account", async () => {
    const { ws, user } = await member();
    const db = await getDb();
    await db.update(workspaces).set({ status: "paused" }).where(eq(workspaces.id, ws.id));
    signIn(user);
    expect((await get(`w=${ws.id}`)).status).toBe(403);
  });

  it("draws a 1084x576 PNG for the member, inline for the preview and as a download on request", async () => {
    const { ws, user, kitId } = await member();
    signIn(user);
    const preview = await get(`w=${ws.id}&kit=${kitId}&look=split`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("Content-Type")).toBe("image/png");
    expect(preview.headers.get("Content-Disposition")).toBe("inline");
    expect(preview.headers.get("Cache-Control")).toBe("private, no-store");
    const png = Buffer.from(await preview.arrayBuffer());
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1084);
    expect(png.readUInt32BE(20)).toBe(576);

    const download = await get(`w=${ws.id}&look=midnight&download=1`);
    expect(download.status).toBe(200);
    expect(download.headers.get("Content-Disposition")).toBe('attachment; filename="skool-cover.png"');
    await download.arrayBuffer();
  });
});
