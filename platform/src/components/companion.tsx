"use client";

import "./companion.css";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  CrosshairIcon,
  LifeBuoyIcon,
  PowerIcon,
  RouteIcon,
  SkipForwardIcon,
  Undo2Icon,
} from "lucide-react";
import { companionSnapshotAction } from "@/actions/companion";
import type { CompanionSnapshot, CompanionStep } from "@/server/companion";
import {
  canBeUpNext,
  GUIDE_COOKIE,
  GUIDE_HELLO_COOKIE,
  GUIDE_SKIP_COOKIE,
  pageGuideFor,
  STEP_HOWTO,
  type GuideMode,
} from "@/lib/guides";
import { cn } from "@/lib/utils";
import { PENNY_POINT, PENNY_WAVE, PENNY_WINK } from "./penny-art";

// Penny: the step-by-step guide. One card that always says the next thing to do, where it is
// and how to do it. It can be minimised to a coin, or turned off (the Guide button in the top
// bar turns it back on). State lives in cookies so the server renders it right first time.

// ---- shared state between the card and the top-bar button ----
let current: GuideMode | null = null;
const listeners = new Set<() => void>();
const setCookie = (name: string, value: string) => {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
};
function setMode(m: GuideMode) {
  current = m;
  setCookie(GUIDE_COOKIE, m);
  listeners.forEach((l) => l());
}
function useMode(initial: GuideMode): GuideMode {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current ?? initial,
    () => initial,
  );
}

/** Penny from the course cast. "face" crops to her head for small spots like the avatar. */
export function PennyFace({
  size = 40,
  className,
  pose = "wave",
  crop = "face",
}: {
  size?: number;
  className?: string;
  pose?: "wave" | "point" | "wink";
  crop?: "face" | "full";
}) {
  const art =
    pose === "point" ? PENNY_POINT : pose === "wink" ? PENNY_WINK : PENNY_WAVE;
  return (
    <svg
      viewBox={crop === "face" ? "34 26 128 128" : "0 0 200 200"}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: art }}
    />
  );
}

/** Top-bar button: turns the guide on and off. */
export function GuideButton({ initialMode }: { initialMode: GuideMode }) {
  const mode = useMode(initialMode);
  const on = mode !== "off";
  return (
    <button
      type="button"
      className={cn("guide-toggle", on && "is-on")}
      aria-pressed={on}
      title={
        on
          ? "Turn the guide off"
          : "Turn the guide on: Penny shows you what to do next"
      }
      onClick={() => setMode(on ? "off" : "open")}
    >
      <LifeBuoyIcon aria-hidden="true" />
      <span className="hidden md:inline">Guide</span>
    </button>
  );
}

