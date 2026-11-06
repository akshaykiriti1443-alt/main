"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

declare global {
  interface Window {
    SIA?: { openCookieSettings: () => void; track: (name: string, params?: object, opts?: object) => void; trackCustom: (name: string, params?: object, opts?: object) => void };
    __siaQ?: unknown[];
  }
}

/**
 * Runs a ported page's own script (see legacy.tsx) once per visit: also after client-side
 * navigation, and never twice under React strict mode (the page root is flagged).
 */
export function LegacyScript({ rootId, js }: { rootId: string; js: string }) {
  useEffect(() => {
    const el = document.getElementById(rootId);
    if (!el || el.dataset.siaReady) return;
    el.dataset.siaReady = "1";
    const s = document.createElement("script");
    s.text = js;
    document.body.appendChild(s);
    return () => s.remove();
  }, [rootId, js]);
  return null;
}

/** "Cookie settings" in the footers: reopens the consent banner (loaded by the layout). */
export function CookieSettingsLink({ className, children = "Cookie settings" }: { className?: string; children?: ReactNode }) {
  return (
    <a
      className={className}
      href="#"
      onClick={(e) => {
        e.preventDefault();
        window.SIA?.openCookieSettings();
      }}
    >
      {children}
    </a>
  );
}

export type ResultTab = { id: string; label: string; panel: ReactNode };

/** The "Client results" tabs: one Ads Manager recording per client, only the visible one plays. */
export function ResultsTabs({ tabs, intro }: { tabs: ResultTab[]; intro: ReactNode }) {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    panelRefs.current.forEach((panel, i) => {
      const v = panel?.querySelector("video");
      if (!v) return;
      if (i === active) {
        if (v.getAttribute("preload") === "none") v.setAttribute("preload", "metadata");
        v.muted = true;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [active]);

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <>
      <div className="rv" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "24px" }}>
        {intro}
        <div role="tablist" aria-label="Client results" style={{ display: "flex", gap: "6px", padding: "5px", borderRadius: "14px", background: "#f4f4f5", border: "1px solid #e4e4e7", flexWrap: "wrap" }}>
          {tabs.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`sia-tab-${t.id}`}
              aria-controls={`sia-panel-${t.id}`}
              aria-selected={i === active}
              tabIndex={i === active ? 0 : -1}
              className="sia-tab"
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tabs.map((t, i) => (
        <div
          key={t.id}
          ref={(el) => {
            panelRefs.current[i] = el;
          }}
          role="tabpanel"
          id={`sia-panel-${t.id}`}
          aria-labelledby={`sia-tab-${t.id}`}
          data-sia-panel={i}
          hidden={i !== active}
          style={{ marginTop: "36px", flexWrap: "wrap", gap: "18px", alignItems: "stretch" }}
        >
          {t.panel}
        </div>
      ))}
    </>
  );
}

/** The /watch player: poster + one big play button, then native controls (or an iframe embed). */
export function WatchPlayer({ src, poster, embedUrl, label }: { src: string; poster: string; embedUrl?: string; label: string }) {
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const sent = useRef(new Set<string>());

  // Custom Meta Pixel events (queued until the visitor's cookie choice allows the Pixel).
  // Named like the VSL events the old site's scripts refer to (VSL_25), once per page view.
  function track(name: string) {
    if (sent.current.has(name)) return;
    sent.current.add(name);
    try {
      window.__siaQ = window.__siaQ || [];
      window.__siaQ.push(["custom", name, {}, { once: true }]);
    } catch {}
  }

  if (embedUrl) {
    return (
      <div className="s-vbox">
        <iframe src={embedUrl} title={label} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen loading="lazy" />
      </div>
    );
  }

  return (
    <div className="s-vbox">
      <video
        ref={video}
        src={src}
        poster={poster}
        preload="metadata"
        playsInline
        controls={playing}
        aria-label={label}
        onPlay={() => {
          setPlaying(true);
          track("VSL_Play");
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          const done = v.duration ? v.currentTime / v.duration : 0;
          if (done >= 0.25) track("VSL_25");
          if (done >= 0.5) track("VSL_50");
          if (done >= 0.95) track("VSL_95");
        }}
      />
      {playing ? null : (
        <button
          type="button"
          className="s-vplay"
          aria-label="Play the video"
          onClick={() => {
            setPlaying(true);
            video.current?.play().catch(() => {});
          }}
        >
          <span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            Play the 5-minute video
          </span>
        </button>
      )}
    </div>
  );
}
