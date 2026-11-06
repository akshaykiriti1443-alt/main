"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, CornerDownRightIcon, PlusIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { toast } from "sonner";
import type { StageKind } from "@/lib/db/schema";
import { createPipelineAction, deletePipelineAction, savePipelineAction } from "@/actions/pipeline";
import { cn } from "@/lib/utils";
import { Callout } from "@/components/ui";
import { Kicker } from "@/components/crm-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { CURRENCIES, KIND_LABEL, kindForStageName, type BoardData, type Column } from "./shared";
import { openProgress, StageMark } from "./stage-mark";

const OFFLINE = "We couldn't reach OneX. Check your connection and try again.";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function CurrencySelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const list = CURRENCIES.includes(value as (typeof CURRENCIES)[number]) ? CURRENCIES : [value, ...CURRENCIES];
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-full">
      {list.map((c) => (
        <NativeSelectOption key={c} value={c}>
          {c}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

// ---------------------------------------------------------------------------
// Edit stages (and rename or delete the pipeline)
// ---------------------------------------------------------------------------

type Row = { key: string; id: string | null; name: string; kind: StageKind; deals: number; pos: number | null };

export function StageEditorSheet({
  wid,
  open,
  nonce,
  onOpenChange,
  data,
  columns,
}: {
  wid: string;
  open: boolean;
  nonce: number;
  onOpenChange: (open: boolean) => void;
  data: BoardData;
  columns: Column[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]">
        <StageEditorForm key={nonce} wid={wid} data={data} columns={columns} onDone={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function StageEditorForm({ wid, data, columns, onDone }: { wid: string; data: BoardData; columns: Column[]; onDone: () => void }) {
  const router = useRouter();
  const ids = useId();
  const [name, setName] = useState(data.pipeline.name);
  const [currency, setCurrency] = useState(data.pipeline.currency);
  const [rows, setRows] = useState<Row[]>(() =>
    data.pipeline.stages.map((s, i) => ({ key: s.id, id: s.id, name: s.name, kind: s.kind, deals: columns.find((c) => c.id === s.id)?.deals.length ?? 0, pos: i })),
  );
  const [removed, setRemoved] = useState<Row[]>([]);
  const [error, setError] = useState<{ message: string; key?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const seq = useRef(0);

  const progress = openProgress(rows);
  const dealCount = columns.reduce((n, c) => n + c.deals.length, 0);
  const onlyOne = data.pipelines.length <= 1;
  const canDelete = !onlyOne && dealCount === 0;

  const focusLater = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

  /** Where a removed stage's deals go: the nearest kept stage that came before it, else the first. */
  function destination(r: Row) {
    const before = rows.filter((x) => x.pos !== null && r.pos !== null && x.pos < r.pos).sort((a, b) => a.pos! - b.pos!);
    return before.at(-1) ?? rows[0];
  }

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    if (error?.key === key) setError(null);
  }

  function shift(key: string, by: -1 | 1) {
    const i = rows.findIndex((r) => r.key === key);
    const j = i + by;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
    // Keep focus on the arrow that was pressed; if it's now disabled, on the other one.
    const edge = j === 0 || j === next.length - 1;
    focusLater(`${ids}-${key}-${edge ? (by < 0 ? "down" : "up") : by < 0 ? "up" : "down"}`);
  }

  function add() {
    const key = `new-${++seq.current}`;
    const at = rows.findIndex((r) => r.kind !== "open");
    const i = at === -1 ? rows.length : at;
    setRows((rs) => [...rs.slice(0, i), { key, id: null, name: "", kind: "open", deals: 0, pos: null }, ...rs.slice(i)]);
    focusLater(`${ids}-${key}-name`);
  }

  function remove(r: Row) {
    if (rows.length <= 1) return setError({ message: "A pipeline needs at least one stage." });
    setRows((rs) => rs.filter((x) => x.key !== r.key));
    if (r.id) setRemoved((rm) => [...rm, r]);
    if (error?.key === r.key) setError(null);
  }

  function restore(r: Row) {
    setRemoved((rm) => rm.filter((x) => x.key !== r.key));
    setRows((rs) => {
      const i = rs.findIndex((x) => x.pos !== null && r.pos !== null && x.pos > r.pos);
      return i === -1 ? [...rs, r] : [...rs.slice(0, i), r, ...rs.slice(i)];
    });
  }

  function validate(): { message: string; key?: string } | null {
    if (!rows.length) return { message: "A pipeline needs at least one stage." };
    if (rows.length > 20) return { message: "Keep it to 20 stages or fewer." };
    const seen = new Map<string, string>();
    for (const r of rows) {
      const n = r.name.trim().replace(/\s+/g, " ");
      if (!n) return { message: "Every stage needs a name.", key: r.key };
      const k = n.toLowerCase();
      if (seen.has(k)) return { message: `Two stages are called "${n}". Give each a different name.`, key: r.key };
      seen.set(k, r.key);
    }
    return null;
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      if (problem.key) focusLater(`${ids}-${problem.key}-name`);
      return;
    }
    setError(null);
    start(async () => {
      try {
        const res = await savePipelineAction(wid, data.pipeline.id, {
          name,
          currency,
          stages: rows.map((r) => ({ id: r.id, name: r.name.trim(), kind: r.kind })),
        });
        if (!res.ok) return setError({ message: res.error });
        toast.success(res.moved ? `Saved. ${plural(res.moved, "deal")} moved to the stage before.` : "Pipeline saved");
        onDone();
        router.refresh();
      } catch {
        setError({ message: OFFLINE });
      }
    });
  }

  function deletePipeline() {
    start(async () => {
      try {
        const res = await deletePipelineAction(wid, data.pipeline.id);
        if (!res.ok) {
          setConfirmDelete(false);
          return setError({ message: res.error });
        }
        toast.success(`${data.pipeline.name} deleted`);
        onDone();
        router.push(`/app/w/${wid}/pipeline`);
        router.refresh();
      } catch {
        setError({ message: OFFLINE });
      }
    });
  }

  return (
    <form onSubmit={save} noValidate className="flex h-full min-h-0 flex-col">
      <SheetHeader className="gap-1.5 border-b border-border/80 px-6 pt-6 pb-5 pr-14">
        <span className="eyebrow">Pipeline settings</span>
        <SheetTitle className="text-[19px] leading-snug">Edit stages</SheetTitle>
        <SheetDescription>The steps someone goes through on the way to yes. Open stages are the steps; a card dropped in Won or Lost is closed.</SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-6">
        <FieldGroup className="gap-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field>
              <FieldLabel htmlFor={`${ids}-name`}>Pipeline name</FieldLabel>
              <Input id={`${ids}-name`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${ids}-currency`}>Currency</FieldLabel>
              <CurrencySelect id={`${ids}-currency`} value={currency} onChange={setCurrency} />
            </Field>
          </div>

          <section aria-labelledby={`${ids}-stages`} className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <Kicker>
                <span id={`${ids}-stages`}>Stages, in order</span>
              </Kicker>
              <span className="text-xs text-subtle-foreground tabular-nums">{rows.length} of 20</span>
            </div>
            <ol className="flex flex-col gap-2">
              {rows.map((r, i) => {
                const invalid = error?.key === r.key;
                const label = r.name.trim() || `Stage ${i + 1}`;
                return (
                  <li key={r.key} className="rounded-xl bg-card p-2 pl-2.5 shadow-xs ring-1 ring-ink/[0.07] dark:bg-white/[0.03] dark:ring-white/[0.08]">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                      <span className="grid w-5 place-items-center">
                        <StageMark kind={r.kind} progress={progress[i]} />
                      </span>
                      <Input
                        id={`${ids}-${r.key}-name`}
                        value={r.name}
                        maxLength={60}
                        placeholder="Name this stage"
                        aria-label={`Stage ${i + 1} name`}
                        aria-invalid={invalid || undefined}
                        onChange={(e) => update(r.key, r.id ? { name: e.target.value } : { name: e.target.value, kind: kindForStageName(e.target.value) })}
                        autoComplete="off"
                        className="h-9 min-w-0 flex-1 basis-44"
                      />
                      <div className="ml-auto flex items-center gap-0.5">
                        <NativeSelect
                          size="sm"
                          aria-label={`Kind of stage for ${label}`}
                          value={r.kind}
                          onChange={(e) => update(r.key, { kind: e.target.value as StageKind })}
                          className="mr-1 w-[88px]"
                        >
                          {(["open", "won", "lost"] as const).map((k) => (
                            <NativeSelectOption key={k} value={k}>
                              {KIND_LABEL[k]}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                        <Button id={`${ids}-${r.key}-up`} type="button" variant="ghost" size="icon-xs" disabled={i === 0} onClick={() => shift(r.key, -1)} aria-label={`Move ${label} up`}>
                          <ArrowUpIcon />
                        </Button>
                        <Button
                          id={`${ids}-${r.key}-down`}
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={i === rows.length - 1}
                          onClick={() => shift(r.key, 1)}
                          aria-label={`Move ${label} down`}
                        >
                          <ArrowDownIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => remove(r)}
                          aria-label={`Remove ${label}`}
                          className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </div>
                    {r.deals > 0 ? <p className="mt-1.5 pl-7 text-xs text-subtle-foreground tabular-nums">{plural(r.deals, "card")} here now</p> : null}
                  </li>
                );
              })}
            </ol>
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={add} disabled={rows.length >= 20}>
              <PlusIcon data-icon="inline-start" />
              Add a stage
            </Button>

            {removed.length ? (
              <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border-strong bg-muted/30 p-3" role="status">
                <Kicker>Removing when you save</Kicker>
                <ul className="flex flex-col gap-1.5">
                  {removed.map((r) => {
                    const to = destination(r);
                    return (
                      <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-foreground line-through decoration-foreground/30">{r.name || "Unnamed stage"}</span>
                          {r.deals > 0 && to ? (
                            <span className="ml-1.5 inline-flex items-center gap-1 text-muted-foreground">
                              <CornerDownRightIcon className="size-3.5" aria-hidden />
                              its {plural(r.deals, "card")} {r.deals === 1 ? "moves" : "move"} to <b className="font-medium text-foreground/85">{to.name.trim() || "the stage before"}</b>
                            </span>
                          ) : (
                            <span className="ml-1.5 text-muted-foreground">(empty)</span>
                          )}
                        </span>
                        <Button type="button" variant="ghost" size="xs" onClick={() => restore(r)}>
                          <Undo2Icon data-icon="inline-start" />
                          Keep it
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">Removing a stage never deletes cards: they move to the stage before it.</p>
            )}
          </section>

          <section className="mt-2 flex flex-col gap-3 rounded-2xl border border-border p-4" aria-labelledby={`${ids}-danger`}>
            <div className="grid gap-1">
              <h3 id={`${ids}-danger`} className="text-sm font-semibold">
                Delete this pipeline
              </h3>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {onlyOne
                  ? "It's your only pipeline, so it stays. Rename it instead."
                  : dealCount
                    ? `It still has ${plural(dealCount, "card")}. Move or delete ${dealCount === 1 ? "it" : "them"} first.`
                    : "It's empty, so nothing else goes with it."}
              </p>
            </div>
            {canDelete ? (
              confirmDelete ? (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm delete">
                  <span className="mr-1 text-[13px] text-foreground/85">Delete {data.pipeline.name} for good?</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)} disabled={pending}>
                    Keep it
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={deletePipeline} disabled={pending} autoFocus>
                    {pending ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
                    Delete pipeline
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="destructive" size="sm" className="self-start" onClick={() => setConfirmDelete(true)} disabled={pending}>
                  <Trash2Icon data-icon="inline-start" />
                  Delete pipeline
                </Button>
              )
            ) : null}
          </section>
        </FieldGroup>
      </div>

      <SheetFooter className="mt-0 gap-3 border-t border-border/80 bg-muted/40 px-6 py-4 dark:bg-white/[0.02]">
        {error ? <Callout tone="error">{error.message}</Callout> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {pending ? "Saving…" : "Save pipeline"}
          </Button>
        </div>
      </SheetFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// New pipeline
// ---------------------------------------------------------------------------

export function NewPipelineDialog({
  wid,
  open,
  nonce,
  onOpenChange,
  defaultCurrency,
}: {
  wid: string;
  open: boolean;
  nonce: number;
  onOpenChange: (open: boolean) => void;
  defaultCurrency: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <NewPipelineForm key={nonce} wid={wid} defaultCurrency={defaultCurrency} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function NewPipelineForm({ wid, defaultCurrency, onDone }: { wid: string; defaultCurrency: string; onDone: () => void }) {
  const router = useRouter();
  const ids = useId();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Give the pipeline a name.");
    setError(null);
    start(async () => {
      try {
        const res = await createPipelineAction(wid, { name: name.trim(), currency });
        if (!res.ok) return setError(res.error);
        toast.success(`${name.trim()} is ready`);
        onDone();
        router.push(`/app/w/${wid}/pipeline?p=${res.id}`);
      } catch {
        setError(OFFLINE);
      }
    });
  }

  return (
    <form onSubmit={create} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>New pipeline</DialogTitle>
        <DialogDescription>A separate board for a different offer, like 1:1 coaching or brand deals.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-[1fr_112px]">
        <Field>
          <FieldLabel htmlFor={`${ids}-name`}>Name</FieldLabel>
          <Input
            id={`${ids}-name`}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Coaching clients"
            aria-invalid={error === "Give the pipeline a name." || undefined}
            autoComplete="off"
            autoFocus
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${ids}-currency`}>Currency</FieldLabel>
          <CurrencySelect id={`${ids}-currency`} value={currency} onChange={setCurrency} />
        </Field>
      </div>
      <FieldDescription className={cn("-mt-1 text-[13px]")}>It starts with six stages: New lead, Contacted, Call booked, Proposal sent, Won and Lost. Rename them any time.</FieldDescription>
      {error ? <Callout tone="error">{error}</Callout> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
          Create pipeline
        </Button>
      </DialogFooter>
    </form>
  );
}
