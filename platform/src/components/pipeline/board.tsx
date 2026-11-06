"use client";

import { useCallback, useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent, type RefObject } from "react";
import Link from "next/link";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CoinsIcon,
  EllipsisIcon,
  SquareKanbanIcon,
  LayersIcon,
  PencilIcon,
  PlusIcon,
  Settings2Icon,
  TrophyIcon,
  UploadIcon,
  type LucideIcon,
} from "lucide-react";
import { formatCents, formatTotals } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Empty } from "@/components/ui";
import { Avatar } from "@/components/crm-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePipeline } from "./provider";
import { daysLabel, daysSince, STATUS_LABEL, sumByCurrency, totalsLabel, type Column, type Deal } from "./shared";
import { openProgress, StageMark } from "./stage-mark";

/*
 * The board: one column per stage, one card per deal. Cards move by native drag and drop (with a
 * drop line showing exactly where they'll land), by their "…" menu (touch and mouse), or by keyboard
 * (Alt + arrows). Every move shows at once and is saved in the background.
 */

/** A card that sits this long in one open stage is "going quiet". */
const QUIET_DAYS = 14;

type Drag = { id: string; from: string; fromIndex: number };

export function PipelineBoard() {
  const { wid, data, columns, move, openNew, openDeal, openStages, announce } = usePipeline();
  const helpId = useId();
  const currency = data.pipeline.currency;
  const progress = openProgress(columns);
  const deals = columns.flatMap((c) => c.deals);

  // ---- Drag and drop ------------------------------------------------------
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<Drag | null>(null);
  const [over, setOver] = useState<{ stageId: string; index: number } | null>(null);
  const lists = useRef(new Map<string, HTMLOListElement>());
  const scroller = useRef<HTMLDivElement>(null);

  /** Where in a column the pointer is: the slot among the other cards (the dragged one excluded). */
  const indexAt = (stageId: string, y: number) => {
    const cards = Array.from(lists.current.get(stageId)?.querySelectorAll<HTMLElement>(":scope > [data-deal-id]") ?? []).filter(
      (el) => el.dataset.dealId !== drag.current?.id,
    );
    const i = cards.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return i === -1 ? cards.length : i;
  };

  const endDrag = useCallback(() => {
    drag.current = null;
    setDragging(null);
    setOver(null);
  }, []);

  function onDragStart(e: DragEvent<HTMLLIElement>, deal: Deal, col: Column, index: number) {
    const d = { id: deal.id, from: col.id, fromIndex: index };
    drag.current = d;
    e.dataTransfer.effectAllowed = "move";
    // Firefox only starts a drag with data on it.
    e.dataTransfer.setData("text/plain", deal.title);
    // Dim the source after the browser has taken its picture of the card.
    requestAnimationFrame(() => {
      if (drag.current === d) setDragging(d);
    });
  }

  function onColumnDragOver(e: DragEvent<HTMLElement>, col: Column) {
    if (!drag.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const index = indexAt(col.id, e.clientY);
    setOver((o) => (o && o.stageId === col.id && o.index === index ? o : { stageId: col.id, index }));
  }

  function onColumnDragLeave(e: DragEvent<HTMLElement>, col: Column) {
    const to = e.relatedTarget as Node | null;
    if (to && e.currentTarget.contains(to)) return;
    setOver((o) => (o?.stageId === col.id ? null : o));
  }

  function onColumnDrop(e: DragEvent<HTMLElement>, col: Column) {
    const d = drag.current;
    if (!d) return;
    e.preventDefault();
    const index = indexAt(col.id, e.clientY);
    endDrag();
    move(d.id, col.id, index, "drag");
  }

  /** Nudge the board sideways while a card is dragged near its edges. */
  function onBoardDragOver(e: DragEvent<HTMLDivElement>) {
    const el = scroller.current;
    if (!drag.current || !el) return;
    const r = el.getBoundingClientRect();
    const edge = Math.min(96, r.width / 5);
    if (e.clientX < r.left + edge) el.scrollBy({ left: -22 });
    else if (e.clientX > r.right - edge) el.scrollBy({ left: 22 });
  }

  // ---- Keyboard -----------------------------------------------------------
  const focusCard = (id: string) =>
    requestAnimationFrame(() => {
      const el = document.getElementById(`deal-${id}`);
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    });

  function onCardKey(e: KeyboardEvent<HTMLDivElement>, deal: Deal, ci: number, index: number) {
    const col = columns[ci];
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return openDeal(deal.id);
    }
    const arrow = e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown";
    if (!arrow || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    if (e.altKey) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const to = columns[ci + (e.key === "ArrowRight" ? 1 : -1)];
        if (!to) return announce(`${deal.title} is already in the ${e.key === "ArrowRight" ? "last" : "first"} stage.`);
        move(deal.id, to.id, undefined, "key");
      } else {
        const j = index + (e.key === "ArrowDown" ? 1 : -1);
        if (j < 0 || j >= col.deals.length) return announce(`${deal.title} is already at the ${j < 0 ? "top" : "bottom"} of ${col.name}.`);
        move(deal.id, col.id, j, "key");
      }
      return focusCard(deal.id);
    }
    // Plain arrows walk the board.
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const next = col.deals[index + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) focusCard(next.id);
      return;
    }
    const step = e.key === "ArrowRight" ? 1 : -1;
    for (let k = ci + step; k >= 0 && k < columns.length; k += step) {
      const list = columns[k].deals;
      if (list.length) return focusCard(list[Math.min(index, list.length - 1)].id);
    }
  }

  // ---- Totals ---------------------------------------------------------------
  const open = deals.filter((d) => d.status === "open");
  const empty = deals.length === 0;

  return (
    <>
      {empty ? (
        <Empty
          icon={SquareKanbanIcon}
          title="Your board is ready for its first card"
          body="A card is one person who might buy. Add someone you've been talking to, then drag them right as they get closer to yes."
          action={
            <>
              <Button variant="cta" size="lg" onClick={() => openNew()} data-guide="pipeline-add">
                <PlusIcon data-icon="inline-start" />
                Add your first opportunity
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href={`/app/w/${wid}/leads/import`}>
                  <UploadIcon data-icon="inline-start" />
                  Import from GoHighLevel
                </Link>
              </Button>
            </>
          }
        />
      ) : (
        <section aria-label="Pipeline totals" className="grid grid-cols-3 rounded-2xl bg-card shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
          <Summary icon={CoinsIcon} label="Open value" value={formatTotals(sumByCurrency(open), currency)} hint="Still in play" />
          <Summary icon={LayersIcon} label="Open deals" value={String(open.length)} hint={open.length === 1 ? "One person deciding" : "People deciding"} />
          <Summary icon={TrophyIcon} label="Won" tone="success" value={formatTotals(sumByCurrency(deals, (d) => d.status === "won"), currency)} hint="They said yes" />
        </section>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] leading-snug text-muted-foreground">
            <span className="max-md:hidden">
              Drag a card to move it, or use its <EllipsisIcon className="inline size-3.5 align-[-2px]" aria-label="more" /> menu. Click a card to edit it.
            </span>
            <span className="md:hidden">
              Swipe to see every stage. Tap <EllipsisIcon className="inline size-3.5 align-[-2px]" aria-label="more" /> on a card to move it.
            </span>
          </p>
          <ScrollButtons key={columns.length} target={scroller} />
        </div>

        <div
          ref={scroller}
          onDragOver={onBoardDragOver}
          className="-mx-4 flex scroll-px-4 items-stretch gap-3 overflow-x-auto overscroll-x-contain px-4 pt-1 pb-4 [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin] max-md:snap-x max-md:snap-mandatory md:-mx-10 md:scroll-px-10 md:px-10 xl:-mx-12 xl:scroll-px-12 xl:px-12"
        >
          {columns.map((col, ci) => {
            const isOver = over?.stageId === col.id;
            const noop = isOver && dragging?.from === col.id && dragging.fromIndex === over.index;
            const showLine = isOver && !noop && col.deals.length > 0;
            let k = 0; // index among the cards that aren't being dragged
            return (
              <section
                key={col.id}
                aria-labelledby={`col-${col.id}`}
                onDragOver={(e) => onColumnDragOver(e, col)}
                onDragLeave={(e) => onColumnDragLeave(e, col)}
                onDrop={(e) => onColumnDrop(e, col)}
                className={cn(
                  "flex w-[280px] shrink-0 snap-start flex-col rounded-2xl p-2 ring-1 ring-inset transition-[background-color,box-shadow] duration-200 ease-swift",
                  col.kind === "won"
                    ? "bg-success-soft/50 ring-success/10 dark:bg-success-soft/30"
                    : "bg-muted/60 ring-ink/[0.035] dark:bg-white/[0.025] dark:ring-white/[0.05]",
                  isOver && "bg-accent ring-2 ring-violet-300/80 dark:bg-accent/60 dark:ring-violet-400/40",
                )}
              >
                <header className="flex flex-col gap-0.5 px-2 pt-1.5 pb-3">
                  <div className="flex items-center gap-2">
                    <StageMark kind={col.kind} progress={progress[ci]} />
                    <h2 id={`col-${col.id}`} className="min-w-0 truncate text-[14px] leading-6 font-semibold tracking-[-0.01em]">
                      {col.name}
                    </h2>
                    <span
                      className="grid h-5 min-w-5 place-items-center rounded-full bg-card px-1.5 text-[11.5px] font-semibold text-muted-foreground tabular-nums ring-1 ring-ink/[0.06] dark:bg-white/[0.06] dark:ring-white/[0.06]"
                      aria-label={`${col.deals.length} ${col.deals.length === 1 ? "card" : "cards"}`}
                    >
                      {col.deals.length}
                    </span>
                    <Button variant="ghost" size="icon-xs" className="-mr-1 ml-auto text-muted-foreground" onClick={() => openNew(col.id)} aria-label={`Add an opportunity to ${col.name}`}>
                      <PlusIcon />
                    </Button>
                  </div>
                  <span className="pl-6 text-[12.5px] text-muted-foreground tabular-nums">{totalsLabel(col.deals, currency)}</span>
                </header>

                <ol
                  ref={(el) => {
                    if (el) lists.current.set(col.id, el);
                    else lists.current.delete(col.id);
                  }}
                  aria-label={col.name}
                  className="flex min-h-28 flex-1 flex-col gap-2.5"
                >
                  {col.deals.map((deal, i) => {
                    const lifted = deal.id === dragging?.id;
                    const line = showLine && !lifted && over.index === k;
                    if (!lifted) k++;
                    return [
                      line ? <DropLine key={`line-${deal.id}`} /> : null,
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        col={col}
                        columns={columns}
                        progress={progress}
                        now={data.now}
                        helpId={helpId}
                        dragging={lifted}
                        onDragStart={(e) => onDragStart(e, deal, col, i)}
                        onDragEnd={endDrag}
                        onKeyDown={(e) => onCardKey(e, deal, ci, i)}
                        onOpen={() => openDeal(deal.id)}
                        onMove={(stageId) => move(deal.id, stageId, undefined, "menu")}
                      />,
                    ];
                  })}
                  {showLine && over.index === k ? <DropLine key="line-end" /> : null}
                  {col.deals.length === 0 ? (
                    <li
                      className={cn(
                        "grid min-h-24 flex-1 place-items-center rounded-xl border border-dashed px-4 text-center text-[12.5px] transition-colors duration-150",
                        isOver ? "border-primary/50 bg-card/70 text-accent-foreground dark:bg-white/[0.04]" : "border-border-strong/70 text-subtle-foreground",
                      )}
                    >
                      {isOver ? "Drop it here" : "No one here yet"}
                    </li>
                  ) : null}
                </ol>
              </section>
            );
          })}

          <button
            type="button"
            onClick={openStages}
            className="flex min-h-36 w-[180px] shrink-0 snap-start flex-col items-center justify-center gap-2 self-start rounded-2xl border border-dashed border-border-strong px-4 py-6 text-center text-[13px] font-medium text-muted-foreground transition-colors duration-150 ease-swift outline-none hover:border-violet-300 hover:bg-accent/60 hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 dark:hover:border-violet-400/40"
          >
            <span className="grid size-8 place-items-center rounded-full bg-card shadow-xs ring-1 ring-ink/[0.06] dark:bg-white/[0.05] dark:ring-white/[0.08]">
              <Settings2Icon className="size-4" aria-hidden />
            </span>
            Add or edit stages
          </button>
        </div>
      </div>

      <p id={helpId} className="sr-only">
        Press Enter to open it. Alt with the left or right arrow moves it to the stage before or after. Alt with the up or down arrow changes its order. The arrow keys move between cards.
      </p>
    </>
  );
}

