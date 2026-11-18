import Link from "next/link";
import { ArrowRightIcon, CoffeeIcon, ListChecksIcon } from "lucide-react";
import { Panel } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { fill, HALF_TIME, JOURNEY_COPY } from "@/lib/week";
import type { WeekDay, WeekStep } from "@/server/path";
import { StepRow } from "./step-row";

const T = JOURNEY_COPY.today;

/** Day 2 is two sittings. Once the website is live, a calm half-time line says stopping is fine. */
function HalfTimeNote({ day }: { day: WeekDay }) {
  const at = day.steps.findIndex((s) => s.key === HALF_TIME.after);
  const firstHalfDone = at >= 0 && day.steps.slice(0, at + 1).every((s) => s.done);
  return (
    <li className="my-1 flex items-start gap-3 rounded-xl border border-dashed border-border-strong px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
      <CoffeeIcon className="mt-0.5 size-4 shrink-0 text-gold-foreground" aria-hidden />
      <span>{firstHalfDone ? T.halfTimeDone : T.halfTimeAhead}</span>
    </li>
  );
}

/** Only today's steps, never the whole week: "step 4 of 9 today". Only the current row is open. */
export function TodayList({ day, current, wid, back, first }: { day: WeekDay; current: WeekStep | null; wid: string; back: string; first?: boolean }) {
  const sub = first ? fill(T.firstSub, { count: day.total }) : current ? fill(T.sub, { day: day.day, n: current.n, count: day.total }) : undefined;
  return (
    <Panel
      icon={ListChecksIcon}
      title={first ? T.firstTitle : T.title}
      sub={sub}
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/app/w/${wid}/path`}>
            {T.whole} <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      }
    >
      <ol className="-mx-2.5 flex flex-col gap-1">
        {day.steps.map((step) => (
          <StepFragment key={step.key} step={step} day={day} current={current?.key === step.key} wid={wid} back={back} />
        ))}
      </ol>
    </Panel>
  );
}

function StepFragment({ step, day, current, wid, back }: { step: WeekStep; day: WeekDay; current: boolean; wid: string; back: string }) {
  return (
    <>
      <StepRow step={step} wid={wid} back={back} current={current} />
      {day.day === HALF_TIME.day && step.key === HALF_TIME.after ? <HalfTimeNote day={day} /> : null}
    </>
  );
}
