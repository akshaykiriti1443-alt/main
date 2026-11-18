// "Add my photo": the member's own photo for their Skool cover. One per workspace, stored as an
// ai_generations row (kind "cover_photo") and only ever read or written through a workspace id, so one
// account can never see or change another's. Only real PNG or JPEG bytes are kept (checked by their
// first bytes, never by the name or the type the browser claims), never SVG or anything that can run.
// Text and location data (EXIF, XMP, PNG text chunks) are dropped before saving.
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiGenerations } from "@/lib/db/schema";

/** The browser shrinks photos before sending (about 1400 px); this leaves room and stays under the 2 MB form limit. */
export const COVER_PHOTO_MAX_BYTES = 1_500_000;
export const COVER_PHOTO_MIN_SIDE = 160;
/**
 * The browser sends at most about 1400 px, so this only stops a hand-made upload whose header asks the
 * renderer to unpack a huge picture from a small file (2048² stays a few tens of MB when drawn).
 */
export const COVER_PHOTO_MAX_SIDE = 2048;

export type ImageInfo = { type: "png" | "jpeg"; width: number; height: number; /** PNG that can be see-through. */ alpha: boolean };

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** What the bytes really are: a PNG or a JPEG with its size, or null for anything else (SVG, GIF, WebP, HEIC, junk). */
export function sniffImage(buf: Uint8Array): ImageInfo | null {
  if (buf.length >= 33 && PNG_SIG.every((b, i) => buf[i] === b)) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (String.fromCharCode(...buf.subarray(12, 16)) !== "IHDR") return null;
    const width = dv.getUint32(16);
    const height = dv.getUint32(20);
    const colorType = buf[25];
    let alpha = colorType === 4 || colorType === 6;
    if (!alpha) {
      // A palette or grey PNG can still be see-through through a tRNS chunk.
      for (const c of pngChunks(buf)) {
        if (c.type === "tRNS") alpha = true;
        if (c.type === "IDAT") break;
      }
    }
    return { type: "png", width, height, alpha };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) return null; // reached the image data with no size
      const len = (buf[i + 2] << 8) | buf[i + 3];
      // SOF0..SOF15, except DHT (C4), JPG (C8) and DAC (CC), carry the size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = (buf[i + 5] << 8) | buf[i + 6];
        const width = (buf[i + 7] << 8) | buf[i + 8];
        return { type: "jpeg", width, height, alpha: false };
      }
      if (len < 2) return null;
      i += 2 + len;
    }
  }
  return null;
}

type PngChunk = { type: string; start: number; end: number };

function* pngChunks(buf: Uint8Array): Generator<PngChunk> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = dv.getUint32(i);
    const end = i + 12 + len;
    if (end > buf.length) return;
    yield { type: String.fromCharCode(...buf.subarray(i + 4, i + 8)), start: i, end };
    i = end;
  }
}

/** PNG chunks a picture needs; text, dates and EXIF are left behind. */
const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "pHYs"]);

/**
 * The same picture with its metadata dropped: EXIF (camera, GPS location), XMP, comments and text.
 * JPEG keeps JFIF (APP0), its colour profile (APP2 ICC) and Adobe colour info (APP14).
 * When the picture data itself isn't found (no IDAT, no start of scan), an empty buffer: nothing usable.
 */
export function stripImageMetadata(buf: Uint8Array, type: ImageInfo["type"]): Buffer {
  if (type === "png") {
    const parts: Uint8Array[] = [buf.subarray(0, 8)];
    let pixels = false;
    for (const c of pngChunks(buf)) {
      if (PNG_KEEP.has(c.type)) parts.push(buf.subarray(c.start, c.end));
      if (c.type === "IDAT") pixels = true;
      if (c.type === "IEND") break;
    }
    return pixels ? Buffer.concat(parts) : Buffer.alloc(0);
  }
  const parts: Uint8Array[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    // A fill byte before a marker, or a marker with no length (TEM, RST0-7): step over it.
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += marker === 0xff ? 1 : 2;
      continue;
    }
    if (marker === 0xda) {
      parts.push(buf.subarray(i)); // the image data, to the end
      return Buffer.concat(parts);
    }
    const len = (buf[i + 2] << 8) | buf[i + 3];
    const seg = buf.subarray(i, i + 2 + len);
    const app = marker >= 0xe0 && marker <= 0xef;
    const icc = marker === 0xe2 && Buffer.from(seg.subarray(4, 15)).toString("latin1") === "ICC_PROFILE";
    const keep = !(marker === 0xfe || (app && marker !== 0xe0 && marker !== 0xee && !icc));
    if (keep) parts.push(seg);
    i += 2 + len;
  }
  // No image data found: nothing that could be drawn, and never the unread rest.
  return Buffer.alloc(0);
}

