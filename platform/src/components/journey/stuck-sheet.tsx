"use client";

import { useState } from "react";
import { ExternalLinkIcon, LifeBuoyIcon } from "lucide-react";
import { laterStepAction } from "@/actions/journey";
import { CopyButton, SubmitButton } from "@/components/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { fill, JOURNEY_COPY } from "@/lib/week";
import { cn } from "@/lib/utils";
import type { WeekStep } from "@/server/path";

const C = JOURNEY_COPY.stuck;

/**
 * "Stuck?": the how-to, a ready message for Skool that needs no review first, and "Do this
 * later". A help path that never shames: none of it is a wrong answer.
 */
export function StuckSheet({
  step,
  how,
  section,
  skoolGroupUrl,
  wid,
  back,
  label = JOURNEY_COPY.hero.stuck,
  className,
}: {
  step: WeekStep;
  how?: string[];
  section?: string;
  skoolGroupUrl: string;
  wid: string;
  back: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ask = fill(C.askText, { day: step.day, n: step.n, title: step.title });
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" className={cn("inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline", className)}>
          <LifeBuoyIcon className="size-3.5" aria-hidden />
          {label}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader className="pr-12">
          <SheetTitle>{fill(C.title, { title: step.title })}</SheetTitle>
          <SheetDescription>{C.sub}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-8">
          {how?.length ? (
            <section className="flex flex-col gap-2.5">
              <h3 className="font-heading text-[15px] font-semibold">{C.tryThis}</h3>
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-foreground/85 marker:font-semibold marker:text-primary">
                {how.map((line) => (
                  <li key={line}>{section ? line.replaceAll("{section}", section) : line}</li>
                ))}
              </ol>
            </section>
          ) : null}
          <section className="flex flex-col gap-2.5">
            <h3 className="font-heading text-[15px] font-semibold">{C.ask}</h3>
            <p className="rounded-xl bg-muted/70 px-3.5 py-3 text-sm leading-relaxed text-foreground/85">{ask}</p>
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={ask} label={C.copy} />
              {skoolGroupUrl ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={skoolGroupUrl} target="_blank" rel="noreferrer">
                    {C.openSkool}
                    <ExternalLinkIcon data-icon="inline-end" />
                  </a>
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{C.noReview}</p>
          </section>
          {step.canLater && !step.later && !step.done ? (
            <section className="flex flex-col gap-2.5">
              <h3 className="font-heading text-[15px] font-semibold">{C.laterTitle}</h3>
              <p className="text-sm text-muted-foreground">{fill(C.laterBody, { day: step.day })}</p>
              <form action={laterStepAction.bind(null, wid, step.key)}>
                <input type="hidden" name="back" value={back} />
                <SubmitButton variant="outline" size="sm">
                  {JOURNEY_COPY.hero.later}
                </SubmitButton>
              </form>
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