function Summary({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: string; hint: string; tone?: "success" }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 px-4 py-4 not-first:border-l not-first:border-border/80 md:px-6 md:py-5">
      <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
        <Icon className={cn("size-3.5 shrink-0", tone === "success" ? "text-success" : "text-primary dark:text-violet-300")} aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      <span className="font-display text-[26px] leading-[1] tracking-[-0.01em] break-words tabular-nums md:text-[34px]">{value}</span>
      <span className="text-xs text-subtle-foreground max-sm:hidden">{hint}</span>
    </div>
  );
}

/** Exactly where a dragged card will land: a violet line between two cards. */
function DropLine() {
  return (
    <li aria-hidden className="pointer-events-none relative -my-[5px] h-0">
      <span className="absolute inset-x-1 -top-[1.5px] h-[3px] rounded-full bg-primary shadow-[0_0_0_3px_var(--accent)] dark:bg-violet-300" />
    </li>
  );
}

const STATUS_BADGE = { won: "success", lost: "secondary", abandoned: "warning" } as const;

function DealCard({
  deal,
  col,
  columns,
  progress,
  now,
  helpId,
  dragging,
  onDragStart,
  onDragEnd,
  onKeyDown,
  onOpen,
  onMove,
}: {
  deal: Deal;
  col: Column;
  columns: Column[];
  progress: number[];
  now: number;
  helpId: string;
  dragging: boolean;
  onDragStart: (e: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  onOpen: () => void;
  onMove: (stageId: string) => void;
}) {
  const days = daysSince(deal.stageChangedAt, now);
  const quiet = deal.status === "open" && days >= QUIET_DAYS;
  const badge = deal.status !== "open" ? STATUS_BADGE[deal.status] : null;
  const who = deal.contact;
  // Most cards are named after their contact: then show how to reach them instead of the name twice.
  const whoLine = who ? (who.name.trim().toLowerCase() === deal.title.trim().toLowerCase() ? who.email || who.phone || who.name : who.name) : null;
  const stayed = days === 0 ? "Moved here today" : `In this stage for ${daysLabel(days).toLowerCase()}`;

  return (
    <li
      data-deal-id={deal.id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group/card relative rounded-xl bg-card shadow-card ring-1 ring-ink/[0.06] transition-[box-shadow,transform,opacity] duration-150 ease-swift hover:-translate-y-px hover:shadow-lift dark:ring-white/[0.07]",
        dragging && "translate-y-0 opacity-40 shadow-none hover:translate-y-0 hover:shadow-none",
      )}
    >
      <div
        id={`deal-${deal.id}`}
        role="button"
        tabIndex={0}
        aria-describedby={helpId}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        className="flex cursor-grab flex-col gap-2.5 rounded-xl p-3.5 text-left outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/35 active:cursor-grabbing"
      >
        <span className="line-clamp-2 pr-7 text-[14px] leading-snug font-medium tracking-[-0.005em] text-foreground">{deal.title}</span>
        {who ? (
          <span className="-mt-0.5 flex min-w-0 items-center gap-2">
            <Avatar name={who.name} size="sm" className="size-6 text-[9.5px]" />
            <span className="truncate text-[12.5px] text-muted-foreground">{whoLine}</span>
          </span>
        ) : null}
        <span className="flex items-center gap-2 border-t border-border/70 pt-2.5">
          {deal.valueCents ? (
            <span className="text-[13.5px] font-semibold tracking-[-0.005em] text-foreground tabular-nums">{formatCents(deal.valueCents, deal.currency)}</span>
          ) : (
            <span className="text-[12.5px] text-subtle-foreground">No value yet</span>
          )}
          {badge ? <Badge variant={badge}>{STATUS_LABEL[deal.status]}</Badge> : null}
          <span title={stayed} className={cn("ml-auto inline-flex shrink-0 items-center gap-1 text-[12px] tabular-nums", quiet ? "text-warning" : "text-subtle-foreground")}>
            <ClockIcon className="size-3" aria-hidden />
            {days === 0 ? "Today" : badge ? daysLabel(days) : `${daysLabel(days)} in stage`}
            <span className="sr-only">. {stayed}.</span>
          </span>
        </span>
      </div>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Move or edit ${deal.title}`}
            className="absolute top-2 right-2 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100 max-md:opacity-100"
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          {columns.map((c, i) => {
            const here = c.id === col.id;
            return (
              <DropdownMenuItem key={c.id} disabled={here} onSelect={() => onMove(c.id)}>
                <StageMark kind={c.kind} progress={progress[i]} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {here ? <span className="text-xs text-subtle-foreground">Here now</span> : null}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onOpen}>
            <PencilIcon />
            Open and edit
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** Left/right buttons for a horizontally scrolling board (mouse users without a sideways wheel). */
function ScrollButtons({ target }: { target: RefObject<HTMLDivElement | null> }) {
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const update = () => setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [target]);
  if (!edges.left && !edges.right) return null;
  const by = (dir: 1 | -1) => target.current?.scrollBy({ left: dir * Math.max(292, (target.current?.clientWidth ?? 600) * 0.7), behavior: "smooth" });
  return (
    <div className="flex shrink-0 items-center gap-1 max-md:hidden">
      <Button variant="outline" size="icon-sm" onClick={() => by(-1)} disabled={!edges.left} aria-label="Scroll the board left">
        <ChevronLeftIcon />
      </Button>
      <Button variant="outline" size="icon-sm" onClick={() => by(1)} disabled={!edges.right} aria-label="Scroll the board right">
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
