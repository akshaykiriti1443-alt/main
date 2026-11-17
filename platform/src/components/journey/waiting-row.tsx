import { metaOkAction } from "@/actions/journey";
import { SubmitButton } from "@/components/client";
import { Callout } from "@/components/ui";
import { howFor } from "@/lib/guides";
import { JOURNEY_COPY } from "@/lib/week";
import type { WeekStep } from "@/server/path";
import { StuckSheet } from "./stuck-sheet";

const C = JOURNEY_COPY.waiting;

/**
 * Someone else's turn, not a to-do: Meta reviews new ads before they run. It sits under the
 * big card and never blocks it, and goes when an ad lead or ad click lands, or on "They're live".
 */
export function WaitingRow({ step, wid, back, skoolGroupUrl }: { step: WeekStep; wid: string; back: string; skoolGroupUrl: string }) {
  return (
    <Callout
      tone="info"
      title={C.title}
      action={
        <div className="flex flex-wrap items-center gap-3">
          <form action={metaOkAction.bind(null, wid)}>
            <input type="hidden" name="back" value={back} />
            <SubmitButton variant="outline" size="sm">
              {C.live}
            </SubmitButton>
          </form>
          <StuckSheet step={step} how={howFor(step.key)?.how} skoolGroupUrl={skoolGroupUrl} wid={wid} back={back} label={C.turnedDown} className="text-accent-foreground" />
        </div>
      }
    >
      {C.body}
    </Callout>
  );
}
