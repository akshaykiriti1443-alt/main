import Link from "next/link";
import { ArrowRightIcon, CheckCircle2Icon, KeyRoundIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTile } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { needsKey, runsLine, type AiRuns } from "./runs";

const keyHref = (wid: string) => `/app/w/${wid}/ai#key`;

/** The small line beside an AI button: whose AI runs it and, on the included runs, which one this is. */
export function RunsNote({ runs, wid, className }: { runs: AiRuns; wid: string; className?: string }) {
  const line = runsLine(runs);
  if (!line) return null;
  return (
    <span className={cn("max-w-[52ch] text-xs leading-relaxed text-muted-foreground", className)}>
      {runs.kind === "own" ? <CheckCircle2Icon className="mr-1 inline size-3.5 -translate-y-px text-success" aria-hidden /> : null}
      {line}{" "}
      {runs.kind === "free" ? (
        <>
          <Link href={keyHref(wid)}>Add a free Gemini key</Link> and you never count runs.
        </>
      ) : runs.kind === "out" || runs.kind === "off" ? (
        <Link href={keyHref(wid)}>Add a free Gemini key</Link>
      ) : null}
    </span>
  );
}

/**
 * The one card a member sees when the next press can't use AI. `then` finishes the sentence
 * "Add a free Gemini key in Your AI, then ...", in the words of the button on that page.
 */
export function OutOfRunsCard({ runs, wid, then, className }: { runs: AiRuns; wid: string; then: string; className?: string }) {
  if (!needsKey(runs)) return null;
  const title = runs.kind === "out" ? `You've used your ${runs.total} free AI runs this month` : "Add your free AI key first";
  return (
    <Card className={cn("ring-2 ring-gold/40", className)}>
      <CardContent className="flex flex-col gap-4 @2xl/main:flex-row @2xl/main:items-center @2xl/main:justify-between">
        <div className="flex items-start gap-3.5">
          <IconTile icon={KeyRoundIcon} tone="gold" className="size-11 rounded-2xl [&_svg]:size-5" />
          <div className="grid min-w-0 gap-1">
            <h2 className="text-[17px] tracking-[-0.012em]">{title}</h2>
            <p className="max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
              Add a free Gemini key in Your AI, then {then}. It takes about two minutes, costs nothing, and from then on every AI button here runs on your key.
            </p>
          </div>
        </div>
        <Button asChild variant="cta" className="shrink-0 self-start @2xl/main:self-center">
          <Link href={keyHref(wid)}>
            Add my free Gemini key
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
