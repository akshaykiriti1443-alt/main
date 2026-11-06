"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CalendarSearchIcon, ChevronLeftIcon, ChevronRightIcon, GlobeIcon } from "lucide-react";
import { groupByLocalDate, isValidTimeZone, localDateKey, longDate } from "@/lib/booking";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { addDays, fmtTime, formatKey, keyParts, monthKey, weekdayOf, zoneOptions } from "./shared";

/** Sunday-first in the Americas, Monday-first everywhere else. */
const weekStartFor = (tz: string) => (tz.startsWith("America/") || tz === "Pacific/Honolulu" ? 0 : 1);

const daysInMonth = (month: string) => {
  const { y, m } = keyParts(`${month}-01`);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const shiftMonth = (month: string, by: number) => {
  const { y, m } = keyParts(`${month}-01`);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** The visitor's zone, with the common ones to pick from. */
export function ZonePicker({ tz, onChange, now, detected, className }: { tz: string; onChange: (tz: string) => void; now: number; detected?: string | null; className?: string }) {
  const id = useId();
  const zones = useMemo(() => zoneOptions(now, tz, detected), [now, tz, detected]);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1.5", className)}>
      <label htmlFor={id} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
        <GlobeIcon className="size-3.5" aria-hidden />
        Time zone
      </label>
      <NativeSelect id={id} size="sm" value={tz} onChange={(e) => isValidTimeZone(e.target.value) && onChange(e.target.value)} className="max-w-full min-w-0 flex-1 basis-48">
        {zones.map((z) => (
          <NativeSelectOption key={z.value} value={z.value}>
            {z.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

/**
 * A month of days (the ones with open times highlighted) and the chosen day's times. Arrow keys
 * move around the month like a date picker; Page Up / Page Down change month.
 */
export function SlotPicker({
  slots,
  tz,
  onTzChange,
  now,
  maxDaysAhead,
  picked,
  onPick,
  detected,
  durationMinutes,
  current,
  day,
}: {
  slots: string[];
  tz: string;
  onTzChange: (tz: string) => void;
  now: number;
  maxDaysAhead: number;
  /** The time already chosen (highlighted when they come back to change it). */
  picked?: string | null;
  onPick: (iso: string) => void;
  detected?: string | null;
  durationMinutes: number;
  /** When moving a booking: its current time, shown but not pickable. */
  current?: string;
  /** Open on this day (e.g. the one they were on before a time got taken). */
  day?: string | null;
}) {
  const ids = useId();
  const byDay = useMemo(() => groupByLocalDate(slots, tz), [slots, tz]);
  const openDays = useMemo(() => Object.keys(byDay).sort(), [byDay]);
  const today = localDateKey(now, tz);
  const lastDay = [addDays(today, maxDaysAhead + 1), openDays[openDays.length - 1] ?? today].sort().pop()!;
  const firstMonth = monthKey(today);
  const lastMonth = monthKey(lastDay);

  const initialDay = picked ? localDateKey(new Date(picked), tz) : day && byDay[day] ? day : (openDays[0] ?? null);
  const [selected, setSelected] = useState<string | null>(initialDay);
  const [month, setMonth] = useState(monthKey(initialDay ?? today));
  const [focusKey, setFocusKey] = useState(initialDay ?? today);
  const moveFocus = useRef(false);
  const grid = useRef<HTMLDivElement>(null);
  /** The visitor picked a day themselves (or came back to change a time): don't move it for them. */
  const chosen = useRef(Boolean(picked || (day && byDay[day])));

  // New zone or fresh times: keep a day they chose if it still has times, else show the first day that does.
  useEffect(() => {
    if (chosen.current && selected && byDay[selected]) return;
    const first = openDays[0] ?? null;
    setSelected(first);
    if (first) {
      setMonth(monthKey(first));
      setFocusKey(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDay]);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-key="${focusKey}"]`)?.focus();
  }, [focusKey, month]);

  const weekStart = weekStartFor(tz);
  const first = `${month}-01`;
  const lead = (weekdayOf(first) - weekStart + 7) % 7;
  const count = daysInMonth(month);
  const cells: (string | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: count }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const weekdayHeads = Array.from({ length: 7 }, (_, i) => addDays("2026-11-01", (weekStart + i) % 7)); // 2026-11-01 is a Sunday

  const minKey = `${firstMonth}-01`;
  const maxKey = `${lastMonth}-${String(daysInMonth(lastMonth)).padStart(2, "0")}`;
  const clampKey = (k: string) => (k < minKey ? minKey : k > maxKey ? maxKey : k);
  const tabKey = monthKey(focusKey) === month ? focusKey : (openDays.find((d) => monthKey(d) === month) ?? first);

  function goMonth(by: number) {
    const next = shiftMonth(month, by);
    if (next < firstMonth || next > lastMonth) return;
    setMonth(next);
    // Speed things up: land on the first day with times in that month.
    const firstOpen = openDays.find((d) => monthKey(d) === next);
    if (firstOpen) {
      chosen.current = true;
      setSelected(firstOpen);
    }
    setFocusKey(firstOpen ?? `${next}-01`);
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>, key: string) {
    let next: string | null = null;
    const wd = (weekdayOf(key) - weekStart + 7) % 7;
    if (e.key === "ArrowLeft") next = addDays(key, -1);
    else if (e.key === "ArrowRight") next = addDays(key, 1);
    else if (e.key === "ArrowUp") next = addDays(key, -7);
    else if (e.key === "ArrowDown") next = addDays(key, 7);
    else if (e.key === "Home") next = addDays(key, -wd);
    else if (e.key === "End") next = addDays(key, 6 - wd);
    else if (e.key === "PageUp" || e.key === "PageDown") {
      const target = shiftMonth(monthKey(key), e.key === "PageUp" ? -1 : 1);
      const day = Math.min(keyParts(key).d, daysInMonth(target));
      next = `${target}-${String(day).padStart(2, "0")}`;
    }
    if (!next) return;
    e.preventDefault();
    next = clampKey(next);
    moveFocus.current = true;
    setFocusKey(next);
    if (monthKey(next) !== month) setMonth(monthKey(next));
  }

  const times = selected ? (byDay[selected] ?? []) : [];
  const monthLabel = formatKey(first, { month: "long", year: "numeric" });

  if (!openDays.length) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent text-primary dark:text-violet-300">
            <CalendarSearchIcon className="size-5" aria-hidden />
          </span>
          <p className="text-[16px] font-semibold tracking-[-0.01em]">No open times right now</p>
          <p className="max-w-[40ch] text-sm leading-relaxed text-muted-foreground">Every time in the next {maxDaysAhead} days is taken. New times open up every day, so check back soon.</p>
        </div>
        <ZonePicker tz={tz} onChange={onTzChange} now={now} detected={detected} />
      </div>
    );
  }

  return (
    <div className="@container/picker">
      <div className="grid gap-x-8 gap-y-7 @[620px]/picker:grid-cols-[minmax(0,1fr)_200px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h3 id={`${ids}-month`} className="text-[16px] font-semibold tracking-[-0.012em]" aria-live="polite">
              {monthLabel}
            </h3>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => goMonth(-1)} disabled={month <= firstMonth} aria-label="Previous month">
                <ChevronLeftIcon />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => goMonth(1)} disabled={month >= lastMonth} aria-label="Next month">
                <ChevronRightIcon />
              </Button>
            </div>
          </div>

          <div ref={grid} role="grid" aria-labelledby={`${ids}-month`} className="flex flex-col gap-1">
            <div role="row" className="grid grid-cols-7 gap-1">
              {weekdayHeads.map((k) => (
                <span key={k} role="columnheader" aria-label={formatKey(k, { weekday: "long" })} className="pb-1.5 text-center text-[11px] font-semibold tracking-[0.08em] text-subtle-foreground uppercase">
                  {formatKey(k, { weekday: "short" })}
                </span>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} role="row" className="grid grid-cols-7 gap-1">
                {week.map((key, di) => {
                  if (!key) return <span key={di} role="gridcell" aria-hidden />;
                  const open = !!byDay[key];
                  const isSel = key === selected;
                  const isToday = key === today;
                  const n = byDay[key]?.length ?? 0;
                  return (
                    <span key={key} role="gridcell" aria-selected={isSel} className="flex justify-center">
                      <button
                        type="button"
                        data-key={key}
                        tabIndex={key === tabKey ? 0 : -1}
                        aria-disabled={!open || undefined}
                        aria-current={isToday ? "date" : undefined}
                        aria-label={`${formatKey(key, { weekday: "long", month: "long", day: "numeric" })}${isToday ? ", today" : ""}: ${open ? `${n} time${n === 1 ? "" : "s"} free` : "no times"}`}
                        onKeyDown={(e) => onKey(e, key)}
                        onFocus={() => setFocusKey(key)}
                        onClick={() => {
                          if (!open) return;
                          chosen.current = true;
                          setSelected(key);
                        }}
                        className={cn(
                          "relative grid aspect-square w-full max-w-[52px] place-items-center rounded-full text-[14.5px] tabular-nums outline-none transition-[background-color,color,box-shadow] duration-150 ease-swift focus-visible:ring-[3px] focus-visible:ring-ring/35",
                          open
                            ? isSel
                              ? "bg-primary font-semibold text-primary-foreground shadow-press"
                              : "bg-accent font-semibold text-accent-foreground hover:bg-accent-strong"
                            : "cursor-default text-subtle-foreground/70",
                        )}
                      >
                        {keyParts(key).d}
                        {isToday ? <span aria-hidden className={cn("absolute bottom-[18%] size-1 rounded-full", isSel ? "bg-primary-foreground" : "bg-current")} /> : null}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>

          <ZonePicker tz={tz} onChange={onTzChange} now={now} detected={detected} className="mt-1" />
        </div>

        <div className="flex min-w-0 flex-col gap-3 @[620px]/picker:max-h-[440px]">
          <div aria-live="polite" className="grid gap-0.5">
            <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{selected ? formatKey(selected, { weekday: "long", month: "short", day: "numeric" }) : "Pick a day"}</h3>
            <p className="text-[12.5px] text-muted-foreground">{selected ? `${times.length} time${times.length === 1 ? "" : "s"} · ${durationMinutes} min each` : "Days with times are highlighted."}</p>
          </div>
          {selected ? (
            <ul className="-mr-1 grid grid-cols-2 gap-2 overflow-y-auto pr-1 pb-1 [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin] @[420px]/picker:grid-cols-3 @[620px]/picker:grid-cols-1">
              {times.map((d) => {
                const iso = d.toISOString();
                const on = picked === iso;
                if (current && Date.parse(current) === d.getTime()) {
                  return (
                    <li key={iso}>
                      <span className="flex h-11 w-full flex-col items-center justify-center rounded-xl border border-dashed border-border-strong text-muted-foreground tabular-nums dark:border-white/15">
                        <span className="text-[13px] leading-none font-semibold">{fmtTime(d, tz)}</span>
                        <span className="mt-0.5 text-[10.5px] leading-none font-medium tracking-[0.04em] uppercase">Your time now</span>
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={iso}>
                    <button
                      type="button"
                      onClick={() => onPick(iso)}
                      aria-label={`${fmtTime(d, tz)}, ${longDate(d, tz)}`}
                      className={cn(
                        "flex h-11 w-full items-center justify-center rounded-xl border text-[14px] font-semibold tabular-nums outline-none transition-[background-color,border-color,color,box-shadow] duration-150 ease-swift focus-visible:ring-[3px] focus-visible:ring-ring/35",
                        on
                          ? "border-primary bg-primary text-primary-foreground shadow-press"
                          : "border-violet-200 bg-card text-primary hover:border-primary hover:bg-accent dark:border-violet-400/25 dark:bg-white/[0.02] dark:text-violet-200 dark:hover:border-violet-300/60 dark:hover:bg-accent",
                      )}
                    >
                      {fmtTime(d, tz)}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
