"use client";

import "./companion.css";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowRightIcon, CheckIcon, ChevronDownIcon, CrosshairIcon, ExternalLinkIcon, LifeBuoyIcon, PowerIcon } from "lucide-react";
import { laterStepAction, saveGroupLinkAction, tickStepAction } from "@/actions/journey";
import type { CompanionSnapshot } from "@/server/companion";
import type { WeekStep } from "@/server/path";
import { GUIDE_COOKIE, GUIDE_HELLO_COOKIE, howFor, pageGuideFor, type GuideMode } from "@/lib/guides";
import { fill, JOURNEY_COPY, POST_KEYS } from "@/lib/week";
import { cn } from "@/lib/utils";
import { SubmitButton } from "./client";
import { StuckSheet } from "./journey/stuck-sheet";
import { PENNY_POINT, PENNY_WAVE, PENNY_WINK } from "./penny-art";
import { PostLinkForm } from "./journey/post-link";

// Penny: how to do this exact step, on the page where it happens. She never picks a step; she
// reads path.current (through the snapshot), so she can't disagree with the big card. She can be
// minimised to a coin, or turned off (the Guide button in the top bar turns her back on). Her
// on/off state lives in a cookie so the server renders it right first time.

const P = JOURNEY_COPY.penny;

/**
 * Her fresh snapshot, by a plain GET (/api/companion). Never a server action: the browser runs those one
 * at a time and ties them to page changes, so a look-up here used to hold up the member's own buttons
 * (Build my launch kit queued behind it) and could stall the page change after a tool's redirect.
 */
async function fetchSnapshot(wid: string): Promise<CompanionSnapshot | null> {
  try {
    const res = await fetch(`/api/companion?w=${encodeURIComponent(wid)}`, { cache: "no-store", credentials: "same-origin" });
    return res.ok ? ((await res.json()) as CompanionSnapshot | null) : null;
  } catch {
    return null;
  }
}

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

