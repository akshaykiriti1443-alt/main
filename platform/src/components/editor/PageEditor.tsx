"use client";

import { useId, useState, useTransition } from "react";
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, EyeIcon, PlusIcon, Trash2Icon } from "lucide-react";
import type { Section, SectionType, SiteTheme } from "@/lib/db/types";
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
};

export function PageEditor({ initialTitle, initialSections, theme, vars, businessName, save }: Props) {
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
            <details key={s.id} className="group rounded-xl bg-card ring-1 ring-foreground/10" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2.5 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
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
              <div className="flex flex-col gap-3 border-t px-3 pt-3 pb-3.5">
                <SectionFields s={s} onChange={(patch) => update(i, patch)} />
              </div>
            </details>
          ))}
          <div className="flex items-center gap-2 rounded-xl border border-dashed p-2.5">
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
        <div className="flex min-w-0 flex-col gap-2 @4xl/main:sticky @4xl/main:top-4">
          <div className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
            <EyeIcon className="size-3.5" aria-hidden />
            Live preview
          </div>
          {/* Funnels carry their own theme, so the preview always sits on white. */}
          <div className="editor-preview overflow-hidden overflow-y-auto rounded-xl border bg-white shadow-sm @4xl/main:max-h-[calc(100vh-170px)]" aria-label="Live preview">
            <LandingSections sections={sections} theme={theme} vars={vars} businessName={businessName} form={{ action: "#", pageId: "preview", eventId: "preview", preview: true }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Text({ label, value, onChange, area, placeholder }: { label: string; value: string; onChange: (v: string) => void; area?: boolean; placeholder?: string }) {
  const id = useId();
  return (
    <Field className="gap-1.5">
      <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </FieldLabel>
      {area ? (
        <Textarea id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input id={id} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
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

function Items<T extends Record<string, string>>({ items, keys, labels, onChange, add }: { items: T[]; keys: (keyof T)[]; labels: string[]; onChange: (items: T[]) => void; add: T }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <div key={i} className="flex flex-col gap-2.5 rounded-lg border bg-muted/40 p-2.5">
          {keys.map((k, ki) => (
            <Text
              key={String(k)}
              label={labels[ki]}
              value={it[k]}
              area={ki === keys.length - 1}
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
          <Text label="Small label above the headline" value={s.eyebrow} onChange={(v) => onChange({ eyebrow: v })} />
          <Text label="Headline" value={s.headline} onChange={(v) => onChange({ headline: v })} area />
          <Text label="Subheadline" value={s.subheadline} onChange={(v) => onChange({ subheadline: v })} area />
          <Text label="Bullets (one per line)" value={s.bullets.join("\n")} onChange={(v) => onChange({ bullets: v.split("\n").slice(0, 8) })} area />
          <Toggle label="Show the signup form here" checked={s.showForm} onChange={(v) => onChange({ showForm: v })} />
          <Text label="Form title" value={s.formTitle} onChange={(v) => onChange({ formTitle: v })} />
          <Text label="Button text" value={s.ctaText} onChange={(v) => onChange({ ctaText: v })} />
          <Text label="Image link (optional)" value={s.imageUrl} placeholder="https://…" onChange={(v) => onChange({ imageUrl: v })} />
        </>
      );
    case "benefits":
    case "steps":
      return (
        <>
          <Text label="Title" value={s.title} onChange={(v) => onChange({ title: v })} />
          <Items items={s.items} keys={["title", "body"]} labels={["Item title", "Text"]} add={{ title: "", body: "" }} onChange={(items) => onChange({ items })} />
        </>
      );
    case "text":
      return (
        <>
          <Text label="Title" value={s.title} onChange={(v) => onChange({ title: v })} />
          <Text label="Text (blank line = new paragraph, - for lists, **bold**, [link](https://…))" value={s.body} onChange={(v) => onChange({ body: v })} area />
        </>
      );
    case "faq":
      return (
        <>
          <Text label="Title" value={s.title} onChange={(v) => onChange({ title: v })} />
          <Items items={s.items} keys={["q", "a"]} labels={["Question", "Answer"]} add={{ q: "", a: "" }} onChange={(items) => onChange({ items })} />
        </>
      );
    case "cta":
      return (
        <>
          <Text label="Headline" value={s.headline} onChange={(v) => onChange({ headline: v })} />
          <Text label="Text" value={s.body} onChange={(v) => onChange({ body: v })} area />
          <Text label="Button text" value={s.buttonText} onChange={(v) => onChange({ buttonText: v })} />
          <Text label="Button link" value={s.buttonUrl} placeholder="{{skool_url}}" onChange={(v) => onChange({ buttonUrl: v })} />
        </>
      );
    case "form":
      return (
        <>
          <Text label="Title" value={s.title} onChange={(v) => onChange({ title: v })} />
          <Text label="Text" value={s.body} onChange={(v) => onChange({ body: v })} />
          <Text label="Button text" value={s.buttonText} onChange={(v) => onChange({ buttonText: v })} />
          <Toggle label="Ask for a phone number" checked={s.collectPhone} onChange={(v) => onChange({ collectPhone: v })} />
        </>
      );
    case "video":
      return (
        <>
          <Text label="Title" value={s.title} onChange={(v) => onChange({ title: v })} />
          <Text label="YouTube, Vimeo or Loom link" value={s.url} placeholder="https://www.youtube.com/watch?v=…" onChange={(v) => onChange({ url: v })} />
        </>
      );
  }
}
