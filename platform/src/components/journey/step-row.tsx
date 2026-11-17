import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, ExternalLinkIcon } from "lucide-react";
import { unlaterStepAction, untickStepAction } from "@/actions/journey";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fill, JOURNEY_COPY, POST_KEYS, WHERE_LABEL } from "@/lib/week";
import { cn } from "@/lib/utils";
import type { WeekStep } from "@/server/path";
import { PostTicks } from "./skool-post-card";
import { Tick } from "./tick";

const R = JOURNEY_COPY.row;

/** A quiet inline form button: "Undo", "Do it now". */
function InlineAction({ action, back, children, extra }: { action: (fd: FormData) => Promise<void>; back: string; children: ReactNode; extra?: Record<string, string> }) {
  return (
    <form action={action} className="inline">
      <input type="hidden" name="back" value={back} />
      {Object.entries(extra ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" className="font-medium text-link underline-offset-4 hover:underline">
        {children}
      </button>
    </form>
  );
}

/** The step's title, linked to wherever it's done (a new tab when that's outside the app). */
function StepLink({ step, label, current }: { step: WeekStep; label: string; current: boolean }) {
  const cls = cn("font-medium text-foreground hover:text-primary hover:no-underline", step.done && "text-foreground/80", current && "font-semibold");
  if (!step.href) return <span className={cls}>{label}</span>;
  return step.external ? (
    <a href={step.href} target="_blank" rel="noreferrer" className={cls}>
      {label}
      <ExternalLinkIcon className="ml-1 inline size-3 align-baseline text-muted-foreground" aria-hidden />
    </a>
  ) : (
    <Link href={step.href} className={cls}>
      {label}
    </Link>
  );
}

/**
 * One step, with its tick. A done row shows its win line; under it, who ticked it ("Seen by the
 * app", or "You ticked this · Undo"). Every row links to where it's done, whatever the day.
 * variant "path" adds the one-line why and where it happens.
 */
export function StepRow({ step, wid, back, current, variant = "today" }: { step: WeekStep; wid: string; back: string; current: boolean; variant?: "today" | "path" }) {
  const isPost = POST_KEYS.includes(step.key);
  const label = step.done ? step.win : isPost && variant === "path" && step.section ? fill(JOURNEY_COPY.post.pathRow, { section: step.section }) : step.title;
  const showWhy = !step.done && (current || variant === "path");
  return (
    <li className={cn("rounded-xl px-2.5 py-2.5 transition-colors duration-150", current ? "bg-accent ring-1 ring-violet-200/80 dark:ring-white/[0.08]" : "hover:bg-accent/40")}>
      <div className="flex items-start gap-3">
        <Tick tick={step.tick} n={step.n} active={current} className="mt-px" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm leading-snug">
            <StepLink step={step} label={label} current={current} />
          </span>
          {showWhy ? <span className="text-[13px] leading-relaxed text-muted-foreground">{step.why}</span> : null}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            {step.tick === "app" ? (
              <>
                <span>{R.seen}</span>
                {step.proof?.href ? (
                  <>
                    <span aria-hidden>·</span>
                    <Link href={step.proof.href} {...(/^https?:/.test(step.proof.href) ? { target: "_blank", rel: "noreferrer" } : {})} className="font-medium">
                      {step.proof.text}
                    </Link>
                  </>
                ) : step.proof ? (
                  <span>· {step.proof.text}</span>
                ) : null}
              </>
            ) : step.tick === "you" ? (
              <>
                <span>{R.youTicked}</span>
                <span aria-hidden>·</span>
                <InlineAction action={untickStepAction.bind(null, wid, step.key)} back={back} extra={isPost ? { both: "1" } : undefined}>
                  {R.undo}
                </InlineAction>
              </>
            ) : step.tick === "waiting" ? (
              <>
                <span>{R.waiting}</span>
                <span aria-hidden>·</span>
                <InlineAction action={untickStepAction.bind(null, wid, step.key)} back={back}>
                  {R.undo}
                </InlineAction>
              </>
            ) : step.later ? (
              <>
                <span>{R.saved}</span>
                <span aria-hidden>·</span>
                <InlineAction action={unlaterStepAction.bind(null, wid, step.key)} back={back}>
                  {R.doNow}
                </InlineAction>
              </>
            ) : null}
          </div>
          {isPost && !step.done && variant === "path" && !current ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {step.href ? (
                <Button variant="secondary" size="sm" asChild>
                  <a href={step.href} target="_blank" rel="noreferrer">
                    {JOURNEY_COPY.post.openSkool}
                    <ExternalLinkIcon data-icon="inline-end" />
                  </a>
                </Button>
              ) : null}
              <PostTicks step={step} wid={wid} back={back} />
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {variant === "path" ? (
            <Badge variant={current ? "soft" : "secondary"} className="max-sm:hidden">
              {WHERE_LABEL[step.where]}
            </Badge>
          ) : null}
          {current ? (
            <span className="flex items-center gap-1 text-[11.5px] font-semibold text-primary dark:text-violet-300">
              {R.next} <ArrowRightIcon className="size-3" aria-hidden />
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
