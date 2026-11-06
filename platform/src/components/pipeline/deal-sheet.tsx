"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRightIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import type { OpportunityStatus } from "@/lib/db/schema";
import { deleteOpportunityAction, saveOpportunityAction, searchContactsAction } from "@/actions/pipeline";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Callout } from "@/components/ui";
import { Avatar } from "@/components/crm-ui";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCIES, daysLabel, daysSince, STATUS_LABEL, statusForKind, valueForInput, type Deal, type DealContact, type Stage } from "./shared";

export type DealSheetTarget = { mode: "new"; stageId: string } | { mode: "edit"; deal: Deal };

const STATUSES: OpportunityStatus[] = ["open", "won", "lost", "abandoned"];
export const STATUS_DOT: Record<OpportunityStatus, string> = {
  open: "bg-primary dark:bg-violet-300",
  won: "bg-success",
  lost: "bg-muted-foreground/50",
  abandoned: "bg-warning",
};

/** Add or edit one opportunity: a full-height drawer on the right (full width on phones). */
export function DealSheet({
  wid,
  open,
  onOpenChange,
  target,
  stages,
  currency,
  now,
  onDeleted,
}: {
  wid: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: DealSheetTarget;
  stages: Stage[];
  currency: string;
  now: number;
  onDeleted: (dealId: string) => void;
}) {
  const router = useRouter();
  const deal = target.mode === "edit" ? target.deal : null;
  const firstStage = deal?.stageId ?? (target.mode === "new" ? target.stageId : "");
  const kindOf = (id: string) => stages.find((s) => s.id === id)?.kind ?? "open";

  const [title, setTitle] = useState(deal?.title ?? "");
  const [contact, setContact] = useState<DealContact | null>(deal?.contact ?? null);
  const [value, setValue] = useState(valueForInput(deal?.valueCents ?? 0));
  const [cur, setCur] = useState(deal?.currency ?? currency);
  const [stageId, setStageId] = useState(stages.some((s) => s.id === firstStage) ? firstStage : (stages[0]?.id ?? ""));
  const [status, setStatus] = useState<OpportunityStatus>(deal?.status ?? statusForKind(kindOf(firstStage), "open"));
  const [source, setSource] = useState(deal?.source ?? "");
  const [notes, setNotes] = useState(deal?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const ids = useId();

  const stageName = stages.find((s) => s.id === stageId)?.name ?? "the board";
  const currencies = CURRENCIES.includes(cur as (typeof CURRENCIES)[number]) ? CURRENCIES : [cur, ...CURRENCIES];

  function pickStage(id: string) {
    setStageId(id);
    // Same rule as the board: a Won or Lost stage closes it, an open stage reopens it.
    setStatus((s) => statusForKind(kindOf(id), s));
  }

  function pickContact(c: DealContact | null) {
    setContact(c);
    if (c && !title.trim()) setTitle(c.name);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() && !contact) {
      setError("Give it a name, or pick a contact.");
      titleRef.current?.focus();
      return;
    }
    setError(null);
    start(async () => {
      try {
        const res = await saveOpportunityAction(wid, deal?.id ?? null, {
          title,
          stageId,
          contactId: contact?.id ?? "",
          value,
          currency: cur,
          status,
          source,
          notes,
        });
        if (!res.ok) return setError(res.error);
        toast.success(deal ? "Saved" : `Added to ${stageName}`);
        onOpenChange(false);
        router.refresh();
      } catch {
        setError("We couldn't reach OneX. Check your connection and try again.");
      }
    });
  }

  function remove() {
    if (!deal) return;
    start(async () => {
      try {
        const res = await deleteOpportunityAction(wid, deal.id);
        if (!res.ok) {
          setConfirming(false);
          return setError(res.error);
        }
        onDeleted(deal.id);
        toast.success("Opportunity deleted");
        onOpenChange(false);
        router.refresh();
      } catch {
        setError("We couldn't reach OneX. Check your connection and try again.");
      }
    });
  }

  const days = deal ? daysSince(deal.stageChangedAt, now) : 0;
  const currentStage = deal ? (stages.find((s) => s.id === deal.stageId)?.name ?? "") : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]"
        onOpenAutoFocus={(e) => {
          // New: straight into the name. Edit: stay calm, focus the drawer itself.
          e.preventDefault();
          if (!deal) titleRef.current?.focus();
          else formRef.current?.focus();
        }}
      >
        <form ref={formRef} tabIndex={-1} onSubmit={save} noValidate className="flex h-full min-h-0 flex-col outline-none">
          <SheetHeader className="gap-1.5 border-b border-border/80 px-6 pt-6 pb-5 pr-14">
            <span className="eyebrow">{deal ? "Opportunity" : "New opportunity"}</span>
            <SheetTitle className="line-clamp-2 text-[19px] leading-snug">{deal ? deal.title : "Someone who might buy"}</SheetTitle>
            <SheetDescription>
              {deal ? (
                <>
                  In <span className="font-medium text-foreground/85">{currentStage}</span> {days === 0 ? "since today" : `for ${daysLabel(days)}`}
                  {deal.valueCents ? <> · {formatCents(deal.valueCents, deal.currency)}</> : null}
                </>
              ) : (
                "One card per person. Drag it right as they get closer to yes."
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-6">
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor={`${ids}-title`}>Name</FieldLabel>
                <Input
                  ref={titleRef}
                  id={`${ids}-title`}
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={contact ? contact.name : "e.g. Jamie Doyle, 1:1 coaching"}
                  aria-invalid={error === "Give it a name, or pick a contact." || undefined}
                  autoComplete="off"
                />
              </Field>

              <ContactPicker wid={wid} value={contact} onChange={pickContact} inputId={`${ids}-contact`} />

              <Field>
                <FieldLabel htmlFor={`${ids}-value`}>Value</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id={`${ids}-value`}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    autoComplete="off"
                    className="min-w-0 flex-1 tabular-nums"
                  />
                  <NativeSelect aria-label="Currency" value={cur} onChange={(e) => setCur(e.target.value)} className="w-[104px] shrink-0">
                    {currencies.map((c) => (
                      <NativeSelectOption key={c} value={c}>
                        {c}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <FieldDescription>What they&apos;d pay you. A rough guess is fine.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor={`${ids}-stage`}>Stage</FieldLabel>
                <NativeSelect id={`${ids}-stage`} value={stageId} onChange={(e) => pickStage(e.target.value)} className="w-full">
                  {stages.map((s) => (
                    <NativeSelectOption key={s.id} value={s.id}>
                      {s.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[13.5px] leading-none font-medium text-foreground">Status</legend>
                <div className="flex w-fit max-w-full flex-wrap gap-0.5 rounded-full bg-muted p-1 ring-1 ring-ink/[0.03] ring-inset dark:ring-white/[0.04]">
                  {STATUSES.map((s) => (
                    <label key={s} className="relative">
                      <input type="radio" name={`${ids}-status`} value={s} checked={status === s} onChange={() => setStatus(s)} className="peer sr-only" />
                      <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] duration-150 ease-swift peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-[0_1px_2px_rgb(var(--shadow-color)/0.08),0_2px_8px_-2px_rgb(var(--shadow-color)/0.08)] peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/30 hover:text-foreground dark:peer-checked:bg-white/[0.09]">
                        <span aria-hidden className={cn("size-1.5 rounded-full", STATUS_DOT[s])} />
                        {STATUS_LABEL[s]}
                      </span>
                    </label>
                  ))}
                </div>
                <FieldDescription>Won and Lost close it. Abandoned is for someone who went quiet.</FieldDescription>
              </fieldset>

              <Field>
                <FieldLabel htmlFor={`${ids}-source`}>Where they came from</FieldLabel>
                <Input
                  id={`${ids}-source`}
                  value={source}
                  maxLength={200}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. Instagram DM, a referral, your Skool"
                  autoComplete="off"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor={`${ids}-notes`}>Notes</FieldLabel>
                <Textarea
                  id={`${ids}-notes`}
                  value={notes}
                  maxLength={10000}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What they want, what you promised, when to follow up."
                  className="min-h-24"
                />
              </Field>
            </FieldGroup>
          </div>

          <SheetFooter className="mt-0 gap-3 border-t border-border/80 bg-muted/40 px-6 py-4 dark:bg-white/[0.02]">
            {error ? <Callout tone="error">{error}</Callout> : null}
            {confirming ? (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3" role="group" aria-label="Confirm delete">
                <span className="grid gap-0.5 leading-tight">
                  <span className="text-sm font-semibold text-foreground">Delete it for good?</span>
                  <span className="text-[13px] text-muted-foreground">You can&apos;t undo this.</span>
                </span>
                <div className="ml-auto flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
                    Keep it
                  </Button>
                  <Button type="button" variant="destructive" onClick={remove} disabled={pending} autoFocus>
                    {pending ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
                    Delete
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {deal ? (
                  <Button type="button" variant="ghost" className="-ml-2 text-destructive hover:bg-destructive-soft hover:text-destructive" onClick={() => setConfirming(true)} disabled={pending}>
                    <Trash2Icon data-icon="inline-start" />
                    Delete
                  </Button>
                ) : null}
                <div className="ml-auto flex gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? <Spinner data-icon="inline-start" /> : null}
                    {pending ? "Saving…" : deal ? "Save" : "Add opportunity"}
                  </Button>
                </div>
              </div>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Search the workspace's contacts by name, email or phone, and pick one. */
function ContactPicker({ wid, value, onChange, inputId }: { wid: string; value: DealContact | null; onChange: (c: DealContact | null) => void; inputId: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DealContact[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const req = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `${inputId}-list`;

  useEffect(() => {
    const term = q.trim();
    const mine = ++req.current;
    if (!term) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const rows = await searchContactsAction(wid, term);
        if (mine === req.current) {
          setResults(rows);
          setActive(0);
        }
      } catch {
        if (mine === req.current) setResults([]);
      } finally {
        if (mine === req.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, wid]);

  function pick(c: DealContact) {
    onChange(c);
    setQ("");
    setResults(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!results?.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[active] ?? results[0]);
    }
  }

  if (value) {
    return (
      <Field>
        <FieldLabel htmlFor={inputId}>Contact</FieldLabel>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card py-2.5 pr-2 pl-3 shadow-xs dark:bg-white/[0.03]">
          <Avatar name={value.name} />
          <div className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-sm font-medium">{value.name}</span>
            <span className="truncate text-xs text-muted-foreground">{value.email || value.phone || "No email or phone yet"}</span>
          </div>
          <Button variant="ghost" size="xs" asChild className="text-primary hover:text-primary dark:text-violet-300">
            <Link href={`/app/w/${wid}/leads/${value.id}`} target="_blank" rel="noopener">
              Open
              <ArrowUpRightIcon data-icon="inline-end" />
              <span className="sr-only">{value.name}&apos;s contact page (opens in a new tab)</span>
            </Link>
          </Button>
          <Button
            id={inputId}
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${value.name} from this opportunity`}
            onClick={() => {
              onChange(null);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            <XIcon />
          </Button>
        </div>
      </Field>
    );
  }

  const showList = results !== null && q.trim().length > 0;
  return (
    <Field>
      <FieldLabel htmlFor={inputId}>Contact</FieldLabel>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />
        <Input
          ref={inputRef}
          id={inputId}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search your leads by name, email or phone"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList && Boolean(results?.length)}
          aria-controls={listId}
          aria-activedescendant={showList && results?.length ? `${listId}-${active}` : undefined}
          className="pr-10 pl-10"
        />
        {loading ? <Spinner className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-subtle-foreground" /> : null}
      </div>
      {showList && results?.length ? (
        <ul id={listId} role="listbox" aria-label="Matching contacts" className="flex flex-col gap-0.5 rounded-xl bg-card p-1.5 shadow-lift ring-1 ring-ink/[0.07] dark:ring-white/[0.08]">
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(c)}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors duration-100 aria-selected:bg-accent"
            >
              <Avatar name={c.name} size="sm" />
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm font-medium">{c.name}</span>
                <span className="truncate text-xs text-muted-foreground">{c.email || c.phone || "No email or phone"}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : showList && !loading ? (
        <p role="status" className="rounded-xl border border-dashed border-border-strong bg-muted/30 px-3.5 py-3 text-[13px] leading-relaxed text-muted-foreground">
          Nobody matches &ldquo;{q.trim()}&rdquo; yet.{" "}
          <Link href={`/app/w/${wid}/leads`} target="_blank" rel="noopener">
            Add them in Leads
          </Link>
          , then pick them here. Or skip it: a name is enough.
        </p>
      ) : (
        <FieldDescription>Optional. Link someone from your Leads to open their history from here.</FieldDescription>
      )}
    </Field>
  );
}
