"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DownloadIcon, FileTextIcon, ImagesIcon, LightbulbIcon, PlusIcon, SaveIcon, ShuffleIcon, SparklesIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CAROUSEL_LIMITS, CAROUSEL_LOOKS, CAROUSEL_LOOK_LABEL, slideRole, type CarouselLook } from "@/server/carousel/shape";
import { Panel, StepDot } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { exampleCarouselAction, saveCarouselAction, scriptCarouselAction, setCarouselLookAction, writeCarouselAction, type CarouselActionResult } from "./actions";
import { POSTING_TIP, slideUrl, zipUrl, type CarouselView } from "./view";

type DraftSlide = { heading: string; body: string };
type Draft = { handle: string; slides: DraftSlide[] };
type Msg = { tone: "ok" | "note" | "error"; text: string; where: "start" | "slides" } | null;

const toDraft = (c: CarouselView): Draft => ({ handle: c.handle, slides: c.slides.map((s) => ({ heading: s.heading, body: s.lines.join("\n") })) });
const linesOf = (body: string) => body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const sameDraft = (a: Draft, b: Draft) =>
  a.handle.replace(/^@+/, "").trim() === b.handle.replace(/^@+/, "").trim() &&
  a.slides.length === b.slides.length &&
  a.slides.every((s, i) => s.heading.trim() === b.slides[i].heading.trim() && linesOf(s.body).join("\n") === linesOf(b.slides[i].body).join("\n"));

const slideLabel = (i: number, n: number) => {
  const role = slideRole(i, n);
  return role === "hook" ? "The hook: stops the thumb" : role === "cta" ? "Last slide: what to do next" : "One idea";
};

/**
 * Make my carousel: start from a topic (Write it for me), a ReelVault script (Turn my script into slides)
 * or the example; see every slide as the PNG it downloads as; change any word; flip the look; download.
 * Every picture is drawn from what's saved, so the previews and the downloads always match.
 */
