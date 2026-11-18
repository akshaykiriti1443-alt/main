import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { createElement as h } from "react";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import {
  COVER_PHOTO_MAX_BYTES,
  checkCoverPhoto,
  deleteCoverPhoto,
  getCoverPhoto,
  hasCoverPhoto,
  saveCoverPhoto,
  sniffImage,
  stripImageMetadata,
} from "@/server/cover/photo";
import { COVER_LOOKS, COVER_SIZE, coverData, headlinePieces, headlineSize, loadCoverData, skoolCoverPng } from "@/server/cover/skoolCover";
import { prizeHeadline, shortWho } from "@/server/cover/cleanText";
import { runLaunchKit } from "@/server/ai/launchKit";
import { removeCoverPhotoAction, saveCoverHeadlineAction, uploadCoverPhotoAction } from "@/app/app/w/[wid]/launch/actions";
import { makeWorkspace } from "./helpers";
import { TINY_JPEG_BASE64 } from "./coverPhotoFixture";

// "Add my photo" and the new cover: the member's own photo, checked and kept per workspace, and a
// YouTube-thumbnail cover (photo + FOR WHO + the Prize in big words) in every look.

const h2 = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock("@/server/tenancy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenancy")>()),
  requireWorkspace: async () => h2.ctx,
}));
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: () => {},
}));

const JPEG = Buffer.from(TINY_JPEG_BASE64, "base64");

/** A see-through PNG of a simple figure (a stand-in for a cut-out photo). */
async function cutoutPng(): Promise<Buffer> {
  const img = new ImageResponse(
    h("div", { style: { width: 300, height: 380, display: "flex" } }, h("svg", { width: 300, height: 380, viewBox: "0 0 300 380" }, h("ellipse", { cx: 150, cy: 100, rx: 60, ry: 72, fill: "#333" }), h("path", { d: "M20 380 C20 260 70 210 150 200 C230 210 280 260 280 380 Z", fill: "#333" }))),
    { width: 300, height: 380 },
  );
  return Buffer.from(await img.arrayBuffer());
}

/** PNG chunk with a bad CRC is fine here: only the chunk walker reads it. */
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
}

async function signIn() {
  const made = await makeWorkspace();
  const db = await getDb();
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, made.ws.id));
  h2.ctx = { workspace, user: { ...made.user, isPlatformAdmin: false }, role: "owner" };
  return { ...made, ws: workspace };
}

const isCoverPng = (png: Buffer) => png.subarray(1, 4).toString("latin1") === "PNG" && png.readUInt32BE(16) === COVER_SIZE.width && png.readUInt32BE(20) === COVER_SIZE.height;

