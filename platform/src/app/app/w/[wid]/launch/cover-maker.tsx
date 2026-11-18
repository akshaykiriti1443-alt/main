"use client";

import { useRef, useState, useTransition } from "react";
import { CameraIcon, DownloadIcon, ImageIcon, ShuffleIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { removeCoverPhotoAction, saveCoverHeadlineAction, uploadCoverPhotoAction } from "./actions";
import { SuggestAnswers } from "./kit-suggest";

// Kept in step with COVER_LOOKS / COVER_LOOK_LABEL in src/server/cover/skoolCover.tsx (that module is server-only).
const LOOKS = [
  { id: "glow", label: "Glow" },
  { id: "split", label: "Spotlight" },
  { id: "midnight", label: "Midnight" },
] as const;

/** Kept in step with COVER_HEADLINE_MAX and COVER_PHOTO_MAX_BYTES on the server. */
const HEADLINE_MAX = 40;
const PHOTO_MAX_BYTES = 1_500_000;

type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * A server action that throws (a dropped connection, or a teammate without admin rights) would otherwise
 * escape the transition and take the whole page to its error screen. It becomes a message here instead.
 */
export async function safely(run: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await run();
  } catch {
    return { ok: false, error: "That didn't work. Check your connection and try again. Only the account owner or an admin can change the cover." };
  }
}

type Prepared ={ ok: true; blob: Blob; cutout: boolean } | { ok: false; error: string };

/**
 * The photo, made ready in the browser before it's sent: turned the right way up, shrunk (about 1400 px),
 * re-saved (which drops camera and location data), and trimmed to the person when it has no background.
 * A see-through photo stays a PNG; any other becomes a JPG.
 */
async function preparePhoto(file: File): Promise<Prepared> {
  if (/svg/i.test(file.type) || /\.svgz?$/i.test(file.name)) return { ok: false, error: "That's a drawing file, not a photo. Pick a PNG or JPG photo." };
  if (file.type && !file.type.startsWith("image/")) return { ok: false, error: "That isn't a photo. Pick a PNG or JPG photo." };
  if (file.size > 30_000_000) return { ok: false, error: "That photo is too big. Pick a smaller one." };
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return { ok: false, error: "Your browser can't open that photo. Try a PNG or JPG, or take a screenshot of it." };
  }
  for (const longSide of [1400, 1100, 850]) {
    const s = Math.min(1, longSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s));
    const h = Math.max(1, Math.round(bmp.height * s));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error: "Your browser can't get that photo ready. Try another browser." };
    ctx.drawImage(bmp, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    // See-through: a real share of the picture is clear (a cut-out of a person), not just a stray pixel.
    let clear = 0;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = px[(y * w + x) * 4 + 3];
        if (a < 16) clear++;
        else if (a > 40) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const cutout = clear / (w * h) > 0.04 && maxX > minX && maxY > minY;
    let out = canvas;
    if (cutout) {
      // Trim the empty space around the person, so the cover can place them big.
      const pad = 4;
      const cx = Math.max(0, minX - pad);
      const cy = Math.max(0, minY - pad);
      const cw = Math.min(w, maxX + pad + 1) - cx;
      const ch = Math.min(h, maxY + pad + 1) - cy;
      out = document.createElement("canvas");
      out.width = cw;
      out.height = ch;
      out.getContext("2d")?.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
    }
    if (out.width < 160 || out.height < 160) return { ok: false, error: "That photo is too small. Pick a bigger, sharper one." };
    const blob = await new Promise<Blob | null>((done) => out.toBlob(done, cutout ? "image/png" : "image/jpeg", 0.9));
    if (!blob) return { ok: false, error: "Your browser can't get that photo ready. Try another browser." };
    if (blob.size <= PHOTO_MAX_BYTES) return { ok: true, blob, cutout };
  }
  return { ok: false, error: "That photo is too big. Try a smaller one, or a screenshot of it." };
}

/**
 * "Make my Skool cover": a 1084×576 PNG drawn from this kit, in the style of the top paid Skool groups:
 * the member's photo, a small "for who" label and their result in big words. A few looks to flip
 * between, their own photo, and the headline they can change here.
 */
