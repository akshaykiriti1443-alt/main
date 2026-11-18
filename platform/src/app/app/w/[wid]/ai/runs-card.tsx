import Link from "next/link";
import { ArrowRightIcon, CheckCircle2Icon, KeyRoundIcon, MessageSquareTextIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTile } from "@/components/ui";
import { CopyButton } from "@/components/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { aiGate, CLAUDE_JOBS, needsKey, runsLine, type AiRuns, type ClaudeJob } from "./runs";

const keyHref = (wid: string) => `/app/w/${wid}/ai#key`;

/** The small line beside an AI button: whose AI runs it and, on the included runs, which one this is. */
export function RunsNote({ runs, wid, claude = false, className }: { runs: AiRuns; wid: string; claude?: boolean; className?: string }) {
  const line = runsLine(runs, claude);
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
 * The card above a page's AI button. Their Claude is connected: "You're on the Claude road", with the
 * sentence to say in Claude (it replaces the key nag; the buttons keep working when a key or included
 * runs are there). No Claude: today's key card, only when the next press can't use AI.
 */
export function AiGateCard({ runs, wid, claude, job, then, className }: { runs: AiRuns; wid: string; claude: boolean; job: ClaudeJob; then: string; className?: string }) {
  const gate = aiGate(runs, claude);
  if (gate.claudeCard) return <ClaudeRoadCard runs={runs} wid={wid} job={job} className={className} />;
  if (gate.keyCard) return <OutOfRunsCard runs={runs} wid={wid} then={then} className={className} />;
  return null;
}

/** "You're on the Claude road": one line and the exact sentence to say in Claude for this page. */
export function ClaudeRoadCard({ runs, wid, job, className }: { runs: AiRuns; wid: string; job: ClaudeJob; className?: string }) {
  const { say, does } = CLAUDE_JOBS[job];
  return (
    <Card className={cn("ring-2 ring-primary/25", className)}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3.5">
          <IconTile icon={MessageSquareTextIcon} className="size-11 rounded-2xl [&_svg]:size-5" />
          <div className="grid min-w-0 gap-1">
            <h2 className="text-[17px] tracking-[-0.012em]">You&apos;re on the Claude road</h2>
            <p className="max-w-[64ch] text-sm leading-relaxed text-muted-foreground">Your Claude is connected. Say this in Claude and {does}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-xl bg-background/70 px-4 py-3.5 ring-1 ring-ink/[0.06] ring-inset @2xl/main:flex-row @2xl/main:items-center @2xl/main:justify-between dark:bg-white/[0.02] dark:ring-white/[0.07]">
          <p className="min-w-0 text-[15px] leading-relaxed font-medium">&ldquo;{say}&rdquo;</p>
          <CopyButton text={say} label="Copy" className="shrink-0 self-start @2xl/main:self-center" />
        </div>
        {needsKey(runs) ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Want the buttons below to write with AI too? <Link href={keyHref(wid)}>Add a free Gemini key</Link>.
          </p>
        ) : null}
      </CardContent>
    </Card>
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