describe("photo checks: only real PNG or JPEG bytes", () => {
  it("reads the real type and size from the bytes, not the name", async () => {
    expect(sniffImage(JPEG)).toEqual({ type: "jpeg", width: 200, height: 240, alpha: false });
    const png = await cutoutPng();
    expect(sniffImage(png)).toMatchObject({ type: "png", width: 300, height: 380, alpha: true });
  });

  it("never accepts SVG, GIF, WebP, HTML or junk", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="300" height="300"/></svg>');
    const gif = Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00", "latin1");
    const webp = Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 ", "latin1");
    for (const bad of [svg, gif, webp, Buffer.from("<html><script>x</script></html>"), Buffer.alloc(0), Buffer.from([0xff, 0xd8, 0xff])]) {
      expect(sniffImage(bad)).toBeNull();
      expect(checkCoverPhoto(bad).ok).toBe(false);
    }
    expect(checkCoverPhoto(svg)).toEqual({ ok: false, error: "That isn't a photo we can use. Pick a PNG or JPG photo." });
  });

  it("refuses a photo that's too big or too small, with a plain reason", () => {
    const huge = Buffer.concat([JPEG, Buffer.alloc(COVER_PHOTO_MAX_BYTES)]);
    expect(checkCoverPhoto(huge)).toMatchObject({ ok: false, error: expect.stringContaining("too big") });
    // A PNG header that says 40 x 40.
    const tiny = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", Buffer.from([0, 0, 0, 40, 0, 0, 0, 40, 8, 6, 0, 0, 0])), pngChunk("IEND", Buffer.alloc(0))]);
    expect(checkCoverPhoto(tiny)).toMatchObject({ ok: false, error: expect.stringContaining("too small") });
    expect(checkCoverPhoto(JPEG).ok).toBe(true);
  });

  it("drops camera and location data: EXIF from a JPEG, text from a PNG", async () => {
    const exif = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x16]), Buffer.from("Exif\0\0GPS 51.5N 0.1W", "latin1")]);
    const withExif = Buffer.concat([JPEG.subarray(0, 2), exif, JPEG.subarray(2)]);
    expect(withExif.includes(Buffer.from("GPS"))).toBe(true);
    const clean = stripImageMetadata(withExif, "jpeg");
    expect(clean.includes(Buffer.from("GPS"))).toBe(false);
    expect(sniffImage(clean)).toMatchObject({ type: "jpeg", width: 200, height: 240 });

    const png = await cutoutPng();
    const withText = Buffer.concat([png.subarray(0, 33), pngChunk("tEXt", Buffer.from("Location\0Home address", "latin1")), png.subarray(33)]);
    const cleanPng = stripImageMetadata(withText, "png");
    expect(cleanPng.includes(Buffer.from("Home address"))).toBe(false);
    expect(cleanPng.equals(png)).toBe(true);
  });

  it("refuses a header that asks for a huge picture, and a header with no picture after it", async () => {
    const ihdr = (w: number, hgt: number) => {
      const d = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 8, 6, 0, 0, 0]);
      d.writeUInt32BE(w, 0);
      d.writeUInt32BE(hgt, 4);
      return pngChunk("IHDR", d);
    };
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // A tiny file whose header says 3000 x 3000: the renderer would unpack all of it.
    const bomb = Buffer.concat([sig, ihdr(3000, 3000), pngChunk("IDAT", Buffer.alloc(16)), pngChunk("IEND", Buffer.alloc(0))]);
    expect(checkCoverPhoto(bomb)).toMatchObject({ ok: false, error: expect.stringContaining("too large") });

    const a = await makeWorkspace();
    // Header only: passes the sniff, but there is nothing to draw.
    const noPixels = Buffer.concat([sig, ihdr(300, 300), pngChunk("IEND", Buffer.alloc(0))]);
    expect(checkCoverPhoto(noPixels).ok).toBe(true);
    expect(await saveCoverPhoto(a.ws.id, noPixels)).toMatchObject({ ok: false, error: expect.stringContaining("isn't a photo") });
    const sos = JPEG.indexOf(Buffer.from([0xff, 0xda]));
    expect(sos).toBeGreaterThan(0);
    expect(await saveCoverPhoto(a.ws.id, JPEG.subarray(0, sos))).toMatchObject({ ok: false, error: expect.stringContaining("isn't a photo") });
    expect(await hasCoverPhoto(a.ws.id)).toBeNull();
  });

  it("keeps the picture when the JPEG has fill bytes between its parts", () => {
    const withFill = Buffer.concat([JPEG.subarray(0, 2), Buffer.from([0xff, 0xff]), JPEG.subarray(2)]);
    const clean = stripImageMetadata(withFill, "jpeg");
    expect(clean.includes(Buffer.from([0xff, 0xda]))).toBe(true);
    expect(sniffImage(clean)).toMatchObject({ type: "jpeg", width: 200, height: 240 });
  });
});

describe("stored per workspace", () => {
  it("one photo per workspace; another workspace never sees it", async () => {
    const a = await makeWorkspace();
    const b = await makeWorkspace();
    const saved = await saveCoverPhoto(a.ws.id, JPEG);
    expect(saved.ok).toBe(true);
    expect((await getCoverPhoto(a.ws.id))?.src.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(await getCoverPhoto(b.ws.id)).toBeNull();
    expect(await deleteCoverPhoto(b.ws.id)).toBe(false);
    expect(await getCoverPhoto(a.ws.id)).not.toBeNull();

    // A new photo replaces the old one; a see-through PNG is a cut-out unless the browser says it isn't.
    const png = await cutoutPng();
    await saveCoverPhoto(a.ws.id, png);
    const now = await getCoverPhoto(a.ws.id);
    expect(now).toMatchObject({ type: "png", cutout: true, width: 300 });
    expect((await saveCoverPhoto(a.ws.id, png, { cutout: false })).ok).toBe(true);
    expect((await hasCoverPhoto(a.ws.id))?.cutout).toBe(false);
    // A JPEG can never be a cut-out.
    await saveCoverPhoto(a.ws.id, JPEG, { cutout: true });
    expect((await getCoverPhoto(a.ws.id))?.cutout).toBe(false);
    const db = await getDb();
    const rows = await db.query.aiGenerations.findMany({ where: (g, { and, eq }) => and(eq(g.workspaceId, a.ws.id), eq(g.kind, "cover_photo")) });
    expect(rows).toHaveLength(1);

    expect(await deleteCoverPhoto(a.ws.id)).toBe(true);
    expect(await getCoverPhoto(a.ws.id)).toBeNull();
  });

  it("Add my photo: the action saves a real photo, refuses SVG, and Remove takes it off", async () => {
    const { ws } = await signIn();
    const svg = new FormData();
    svg.set("photo", new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: "image/png" }), "me.png");
    expect(await uploadCoverPhotoAction(ws.id, svg)).toMatchObject({ ok: false });
    expect(await hasCoverPhoto(ws.id)).toBeNull();
    expect(await uploadCoverPhotoAction(ws.id, new FormData())).toEqual({ ok: false, error: "Pick a photo first." });

    const fd = new FormData();
    fd.set("photo", new Blob([new Uint8Array(await cutoutPng())], { type: "image/png" }), "me.png");
    fd.set("cutout", "1");
    expect(await uploadCoverPhotoAction(ws.id, fd)).toMatchObject({ ok: true });
    expect((await hasCoverPhoto(ws.id))?.cutout).toBe(true);
    expect(await removeCoverPhotoAction(ws.id)).toMatchObject({ ok: true });
    expect(await hasCoverPhoto(ws.id)).toBeNull();
  });
});

