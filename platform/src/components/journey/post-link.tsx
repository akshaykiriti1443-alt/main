import { coursePostAction } from "@/actions/journey";
import { SubmitButton } from "@/components/client";
import { fill, JOURNEY_COPY } from "@/lib/week";
import { cn } from "@/lib/utils";
import type { WeekStep } from "@/server/path";

const C = JOURNEY_COPY.post;

// Course unlocks: the posted half of a day's post is the link to it, pasted by the member. No hooks,
// so the big card, Your path and Penny can all use it.

/** "Link to your Day N post" + "Save my post link". A flagged link says it waits for the owner. */
export function PostLinkForm({ step, wid, back, className, compact }: { step: WeekStep; wid: string; back: string; className?: string; compact?: boolean }) {
  const saved = step.postLink?.saved;
  const id = `post-link-${step.key}${compact ? "-penny" : ""}`;
  return (
    <form action={coursePostAction.bind(null, wid, step.day)} className={cn("flex w-full flex-col gap-1.5", className)}>
      <input type="hidden" name="back" value={back} />
      {saved?.flagged ? <p className="text-[13px] leading-relaxed text-warning">{fill(C.linkFlagged, { reason: saved.reason })}</p> : null}
      {step.postLink?.catchUp ? <p className="text-[13px] leading-relaxed text-foreground/85">{step.postLink.catchUp}</p> : null}
      <label htmlFor={id} className="text-[13px] font-semibold">
        {fill(C.linkField, { day: step.day })}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          name="postUrl"
          type="url"
          inputMode="url"
          autoComplete="off"
          required
          placeholder={step.postLink?.placeholder || C.linkPlaceholder}
          aria-describedby={`${id}-hint`}
          className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground sm:max-w-md"
        />
        <SubmitButton variant="outline" size="sm" className="self-start sm:self-auto">
          {C.linkSave}
        </SubmitButton>
      </div>
      <p id={`${id}-hint`} className="text-[12px] text-muted-foreground">
        {C.linkHint}
      </p>
    </form>
  );
}

/** After the link is in: what it opened (the next lesson in Skool, and the day's reward). */
export function PostLinkDone({ step, className }: { step: WeekStep; className?: string }) {
  if (!step.postLink) return null;
  return (
    <p className={cn("text-[13px] leading-relaxed text-success", className)}>
      {step.postLink.next}
      {step.postLink.reward ? ` ${step.postLink.reward}` : ""}
    </p>
  );
}
