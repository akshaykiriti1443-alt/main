"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Callout } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { mirrorableRoute, oneXUrl, parseRvMessage, routeFromPath, sameRoute, type OneXToRv } from "./routes";

/** No rv:ready or rv:error by then: ReelVault isn't answering. */
const READY_TIMEOUT_MS = 15_000;
/** A second "signed out" this soon after a fresh ticket means cookies are blocked, not an expired session. */
const SIGNED_OUT_WINDOW_MS = 60_000;
const MIN_HEIGHT = 320;
const START_HEIGHT = 640;

type Status = "loading" | "unreachable" | "error" | "ready";
type Theme = "light" | "dark";

/** OneX's own words for each reason ReelVault didn't open. Admin lines only show to platform admins. */
const ERROR_COPY: Record<string, { text: string; admin?: string; login?: boolean }> = {
  not_set_up: { text: "ReelVault and OneX aren't connected yet.", admin: "ReelVault has no ONEX_SSO_SECRET, or the ONEX_SSO_SECRET values differ." },
  bad_link: { text: "ReelVault and OneX aren't connected yet.", admin: "The ONEX_SSO_SECRET values differ." },
  turned_off: { text: "Your ReelVault account is turned off. Message the community admin." },
  too_many: { text: "Too many tries. Wait a minute, then try again." },
  signed_out: { text: "We couldn't sign you in to ReelVault. Allow cookies for this site and try again." },
  expired: { text: "The sign-in to ReelVault didn't go through. Try again." },
  used: { text: "The sign-in to ReelVault didn't go through. Try again." },
  // OneX's own route answered inside the frame instead of sending it on to ReelVault.
  onex_signed_out: { text: "You're signed out of OneX. Log in again, then come back here.", login: true },
  onex_unavailable: { text: "ReelVault isn't available for your account right now. Reload the page and try again." },
};

const CARD = "rounded-2xl bg-card shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]";