function stepPathOf(step: CompanionStep) {
  return step.href.split(/[?#]/)[0];
}

function isOnStepPage(pathname: string, step: CompanionStep) {
  const p = stepPathOf(step);
  if (pathname === p) return true;
  // Publishing happens on a single page of a site.
  return step.key === "publish" && pathname.startsWith(`${p}/`);
}

export function Companion({
  wid,
  initialMode,
  firstVisit,
  initialSkipped,
  initial,
}: {
  wid: string;
  initialMode: GuideMode;
  firstVisit: boolean;
  initialSkipped: string[];
  initial: CompanionSnapshot;
}) {
  const mode = useMode(initialMode);
  const pathname = usePathname();
  const [snap, setSnap] = useState(initial);
  const [skipped, setSkipped] = useState<string[]>(initialSkipped);
  const [hello, setHello] = useState(firstVisit);
  const [targetFound, setTargetFound] = useState(false);
  const firstRun = useRef(true);
  const cardRef = useRef<HTMLElement>(null);
  // Opened by hand on this page. Pages that already show the big "Up next" card (Dashboard,
  // Your path) and phones keep Penny small until she's tapped, so she never doubles up or covers.
  const [peek, setPeek] = useState(false);
  useEffect(() => setPeek(false), [pathname]);

  // Fresh progress after every page change (a step may have just ticked off).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    let live = true;
    companionSnapshotAction(wid).then((s) => {
      if (live && s) setSnap(s);
    });
    return () => {
      live = false;
    };
  }, [pathname, wid]);

  // Turned back on after being off: the server didn't load progress, so load it now.
  useEffect(() => {
    if (mode === "off" || snap.total > 0) return;
    let live = true;
    companionSnapshotAction(wid).then((s) => {
      if (live && s) setSnap(s);
    });
    return () => {
      live = false;
    };
  }, [mode, snap.total, wid]);

  // Days 2 to 6: today's lesson comes first, so Penny doesn't jump a Day 2 member to Day 7.
  const today = snap.today;
  // Same rule as Up next (src/server/path.ts): optional steps, outcomes and steps locked to
  // another plan never hold you up.
  const next = today
    ? null
    : (snap.steps.find((s) => canBeUpNext(s) && !skipped.includes(s.key)) ??
      null);
  const nextTitle = today?.title ?? next?.title;
  const onStep = next ? isOnStepPage(pathname, next) : false;
  const how = next ? STEP_HOWTO[next.key] : undefined;
  const guide = pageGuideFor(pathname, wid);
  const position = next
    ? snap.steps.findIndex((s) => s.key === next.key) + 1
    : snap.total;
  const pct = Math.round((snap.done / Math.max(1, snap.total)) * 100);

  // The glowing dot on the menu item for the next step, and the glow on the thing to click.
  useEffect(() => {
    const cleanup: (() => void)[] = [];
    setTargetFound(false);
    if (mode !== "off" && next) {
      const p = stepPathOf(next);
      const base = `/app/w/${wid}`;
      const links = Array.from(
        document.querySelectorAll<HTMLElement>("a[data-nav]"),
      );
      const best = links
        .filter((a) => {
          const h = a.dataset.nav ?? "";
          return h === p || (h !== base && p.startsWith(`${h}/`));
        })
        .sort(
          (a, b) => (b.dataset.nav?.length ?? 0) - (a.dataset.nav?.length ?? 0),
        )[0];
      if (best) {
        best.classList.add("guide-dot");
        cleanup.push(() => best.classList.remove("guide-dot"));
      }
      if (onStep && how?.target) {
        // The page may still be rendering; look again shortly.
        const find = () =>
          document.querySelector<HTMLElement>(`[data-guide="${how.target}"]`);
        const apply = (el: HTMLElement) => {
          el.classList.add("guide-target");
          setTargetFound(true);
          cleanup.push(() => el.classList.remove("guide-target"));
        };
        const el = find();
        if (el) apply(el);
        else {
          const t = setTimeout(() => {
            const later = find();
            if (later) apply(later);
          }, 700);
          cleanup.push(() => clearTimeout(t));
        }
      }
    }
    return () => cleanup.forEach((f) => f());
  }, [mode, next?.key, next?.href, onStep, how?.target, wid, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (mode === "off" || snap.total === 0) return null;

  const skip = (key: string) => {
    const list = [...new Set([...skipped, key])];
    setSkipped(list);
    setCookie(GUIDE_SKIP_COOKIE, list.join(","));
  };
  const unskip = () => {
    setSkipped([]);
    setCookie(GUIDE_SKIP_COOKIE, "");
  };
  const gotIt = () => {
    setHello(false);
    setCookie(GUIDE_HELLO_COOKIE, "1");
    if (mode === "open") setMode("open");
  };
  const showMe = () => {
    const el = how?.target
      ? document.querySelector<HTMLElement>(`[data-guide="${how.target}"]`)
      : null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("guide-target");
    void el.offsetWidth; // restart the pulse
    el.classList.add("guide-target");
    const focusable = el.matches("button, a, input, select, textarea")
      ? el
      : el.querySelector<HTMLElement>("button, input, select, textarea, a");
    focusable?.focus({ preventScroll: true });
  };

  const base = `/app/w/${wid}`;
  const pageHasUpNext = pathname === base || pathname === `${base}/path`;
  const fab = (onOpen: () => void, className = "guide-fab") => (
    <button
      type="button"
      className={className}
      onClick={onOpen}
      aria-label={
        nextTitle ? `Open your guide. Next: ${nextTitle}` : "Open your guide"
      }
    >
      <PennyFace size={44} className="guide-fab-face" />
      {nextTitle ? (
        <span className="guide-fab-label">
          <span className="guide-fab-kicker">Next</span>
          <span className="guide-fab-title">{nextTitle}</span>
        </span>
      ) : null}
    </button>
  );
  if (mode === "open" && pageHasUpNext && !peek && !hello)
    return fab(() => setPeek(true));

  if (mode === "min") {
    return (
      <button
        type="button"
        className="guide-fab"
        onClick={() => setMode("open")}
        aria-label={
          nextTitle ? `Open your guide. Next: ${nextTitle}` : "Open your guide"
        }
      >
        <PennyFace size={44} className="guide-fab-face" />
        {nextTitle ? (
          <span className="guide-fab-label">
            <span className="guide-fab-kicker">Next</span>
            <span className="guide-fab-title">{nextTitle}</span>
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <>
      {/* Wide screens: dock beside the page instead of covering it (rendered on the server, so no jump). */}
      <style>{`@media (min-width:1280px){[data-slot="sidebar-inset"]{margin-right:396px!important}}`}</style>
      {/* Phones: a coin until tapped (CSS swaps them), so the card never sits on the page. */}
      {fab(() => setPeek(true), "guide-fab guide-fab-mobile")}
      <aside
        ref={cardRef}
        className="guide-card"
        data-mobile-min={!peek && !hello ? "1" : undefined}
        aria-label="Penny, your guide"
        onKeyDown={(e) => {
          if (e.key === "Escape") setMode("min");
        }}
      >
        <header className="guide-head">
          <PennyFace size={42} className="guide-head-face" />
          <div className="guide-head-text">
            <b>Penny</b>
            <span>
              Your guide · {snap.done} of {snap.total} done
            </span>
          </div>
          <button
            type="button"
            className="guide-icon"
            onClick={() => setMode("min")}
            aria-label="Minimise the guide"
            title="Minimise"
          >
            <ChevronDownIcon />
          </button>
          <button
            type="button"
            className="guide-icon"
            onClick={() => setMode("off")}
            aria-label="Turn the guide off"
            title="Turn off (the Guide button at the top turns me back on)"
          >
            <PowerIcon />
          </button>
        </header>
        <div
          className="guide-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Your path progress"
        >
          <span style={{ width: `${Math.max(4, pct)}%` }} />
        </div>

        <div className="guide-body">
          {hello ? (
            <div className="guide-hello">
              <PennyFace size={64} crop="full" className="guide-hello-art" />
              <p>
                <b>Hi, I&apos;m Penny.</b> I&apos;ll show you one thing at a
                time, in the right order. Follow the glowing dot. You can hide
                me any time.
              </p>
              <button type="button" className="guide-link" onClick={gotIt}>
                Got it
              </button>
            </div>
          ) : null}

          {today ? (
            <section className="guide-step">
              <span className="guide-kicker">{today.eyebrow}</span>
              <h3>{today.title}</h3>
              <p className="guide-why">{today.body}</p>
              <Link
                href={today.href}
                className="guide-go"
                {...(/^https?:/.test(today.href)
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
              >
                Take me there <ArrowRightIcon aria-hidden="true" />
              </Link>
              <div className="guide-row">
                <Link href={`/app/w/${wid}/path`} className="guide-link">
                  <RouteIcon aria-hidden="true" /> All steps
                </Link>
              </div>
            </section>
          ) : next ? (
            <section className="guide-step">
              <span className="guide-kicker">
                Step {position} of {snap.total} · Lesson {next.lesson}
              </span>
              <h3>{next.title}</h3>
              <p className="guide-why">{next.why}</p>
              {onStep ? (
                <>
                  <p className="guide-here">
                    <CheckIcon aria-hidden="true" /> You&apos;re in the right
                    place. Here&apos;s how:
                  </p>
                  {how ? (
                    <ol className="guide-how">
                      {how.how.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ol>
                  ) : null}
                  {targetFound ? (
                    <button type="button" className="guide-go" onClick={showMe}>
                      <CrosshairIcon aria-hidden="true" /> Show me where
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <Link href={next.href} className="guide-go">
                    Take me there <ArrowRightIcon aria-hidden="true" />
                  </Link>
                  <p className="guide-hint">
                    Or follow the glowing dot in the menu.
                  </p>
                </>
              )}
              <div className="guide-row">
                <button
                  type="button"
                  className="guide-link"
                  onClick={() => skip(next.key)}
                >
                  <SkipForwardIcon aria-hidden="true" /> Skip this step
                </button>
                <Link href={`/app/w/${wid}/path`} className="guide-link">
                  <RouteIcon aria-hidden="true" /> All steps
                </Link>
              </div>
            </section>
          ) : (
            <section className="guide-step">
              <span className="guide-kicker">All done</span>
              <h3>
                {snap.done >= snap.total
                  ? "Every step ticked. Look at you."
                  : "Your to-dos are done. Look at you."}
              </h3>
              <p className="guide-why">
                {snap.done >= snap.total
                  ? "Keep the weekly rhythm: Monday check-in, one new ad, one Unlock."
                  : "The rest tick themselves as your Skool numbers grow. Keep the weekly rhythm: Monday check-in, one new ad, one Unlock."}
              </p>
            </section>
          )}

          {guide ? (
            <details className="guide-about" open={!onStep && !hello}>
              <summary>About this page: {guide.title}</summary>
              <p>{guide.what}</p>
              <ul>
                {guide.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </details>
          ) : null}

          {skipped.length ? (
            <button
              type="button"
              className="guide-link guide-unskip"
              onClick={unskip}
            >
              <Undo2Icon aria-hidden="true" /> {skipped.length} skipped. Bring{" "}
              {skipped.length === 1 ? "it" : "them"} back
            </button>
          ) : null}
        </div>
      </aside>
    </>
  );
}
