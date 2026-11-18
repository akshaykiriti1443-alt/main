"use client";

import { createContext, useContext, useId, useState, useTransition } from "react";
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, EyeIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import type { Section, SectionType, SiteTheme } from "@/lib/db/types";
import type { CopyField, PageCopyRequest, PageCopyResult } from "@/server/ai/pageCopy";
import { LandingSections } from "@/components/landing/LandingSections";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const TYPE_LABEL: Record<SectionType, string> = {
  hero: "Hero + form",
  benefits: "Benefits",
  steps: "Steps",
  text: "Text",
  faq: "FAQ",
  cta: "Button (call to action)",
  form: "Signup form",
  video: "Video",
};

function blank(type: SectionType): Section {
  const id = Math.random().toString(36).slice(2, 10);
  switch (type) {
    case "hero":
      return { id, type, eyebrow: "", headline: "Your big promise", subheadline: "", bullets: [], ctaText: "Send it to me", formTitle: "Where should I send it?", showForm: true, imageUrl: "" };
    case "benefits":
      return { id, type, title: "What you get", items: [{ title: "Benefit", body: "Describe it." }] };
    case "steps":
      return { id, type, title: "How it works", items: [{ title: "Step one", body: "Describe it." }] };
    case "text":
      return { id, type, title: "", body: "Write here." };
    case "faq":
      return { id, type, title: "Questions", items: [{ q: "Question?", a: "Answer." }] };
    case "cta":
      return { id, type, headline: "Ready to join?", body: "", buttonText: "Join the group", buttonUrl: "{{skool_url}}" };
    case "form":
      return { id, type, title: "Get it free", body: "", buttonText: "Send it to me", collectPhone: false };
    case "video":
      return { id, type, title: "", url: "" };
  }
}

function summary(s: Section): string {
  if (s.type === "hero" || s.type === "cta") return s.headline;
  if (s.type === "video" || s.type === "text" || s.type === "benefits" || s.type === "steps" || s.type === "faq" || s.type === "form") return s.title;
  return "";
}

type Props = {
  initialTitle: string;
  initialSections: Section[];
  theme: SiteTheme;
  vars: Record<string, string>;
  businessName: string;
  save: (content: { sections: Section[] }, title: string) => Promise<{ ok: boolean; error?: string }>;
  /** "Write it for me" / "Rewrite in my voice": AI (or a starter line) for one box. Fills the box; Save still saves. */
  writeCopy?: (req: PageCopyRequest) => Promise<PageCopyResult>;
};

type WriteCopy = NonNullable<Props["writeCopy"]>;
const CopyContext = createContext<WriteCopy | null>(null);
/** Which box this is, so the AI knows a headline from a button. */
type AiBox = { field: CopyField; section: SectionType; nearby?: string };

