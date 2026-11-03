import { EyeIcon } from "lucide-react";
import { setViewAsAction } from "@/actions/viewAs";
import { VIEW_AS, type ViewAs } from "@/server/viewAs";
import { cn } from "@/lib/utils";

// Shown only to the platform owner: preview the app as each kind of member. Nothing is saved.
export function ViewAsBar({ wid, current }: { wid: string; current: ViewAs }) {
  const previewing = current !== "owner";
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between",
        previewing ? "border-warning/40 bg-warning-soft" : "bg-muted/40",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <EyeIcon className="size-4 shrink-0" />
        <span className="min-w-0">
          <b>View as:</b> {VIEW_AS[current].label}
          <span className="hidden text-muted-foreground md:inline"> · {VIEW_AS[current].hint}</span>
          {previewing ? <span className="block text-xs text-muted-foreground">Preview only. Your data and plan don&apos;t change.</span> : null}
        </span>
      </span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="View the app as">
        {(Object.keys(VIEW_AS) as ViewAs[]).map((mode) => (
          <form key={mode} action={setViewAsAction.bind(null, wid, mode)}>
            <button
              type="submit"
              aria-pressed={mode === current}
              title={VIEW_AS[mode].hint}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-background",
                mode === current ? "border-primary bg-primary text-primary-foreground hover:bg-primary" : "bg-background/60",
              )}
            >
              {VIEW_AS[mode].label}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
