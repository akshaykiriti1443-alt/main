"use client";

import { CopyIcon, PlusIcon, XIcon } from "lucide-react";
import { fromMinutes, toMinutes } from "@/lib/booking";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { wallLabel } from "./shared";

export type Range = { start: string; end: string };
/** Index = weekday (0 = Sunday). */
export type Week = Range[][];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Monday first, like most people's week. */
const ORDER = [1, 2, 3, 4, 5, 6, 0];

const STEPS = Array.from({ length: 96 }, (_, i) => fromMinutes(i * 15));
const START_OPTIONS = STEPS;
const END_OPTIONS = [...STEPS.slice(1), "24:00"];

export function toWeek(rules: { day: number; start: string; end: string }[]): Week {
  const week: Week = [[], [], [], [], [], [], []];
  for (const r of rules) if (r.day >= 0 && r.day <= 6) week[r.day].push({ start: r.start, end: r.end });
  for (const day of week) day.sort((a, b) => a.start.localeCompare(b.start));
  return week;
}

export function fromWeek(week: Week) {
  return week.flatMap((ranges, day) => ranges.map((r) => ({ day, start: r.start, end: r.end })));
}

/** One message per day with a problem: ends before it starts, or two ranges overlap. */
export function weekErrors(week: Week): Record<number, string> {
  const out: Record<number, string> = {};
  week.forEach((ranges, day) => {
    const sorted = [...ranges].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    if (sorted.some((r) => toMinutes(r.end) <= toMinutes(r.start))) out[day] = "Each range has to end after it starts.";
    else if (sorted.some((r, i) => i > 0 && toMinutes(r.start) < toMinutes(sorted[i - 1].end))) out[day] = "Two of these ranges overlap.";
  });
  return out;
}

function withCurrent(options: string[], value: string) {
  return options.includes(value) ? options : [...options, value].sort((a, b) => toMinutes(a) - toMinutes(b));
}

/** Weekly hours: each day on or off, with one or more time ranges. */
export function AvailabilityEditor({ week, onChange, errors }: { week: Week; onChange: (week: Week) => void; errors: Record<number, string> }) {
  const set = (day: number, ranges: Range[]) => onChange(week.map((r, i) => (i === day ? ranges : r)));

  function toggle(day: number, on: boolean) {
    if (!on) return set(day, []);
    // Turning a day on borrows the hours of the closest day that's already open, else 9 to 5.
    const near = [1, 2, 3, 4, 5, 6, 0].map((d) => week[d]).find((r) => r.length);
    set(day, near ? near.map((r) => ({ ...r })) : [{ start: "09:00", end: "17:00" }]);
  }

  function addRange(day: number) {
    const ranges = week[day];
    const last = ranges[ranges.length - 1];
    const startMin = last ? Math.min(toMinutes(last.end) + 60, 23 * 60) : 9 * 60;
    const endMin = Math.min(startMin + 120, 24 * 60);
    set(day, [...ranges, { start: fromMinutes(startMin), end: endMin === 1440 ? "24:00" : fromMinutes(endMin) }]);
  }

  const mondayOpen = week[1].length > 0;
  function copyMonday() {
    onChange(week.map((r, day) => (day >= 1 && day <= 5 ? week[1].map((x) => ({ ...x })) : r)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13.5px] font-medium">Weekly hours</span>
        <Button type="button" variant="ghost" size="sm" onClick={copyMonday} disabled={!mondayOpen} className="-mr-2 text-primary dark:text-violet-300">
          <CopyIcon data-icon="inline-start" />
          Copy Monday to all weekdays
        </Button>
      </div>
      <ul className="flex flex-col divide-y divide-border/80 rounded-xl ring-1 ring-border-strong/70 dark:ring-white/[0.08]">
        {ORDER.map((day) => {
          const ranges = week[day];
          const on = ranges.length > 0;
          const id = `day-${day}`;
          return (
            <li key={day} className={cn("flex flex-wrap items-start gap-x-4 gap-y-2.5 px-3.5 py-3 sm:px-4", !on && "bg-muted/30 dark:bg-white/[0.01]")}>
              <label htmlFor={id} className="flex h-9 w-[132px] shrink-0 cursor-pointer items-center gap-3 select-none">
                <Switch id={id} checked={on} onCheckedChange={(v) => toggle(day, v)} aria-label={`Open on ${DAY_NAMES[day]}`} />
                <span className={cn("text-[14px] font-medium", !on && "text-muted-foreground")}>{DAY_NAMES[day]}</span>
              </label>
              {on ? (
                <div className="flex min-w-0 flex-1 basis-[250px] flex-col gap-2">
                  {ranges.map((r, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <TimeSelect
                        label={`${DAY_NAMES[day]} range ${i + 1} starts`}
                        value={r.start}
                        options={withCurrent(START_OPTIONS, r.start)}
                        invalid={!!errors[day]}
                        onChange={(v) => set(day, ranges.map((x, j) => (j === i ? { ...x, start: v } : x)))}
                      />
                      <span aria-hidden className="px-0.5 text-muted-foreground">–</span>
                      <TimeSelect
                        label={`${DAY_NAMES[day]} range ${i + 1} ends`}
                        value={r.end}
                        options={withCurrent(END_OPTIONS, r.end)}
                        invalid={!!errors[day]}
                        onChange={(v) => set(day, ranges.map((x, j) => (j === i ? { ...x, end: v } : x)))}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-muted-foreground"
                        aria-label={`Remove ${DAY_NAMES[day]} ${wallLabel(r.start)} to ${wallLabel(r.end)}`}
                        onClick={() => set(day, ranges.filter((_, j) => j !== i))}
                      >
                        <XIcon />
                      </Button>
                    </div>
                  ))}
                  {errors[day] ? (
                    <p role="alert" className="text-[12.5px] text-destructive">
                      {errors[day]}
                    </p>
                  ) : null}
                  {ranges.length < 6 ? (
                    <button
                      type="button"
                      onClick={() => addRange(day)}
                      className="inline-flex w-fit items-center gap-1.5 rounded-full py-0.5 text-[12.5px] font-semibold text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/30 dark:text-violet-300"
                    >
                      <PlusIcon className="size-3.5" aria-hidden />
                      Add hours
                    </button>
                  ) : null}
                </div>
              ) : (
                <span className="flex h-9 items-center text-[13.5px] text-subtle-foreground">Unavailable</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TimeSelect({ label, value, options, onChange, invalid }: { label: string; value: string; options: string[]; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <NativeSelect aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} className="w-[112px] shrink-0 tabular-nums">
      {options.map((o) => (
        <NativeSelectOption key={o} value={o}>
          {wallLabel(o)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
