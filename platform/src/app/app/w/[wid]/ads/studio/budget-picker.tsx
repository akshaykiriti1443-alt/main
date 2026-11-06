"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const PILL =
  "flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border-strong bg-card px-4 text-[15px] font-semibold tabular-nums shadow-xs transition-colors duration-150 select-none hover:border-violet-200 hover:bg-accent has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-checked:ring-1 has-checked:ring-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/40 dark:bg-white/[0.03] dark:hover:border-white/20";

/** $5, $10 or their own amount. Typing an amount picks "Other" by itself. */
export function BudgetPicker({ initial }: { initial: number }) {
  const preset = initial === 5 || initial === 10 ? String(initial) : "other";
  const [pick, setPick] = useState(preset);
  const other = useRef<HTMLInputElement>(null);
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2.5 text-[13.5px] font-medium">Daily budget</legend>
      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        {(["5", "10"] as const).map((v) => (
          <label key={v} className={PILL}>
            <input type="radio" name="budget" value={v} checked={pick === v} onChange={() => setPick(v)} className="sr-only" />${v}
            {v === "5" ? <span className="text-[11px] font-medium text-muted-foreground">start</span> : null}
          </label>
        ))}
        <label className={PILL}>
          <input
            type="radio"
            name="budget"
            value="other"
            checked={pick === "other"}
            onChange={() => {
              setPick("other");
              requestAnimationFrame(() => other.current?.focus());
            }}
            className="sr-only"
          />
          Other
        </label>
      </div>
      <div className={cn("flex items-center gap-2 sm:max-w-md", pick !== "other" && "hidden")}>
        <span className="text-sm text-muted-foreground">$</span>
        <Input
          ref={other}
          name="budgetOther"
          inputMode="decimal"
          aria-label="Your daily budget in dollars"
          placeholder="15"
          defaultValue={preset === "other" ? String(initial) : ""}
          onFocus={() => setPick("other")}
          className="w-28 tabular-nums"
        />
        <span className="text-sm text-muted-foreground">a day</span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">$5–$10 a day is plenty to start. Less than $5 rarely reaches Skool&apos;s 100 visitors in 30 days.</p>
    </fieldset>
  );
}
