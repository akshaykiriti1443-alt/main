"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Which = "ai" | "starter";

export const REBUILD_CONFIRM: Record<Which, string> = {
  ai: "This rewrites your website's draft and your 3 emails. Press again to build.",
  starter: "This swaps your website's draft and your 3 emails for the starter template. Press again.",
};

/**
 * Build my launch kit, and the starter template beside it when AI can't run. Once a kit exists,
 * either one rewrites the website's draft and the emails, so both ask for a second press.
 */
/** The words on the button while the kit builds. With no AI the starter template is built in a second or two. */
export const buildingLabel = (noAi: boolean) => (noAi ? "Building your kit…" : "Writing your kit… (up to a minute)");

export function KitButtons({
  starterAction,
  rebuild,
  aiDisabled,
  offerStarter,
  noAi = false,
}: {
  starterAction: (fd: FormData) => Promise<void>;
  rebuild: boolean;
  aiDisabled: boolean;
  offerStarter: boolean;
  /** No AI can run (no key, no included runs): Build my launch kit makes the starter template. */
  noAi?: boolean;
}) {
  const { pending } = useFormStatus();
  const [armed, setArmed] = useState<Which | null>(null);
  const [sent, setSent] = useState<Which | null>(null);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const waiting = (which: Which) => rebuild && armed !== which;
  // The first press of a rebuild only arms the button. It starts as type="button", but React re-renders inside
  // the click (it turns into a submit button) before the browser decides whether the click submits, so the
  // press also cancels the click's default: otherwise one press both armed and built.
  const press = (which: Which) => (e: MouseEvent<HTMLButtonElement>) => {
    if (waiting(which)) {
      e.preventDefault();
      setArmed(which);
    } else setSent(which);
  };

  return (
    <>
      {/* The form's first submit button, and disabled: Enter in a text box never builds or spends a run. */}
      <button type="submit" disabled aria-hidden tabIndex={-1} className="sr-only" data-enter-guard="" />
      <Button
        type={waiting("ai") ? "button" : "submit"}
        variant={rebuild && armed === "ai" ? "destructive" : "cta"}
        size="lg"
        data-guide="kit-build"
        disabled={aiDisabled || pending}
        aria-disabled={pending}
        onClick={press("ai")}
      >
        {pending && sent === "ai" ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
        {pending && sent === "ai" ? buildingLabel(noAi) : rebuild && armed === "ai" ? REBUILD_CONFIRM.ai : "Build my launch kit"}
      </Button>
      {offerStarter ? (
        <Button
          type={waiting("starter") ? "button" : "submit"}
          variant={rebuild && armed === "starter" ? "destructive" : "outline"}
          // React allows formAction only on a submit button; the first press of a rebuild only arms it.
          formAction={waiting("starter") ? undefined : starterAction}
          disabled={pending}
          aria-disabled={pending}
          onClick={press("starter")}
        >
          {pending && sent === "starter" ? <Spinner data-icon="inline-start" /> : null}
          {pending && sent === "starter" ? "Building from the template…" : rebuild && armed === "starter" ? REBUILD_CONFIRM.starter : "Use the starter template instead"}
        </Button>
      ) : null}
    </>
  );
}
