"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, ChevronDownIcon, SquareKanbanIcon, PlusIcon, Settings2Icon } from "lucide-react";
import { toast } from "sonner";
import { moveOpportunityAction } from "@/actions/pipeline";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DealSheet, type DealSheetTarget } from "./deal-sheet";
import { NewPipelineDialog, StageEditorSheet } from "./stage-editor";
import { statusForKind, type BoardData, type Column, type Deal } from "./shared";

/*
 * The pipeline page's client state. The server hands over the board; this keeps an optimistic copy
 * (so a dragged card lands instantly), owns the add/edit drawer and the stage editor, and announces
 * moves to screen readers. Anything on the page can reach it with usePipeline().
 */

export type MoveVia = "drag" | "menu" | "key" | "undo";

type PipelineCtx = {
  wid: string;
  data: BoardData;
  columns: Column[];
  move: (dealId: string, stageId: string, index: number | undefined, via: MoveVia) => void;
  openNew: (stageId?: string) => void;
  openDeal: (dealId: string) => void;
  openStages: () => void;
  openNewPipeline: () => void;
  announce: (message: string) => void;
};

const Ctx = createContext<PipelineCtx | null>(null);

export function usePipeline() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePipeline() needs <PipelineProvider>.");
  return ctx;
}

export function PipelineProvider({ wid, data, children }: { wid: string; data: BoardData; children: ReactNode }) {
  const router = useRouter();
  const [columns, setColumns] = useState<Column[]>(data.columns);
  const colsRef = useRef(columns);
  const pending = useRef(0);
  const commit = useCallback((next: Column[]) => {
    colsRef.current = next;
    setColumns(next);
  }, []);

  // Fresh server data replaces the optimistic copy, unless a move is still on its way (its own
  // refresh lands right after, so the board never flickers back to an older order).
  useEffect(() => {
    if (pending.current === 0) commit(data.columns);
  }, [data, commit]);

  const [live, setLive] = useState({ message: "", n: 0 });
  const announce = useCallback((message: string) => setLive((l) => ({ message, n: l.n + 1 })), []);

  const move = useCallback(
    async (dealId: string, stageId: string, index: number | undefined, via: MoveVia) => {
      const before = colsRef.current;
      const fromCol = before.find((c) => c.deals.some((d) => d.id === dealId));
      const toCol = before.find((c) => c.id === stageId);
      if (!fromCol || !toCol) return;
      const deal = fromCol.deals.find((d) => d.id === dealId)!;
      const fromIndex = fromCol.deals.indexOf(deal);
      const same = fromCol.id === toCol.id;
      const at = index ?? 0;
      if (same && (index === undefined || at === fromIndex)) return;

      const landed: Deal = same ? deal : { ...deal, stageId, status: statusForKind(toCol.kind, deal.status), stageChangedAt: Date.now() };
      const place = (cols: Column[], d: Deal, colId: string, i: number) =>
        cols.map((c) => {
          const deals = c.deals.filter((x) => x.id !== d.id);
          if (c.id === colId) deals.splice(Math.min(Math.max(0, i), deals.length), 0, d);
          return { ...c, deals };
        });
      commit(place(before, landed, stageId, at));

      const where = same ? `position ${at + 1} in ${toCol.name}` : toCol.name;
      announce(`Moved ${deal.title} to ${where}.`);

      pending.current++;
      let res: Awaited<ReturnType<typeof moveOpportunityAction>>;
      try {
        res = await moveOpportunityAction(wid, dealId, stageId, index);
      } catch {
        res = { ok: false, error: "We couldn't reach OneX. Check your connection and try again." };
      }
      pending.current--;

      if (!res.ok) {
        // Put just this card back where it was; anything else that moved meanwhile stays.
        commit(place(colsRef.current, deal, fromCol.id, fromIndex));
        toast.error(res.error);
        announce(`Couldn't move ${deal.title}. ${res.error}`);
      } else if (via === "menu" && !same) {
        toast.success(`Moved to ${toCol.name}`, {
          id: `move:${dealId}`,
          action: { label: "Undo", onClick: () => void move(dealId, fromCol.id, fromIndex, "undo") },
        });
      }
      if (pending.current === 0) router.refresh();
    },
    [wid, commit, announce, router],
  );

  // The add/edit drawer. `target` outlives `open`, so the sheet can animate closed.
  const [drawer, setDrawer] = useState<{ open: boolean; target: DealSheetTarget | null; nonce: number }>({ open: false, target: null, nonce: 0 });
  const openNew = useCallback(
    (stageId?: string) => setDrawer((d) => ({ open: true, target: { mode: "new", stageId: stageId ?? colsRef.current[0]?.id ?? "" }, nonce: d.nonce + 1 })),
    [],
  );
  const openDeal = useCallback((dealId: string) => {
    const deal = colsRef.current.flatMap((c) => c.deals).find((d) => d.id === dealId);
    if (deal) setDrawer((d) => ({ open: true, target: { mode: "edit", deal }, nonce: d.nonce + 1 }));
  }, []);

  // The stage editor and "New pipeline": a fresh form each time they open (nonce).
  const [stages, setStages] = useState({ open: false, nonce: 0 });
  const [newPipe, setNewPipe] = useState({ open: false, nonce: 0 });

  // A different pipeline: close anything that belongs to the old one.
  const pipelineId = data.pipeline.id;
  useEffect(() => {
    setDrawer((d) => ({ ...d, open: false }));
    setStages((s) => ({ ...s, open: false }));
  }, [pipelineId]);

  const value = useMemo<PipelineCtx>(
    () => ({
      wid,
      data,
      columns,
      move: (a, b, c, d) => void move(a, b, c, d),
      openNew,
      openDeal,
      openStages: () => setStages((s) => ({ open: true, nonce: s.nonce + 1 })),
      openNewPipeline: () => setNewPipe((s) => ({ open: true, nonce: s.nonce + 1 })),
      announce,
    }),
    [wid, data, columns, move, openNew, openDeal, announce],
  );

  const onDeleted = useCallback(
    (dealId: string) => commit(colsRef.current.map((c) => ({ ...c, deals: c.deals.filter((d) => d.id !== dealId) }))),
    [commit],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {drawer.target ? (
        <DealSheet
          key={drawer.nonce}
          wid={wid}
          open={drawer.open}
          onOpenChange={(open) => setDrawer((d) => ({ ...d, open }))}
          target={drawer.target}
          stages={data.pipeline.stages}
          currency={data.pipeline.currency}
          now={data.now}
          onDeleted={onDeleted}
        />
      ) : null}
      <StageEditorSheet
        wid={wid}
        open={stages.open}
        nonce={stages.nonce}
        onOpenChange={(open) => setStages((s) => ({ ...s, open }))}
        data={data}
        columns={columns}
      />
      <NewPipelineDialog
        wid={wid}
        open={newPipe.open}
        nonce={newPipe.nonce}
        onOpenChange={(open) => setNewPipe((s) => ({ ...s, open }))}
        defaultCurrency={data.pipeline.currency}
      />
      {/* Screen readers hear every move. The alternating space makes a repeated message announce again. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-pipeline-live>
        {live.message}
        {live.n % 2 ? " " : ""}
      </div>
    </Ctx.Provider>
  );
}

/** The page-level "Add opportunity" button (violet: the pink one belongs to the empty board). */
export function AddOpportunityButton({ className }: { className?: string }) {
  const { openNew } = usePipeline();
  return (
    <Button className={className} onClick={() => openNew()} data-guide="pipeline-add">
      <PlusIcon data-icon="inline-start" />
      Add opportunity
    </Button>
  );
}

/** Which board you're looking at, plus "Edit stages" and "New pipeline". */
export function PipelineSwitcher() {
  const { wid, data, openStages, openNewPipeline } = usePipeline();
  const many = data.pipelines.length > 1;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="max-w-[15rem]" aria-label={`Pipeline: ${data.pipeline.name}. Switch pipeline or edit stages`}>
          <SquareKanbanIcon data-icon="inline-start" className="text-primary dark:text-violet-300" />
          <span className="min-w-0 truncate">{data.pipeline.name}</span>
          <ChevronDownIcon data-icon="inline-end" className="text-subtle-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{many ? "Your pipelines" : "Your pipeline"}</DropdownMenuLabel>
        {data.pipelines.map((p) => {
          const current = p.id === data.pipeline.id;
          return (
            <DropdownMenuItem key={p.id} asChild className={cn(current && "font-medium")}>
              <Link href={`/app/w/${wid}/pipeline${p.isDefault ? "" : `?p=${p.id}`}`} aria-current={current ? "page" : undefined}>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="text-xs text-subtle-foreground tabular-nums">{p.stageCount} stages</span>
                <CheckIcon className={cn("text-primary dark:text-violet-300", !current && "invisible")} aria-hidden />
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={openStages}>
          <Settings2Icon />
          Edit stages
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={openNewPipeline}>
          <PlusIcon />
          New pipeline
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
