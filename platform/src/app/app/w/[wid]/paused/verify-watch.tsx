"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CircleCheckIcon, LogInIcon } from "lucide-react";
import { verifyWaitAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const EVERY_MS = 4_000;
// After this long, ask less often: they have probably wandered off.
const SLOW_AFTER_MS = 15 * 60_000;
const SLOW_EVERY_MS = 20_000;

/**
 * Watches for the email being confirmed, on any device, and moves on by itself. Asks only while
 * the tab is visible, and straight away when the member comes back to it (the usual moment:
 * they confirmed on their phone and picked the laptop up again).
 */
export function VerifyWatch({ ticket, wid, email, children }: { ticket: string; wid: string; email: string; children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"waiting" | "confirmed" | "signed-out">("waiting");
  const started = useRef(Date.now());
  const busy = useRef(false);
  const done = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;

    const check = async () => {
      if (!alive || done.current || busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        const res = await verifyWaitAction(ticket);
        if (!alive) return;
        if (res === "open") {
          done.current = true;
          router.replace(`/app/w/${wid}`);
          router.refresh();
        } else if (res === "confirmed" || res === "signed-out") {
          done.current = true;
          setState(res);
        } else if (res === "stop") {
          done.current = true;
        }
      } catch {
        // Offline for a moment: the next round tries again.
      } finally {
        busy.current = false;
      }
    };

    const loop = () => {
      if (!alive || done.current) return;
      const wait = Date.now() - started.current > SLOW_AFTER_MS ? SLOW_EVERY_MS : EVERY_MS;
      timer = setTimeout(async () => {
        await check();
        loop();
      }, wait);
    };

    const onBack = () => {
      if (document.visibilityState === "visible") void check();
    };

    loop();
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
    // The ticket and workspace never change while this screen is open.
  }, [ticket, wid, router]);

  if (state === "waiting") {
    return (
      <>
        {children}
        <p className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground" role="status">
          <span aria-hidden className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          This page moves on by itself once you confirm.
        </p>
      </>
    );
  }

  const login = `/login?note=${state === "confirmed" ? "confirmed" : "signed-out"}&email=${encodeURIComponent(email)}&next=${encodeURIComponent(`/app/w/${wid}`)}`;
  return (
    <Card className="ring-success/25">
      <CardContent className="flex flex-col items-center gap-4 text-center">
        {state === "confirmed" ? (
          <CircleCheckIcon className="size-10 text-success" aria-hidden />
        ) : (
          <LogInIcon className="size-10 text-primary dark:text-violet-300" aria-hidden />
        )}
        <div className="grid gap-1.5">
          <h2 className="text-2xl">{state === "confirmed" ? "Your email is confirmed" : "You're logged out here"}</h2>
          <p className="max-w-[46ch] text-[15px] text-muted-foreground">
            {state === "confirmed"
              ? "For safety, confirming logs you out everywhere else, so log in once more on this device and you carry on where you were."
              : "Log in again with the same email and password to carry on."}
          </p>
        </div>
        <Button asChild variant="cta" size="lg" className="w-full sm:w-auto">
          <a href={login}>
            Log in to carry on
            <ArrowRightIcon data-icon="inline-end" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
