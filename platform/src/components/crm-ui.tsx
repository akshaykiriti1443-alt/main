import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTile, type Tone } from "@/components/ui";
import { Badge } from "@/components/ui/badge";

/*
 * Small building blocks for the list-heavy pages (leads, inbox, emails, automations, unlocks,
 * agency and admin). Quiet rows, soft avatars, segmented filters that live in the URL.
 */

const AVATAR_TONES = [
  "from-violet-100 to-pink-50 text-violet-700 dark:from-accent-strong dark:to-accent dark:text-accent-foreground",
  "from-pink-100 to-violet-50 text-pink-700 dark:from-cta-soft dark:to-accent dark:text-cta-soft-foreground",
  "from-gold-soft to-pink-50 text-gold-foreground dark:from-gold-soft dark:to-accent dark:text-gold-foreground",
  "from-success-soft to-violet-50 text-success dark:from-success-soft dark:to-accent dark:text-success",
] as const;

function initials(name: string) {
  // An email stands in for a name: "jamie.doyle@…" reads as JD.
  const base = name.includes("@") ? name.split("@")[0] : name;
  const parts = base.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0];
  return ((first[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : (first[1] ?? ""))).toUpperCase();
}

/** A person at a glance: their initials on a soft candy disc. The colour is stable per name. */
export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-linear-135 font-semibold tracking-[0.01em] ring-1 ring-ink/[0.05] ring-inset select-none dark:ring-white/[0.06]",
        AVATAR_TONES[h % AVATAR_TONES.length],
        size === "sm" && "size-7 text-[10.5px]",
        size === "md" && "size-9 text-xs",
        size === "lg" && "size-11 text-sm",
        size === "xl" && "size-16 text-lg",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Filters that live in the URL, drawn like the segmented Tabs control. */
export function SegmentedLinks({
  label,
  items,
  className,
}: {
  label: string;
  items: { key: string; href: string; label: ReactNode; active: boolean; count?: number; icon?: LucideIcon }[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-muted p-1 ring-1 ring-ink/[0.03] ring-inset dark:ring-white/[0.04]", className)}>
      {items.map(({ key, href, label: text, active, count, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          data-slot="segmented-link"
          aria-current={active ? "page" : undefined}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground no-underline transition-[color,background-color,box-shadow] duration-150 ease-swift hover:text-foreground",
            active && "bg-card text-foreground shadow-[0_1px_2px_rgb(var(--shadow-color)/0.08),0_2px_8px_-2px_rgb(var(--shadow-color)/0.08)] dark:bg-white/[0.09] dark:shadow-none",
          )}
        >
          {Icon ? <Icon className={cn("size-3.5", active ? "text-primary dark:text-violet-300" : "")} aria-hidden /> : null}
          {text}
          {count !== undefined ? (
            <span className={cn("min-w-4 text-center text-[11.5px] tabular-nums", active ? "text-muted-foreground" : "text-subtle-foreground")}>{count}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

/** A one-line empty state for secondary lists, so a page never turns into a stack of big empties. */
export function QuietEmpty({ icon, tone = "muted", title, body, action, className }: { icon: LucideIcon; tone?: Tone; title: ReactNode; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-xl border border-dashed border-border-strong bg-muted/30 px-4 py-3.5", className)}>
      <IconTile icon={icon} tone={tone} className="size-8 rounded-[10px]" />
      <div className="grid min-w-0 flex-1 basis-56 gap-0.5 text-sm">
        <span className="font-medium text-foreground">{title}</span>
        {body ? <span className="text-muted-foreground">{body}</span> : null}
      </div>
      {action}
    </div>
  );
}

/** On or off, as a small dot with a soft halo. */
export function LiveDot({ on, className }: { on: boolean; className?: string }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", on ? "bg-success ring-4 ring-success/15" : "bg-border-strong ring-4 ring-transparent", className)} />;
}

/** A table that runs edge to edge as the last child of a Panel or Card. */
export function EdgeTable({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("-mx-6 -mb-6 border-t border-border/80 [&_tr>*:first-child]:pl-6 [&_tr>*:last-child]:pr-6", className)}>{children}</div>;
}

/** A list of quiet, clickable rows that runs edge to edge inside a Panel. */
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("-mx-6 -mb-6 flex flex-col divide-y divide-border/80 border-t border-border/80", className)}>{children}</ul>;
}

/** One quiet row: hover tint, the title turns violet, a chevron nudges. */
export const rowLink =
  "group/row flex items-center gap-3.5 px-6 py-3.5 text-foreground no-underline transition-colors duration-150 ease-swift hover:bg-accent/60 hover:no-underline dark:hover:bg-white/[0.03]";

const STAGE_LABEL: Record<string, string> = { new: "New", engaged: "Engaged", trial: "On trial", member: "Member", lost: "Lost" };
const STAGE_CLASS: Record<string, string> = {
  new: "bg-accent text-accent-foreground",
  engaged: "bg-gold-soft text-gold-foreground",
  trial: "bg-hot-soft text-hot",
  member: "bg-success-soft text-success",
  lost: "bg-secondary text-muted-foreground",
};

/** A pipeline stage as a status chip: a dot in the stage's colour, then the word. */
export function StageChip({ stage, className }: { stage: string; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("gap-1.5 pl-2", STAGE_CLASS[stage], className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
      {STAGE_LABEL[stage] ?? stage}
    </Badge>
  );
}

/** The small uppercase label used over a list or a group of fields. */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("text-[11.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase", className)}>{children}</span>;
}
