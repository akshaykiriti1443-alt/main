import { CircleCheckIcon, CircleMinusIcon } from "lucide-react";
import type { StageKind } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

/**
 * A stage's kind at a glance. Open stages are a violet dot that deepens the closer the stage is to
 * yes (`progress` 0..1); won is a jade tick, lost a quiet minus.
 */
export function StageMark({ kind, progress = 1, className }: { kind: StageKind; progress?: number; className?: string }) {
  if (kind === "won") return <CircleCheckIcon className={cn("size-4 shrink-0 text-success", className)} strokeWidth={2.25} aria-hidden />;
  if (kind === "lost") return <CircleMinusIcon className={cn("size-4 shrink-0 text-muted-foreground/80", className)} strokeWidth={2.25} aria-hidden />;
  return (
    <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center", className)}>
      <span className="size-2.5 rounded-full bg-primary ring-[3px] ring-primary/15 dark:bg-violet-300 dark:ring-violet-300/15" style={{ opacity: 0.35 + 0.65 * Math.min(1, Math.max(0, progress)) }} />
    </span>
  );
}

/** progress (0..1) for each open stage, by its place among the open stages. */
export function openProgress(stages: { kind: StageKind }[]) {
  const open = stages.filter((s) => s.kind === "open").length;
  let i = 0;
  return stages.map((s) => (s.kind === "open" ? (open <= 1 ? 1 : i++ / (open - 1)) : 1));
}