const pathOf = (href: string) => href.split(/[?#]/)[0];

function isOnStepPage(pathname: string, step: WeekStep) {
  if (!step.href || step.external) return false;
  const p = pathOf(step.href);
  if (pathname === p) return true;
  // Publishing happens on a single page of a site, a script is remade deeper inside ReelVault, and a
  // saved carousel opens on its own page under Make my carousel.
  return (step.key === "publish" || step.key === "reel1" || step.key === "carousel") && pathname.startsWith(`${p}/`);
}

/** A tick form for Penny's card, posting back to the page she's on. */
function PennyTick({ wid, stepKey, back, label, waiting }: { wid: string; stepKey: string; back: string; label: string; waiting?: boolean }) {
  return (
    <form action={tickStepAction.bind(null, wid, stepKey)}>
      <input type="hidden" name="back" value={back} />
      {waiting ? <input type="hidden" name="as" value="waiting" /> : null}
      <SubmitButton variant="outline" size="sm">
        {label}
      </SubmitButton>
    </form>
  );
}

/** The same controls as the big card, for a step done in Skool, Meta or on a phone. */
function OutsideControls({ step, wid, back }: { step: WeekStep; wid: string; back: string }) {
  const isPost = POST_KEYS.includes(step.key);
  return (
    <div className="flex flex-col gap-2.5">
      {isPost && step.section ? (
        <p className="guide-why">
          {JOURNEY_COPY.post.section}: <b className="font-semibold text-foreground">{step.section}</b>
        </p>
      ) : null}
      {step.href ? (
        <a href={step.href} className="guide-go" target="_blank" rel="noreferrer">
          {isPost ? JOURNEY_COPY.post.openSkool : step.verb} <ExternalLinkIcon aria-hidden="true" />
        </a>
      ) : step.key === "skool" ? (
        <p className="guide-why">{JOURNEY_COPY.hero.groupNoReferral}</p>
      ) : null}
      {step.key === "skool" ? (
        <form action={saveGroupLinkAction.bind(null, wid)} className="flex flex-col gap-1.5">
          <input type="hidden" name="back" value={back} />
          <label htmlFor="penny-skool-url" className="text-[13px] font-semibold">
            {JOURNEY_COPY.hero.groupField}
          </label>
          <input
            id="penny-skool-url"
            name="skoolUrl"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder={JOURNEY_COPY.hero.groupPlaceholder}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          />
          <SubmitButton variant="outline" size="sm" className="self-start">
            {JOURNEY_COPY.hero.groupSave}
          </SubmitButton>
        </form>
      ) : null}
      {isPost ? (
        <div className="flex flex-wrap gap-2">
          {step.halves?.posted && !step.postLink?.catchUp ? (
            <span className="guide-here">
              <CheckIcon aria-hidden="true" /> {step.postLink ? JOURNEY_COPY.post.linkSaved : JOURNEY_COPY.post.posted}
            </span>
          ) : step.postLink ? (
            <PostLinkForm step={step} wid={wid} back={back} compact />
          ) : (
            <PennyTick wid={wid} stepKey={step.key} back={back} label={step.selfLabel ?? ""} />
          )}
          {step.halves?.reviewed ? (
            <span className="guide-here">
              <CheckIcon aria-hidden="true" /> {JOURNEY_COPY.post.reviewed}
            </span>
          ) : (
            <PennyTick wid={wid} stepKey={`${step.key}r`} back={back} label={step.reviewLabel ?? ""} />
          )}
        </div>
      ) : step.selfLabel ? (
        <PennyTick wid={wid} stepKey={step.key} back={back} label={step.selfLabel} />
      ) : null}
    </div>
  );
}

export function Companion({
  wid,
  initialMode,
  firstVisit,
  initial,
}: {
  wid: string;
  initialMode: GuideMode;
  firstVisit: boolean;
  initial: CompanionSnapshot | null;
  /** Ignored: skipping moved to "Do this later", saved on the server. */
  initialSkipped?: string[];
}) {
  const mode = useMode(initialMode);
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  const [snap, setSnap] = useState<CompanionSnapshot | null>(initial);
  const [hello, setHello] = useState(firstVisit);
  // On a phone the open panel covers the page's own next-step button, so there she waits as the coin until tapped.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const [targetFound, setTargetFound] = useState(false);
  // A win since her last look, on the page it happened: "{win} Next: {title}."
  const [flip, setFlip] = useState<{ win: string; at: string } | null>(null);
  const firstRun = useRef(true);
  const prevDone = useRef<string[] | null>(initial?.doneKeys ?? null);
  // Opened by hand on this page. Off the step's own page she stays a coin until tapped.
  const [peek, setPeek] = useState(false);
  useEffect(() => setPeek(false), [pathname]);

  // Fresh after every page change, and after ?ok= (tool actions redirect to the same page).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    let live = true;
    fetchSnapshot(wid).then((s) => {
      if (live && s) setSnap(s);
    });
    return () => {
      live = false;
    };
  }, [pathname, search, wid]);

  // Turned back on after being off: the server didn't load her, so load now.
  useEffect(() => {
    if (mode === "off" || snap) return;
    let live = true;
    fetchSnapshot(wid).then((s) => {
      if (live && s) setSnap(s);
    });
    return () => {
      live = false;
    };
  }, [mode, snap, wid]);

  // The moment a step ticks, say what now exists.
  useEffect(() => {
    if (!snap) return;
    const before = prevDone.current;
    prevDone.current = snap.doneKeys;
    if (!before) return;
    const fresh = snap.doneKeys.filter((k) => !before.includes(k));
    const win = fresh.length ? snap.wins[fresh[fresh.length - 1]] : undefined;
    if (win) setFlip({ win, at: pathname });
  }, [snap]); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = snap?.mode === "week" ? snap.current : null;
  const quietDay = snap?.state === "dayDone";
  // In-app only, for the menu dot and the shell's "More" group. Quiet after the day is done.
  const nextHref = mode !== "off" && cur && !quietDay && cur.href && !cur.external && cur.href.startsWith("/app/w/") ? cur.href : null;
  const onStep = cur && !quietDay ? isOnStepPage(pathname, cur) : false;
  const how = cur ? howFor(cur.key, cur.section) : undefined;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("onx:guide-next", { detail: { href: nextHref } }));
  }, [nextHref]);

  // The glowing dot on the menu item for the next step, and the glow on the thing to click.
  useEffect(() => {
    const cleanup: (() => void)[] = [];
    setTargetFound(false);
    if (nextHref) {
      const p = pathOf(nextHref);
      const base = `/app/w/${wid}`;
      const best = Array.from(document.querySelectorAll<HTMLElement>("a[data-nav]"))
        .filter((a) => {
          const h = a.dataset.nav ?? "";
          return h === p || (h !== base && p.startsWith(`${h}/`));
        })
        .sort((a, b) => (b.dataset.nav?.length ?? 0) - (a.dataset.nav?.length ?? 0))[0];
      if (best) {
        best.classList.add("guide-dot");
        cleanup.push(() => best.classList.remove("guide-dot"));
      }
      if (onStep && how?.target) {
        // The page may still be rendering; look again shortly.
        const find = () => document.querySelector<HTMLElement>(`[data-guide="${how.target}"]`);
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
  }, [nextHref, onStep, how?.target, wid, pathname]);

  if (mode === "off" || !snap) return null;

  const base = `/app/w/${wid}`;
  const home = pathname === base || pathname === `${base}/path`;
  const guide = pageGuideFor(pathname, wid);
  const after = snap.mode === "after";
  const showFlip = Boolean(flip && flip.at === pathname && !home);
  const outside = Boolean(cur && (cur.external || !cur.href));
  const place = cur?.href && !cur.external ? pageGuideFor(pathOf(cur.href), wid)?.title : undefined;
  // The coin's label: nothing on the pages that already show the step, or when she's quiet.
  const coinTitle = !home && cur && !quietDay ? cur.title : undefined;
  const autoOpen = mode === "open" && (showFlip || (!narrow && (hello || (onStep && !home))));

  const gotIt = () => {
    setHello(false);
    setCookie(GUIDE_HELLO_COOKIE, "1");
  };
  const showMe = () => {
    const el = how?.target ? document.querySelector<HTMLElement>(`[data-guide="${how.target}"]`) : null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("guide-target");
    void el.offsetWidth; // restart the pulse
    el.classList.add("guide-target");
    const focusable = el.matches("button, a, input, select, textarea") ? el : el.querySelector<HTMLElement>("button, input, select, textarea, a");
    focusable?.focus({ preventScroll: true });
  };

  const fab = (onOpen: () => void, className = "guide-fab") => (
    <button type="button" className={className} onClick={onOpen} aria-label={coinTitle ? fill(P.openNext, { title: coinTitle }) : P.open}>
      <PennyFace size={44} pose={quietDay ? "wink" : "wave"} className="guide-fab-face" />
      {coinTitle ? (
        <span className="guide-fab-label">
          <span className="guide-fab-kicker">{P.nextLabel}</span>
          <span className="guide-fab-title">{coinTitle}</span>
        </span>
      ) : null}
    </button>
  );

  if (mode === "min")
    return fab(() => {
      setMode("open");
      setPeek(true);
    });
  if (!autoOpen && !peek) return fab(() => setPeek(true));

  const footer = cur ? (
    <div className="guide-row">
      <StuckSheet step={cur} how={how?.how} section={cur.section} skoolGroupUrl={snap.skoolGroupUrl} wid={wid} back={pathname} className="guide-link" />
      {cur.canLater && !cur.later ? (
        <form action={laterStepAction.bind(null, wid, cur.key)}>
          <input type="hidden" name="back" value={pathname} />
          <button type="submit" className="guide-link">
            {JOURNEY_COPY.hero.later}
          </button>
        </form>
      ) : null}
    </div>
  ) : null;
  const kicker = cur ? <span className="guide-kicker">{fill(P.kicker, { day: cur.day, n: cur.n, count: cur.count })}</span> : null;
  const metaNote = snap.waitingOnMeta ? <p className="guide-hint">{P.metaTurn}</p> : null;

  let body: ReactNode;
  if (home && !peek) {
    body = null; // Dashboard and Your path already show the step: only her hello, the first time.
  } else if (showFlip && flip) {
    body = (
      <section className="guide-step">
        <p className="guide-here">
          <CheckIcon aria-hidden="true" /> {cur && !quietDay ? fill(P.flip, { win: flip.win, title: cur.title }) : fill(P.flipLast, { win: flip.win })}
        </p>
        {cur && !quietDay && cur.href ? (
          <Link href={cur.href} className="guide-go" {...(cur.external ? { target: "_blank", rel: "noreferrer" } : {})} onClick={() => setFlip(null)}>
            {P.takeMe} <ArrowRightIcon aria-hidden="true" />
          </Link>
        ) : null}
        <Link href={base} className="guide-link self-start" onClick={() => setFlip(null)}>
          {P.backHome}
        </Link>
      </section>
    );
  } else if (after || !cur) {
    body = null; // Week done, or an older account: only the page tips below.
  } else if (quietDay) {
    body = (
      <section className="guide-step">
        <h3>{fill(P.dayDone, { day: cur.day - 1 })}</h3>
      </section>
    );
  } else if (onStep) {
    body = (
      <section className="guide-step">
        {kicker}
        <h3>{cur.title}</h3>
        <p className="guide-here">
          <CheckIcon aria-hidden="true" /> {P.here}
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
            <CrosshairIcon aria-hidden="true" /> {P.showMe}
          </button>
        ) : null}
        {cur.selfLabel ? <PennyTick wid={wid} stepKey={cur.key} back={pathname} label={cur.selfLabel} /> : null}
        {cur.waitingLabel ? <PennyTick wid={wid} stepKey={cur.key} back={pathname} label={cur.waitingLabel} waiting /> : null}
        {footer}
      </section>
    );
  } else if (outside) {
    body = (
      <section className="guide-step">
        {kicker}
        <h3>{cur.title}</h3>
        {metaNote}
        <OutsideControls step={cur} wid={wid} back={pathname} />
        {footer}
      </section>
    );
  } else {
    body = (
      <section className="guide-step">
        {kicker}
        <h3>{cur.title}</h3>
        {metaNote}
        {place ? <p className="guide-why">{fill(P.elsewhere, { place })}</p> : null}
        {cur.href ? (
          <Link href={cur.href} className="guide-go">
            {P.takeMe} <ArrowRightIcon aria-hidden="true" />
          </Link>
        ) : null}
        {footer}
      </section>
    );
  }

  return (
    <>
      {/* Wide screens: dock beside the page instead of covering it (rendered on the server, so no jump). */}
      <style>{`@media (min-width:1280px){[data-slot="sidebar-inset"]{margin-right:396px!important}}`}</style>
      {/* Phones: a coin until tapped (CSS swaps them), so the card never sits over a form. */}
      {fab(() => setPeek(true), "guide-fab guide-fab-mobile")}
      <aside
        className="guide-card"
        data-mobile-min={!peek && !hello ? "1" : undefined}
        aria-label="Penny, your guide"
        onKeyDown={(e) => {
          if (e.key === "Escape") setMode("min");
        }}
      >
        <header className="guide-head">
          <PennyFace size={42} pose={quietDay ? "wink" : "wave"} className="guide-head-face" />
          <div className="guide-head-text">
            <b>Penny</b>
            <span>{cur && !quietDay && snap.dayTitle ? snap.dayTitle : guide?.title ?? ""}</span>
          </div>
          <button type="button" className="guide-icon" onClick={() => (peek ? setPeek(false) : setMode("min"))} aria-label="Minimise the guide" title={P.minimise}>
            <ChevronDownIcon />
          </button>
          <button type="button" className="guide-icon" onClick={() => setMode("off")} aria-label="Turn the guide off" title={P.off}>
            <PowerIcon />
          </button>
        </header>

        <div className="guide-body">
          {hello ? (
            <div className="guide-hello">
              <PennyFace size={64} crop="full" className="guide-hello-art" />
              <p>{P.hello}</p>
              <button type="button" className="guide-link" onClick={gotIt}>
                {P.gotIt}
              </button>
            </div>
          ) : null}

          {body}

          {guide ? (
            <details className="guide-about" open={after && !hello}>
              <summary>{fill(P.about, { title: guide.title })}</summary>
              <p>{guide.what}</p>
              <ul>
                {guide.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </aside>
    </>
  );
}