describe("the cover's words", () => {
  it("FOR <WHO> keeps the people, not the whole sentence", () => {
    expect(shortWho("Busy dads over 35 who want to get strong without living in the gym")).toBe("Busy dads over 35");
    expect(shortWho("for busy dads")).toBe("busy dads");
    expect(shortWho("a ".repeat(200)).length).toBeLessThanOrEqual(32);
    expect(shortWho("<b>Home</b> bakers")).toBe("Home bakers");
  });

  it("the Prize is short: the first clause, then a word cut", () => {
    expect(prizeHeadline("get strong in 3 gym sessions a week, without living in the gym")).toBe("Get strong in 3 gym sessions a week");
    expect(prizeHeadline("x ".repeat(100)).length).toBeLessThanOrEqual(40);
  });

  it("uses the kit's headline first, then the member's, then their result; never the price or trial", () => {
    const input = { businessName: "The 45-Minute Dad", audience: "busy dads over 35", outcome: "get strong in 3 gym sessions a week, without living in the gym", price: "$29", trialDays: 7, ownerName: "Sam" };
    expect(coverData({ input, kit: { coverHeadline: "Strong in 3 sessions a week" } }).headline).toBe("Strong in 3 sessions a week");
    expect(coverData({ input: { ...input, coverHeadline: "Dad strong" } }).headline).toBe("Dad strong");
    const d = coverData({ input });
    expect(d.headline).toBe("Get strong in 3 gym sessions a week");
    expect(d.eyebrow).toBe("For busy dads over 35");
    expect(d.owner).toBe("Sam");
    expect(`${d.headline} ${d.eyebrow}`).not.toMatch(/\$29|trial/i);
  });

  it("highlights the number and its word, keeps tiny words with the next, and fits the column", () => {
    expect(headlinePieces("Strong in 3 sessions a week")).toEqual([
      { text: "Strong", mark: "none" },
      { text: "in", mark: "none" },
      { text: "3 sessions", mark: "marker" },
      { text: "a week", mark: "none" },
    ]);
    expect(headlinePieces("Bake a better loaf every weekend").filter((p) => p.mark === "accent").map((p) => p.text)).toEqual(["every", "weekend"]);
    const big = headlineSize(headlinePieces("Strong in 3 sessions a week"), 560, 330);
    expect(big.size).toBeGreaterThanOrEqual(90);
    expect(big.rows).toBeLessThanOrEqual(3);
    const long = headlineSize(headlinePieces("Supercalifragilistic transformations guaranteed"), 560, 330);
    expect(long.size).toBeLessThan(big.size);
  });
});

