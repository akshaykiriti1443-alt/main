import { tickStepAction, untickStepAction } from "@/actions/journey";
import { CopyButton, SubmitButton } from "@/components/client";
import { JOURNEY_COPY, postFor } from "@/lib/week";
import { cn } from "@/lib/utils";
import type { WeekStep } from "@/server/path";
import { PostLinkDone, PostLinkForm } from "./post-link";
import { Tick } from "./tick";

const C = JOURNEY_COPY.post;

/** The two halves of a day's post: "I posted mine" and "I reviewed the one before me". Each has its own Undo. */
export function PostTicks({ step, wid, back, className }: { step: WeekStep; wid: string; back: string; className?: string }) {
  // Course unlocks: the posted half is the pasted link (no Undo: it already opened the next lesson).
  if (step.postLink) {
    // A pre-switch tick counts, but with no link saved the next lesson never opened: keep the form up.
    const posted = Boolean(step.halves?.posted) && !step.postLink.catchUp;
    const reviewed = Boolean(step.halves?.reviewed);
    return (
      <div className={cn("flex w-full flex-col gap-2.5", className)}>
        {posted ? (
          <>
            <span className="flex items-center gap-2 self-start rounded-full bg-success-soft py-1 pr-3 pl-1 text-[13px] font-semibold text-success">
              <Tick tick="app" className="size-6" />
              {C.linkSaved}
            </span>
            <PostLinkDone step={step} />
          </>
        ) : (
          <PostLinkForm step={step} wid={wid} back={back} />
        )}
        {reviewed ? (
          <form action={untickStepAction.bind(null, wid, `${step.key}r`)} className="flex items-center gap-2 self-start rounded-full bg-accent py-1 pr-3 pl-1 text-[13px] text-accent-foreground">
            <input type="hidden" name="back" value={back} />
            <Tick tick="you" className="size-6" />
            <span className="font-semibold">{C.reviewed}</span>
            <span aria-hidden className="text-accent-foreground/50">·</span>
            <button type="submit" className="font-medium underline-offset-4 hover:underline">
              {JOURNEY_COPY.row.undo}
            </button>
          </form>
        ) : (
          <form action={tickStepAction.bind(null, wid, `${step.key}r`)} className="self-start">
            <input type="hidden" name="back" value={back} />
            <SubmitButton variant="outline" size="sm">
              {step.reviewLabel ?? ""}
            </SubmitButton>
          </form>
        )}
      </div>
    );
  }
  const halves = [
    { key: step.key, done: Boolean(step.halves?.posted), label: step.selfLabel ?? "", doneLabel: C.posted },
    { key: `${step.key}r`, done: Boolean(step.halves?.reviewed), label: step.reviewLabel ?? "", doneLabel: C.reviewed },
  ];
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {halves.map((h) =>
        h.done ? (
          <form key={h.key} action={untickStepAction.bind(null, wid, h.key)} className="flex items-center gap-2 rounded-full bg-accent py-1 pr-3 pl-1 text-[13px] text-accent-foreground">
            <input type="hidden" name="back" value={back} />
            <Tick tick="you" className="size-6" />
            <span className="font-semibold">{h.doneLabel}</span>
            <span aria-hidden className="text-accent-foreground/50">·</span>
            <button type="submit" className="font-medium underline-offset-4 hover:underline">
              {JOURNEY_COPY.row.undo}
            </button>
          </form>
        ) : (
          <form key={h.key} action={tickStepAction.bind(null, wid, h.key)}>
            <input type="hidden" name="back" value={back} />
            <SubmitButton variant="outline" size="sm">
              {h.label}
            </SubmitButton>
          </form>
        ),
      )}
    </div>
  );
}

/**
 * Every day's Skool post (the last step of every day): the section to post in, the post ready to copy with the member's
 * real website and group in it, and two ticks on the member's word. The app never signs in to Skool.
 */
export function SkoolPostCard({ step, wid, back, website, group }: { step: WeekStep; wid: string; back: string; website?: string; group?: string }) {
  const text = postFor(step.day, website, group);
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 text-card-foreground shadow-card ring-1 ring-ink/[0.06] md:p-5 dark:ring-white/[0.08]">
      {step.section ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{C.section}</span>
          <CopyButton text={step.section} label={step.section} className="rounded-full font-semibold" />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <pre className="max-h-40 overflow-auto rounded-xl bg-muted/60 px-3.5 py-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/85">{text}</pre>
        <CopyButton text={text} label={C.copyPost} className="self-start" />
      </div>
      <PostTicks step={step} wid={wid} back={back} />
      <div className="flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground">
        <p>{C.firstIn}</p>
        <p>{step.postLink ? C.linkWord : C.word}</p>
      </div>
    </div>
  );
}