export function PageEditor({ initialTitle, initialSections, theme, vars, businessName, save, writeCopy }: Props) {
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState<{ kind: "idle" | "dirty" | "saved" | "error"; text?: string }>({ kind: "idle" });
  const [pending, start] = useTransition();
  const [addType, setAddType] = useState<SectionType>("text");

  const update = (i: number, patch: Partial<Section>) => {
    setSections((prev) => prev.map((s, j) => (j === i ? ({ ...s, ...patch } as Section) : s)));
    setStatus({ kind: "dirty" });
  };
  const move = (i: number, dir: -1 | 1) => {
    setSections((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setStatus({ kind: "dirty" });
  };
  const remove = (i: number) => {
    setSections((prev) => prev.filter((_, j) => j !== i));
    setStatus({ kind: "dirty" });
  };
  const onSave = () =>
    start(async () => {
      const res = await save({ sections }, title);
      setStatus(res.ok ? { kind: "saved", text: "Saved. Publish the funnel to make it live." } : { kind: "error", text: res.error });
    });

  return (
    <CopyContext.Provider value={writeCopy ?? null}>
      <div className="flex flex-col gap-4">
        <Card size="sm">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field className="flex-1">
              <FieldLabel htmlFor="page-title">Page title</FieldLabel>
              <Input id="page-title" value={title} onChange={(e) => (setTitle(e.target.value), setStatus({ kind: "dirty" }))} />
            </Field>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {status.kind === "dirty" ? (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-warning" aria-hidden />
                  Unsaved changes
                </span>
              ) : null}
              {status.kind === "saved" ? <span className="text-sm text-success">{status.text}</span> : null}
              {status.kind === "error" ? <span className="text-sm text-destructive">{status.text}</span> : null}
              <Button type="button" onClick={onSave} disabled={pending}>
                {pending ? <Spinner data-icon="inline-start" /> : null}
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 items-start gap-4 @4xl/main:grid-cols-[400px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-2.5 @4xl/main:max-h-[calc(100vh-140px)] @4xl/main:overflow-y-auto @4xl/main:pr-1">
            {sections.map((s, i) => (
              <details key={s.id} className="group rounded-xl bg-card shadow-xs ring-1 ring-ink/[0.07] transition-shadow duration-200 open:shadow-card dark:ring-white/[0.08]" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent/50 [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-2">
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
                    <span className="min-w-0 truncate text-sm">
                      <span className="font-medium">{TYPE_LABEL[s.type]}</span>
                      {summary(s) ? <span className="text-muted-foreground"> · {summary(s).slice(0, 40)}</span> : null}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.preventDefault()}>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                      <ArrowUpIcon />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === sections.length - 1}>
                      <ArrowDownIcon />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label="Delete section" onClick={() => remove(i)}>
                      <Trash2Icon />
                    </Button>
                  </span>
                </summary>
                <div className="flex flex-col gap-3.5 border-t border-border/80 px-3.5 pt-3.5 pb-4">
                  <SectionFields s={s} onChange={(patch) => update(i, patch)} />
                </div>
              </details>
            ))}
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-border-strong bg-card/40 p-2.5">
              <NativeSelect value={addType} onChange={(e) => setAddType(e.target.value as SectionType)} aria-label="Section type" className="min-w-0 flex-1">
                {(Object.keys(TYPE_LABEL) as SectionType[]).map((t) => (
                  <NativeSelectOption key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSections((prev) => [...prev, blank(addType)]);
                  setStatus({ kind: "dirty" });
                }}
              >
                <PlusIcon data-icon="inline-start" />
                Add section
              </Button>
            </div>
            <p className="px-1 text-xs text-muted-foreground">
              Tip: type <code className="rounded bg-muted px-1 py-0.5 font-mono">{"{{skool_url}}"}</code> in any button link to use your Skool link, and{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">{"{{lead_magnet_url}}"}</code> for your free guide.
            </p>
          </div>
          <div className="flex min-w-0 flex-col @4xl/main:sticky @4xl/main:top-4">
            {/* A quiet browser bar, so the preview reads as "your page, on the web". */}
            <div className="flex h-10 items-center gap-1.5 rounded-t-2xl border border-b-0 border-border bg-card px-3.5">
              <span className="size-2.5 rounded-full bg-border-strong" aria-hidden />
              <span className="size-2.5 rounded-full bg-border-strong" aria-hidden />
              <span className="size-2.5 rounded-full bg-border-strong" aria-hidden />
              <span className="mx-auto flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[11.5px] font-medium text-muted-foreground">
                <EyeIcon className="size-3.5" aria-hidden />
                Live preview
              </span>
              <span className="w-[42px]" aria-hidden />
            </div>
            {/* Funnels carry their own theme, so the preview always sits on white. */}
            <div className="editor-preview max-h-[78vh] rounded-t-none rounded-b-2xl border-border @4xl/main:max-h-[calc(100vh-180px)]" aria-label="Live preview">
              <LandingSections sections={sections} theme={theme} vars={vars} businessName={businessName} form={{ action: "#", pageId: "preview", eventId: "preview", preview: true }} />
            </div>
          </div>
        </div>
      </div>
    </CopyContext.Provider>
  );
}

function Text({ label, value, onChange, area, placeholder, ai }: { label: string; value: string; onChange: (v: string) => void; area?: boolean; placeholder?: string; ai?: AiBox }) {
  const id = useId();
  const writeCopy = useContext(CopyContext);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const empty = !value.trim();
  const write = () =>
    start(async () => {
      if (!writeCopy || !ai) return;
      setNote(null);
      try {
        const res = await writeCopy({ field: ai.field, section: ai.section, current: value, nearby: ai.nearby ?? "" });
        if (!res.ok) return setNote({ tone: "error", text: res.error });
        if (res.text !== value) onChange(res.text);
        setNote(res.note ? { tone: "info", text: res.note } : { tone: "info", text: "Done. Change any word you like, then press Save." });
      } catch {
        setNote({ tone: "error", text: "That didn't work. Check your connection and try again. Your words are unchanged." });
      }
    });
  return (
    <Field className="gap-1.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </FieldLabel>
        {writeCopy && ai ? (
          <Button type="button" variant="ghost" size="xs" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={write} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
            {pending ? "Writing…" : empty ? "Write it for me" : "Rewrite in my voice"}
          </Button>
        ) : null}
      </div>
      {area ? (
        <Textarea id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input id={id} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {note ? (
        <p role="status" className={note.tone === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {note.text}
        </p>
      ) : null}
    </Field>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}

function Items<T extends Record<string, string>>({
  items,
  keys,
  labels,
  onChange,
  add,
  ai,
}: {
  items: T[];
  keys: (keyof T)[];
  labels: string[];
  onChange: (items: T[]) => void;
  add: T;
  /** The AI field for each key, and the section they sit in. */
  ai?: { fields: CopyField[]; section: SectionType; nearby?: string };
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <div key={i} className="flex flex-col gap-2.5 rounded-xl bg-background/70 p-3 ring-1 ring-ink/[0.06] ring-inset dark:bg-white/[0.02] dark:ring-white/[0.07]">
          {keys.map((k, ki) => (
            <Text
              key={String(k)}
              label={labels[ki]}
              value={it[k]}
              area={ki === keys.length - 1}
              // The item's other box (its title, or its question) tells the AI what this one is about.
              ai={ai?.fields[ki] ? { field: ai.fields[ki], section: ai.section, nearby: [ai.nearby, ...keys.filter((o) => o !== k).map((o) => it[o])].filter(Boolean).join(" · ") } : undefined}
              onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)))}
            />
          ))}
          <Button type="button" variant="ghost" size="xs" className="self-start text-destructive hover:text-destructive" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...items, { ...add }])}>
        <PlusIcon data-icon="inline-start" />
        Add item
      </Button>
    </div>
  );
}

function SectionFields({ s, onChange }: { s: Section; onChange: (patch: Partial<Section>) => void }) {
  switch (s.type) {
    case "hero":
      return (
        <>
          <Text label="Small label above the headline" value={s.eyebrow} onChange={(v) => onChange({ eyebrow: v })} ai={{ field: "eyebrow", section: "hero", nearby: s.headline }} />
          <Text label="Headline" value={s.headline} onChange={(v) => onChange({ headline: v })} area ai={{ field: "headline", section: "hero" }} />
          <Text label="Subheadline" value={s.subheadline} onChange={(v) => onChange({ subheadline: v })} area ai={{ field: "subheadline", section: "hero", nearby: s.headline }} />
          <Text
            label="Bullets (one per line)"
            value={s.bullets.join("\n")}
            onChange={(v) => onChange({ bullets: v.split("\n").slice(0, 8) })}
            area
            ai={{ field: "bullets", section: "hero", nearby: s.headline }}
          />
          <Toggle label="Show the signup form here" checked={s.showForm} onChange={(v) => onChange({ showForm: v })} />
          <Text label="Form title" value={s.formTitle} onChange={(v) => onChange({ formTitle: v })} ai={{ field: "formTitle", section: "hero", nearby: s.headline }} />
          <Text label="Button text" value={s.ctaText} onChange={(v) => onChange({ ctaText: v })} ai={{ field: "button", section: "hero", nearby: s.headline }} />
          <Text label="Image link (optional)" value={s.imageUrl} placeholder="https://…" onChange={(v) => onChange({ imageUrl: v })} />
        </>
      );
    case "benefits":
    case "steps":
      return (
        <>
          <Text label="Title" value={s.title} onChange={(v) => onChange({ title: v })} ai={{ field: "title", section: s.type }} />
          <Items
            items={s.items}
            keys={["title", "body"]}
            labels={["Item title", "Text"]}
            add={{ title: "", body: "" }}
            onChange={(items) => onChange({ items })}
            ai={{ fields: ["itemTitle", "itemBody"], section: s.type, nearby: s.title }}
          />
        </>
      );
    case "text":
      return (
        <>
          <Text label="Title" value={s.title} onChange={(v) => onChange({ title: v })} ai={{ field: "title", section: "text" }} />
          <Text
            label="Text (blank line = new paragraph, - for lists, **bold**, [link](https://…))"
            value={s.body}
            onChange={(v) => onChange({ body: v })}
            area
            ai={{ field: "body", section: "text", nearby: s.title }}
          />
        </>
      );
    case "faq":
      return (
        <>
          <Text label="Title" value={s.title} onChange={(v) => onChange({ title: v })} />
          <Items
            items={s.items}
            keys={["q", "a"]}
            labels={["Question", "Answer"]}
            add={{ q: "", a: "" }}
            onChange={(items) => onChange({ items })}
            ai={{ fields: ["question", "answer"], section: "faq" }}
          />
        </>
      );
    case "cta":
      return (
        <>
          <Text label="Headline" value={s.headline} onChange={(v) => onChange({ headline: v })} ai={{ field: "headline", section: "cta" }} />
          <Text label="Text" value={s.body} onChange={(v) => onChange({ body: v })} area ai={{ field: "body", section: "cta", nearby: s.headline }} />
          <Text label="Button text" value={s.buttonText} onChange={(v) => onChange({ buttonText: v })} ai={{ field: "button", section: "cta", nearby: s.headline }} />
          <Text label="Button link" value={s.buttonUrl} placeholder="{{skool_url}}" onChange={(v) => onChange({ buttonUrl: v })} />
        </>
      );
    case "form":
      return (
        <>
          <Text label="Title" value={s.title} onChange={(v) => onChange({ title: v })} ai={{ field: "title", section: "form" }} />
          <Text label="Text" value={s.body} onChange={(v) => onChange({ body: v })} ai={{ field: "body", section: "form", nearby: s.title }} />
          <Text label="Button text" value={s.buttonText} onChange={(v) => onChange({ buttonText: v })} ai={{ field: "button", section: "form", nearby: s.title }} />
          <Toggle label="Ask for a phone number" checked={s.collectPhone} onChange={(v) => onChange({ collectPhone: v })} />
        </>
      );
    case "video":
      return (
        <>
          <Text label="Title" value={s.title} onChange={(v) => onChange({ title: v })} ai={{ field: "title", section: "video" }} />
          <Text label="YouTube, Vimeo or Loom link" value={s.url} placeholder="https://www.youtube.com/watch?v=…" onChange={(v) => onChange({ url: v })} />
        </>
      );
  }
}