describe("the cover picture", () => {
  const base = coverData({ input: { businessName: "The 45-Minute Dad", audience: "busy dads over 35", outcome: "get strong in 3 gym sessions a week", brandColor: "#2A44EE" } });

  it("draws a 1084x576 PNG in every look: no photo, a framed photo and a cut-out", async () => {
    const framed = { src: `data:image/jpeg;base64,${TINY_JPEG_BASE64}`, width: 200, height: 240, cutout: false };
    const png = await cutoutPng();
    const cut = { src: `data:image/png;base64,${png.toString("base64")}`, width: 300, height: 380, cutout: true };
    for (const look of COVER_LOOKS) {
      const plain = await skoolCoverPng({ ...base, photo: null }, look);
      const withPhoto = await skoolCoverPng({ ...base, photo: framed }, look);
      const withCutout = await skoolCoverPng({ ...base, photo: cut }, look);
      for (const p of [plain, withPhoto, withCutout]) expect(isCoverPng(p), look).toBe(true);
      expect(withPhoto.equals(plain)).toBe(false);
      expect(withCutout.equals(plain)).toBe(false);
    }
  }, 120_000);

  it("loadCoverData brings this workspace's own photo, never another's", async () => {
    const a = await makeWorkspace();
    const b = await makeWorkspace();
    await saveCoverPhoto(a.ws.id, JPEG);
    const db = await getDb();
    const [wsA] = await db.select().from(workspaces).where(eq(workspaces.id, a.ws.id));
    const [wsB] = await db.select().from(workspaces).where(eq(workspaces.id, b.ws.id));
    expect((await loadCoverData(wsA, null)).photo?.width).toBe(200);
    expect((await loadCoverData(wsB, null)).photo).toBeNull();
  });
});

describe("Cover headline on the kit", () => {
  const ANSWERS = { businessName: "Fit Dads Club", ownerName: "Sam", niche: "strength for dads", audience: "busy dads", outcome: "get strong in 3 sessions a week", price: "$29", trialDays: 7, skoolUrl: "", tone: "friendly", brandColor: "#2A44EE" };

  it("is written for every kit, and a member's own words are kept word for word", async () => {
    const { ws } = await signIn();
    const kit = await runLaunchKit(ws.id, ANSWERS, { useAi: false });
    if (!kit.ok) throw new Error(kit.error);
    const db = await getDb();
    const row = await db.query.aiGenerations.findFirst({ where: (g, { eq }) => eq(g.id, kit.generationId) });
    expect(row?.output.coverHeadline).toBe("Get strong in 3 sessions a week");

    const own = await runLaunchKit(ws.id, { ...ANSWERS, coverHeadline: "Dad strong by summer" }, { useAi: false });
    if (!own.ok) throw new Error(own.error);
    const ownRow = await db.query.aiGenerations.findFirst({ where: (g, { eq }) => eq(g.id, own.generationId) });
    expect(ownRow?.output.coverHeadline).toBe("Dad strong by summer");
  });

  it("Save changes it on this workspace's kit only, and the cover reads it", async () => {
    const { ws } = await signIn();
    const kit = await runLaunchKit(ws.id, ANSWERS, { useAi: false });
    if (!kit.ok) throw new Error(kit.error);
    expect(await saveCoverHeadlineAction(ws.id, kit.generationId, "  <b>Strong</b> in 3 sessions a week ")).toMatchObject({ ok: true });
    const db = await getDb();
    const [w] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect((await loadCoverData(w, kit.generationId)).headline).toBe("Strong in 3 sessions a week");
    // Rebuild keeps it: it's saved as the kit's answer too.
    const row = await db.query.aiGenerations.findFirst({ where: (g, { eq }) => eq(g.id, kit.generationId) });
    expect(row?.input.coverHeadline).toBe("Strong in 3 sessions a week");
    expect(await saveCoverHeadlineAction(ws.id, kit.generationId, " ")).toMatchObject({ ok: false });

    // Someone else's kit id changes nothing.
    const other = await makeWorkspace();
    const theirs = await runLaunchKit(other.ws.id, ANSWERS, { useAi: false });
    if (!theirs.ok) throw new Error(theirs.error);
    expect(await saveCoverHeadlineAction(ws.id, theirs.generationId, "Hijacked")).toMatchObject({ ok: false });
    const theirRow = await db.query.aiGenerations.findFirst({ where: (g, { eq }) => eq(g.id, theirs.generationId) });
    expect(theirRow?.output.coverHeadline).not.toBe("Hijacked");
  });
});

describe("Make my Skool cover: a failed call stays on the page", () => {
  it("turns a thrown action (dropped connection, no admin rights) into a message", async () => {
    const { safely } = await import("@/app/app/w/[wid]/launch/cover-maker");
    expect(await safely(async () => ({ ok: true, message: "Saved." }))).toEqual({ ok: true, message: "Saved." });
    const failed = await safely(async () => {
      throw new Error("You don't have permission for this action.");
    });
    expect(failed).toMatchObject({ ok: false, error: expect.stringContaining("try again") });
  });
});