export function CoverMaker({
  wid,
  kitId,
  photo,
  headline,
  context,
}: {
  wid: string;
  kitId: string;
  /** This workspace's cover photo, if it has one (its id changes with every new photo). */
  photo: { id: string; cutout: boolean } | null;
  headline: string;
  /** What the kit knows, so Suggest fits it. */
  context: { businessName: string; niche: string; audience: string; outcome: string };
}) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const headRef = useRef<HTMLInputElement>(null);
  const look = LOOKS[i];
  const src = (download = false) =>
    `/api/skool-cover?${new URLSearchParams({ w: wid, kit: kitId, look: look.id, v: `${photo?.id ?? "none"}-${version}`, ...(download ? { download: "1" } : {}) })}`;
  const url = src();
  const ready = loaded === url;

  if (!open) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button variant="outline" onClick={() => setOpen(true)}>
          <ImageIcon data-icon="inline-start" />
          Make my Skool cover
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">Your photo and your result in big words, like the top Skool groups. Upload it in your group&apos;s settings, as the cover image.</p>
      </div>
    );
  }

  const onFile = (file: File | undefined) => {
    if (!file) return;
    start(async () => {
      setMsg(null);
      const ready = await preparePhoto(file);
      if (!ready.ok) return setMsg({ tone: "error", text: ready.error });
      const fd = new FormData();
      fd.set("photo", ready.blob, ready.cutout ? "photo.png" : "photo.jpg");
      fd.set("cutout", ready.cutout ? "1" : "0");
      const res = await safely(() => uploadCoverPhotoAction(wid, fd));
      setMsg(res.ok ? { tone: "ok", text: res.message } : { tone: "error", text: res.error });
      if (res.ok) setVersion((n) => n + 1);
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const removePhoto = () =>
    start(async () => {
      setMsg(null);
      const res = await safely(() => removeCoverPhotoAction(wid));
      setMsg(res.ok ? { tone: "ok", text: res.message } : { tone: "error", text: res.error });
      if (res.ok) setVersion((n) => n + 1);
    });

  const saveHeadline = () =>
    start(async () => {
      setMsg(null);
      const res = await safely(() => saveCoverHeadlineAction(wid, kitId, headRef.current?.value ?? ""));
      setMsg(res.ok ? { tone: "ok", text: res.message } : { tone: "error", text: res.error });
      if (res.ok) setVersion((n) => n + 1);
    });

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Your Skool cover</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          Look {i + 1} of {LOOKS.length} · {look.label}
        </span>
      </div>

      {!photo ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent/50 px-4 py-3 ring-1 ring-primary/15 ring-inset">
          <p className="text-[13.5px] leading-snug">
            <b className="font-semibold">Add your photo.</b> Most top Skool groups put the owner&apos;s face on the cover.
          </p>
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : <CameraIcon data-icon="inline-start" />}
            Add my photo
          </Button>
        </div>
      ) : null}

      <div className="relative aspect-[1084/576] w-full overflow-hidden rounded-xl bg-muted ring-1 ring-ink/[0.06] ring-inset dark:ring-white/[0.08]">
        <img
          key={url}
          src={url}
          alt={`Your Skool cover, ${look.label} look`}
          width={1084}
          height={576}
          className="size-full object-cover"
          onLoad={() => setLoaded(url)}
          onError={() => setFailed(url)}
        />
        {!ready && failed !== url ? (
          <div className="absolute inset-0 grid place-items-center bg-background/40 backdrop-blur-[2px]">
            <span className="flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs font-medium shadow-xs">
              <Spinner className="size-3.5" />
              Drawing your cover…
            </span>
          </div>
        ) : null}
      </div>
      {failed === url ? <p className="text-sm text-destructive">That one didn&apos;t draw. Press Try another look, or reload the page.</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <a href={src(true)} download="skool-cover.png">
            <DownloadIcon data-icon="inline-start" />
            Download my cover
          </a>
        </Button>
        <Button variant="outline" onClick={() => setI((n) => (n + 1) % LOOKS.length)}>
          <ShuffleIcon data-icon="inline-start" />
          Try another look
        </Button>
      </div>

      {/* Your photo */}
      <div className="flex flex-col gap-2 rounded-xl bg-background/60 p-4 ring-1 ring-border ring-inset dark:bg-white/[0.02]">
        <span className="text-sm font-medium">Your photo</span>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : <CameraIcon data-icon="inline-start" />}
            {photo ? "Change my photo" : "Add my photo"}
          </Button>
          {photo ? (
            <Button variant="ghost" size="sm" onClick={removePhoto} disabled={pending}>
              <Trash2Icon data-icon="inline-start" />
              Remove photo
            </Button>
          ) : null}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Best: a photo of you with no background. On iPhone, press and hold yourself in a photo, then Copy or Share. Many Android phones let you do the same in Google Photos. Any clear photo of your face works too.
        </p>
      </div>

      {/* The big words */}
      <form className="flex flex-col gap-2 rounded-xl bg-background/60 p-4 ring-1 ring-border ring-inset dark:bg-white/[0.02]" onSubmit={(e) => (e.preventDefault(), saveHeadline())}>
        <label htmlFor="cover-headline" className="text-sm font-medium">
          Cover headline
        </label>
        {/* What Suggest reads, so its ideas fit this kit. */}
        <input type="hidden" name="businessName" value={context.businessName} />
        <input type="hidden" name="niche" value={context.niche} />
        <input type="hidden" name="audience" value={context.audience} />
        <input type="hidden" name="outcome" value={context.outcome} />
        <div className="flex flex-wrap items-center gap-2">
          <Input ref={headRef} id="cover-headline" name="coverHeadline" maxLength={HEADLINE_MAX} defaultValue={headline} placeholder="Strong in 3 sessions a week" className="min-w-0 flex-1 basis-56" />
          <Button type="submit" variant="outline" disabled={pending}>
            Save
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">The result, in 4 to 8 words. A number helps, if it&apos;s true.</p>
        <SuggestAnswers wid={wid} field="coverHeadline" what="a headline" />
      </form>

      {msg ? (
        <p aria-live="polite" className={msg.tone === "error" ? "text-sm text-destructive" : "text-sm text-success"}>
          {msg.text}
        </p>
      ) : null}
      <p className="text-xs leading-relaxed text-muted-foreground">1084 × 576 PNG. Upload it in your group&apos;s settings, as the cover image. Change your brand colour on your website and the cover follows.</p>
    </div>
  );
}