export type CoverPhoto = { src: string; width: number; height: number; cutout: boolean; type: ImageInfo["type"]; id: string };
export type SaveCoverPhotoResult = { ok: true; photo: CoverPhoto } | { ok: false; error: string };

/** Checks one upload. Plain reasons a beginner can act on. */
export function checkCoverPhoto(bytes: Uint8Array): { ok: true; info: ImageInfo } | { ok: false; error: string } {
  if (!bytes.length) return { ok: false, error: "Pick a photo first." };
  if (bytes.length > COVER_PHOTO_MAX_BYTES) return { ok: false, error: "That photo is too big. Try a smaller one (under 1.5 MB), or a screenshot of it." };
  const info = sniffImage(bytes);
  if (!info) return { ok: false, error: "That isn't a photo we can use. Pick a PNG or JPG photo." };
  if (info.width < COVER_PHOTO_MIN_SIDE || info.height < COVER_PHOTO_MIN_SIDE) return { ok: false, error: "That photo is too small. Pick a bigger, sharper one." };
  if (info.width > COVER_PHOTO_MAX_SIDE || info.height > COVER_PHOTO_MAX_SIDE) return { ok: false, error: "That photo is too large. Pick a smaller one." };
  return { ok: true, info };
}

const base = (workspaceId: string) => and(eq(aiGenerations.workspaceId, workspaceId), eq(aiGenerations.kind, "cover_photo"));

/**
 * Save the member's cover photo, replacing the one before. `cutout` is the browser's word that the
 * photo has no background; it only counts for a PNG that can be see-through.
 */
export async function saveCoverPhoto(workspaceId: string, bytes: Uint8Array, opts: { cutout?: boolean } = {}): Promise<SaveCoverPhotoResult> {
  const checked = checkCoverPhoto(bytes);
  if (!checked.ok) return checked;
  const { info } = checked;
  const clean = stripImageMetadata(bytes, info.type);
  // A header with no picture after it would save fine and then break every cover drawn from it.
  if (!clean.length) return { ok: false, error: "That isn't a photo we can use. Pick a PNG or JPG photo." };
  const cutout = info.type === "png" && info.alpha && opts.cutout !== false;
  const db = await getDb();
  const row = await db.transaction(async (tx) => {
    await tx.delete(aiGenerations).where(base(workspaceId));
    const [r] = await tx
      .insert(aiGenerations)
      .values({
        workspaceId,
        kind: "cover_photo",
        input: { type: info.type, width: info.width, height: info.height, cutout, bytes: clean.length },
        output: { data: clean.toString("base64") },
        model: "upload",
      })
      .returning({ id: aiGenerations.id });
    return r;
  });
  return { ok: true, photo: { id: row.id, src: dataUrl(info.type, clean.toString("base64")), width: info.width, height: info.height, cutout, type: info.type } };
}

const dataUrl = (type: ImageInfo["type"], b64: string) => `data:image/${type};base64,${b64}`;

/** This workspace's cover photo, checked again on the way out, or null. */
export async function getCoverPhoto(workspaceId: string): Promise<CoverPhoto | null> {
  const db = await getDb();
  const [row] = await db.select({ id: aiGenerations.id, input: aiGenerations.input, output: aiGenerations.output }).from(aiGenerations).where(base(workspaceId)).orderBy(desc(aiGenerations.createdAt)).limit(1);
  if (!row || typeof row.output.data !== "string") return null;
  const bytes = Buffer.from(row.output.data, "base64");
  const info = sniffImage(bytes);
  if (!info) return null;
  return { id: row.id, src: dataUrl(info.type, row.output.data), width: info.width, height: info.height, cutout: info.type === "png" && info.alpha && row.input.cutout === true, type: info.type };
}

/** Whether there is one, without reading the picture. */
export async function hasCoverPhoto(workspaceId: string): Promise<{ id: string; cutout: boolean } | null> {
  const db = await getDb();
  const [row] = await db.select({ id: aiGenerations.id, input: aiGenerations.input }).from(aiGenerations).where(base(workspaceId)).orderBy(desc(aiGenerations.createdAt)).limit(1);
  return row ? { id: row.id, cutout: row.input.cutout === true } : null;
}

export async function deleteCoverPhoto(workspaceId: string): Promise<boolean> {
  const db = await getDb();
  const gone = await db.delete(aiGenerations).where(base(workspaceId)).returning({ id: aiGenerations.id });
  return gone.length > 0;
}