export function CarouselStudio({ wid, initial, defaultHandle, topicHint, aiLine }: { wid: string; initial: CarouselView | null; defaultHandle: string; topicHint: string; aiLine: string }) {
  const router = useRouter();
  const [carousel, setCarousel] = useState<CarouselView | null>(initial);
  const [draft, setDraft] = useState<Draft | null>(initial ? toDraft(initial) : null);
  const [look, setLook] = useState<CarouselLook>(initial?.look ?? "glow");
  const [v, setV] = useState(0);
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<"write" | "script" | "example" | "save" | null>(null);
  const [, startLook] = useTransition();

  // Opening another saved carousel from the list (?id= changes) loads it here.
  useEffect(() => {
    if (initial && initial.id !== carousel?.id) {
      setCarousel(initial);
      setDraft(toDraft(initial));
      setLook(initial.look);
      setMsg(null);
    }
    if (!initial && carousel) {
      setCarousel(null);
      setDraft(null);
    }
    // Only when the page hands us a different carousel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  const dirty = useMemo(() => Boolean(carousel && draft && !sameDraft(draft, toDraft(carousel))), [carousel, draft]);
  const handle = (draft?.handle ?? defaultHandle).replace(/^@+/, "").trim();

  const opened = (res: CarouselActionResult, okText: string) => {
    if (!res.ok) {
      setMsg({ tone: "error", text: res.error, where: "start" });
      return;
    }
    setCarousel(res.carousel);
    setDraft(toDraft(res.carousel));
    setLook(res.carousel.look);
    setV(Date.now());
    setMsg(res.note ? { tone: "note", text: res.note, where: "slides" } : { tone: "ok", text: okText, where: "slides" });
    router.replace(`/app/w/${wid}/carousel?id=${res.carousel.id}`, { scroll: false });
    requestAnimationFrame(() => document.getElementById("slides")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const run = async (kind: "write" | "script" | "example") => {
    setBusy(kind);
    setMsg(null);
    try {
      if (kind === "write") opened(await writeCarouselAction(wid, topic, handle), "Written by your AI. Check the words, then download.");
      else if (kind === "script") opened(await scriptCarouselAction(wid, script, handle), "Your script is now slides. Check the words, then download.");
      else opened(await exampleCarouselAction(wid, handle), "Here's the example. Change any words to make it yours.");
    } catch {
      setMsg({ tone: "error", text: "That didn't work. Check your connection and try again.", where: "start" });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!carousel || !draft) return;
    setBusy("save");
    setMsg(null);
    try {
      const res = await saveCarouselAction(wid, carousel.id, { title: carousel.title, handle: draft.handle, look, slides: draft.slides.map((s) => ({ heading: s.heading, lines: linesOf(s.body) })) });
      if (!res.ok) setMsg({ tone: "error", text: res.error, where: "slides" });
      else {
        setCarousel(res.carousel);
        setDraft(toDraft(res.carousel));
        setV(Date.now());
        setMsg({ tone: "ok", text: "Saved. Your slides above are up to date.", where: "slides" });
      }
    } catch {
      setMsg({ tone: "error", text: "That didn't save. Check your connection and try again.", where: "slides" });
    } finally {
      setBusy(null);
    }
  };

  const nextLook = () => {
    if (!carousel) return;
    const next = CAROUSEL_LOOKS[(CAROUSEL_LOOKS.indexOf(look) + 1) % CAROUSEL_LOOKS.length];
    setLook(next);
    startLook(async () => {
      // Only remembered for next time (the previews already show it), so a dropped call stays quiet
      // rather than taking the page to its error screen.
      await setCarouselLookAction(wid, carousel.id, next).catch(() => null);
    });
  };

  const setSlide = (i: number, patch: Partial<DraftSlide>) => setDraft((d) => (d ? { ...d, slides: d.slides.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : d));
  const addSlide = () => setDraft((d) => (d && d.slides.length < CAROUSEL_LIMITS.maxSlides ? { ...d, slides: [...d.slides.slice(0, -1), { heading: "", body: "" }, d.slides[d.slides.length - 1]] } : d));
  const removeSlide = (i: number) => setDraft((d) => (d && d.slides.length > CAROUSEL_LIMITS.minSlides ? { ...d, slides: d.slides.filter((_, j) => j !== i) } : d));

  const note = (where: "start" | "slides") =>
    msg && msg.where === where ? (
    <p aria-live="polite" className={cn("text-[13px] leading-relaxed", msg.tone === "error" ? "text-destructive" : msg.tone === "note" ? "text-warning" : "text-success")}>
      {msg.text}
    </p>
  ) : null;

  const start = (
    <Panel step={carousel ? undefined : 1} icon={carousel ? PlusIcon : undefined} title={carousel ? "Make another one" : "Start your post"} sub="Pick one way in. You can change every word after.">
      <div className="grid gap-6 @3xl/main:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="carousel-topic">What&apos;s your post about?</FieldLabel>
            <Input
              id="carousel-topic"
              value={topic}
              maxLength={CAROUSEL_LIMITS.topic}
              placeholder={topicHint ? `Like: 3 easy tips for ${topicHint}` : "Like: 3 easy gym days for busy dads"}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) {
                  e.preventDefault();
                  void run("write");
                }
              }}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant={carousel ? "default" : "cta"} onClick={() => run("write")} disabled={busy !== null}>
              {busy === "write" ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
              {busy === "write" ? "Writing…" : "Write it for me"}
            </Button>
          </div>
          {aiLine ? <p className="text-xs leading-relaxed text-muted-foreground">{aiLine}</p> : null}
        </div>
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="carousel-script">Or paste your ReelVault script</FieldLabel>
            <Textarea id="carousel-script" rows={4} value={script} maxLength={CAROUSEL_LIMITS.script} placeholder="Paste the script you got from Remake this." onChange={(e) => setScript(e.target.value)} />
          </Field>
          <Button variant="outline" className="self-start" onClick={() => run("script")} disabled={busy !== null || script.trim().length < 20}>
            {busy === "script" ? <Spinner data-icon="inline-start" /> : <FileTextIcon data-icon="inline-start" />}
            {busy === "script" ? "Making slides…" : "Turn my script into slides"}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/80 pt-4 text-[13px] text-muted-foreground">
        <span>Not sure what good looks like?</span>
        <Button variant="link" size="xs" className="h-auto px-0" onClick={() => run("example")} disabled={busy !== null}>
          {busy === "example" ? "Opening…" : "Show me an example"}
        </Button>
      </div>
      {note("start")}
    </Panel>
  );

  if (!carousel || !draft) return start;

  const n = carousel.slides.length;
  return (
    <>
      <Panel
        id="slides"
        step={2}
        title="Your slides"
        sub={`${n} slides, 1080 × 1350, in your brand colour. Look: ${CAROUSEL_LOOK_LABEL[look]}.`}
        className="scroll-mt-20 ring-violet-200/90 dark:ring-violet-400/20"
        action={
          <Button variant="outline" size="sm" onClick={nextLook}>
            <ShuffleIcon data-icon="inline-start" />
            Try another look
          </Button>
        }
      >
        {note("slides")}
        {dirty ? <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-foreground">You changed some words. Press Save changes below and these pictures update.</p> : null}
        <ol className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
          {carousel.slides.map((_, i) => (
            <li key={`${carousel.id}-${i}`} className="flex w-[min(62vw,220px)] shrink-0 snap-start flex-col gap-2">
              <div className="relative aspect-[1080/1350] w-full overflow-hidden rounded-xl bg-muted ring-1 ring-ink/[0.06] ring-inset dark:ring-white/[0.08]">
                <img
                  src={slideUrl(wid, carousel.id, i + 1, look, { v })}
                  alt={`Slide ${i + 1} of ${n}`}
                  width={1080}
                  height={1350}
                  loading={i < 3 ? "eager" : "lazy"}
                  className={cn("size-full object-cover transition-opacity", dirty && "opacity-60")}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {i + 1} of {n}
                </span>
                {dirty ? (
                  <Button variant="outline" size="xs" disabled>
                    <DownloadIcon data-icon="inline-start" />
                    Download
                  </Button>
                ) : (
                  <Button variant="outline" size="xs" asChild>
                    <a href={slideUrl(wid, carousel.id, i + 1, look, { download: true })} download>
                      <DownloadIcon data-icon="inline-start" />
                      Download
                    </a>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          {dirty ? (
            <Button variant="cta" size="lg" disabled>
              <ImagesIcon data-icon="inline-start" />
              Download all slides
            </Button>
          ) : (
            <Button variant="cta" size="lg" asChild>
              <a href={zipUrl(wid, carousel.id, look)} download>
                <ImagesIcon data-icon="inline-start" />
                Download all slides
              </a>
            </Button>
          )}
          <span className="max-w-[52ch] text-xs leading-relaxed text-muted-foreground">One ZIP file with every slide in order. On a phone, press and hold each slide above and tap Save to Photos.</span>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-cta-soft px-4 py-3 text-sm leading-relaxed ring-1 ring-pink-200/80 ring-inset dark:ring-pink-400/20">
          <LightbulbIcon className="mt-0.5 size-4 shrink-0 text-cta-soft-foreground" aria-hidden />
          <span>{POSTING_TIP}</span>
        </div>
      </Panel>

      <Panel step={3} title="Change any words" sub="Big words on top, up to 3 short lines under them. Then press Save changes.">
        <ol className="flex flex-col gap-4">
          {draft.slides.map((s, i) => {
            const role = slideRole(i, draft.slides.length);
            return (
              <li key={i} className="flex flex-col gap-3 rounded-xl bg-muted/40 p-4 ring-1 ring-ink/[0.04] ring-inset dark:ring-white/[0.05]">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2.5 text-sm font-semibold">
                    <StepDot n={i + 1} active={role !== "point"} className="size-6 text-xs" />
                    {slideLabel(i, draft.slides.length)}
                  </span>
                  {role === "point" && draft.slides.length > CAROUSEL_LIMITS.minSlides ? (
                    <Button variant="ghost" size="icon-xs" aria-label={`Remove slide ${i + 1}`} onClick={() => removeSlide(i)}>
                      <XIcon />
                    </Button>
                  ) : null}
                </div>
                <Field>
                  <FieldLabel htmlFor={`slide-${i}-heading`} className="sr-only">
                    Big words for slide {i + 1}
                  </FieldLabel>
                  <Input
                    id={`slide-${i}-heading`}
                    value={s.heading}
                    maxLength={CAROUSEL_LIMITS.heading}
                    placeholder={role === "hook" ? "You don't need 6 gym days. You need these 3." : role === "cta" ? "Save this for later." : "Day A: squat + push"}
                    onChange={(e) => setSlide(i, { heading: e.target.value })}
                    className="font-semibold"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`slide-${i}-body`} className="sr-only">
                    Small lines for slide {i + 1}
                  </FieldLabel>
                  <Textarea
                    id={`slide-${i}-body`}
                    rows={role === "hook" ? 1 : 3}
                    value={s.body}
                    maxLength={(CAROUSEL_LIMITS.line + 1) * CAROUSEL_LIMITS.lines}
                    placeholder={role === "hook" ? "Optional: one small line under it" : role === "cta" ? "More in my group. Link in bio." : "One short line each, up to 3"}
                    onChange={(e) => setSlide(i, { body: e.target.value })}
                  />
                </Field>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-end gap-4">
          <Button variant="outline" size="sm" onClick={addSlide} disabled={draft.slides.length >= CAROUSEL_LIMITS.maxSlides}>
            <PlusIcon data-icon="inline-start" />
            Add a slide
          </Button>
          <Field className="w-full max-w-xs">
            <FieldLabel htmlFor="carousel-handle">Your Instagram name (optional)</FieldLabel>
            <Input id="carousel-handle" value={draft.handle} maxLength={CAROUSEL_LIMITS.handle + 1} placeholder="@yourname" onChange={(e) => setDraft((d) => (d ? { ...d, handle: e.target.value } : d))} />
            <FieldDescription>Shown small on every slide.</FieldDescription>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border/80 pt-4">
          <Button onClick={save} disabled={busy !== null || !dirty}>
            {busy === "save" ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
            {busy === "save" ? "Saving…" : "Save changes"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {CAROUSEL_LIMITS.minSlides} to {CAROUSEL_LIMITS.maxSlides} slides. Empty slides are left out.
          </span>
        </div>
      </Panel>

      {start}
    </>
  );
}