/** The placeholder while ReelVault signs in: a OneX card with skeleton lines, the frame's starting height. */
export function ReelVaultLoading({ className }: { className?: string }) {
  return (
    <div aria-busy="true" aria-label="Opening ReelVault" className={cn(CARD, "flex h-[640px] flex-col gap-5 overflow-hidden p-6 md:p-8", className)}>
      <Skeleton className="h-9 w-56 rounded-xl" />
      <Skeleton className="h-4 w-full max-w-[52ch]" />
      <div className="grid gap-4 pt-2 @2xl/main:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function ReelVaultFrame({
  wid,
  rvOrigin,
  platformName,
  isAdmin,
  reelVaultUrl,
}: {
  wid: string;
  /** new URL(REELVAULT_URL).origin: the only origin messages go to and come from. An origin, not a secret. */
  rvOrigin: string;
  platformName: string;
  isAdmin: boolean;
  /** Only passed to platform admins, for the "is it running?" hint. */
  reelVaultUrl?: string;
}) {
  const base = `/app/w/${wid}`;
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const urlRoute = routeFromPath(pathname, search, base);
  const { resolvedTheme } = useTheme();
  const theme: Theme | undefined = resolvedTheme === "dark" || resolvedTheme === "light" ? resolvedTheme : undefined;

  const [frameKey, setFrameKey] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorCode, setErrorCode] = useState<{ code: string; message: string } | null>(null);
  const [height, setHeight] = useState(START_HEIGHT);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  /** The route the frame is on, as far as OneX knows. Set from rv:ready, rv:route and our own onex:navigate. */
  const lastRoute = useRef<string | null>(null);
  /** The route this frame's ticket asked for. */
  const requestedRoute = useRef<string | null>(null);
  /** A OneX address change that came before rv:ready. */
  const pendingRoute = useRef<string | null>(null);
  const urlRouteRef = useRef(urlRoute);
  const themeRef = useRef(theme);
  const ticketRetried = useRef(false);
  const signedOutAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    urlRouteRef.current = urlRoute;
  }, [urlRoute]);

  const post = useCallback(
    (msg: OneXToRv) => {
      iframeRef.current?.contentWindow?.postMessage(msg, rvOrigin);
    },
    [rvOrigin],
  );

  const setTitle = useCallback((title: string) => {
    document.title = `${title || "ReelVault"} · ${platformName}`;
  }, [platformName]);

  /** Mirror the frame's screen in the address bar. Replace, never push: the frame's own history is the one entry. */
  const mirror = useCallback(
    (route: string) => {
      lastRoute.current = route;
      window.history.replaceState(null, "", oneXUrl(route, base));
      window.scrollTo({ top: 0 });
    },
    [base],
  );

  /** A fresh iframe, so a fresh ticket. The ReelVault session is reused if it is still there. */
  const remount = useCallback(() => {
    clearTimeout(timer.current);
    ready.current = false;
    setErrorCode(null);
    setStatus("loading");
    // Back to the skeleton's height: the old page's height would leave a long blank scroll under it.
    setHeight(START_HEIGHT);
    setSrc(null);
    setFrameKey((k) => k + 1);
  }, []);

  const showError = useCallback((code: string, message = "") => {
    clearTimeout(timer.current);
    ready.current = false;
    setErrorCode({ code, message });
    setStatus("error");
  }, []);

  // The frame's address: set once per frame, after mount, once the theme is known (so it paints in the right one).
  useEffect(() => {
    if (src !== null || !theme) return;
    const to = lastRoute.current ?? urlRouteRef.current;
    requestedRoute.current = to;
    pendingRoute.current = null;
    // w is OneX's own (the route checks this workspace's gates); it is never sent on to ReelVault.
    setSrc(`/api/reelvault/open?${new URLSearchParams({ embed: "1", w: wid, theme, to }).toString()}`);
  }, [frameKey, src, theme, wid]);

  // No word from ReelVault in 15 s: say so (a late rv:ready still opens it).
  useEffect(() => {
    if (!src) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!ready.current) setStatus((s) => (s === "loading" ? "unreachable" : s));
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(timer.current);
  }, [src]);

  // OneX's theme toggle, passed on as it changes (system changes included).
  useEffect(() => {
    themeRef.current = theme;
    if (ready.current && theme) post({ type: "onex:theme", theme });
  }, [theme, post]);

  // The OneX address changed (a sidebar sub-item, Back or Forward): tell the frame, unless it is our own mirror.
  useEffect(() => {
    if (ready.current) {
      if (!sameRoute(urlRoute, lastRoute.current)) {
        lastRoute.current = urlRoute;
        post({ type: "onex:navigate", route: urlRoute });
      }
    } else {
      pendingRoute.current = sameRoute(urlRoute, requestedRoute.current) ? null : urlRoute;
    }
  }, [urlRoute, post]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== rvOrigin) return;
      const win = iframeRef.current?.contentWindow;
      if (!win || event.source !== win) return;
      const msg = parseRvMessage(event.data);
      if (!msg) return;
      switch (msg.type) {
        case "rv:ready": {
          clearTimeout(timer.current);
          ready.current = true;
          ticketRetried.current = false;
          setErrorCode(null);
          setStatus("ready");
          setTitle(msg.title);
          if (themeRef.current) post({ type: "onex:theme", theme: themeRef.current });
          const route = mirrorableRoute(msg.route);
          const want = pendingRoute.current;
          pendingRoute.current = null;
          if (want && !sameRoute(want, route)) {
            lastRoute.current = want;
            post({ type: "onex:navigate", route: want });
          } else if (route) {
            lastRoute.current = route;
            // ReelVault chose another screen (first-run onboarding, a removed reel): show its address.
            if (!sameRoute(route, urlRouteRef.current)) mirror(route);
          }
          break;
        }
        case "rv:route": {
          setTitle(msg.title);
          // A search with characters ROUTE_RE refuses ("reels?q=what*") is mirrored percent-encoded
          // ("reels?q=what%2A"), so a click on the same sidebar item still changes the address and clears it.
          const route = mirrorableRoute(msg.route);
          if (route === null) {
            // We don't know where the frame is: forget the last route, so the next sidebar click always goes.
            lastRoute.current = null;
            break;
          }
          if (!sameRoute(route, lastRoute.current)) mirror(route);
          break;
        }
        case "rv:height":
          setHeight(Math.max(msg.height, MIN_HEIGHT));
          break;
        case "rv:toast":
          toast(msg.text);
          break;
        case "rv:signed-out": {
          const now = Date.now();
          if (now - signedOutAt.current < SIGNED_OUT_WINDOW_MS) showError("signed_out");
          else {
            signedOutAt.current = now;
            remount();
          }
          break;
        }
        case "rv:error": {
          if ((msg.code === "expired" || msg.code === "used") && !ticketRetried.current) {
            ticketRetried.current = true;
            remount();
          } else showError(msg.code, msg.message);
          break;
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [rvOrigin, post, mirror, remount, setTitle, showError]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // OneX's own route answered inside the frame (signed out of OneX, or not allowed): the frame stayed
  // on our origin, so we can read it. A ReelVault page is cross-origin and reading it throws: that's fine.
  const onLoad = useCallback(() => {
    const f = iframeRef.current;
    if (!f) return;
    let href = "";
    try {
      href = f.contentWindow?.location.href ?? "";
    } catch {
      return;
    }
    if (!href.startsWith(`${window.location.origin}/api/reelvault/open`)) return;
    const text = f.contentDocument?.body?.textContent?.trim() ?? "";
    showError(text.startsWith("Sign in") ? "onex_signed_out" : "onex_unavailable");
  }, [showError]);

  const tryAgain = useCallback(() => {
    signedOutAt.current = 0;
    ticketRetried.current = false;
    remount();
  }, [remount]);

  const retry = (
    <Button variant="outline" size="sm" onClick={tryAgain}>
      <RefreshCwIcon data-icon="inline-start" />
      Try again
    </Button>
  );

  const copy = errorCode ? ERROR_COPY[errorCode.code] : undefined;
  const showFrame = src !== null && status !== "error";

  return (
    <section aria-label="ReelVault" className="relative flex min-w-0 flex-col gap-4">
      {status === "unreachable" ? (
        <Callout tone="warn" title="We can't reach ReelVault right now" action={retry}>
          Try again in a moment.
          {isAdmin && reelVaultUrl ? (
            <span className="mt-1 block text-muted-foreground">
              Is ReelVault Members running at {reelVaultUrl}? On this computer, start it from the ReelVault Members desktop icon.
            </span>
          ) : null}
        </Callout>
      ) : null}

      {status === "error" && errorCode ? (
        <Callout
          tone="error"
          title="ReelVault didn't open"
          action={
            copy?.login ? (
              <Button asChild size="sm">
                <Link href="/login">Log in</Link>
              </Button>
            ) : (
              retry
            )
          }
        >
          {copy?.text ?? (errorCode.message || "Something went wrong. Try again.")}
          {isAdmin && copy?.admin ? <span className="mt-1 block text-muted-foreground">{copy.admin}</span> : null}
        </Callout>
      ) : null}

      <div className="relative min-w-0">
        {status === "loading" ? <ReelVaultLoading className={showFrame ? "absolute inset-x-0 top-0 z-[1]" : undefined} /> : null}
        {showFrame ? (
          <iframe
            key={frameKey}
            ref={iframeRef}
            src={src}
            title="ReelVault"
            // Copy buttons, and the full-screen button on reel videos. Granted to ReelVault's frame only.
            allow="clipboard-write; fullscreen"
            allowFullScreen
            onLoad={onLoad}
            onError={() => setStatus((s) => (s === "ready" ? s : "unreachable"))}
            className={cn("block w-full border-0 bg-transparent transition-opacity duration-200", status === "ready" ? "opacity-100" : "pointer-events-none opacity-0")}
            style={{ height: `${status === "unreachable" ? 0 : height}px`, colorScheme: theme }}
          />
        ) : null}
      </div>
    </section>
  );
}
