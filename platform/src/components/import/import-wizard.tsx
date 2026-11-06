"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  FileSpreadsheetIcon,
  LockIcon,
  RotateCcwIcon,
  SquareKanbanIcon,
  UploadIcon,
  UsersIcon,
} from "lucide-react";
import { finishImportAction, importChunkAction } from "@/actions/crmImport";
import { parseCsv } from "@/lib/csv";
import {
  buildRecords,
  CONTACT_FIELDS,
  guessContactMapping,
  guessKind,
  guessOpportunityMapping,
  isSkipped,
  normalizeContact,
  normalizeOpportunity,
  OPPORTUNITY_FIELDS,
  type ContactField,
  type ImportKind,
  type OpportunityField,
  type Skipped,
} from "@/lib/crmImport";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Callout, IconTile, Panel } from "@/components/ui";
import { Kicker } from "@/components/crm-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";

const CHUNK = 250;
const MAX_BYTES = 25 * 1024 * 1024;
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "NZD", "INR", "SGD", "AED", "ZAR", "CHF", "SEK", "NOK", "DKK", "BRL", "MXN", "JPY"];

type Parsed = { fileName: string; headers: string[]; rows: string[][] };
type Totals = { created: number; updated: number; merged: number; skipped: Skipped[]; contactsCreated: number; pipelinesCreated: string[]; stagesCreated: string[] };
const EMPTY: Totals = { created: 0, updated: 0, merged: 0, skipped: [], contactsCreated: 0, pipelinesCreated: [], stagesCreated: [] };

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export function ImportWizard({ wid, canOpportunities, defaultCurrency }: { wid: string; canOpportunities: boolean; defaultCurrency: string }) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ImportKind>("contacts");
  const [contactMap, setContactMap] = useState<ContactField[]>([]);
  const [oppMap, setOppMap] = useState<OpportunityField[]>([]);
  const [tag, setTag] = useState("imported");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [phase, setPhase] = useState<"pick" | "map" | "running" | "done">("pick");
  const [progress, setProgress] = useState(0);
  const [totals, setTotals] = useState<Totals>(EMPTY);
  const [runError, setRunError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function readFile(file: File) {
    setError(null);
    if (!/\.(csv|txt|tsv)$/i.test(file.name) && !/csv|text/.test(file.type)) return setError("That isn't a CSV file. In GoHighLevel (or Excel, or Google Sheets) choose Export › CSV, then upload that file.");
    if (file.size > MAX_BYTES) return setError("That file is over 25 MB. Split it into smaller files and import them one by one.");
    const text = await file.text();
    const { headers, rows } = parseCsv(text);
    if (!headers.length || !rows.length) return setError("We couldn't find any rows in that file. Is the first line the column names?");
    const k = guessKind(headers);
    setParsed({ fileName: file.name, headers, rows });
    setKind(k === "opportunities" && !canOpportunities ? "contacts" : k);
    setContactMap(guessContactMapping(headers));
    setOppMap(guessOpportunityMapping(headers));
    setPhase("map");
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void readFile(f);
  };

  // Everything below is computed from the same functions the server runs, so the preview is honest.
  const check = useMemo(() => {
    if (!parsed) return null;
    if (kind === "contacts") {
      const records = buildRecords(parsed.headers, parsed.rows, contactMap);
      const clean = records.map((r) => normalizeContact(r, { tag }));
      const ok = clean.filter((c) => !isSkipped(c));
      return { records, clean, ok: ok.length, skipped: clean.filter(isSkipped) as Skipped[], hasKey: contactMap.includes("email") || contactMap.includes("phone") };
    }
    const records = buildRecords(parsed.headers, parsed.rows, oppMap);
    const clean = records.map((r) => normalizeOpportunity(r, { tag }));
    const ok = clean.filter((c) => !isSkipped(c));
    return { records, clean, ok: ok.length, skipped: clean.filter(isSkipped) as Skipped[], hasKey: oppMap.includes("title") || oppMap.includes("contact_name") || oppMap.includes("email") };
  }, [parsed, kind, contactMap, oppMap, tag]);

  async function run() {
    if (!parsed || !check) return;
    setPhase("running");
    setRunError(null);
    setProgress(0);
    const sum: Totals = { ...EMPTY, skipped: [], pipelinesCreated: [], stagesCreated: [] };
    const records = check.records;
    for (let i = 0; i < records.length; i += CHUNK) {
      const res = await importChunkAction(wid, kind, records.slice(i, i + CHUNK), { tag: tag.trim() || undefined, fileName: parsed.fileName, currency });
      if (!res.ok) {
        setRunError(`${res.error} ${i ? `The first ${plural(i, "row")} are already in.` : ""}`.trim());
        setTotals(sum);
        setPhase("done");
        return;
      }
      const s = res.summary as Partial<Totals> & { created: number; updated: number; merged: number; skipped: Skipped[] };
      sum.created += s.created;
      sum.updated += s.updated;
      sum.merged += s.merged;
      sum.skipped.push(...s.skipped);
      sum.contactsCreated += s.contactsCreated ?? 0;
      for (const p of s.pipelinesCreated ?? []) if (!sum.pipelinesCreated.includes(p)) sum.pipelinesCreated.push(p);
      for (const st of s.stagesCreated ?? []) if (!sum.stagesCreated.includes(st)) sum.stagesCreated.push(st);
      setProgress(Math.round(((i + CHUNK) / records.length) * 100));
      setTotals({ ...sum });
    }
    await finishImportAction(wid, { kind, file: parsed.fileName.slice(0, 200), created: sum.created, updated: sum.updated, skipped: sum.skipped.length }).catch(() => undefined);
    setProgress(100);
    setTotals(sum);
    setPhase("done");
  }

  const reset = () => {
    setParsed(null);
    setPhase("pick");
    setTotals(EMPTY);
    setRunError(null);
    if (input.current) input.current.value = "";
  };

  // ---------------------------------------------------------------- pick a file
  if (phase === "pick" || !parsed || !check) {
    return (
      <Panel step={1} title="Upload your CSV" sub="A contacts export or an opportunities export from GoHighLevel, or any spreadsheet saved as CSV.">
        <label
          htmlFor="import-file"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-4 rounded-2xl border border-dashed border-border-strong bg-[radial-gradient(80%_100%_at_50%_0%,var(--accent),transparent_70%)] px-6 py-12 text-center transition-[border-color,background-color] duration-200 ease-swift hover:border-primary/50 dark:bg-[radial-gradient(80%_100%_at_50%_0%,rgb(118_85_245/0.08),transparent_70%)]",
            dragging && "border-primary bg-accent",
          )}
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-card text-primary shadow-lift ring-1 ring-ink/[0.06] dark:text-violet-300 dark:ring-white/[0.08]">
            <FileSpreadsheetIcon className="size-7" strokeWidth={1.6} aria-hidden />
          </span>
          <span className="grid max-w-sm gap-1">
            <span className="font-heading text-[17px] font-semibold tracking-[-0.012em]">Drop your CSV here</span>
            <span className="text-sm text-muted-foreground">or click to choose it. It stays on your computer until you press Import.</span>
          </span>
          <span className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-press">
            <UploadIcon className="size-4" aria-hidden />
            Choose file
          </span>
          <input
            ref={input}
            id="import-file"
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void readFile(f);
            }}
          />
        </label>
        {error ? <Callout tone="error">{error}</Callout> : null}
      </Panel>
    );
  }

  const fields = kind === "contacts" ? CONTACT_FIELDS : OPPORTUNITY_FIELDS;
  const mapping: string[] = kind === "contacts" ? contactMap : oppMap;
  const setField = (i: number, value: string) =>
    kind === "contacts" ? setContactMap((m) => m.map((f, j) => (j === i ? (value as ContactField) : f))) : setOppMap((m) => m.map((f, j) => (j === i ? (value as OpportunityField) : f)));
  const preview = check.clean.slice(0, 6);
  const noun = kind === "contacts" ? "contact" : "opportunity";
  const nouns = kind === "contacts" ? "contacts" : "opportunities";

  // ---------------------------------------------------------------- running / done
  if (phase === "running" || phase === "done") {
    const running = phase === "running";
    return (
      <Panel
        icon={running ? UploadIcon : runError ? CircleAlertIcon : CircleCheckIcon}
        tone={running ? "primary" : runError ? "warning" : "success"}
        title={running ? `Importing ${parsed.fileName}…` : runError ? "The import stopped part-way" : `${parsed.fileName} is in`}
        sub={running ? "Keep this tab open. Big files take a minute." : runError ? runError : "Nobody was emailed and no automations ran."}
      >
        <Progress value={progress} className="h-2" aria-label="Import progress" />
        <dl className="grid grid-cols-2 gap-3 @2xl/main:grid-cols-4">
          <SummaryStat label={kind === "contacts" ? "New contacts" : "New opportunities"} value={totals.created} tone="success" />
          <SummaryStat label="Updated" value={totals.updated} hint={kind === "contacts" ? "already in your leads" : "already on a board"} />
          <SummaryStat label="Merged" value={totals.merged} hint="duplicate rows in the file" />
          <SummaryStat label="Skipped" value={totals.skipped.length} tone={totals.skipped.length ? "warning" : undefined} />
        </dl>
        {kind === "opportunities" && !running ? (
          <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            {totals.contactsCreated ? <span>{plural(totals.contactsCreated, "new contact")} added for opportunities with no match in your leads.</span> : null}
            {totals.pipelinesCreated.length ? <span>New pipelines: {totals.pipelinesCreated.join(", ")}.</span> : null}
            {totals.stagesCreated.length ? (
              <span>
                New stages: {totals.stagesCreated.join(", ")}. They were added in the order they appear in the file; put them in your order in Pipeline › Edit stages.
              </span>
            ) : null}
          </div>
        ) : null}
        {totals.skipped.length && !running ? (
          <details className="rounded-xl bg-muted/50 px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium">See the skipped rows</summary>
            <ul className="mt-2 flex max-h-56 flex-col gap-1 overflow-auto text-muted-foreground">
              {totals.skipped.slice(0, 200).map((s) => (
                <li key={s.row}>
                  Row {s.row}: {s.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {!running ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={kind === "contacts" ? `/app/w/${wid}/leads` : `/app/w/${wid}/pipeline`}>
                {kind === "contacts" ? <UsersIcon data-icon="inline-start" /> : <SquareKanbanIcon data-icon="inline-start" />}
                {kind === "contacts" ? "Open your leads" : "Open your pipeline"}
              </Link>
            </Button>
            <Button variant="outline" onClick={reset}>
              <RotateCcwIcon data-icon="inline-start" />
              Import another file
            </Button>
          </div>
        ) : null}
      </Panel>
    );
  }

  // ---------------------------------------------------------------- map columns
  return (
    <>
      <Panel
        step={2}
        title="Check the columns"
        sub="We matched each column to a field. Change any that look wrong. Columns we don't know go into the contact's notes, so nothing is lost."
        action={
          <Button variant="ghost" size="sm" onClick={reset}>
            <ArrowLeftIcon data-icon="inline-start" />
            Other file
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="inline-flex min-w-0 items-center gap-2 text-sm">
            <FileSpreadsheetIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate font-medium">{parsed.fileName}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              · {plural(parsed.rows.length, "row")} · {plural(parsed.headers.length, "column")}
            </span>
          </span>
          <div role="radiogroup" aria-label="What's in this file" className="inline-flex items-center gap-0.5 rounded-full bg-muted p-1 ring-1 ring-ink/[0.03] ring-inset dark:ring-white/[0.04]">
            {(["contacts", "opportunities"] as const).map((k) => {
              const locked = k === "opportunities" && !canOpportunities;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  disabled={locked}
                  onClick={() => setKind(k)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-150 ease-swift hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60",
                    kind === k && "bg-card text-foreground shadow-[0_1px_2px_rgb(var(--shadow-color)/0.08),0_2px_8px_-2px_rgb(var(--shadow-color)/0.08)] dark:bg-white/[0.09] dark:shadow-none",
                  )}
                >
                  {locked ? <LockIcon className="size-3.5" aria-hidden /> : k === "contacts" ? <UsersIcon className="size-3.5" aria-hidden /> : <SquareKanbanIcon className="size-3.5" aria-hidden />}
                  {k === "contacts" ? "Contacts" : "Opportunities"}
                </button>
              );
            })}
          </div>
        </div>
        {!canOpportunities && guessKind(parsed.headers) === "opportunities" ? (
          <Callout tone="info">This looks like an opportunities export. Opportunities go on the Pipeline, which is on the Growth plan, so for now we'll import the people in it as contacts.</Callout>
        ) : null}

        <div className="-mx-6 border-y border-border/80">
          <div aria-hidden className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_15rem] gap-3 px-6 py-2.5 text-[11.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase @2xl/main:grid">
            <span>Column in your file</span>
            <span>Example</span>
            <span>Goes into</span>
          </div>
          <ul className="flex flex-col divide-y divide-border/80 @2xl/main:border-t @2xl/main:border-border/80">
            {parsed.headers.map((h, i) => {
              const sample = parsed.rows.map((r) => r[i]).find((v) => v) ?? "";
              const value = mapping[i] ?? "notes";
              return (
                <li
                  key={`${h}-${i}`}
                  className={cn("grid gap-2 px-6 py-3 text-sm @2xl/main:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_15rem] @2xl/main:items-center @2xl/main:gap-3 @2xl/main:py-2", value === "skip" && "[&>*:not(:last-child)]:opacity-60")}
                >
                  <span className="min-w-0 truncate font-medium">{h}</span>
                  <span className="min-w-0 truncate text-muted-foreground" title={sample}>
                    {sample ? (
                      <>
                        <span className="text-subtle-foreground @2xl/main:hidden">e.g. </span>
                        {sample}
                      </>
                    ) : (
                      <span className="text-subtle-foreground">Empty in this file</span>
                    )}
                  </span>
                  <NativeSelect value={value} onChange={(e) => setField(i, e.target.value)} aria-label={`Field for ${h}`} className="w-full">
                    {fields.map((f) => (
                      <NativeSelectOption key={f.value} value={f.value}>
                        {f.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="grid gap-4 @2xl/main:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="import-tag">Tag everyone in this file</FieldLabel>
            <Input id="import-tag" value={tag} maxLength={60} onChange={(e) => setTag(e.target.value.toLowerCase())} placeholder="imported" />
            <FieldDescription>So you can find this batch later. Leave empty for no extra tag.</FieldDescription>
          </Field>
          {kind === "opportunities" ? (
            <Field>
              <FieldLabel htmlFor="import-currency">Currency for new pipelines</FieldLabel>
              <NativeSelect id="import-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full">
                {CURRENCIES.map((c) => (
                  <NativeSelectOption key={c} value={c}>
                    {c}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>Missing pipelines and stages are created from the file.</FieldDescription>
            </Field>
          ) : null}
        </div>
      </Panel>

      <Panel step={3} title="Preview and import" sub={`The first few ${nouns}, exactly as they'll be saved. We match people by email first, then phone, so nobody is added twice.`}>
        <ul className="-mx-6 flex flex-col divide-y divide-border/80 border-y border-border/80">
          {preview.map((c, i) => (
            <li key={i} className="flex items-start gap-3 px-6 py-3 text-sm">
              {isSkipped(c) ? (
                <>
                  <IconTile icon={CircleAlertIcon} tone="warning" className="size-8 rounded-[10px]" />
                  <span className="grid gap-0.5">
                    <span className="font-medium">Row {c.row} is skipped</span>
                    <span className="text-muted-foreground">{c.reason}</span>
                  </span>
                </>
              ) : "title" in c ? (
                <>
                  <IconTile icon={SquareKanbanIcon} tone="primary" className="size-8 rounded-[10px]" />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate font-medium">{c.title}</span>
                    <span className="truncate text-muted-foreground">
                      {[c.contactName || c.email || c.phone, `${c.pipeline || "Default pipeline"} › ${c.stage || "first stage"}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{c.valueCents ? formatCents(c.valueCents, currency) : ""}</span>
                  {c.status && c.status !== "open" ? <Badge variant="secondary">{c.status}</Badge> : null}
                </>
              ) : (
                <>
                  <IconTile icon={UsersIcon} tone="success" className="size-8 rounded-[10px]" />
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="truncate font-medium">{[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || c.phone}</span>
                    <span className="truncate text-muted-foreground">{[c.email, c.phone, c.createdAt ? `added ${c.createdAt.slice(0, 10)}` : ""].filter(Boolean).join(" · ")}</span>
                    {c.tags.length || c.unsubscribed ? (
                      <span className="flex flex-wrap gap-1">
                        {c.unsubscribed ? (
                          <Badge variant="secondary" className="bg-warning-soft text-warning">
                            do not email
                          </Badge>
                        ) : null}
                        {c.tags.slice(0, 6).map((t) => (
                          <Badge key={t} variant="outline">
                            {t}
                          </Badge>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  {c.noteLines.length ? <span className="hidden shrink-0 text-xs text-subtle-foreground @xl/main:inline">+{plural(c.noteLines.length, "note")}</span> : null}
                </>
              )}
            </li>
          ))}
        </ul>

        {!check.hasKey ? (
          <Callout tone="warn" title={kind === "contacts" ? "Pick the email or phone column" : "Pick the deal name or contact column"}>
            {kind === "contacts" ? "Every contact needs an email or a phone number. Set one of the columns above to Email or Phone." : "Each opportunity needs a name, a contact name or an email."}
          </Callout>
        ) : null}

        <div className="flex flex-col gap-3 @2xl/main:flex-row @2xl/main:items-center @2xl/main:justify-between">
          <div className="grid gap-0.5 text-sm">
            <Kicker>Ready</Kicker>
            <span>
              <b className="font-semibold tabular-nums">{plural(check.ok, noun, nouns)}</b>
              {check.skipped.length ? <span className="text-muted-foreground"> · {plural(check.skipped.length, "row")} will be skipped</span> : null}
            </span>
            <span className="text-xs text-muted-foreground">Importing never sends emails or starts automations.</span>
          </div>
          <Button variant="cta" size="lg" disabled={!check.hasKey || check.ok === 0} onClick={run}>
            Import {plural(check.ok, noun, nouns)}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </Panel>
    </>
  );
}

function SummaryStat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "success" | "warning" }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-muted/40 px-4 py-3 ring-1 ring-ink/[0.04] ring-inset dark:bg-white/[0.03] dark:ring-white/[0.05]">
      <dt className="text-[13px] font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("font-display text-[32px] leading-none tabular-nums", tone === "success" && value > 0 && "text-success", tone === "warning" && value > 0 && "text-warning")}>{value.toLocaleString("en-US")}</dd>
      {hint ? <span className="text-xs text-subtle-foreground">{hint}</span> : null}
    </div>
  );
}
