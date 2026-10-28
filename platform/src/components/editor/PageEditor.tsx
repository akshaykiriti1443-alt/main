"use client";

import { useState, useTransition } from "react";
import type { Section, SectionType, SiteTheme } from "@/lib/db/types";
import { LandingSections } from "@/components/landing/LandingSections";

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
    <div className="stack">
      <div className="card row-between">
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label htmlFor="page-title">Page title</label>
          <input id="page-title" value={title} onChange={(e) => (setTitle(e.target.value), setStatus({ kind: "dirty" }))} />
        </div>
        <div className="row" style={{ alignSelf: "flex-end" }}>
          {status.kind === "dirty" ? <span className="small muted">Unsaved changes</span> : null}
          {status.kind === "saved" ? <span className="small" style={{ color: "var(--good)" }}>{status.text}</span> : null}
          {status.kind === "error" ? <span className="small" style={{ color: "var(--bad)" }}>{status.text}</span> : null}
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <div className="editor">
        <div className="editor-panel">
          {sections.map((s, i) => (
            <details key={s.id} className="section-card" open={i === 0}>
              <summary>
                <span>
                  {TYPE_LABEL[s.type]} <span className="small muted">· {summary(s).slice(0, 40)}</span>
                </span>
                <span className="row" style={{ gap: 4 }} onClick={(e) => e.preventDefault()}>
                  <button type="button" className="btn btn-sm" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                    ↑
                  </button>
                  <button type="button" className="btn btn-sm" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === sections.length - 1}>
                    ↓
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" aria-label="Delete section" onClick={() => remove(i)}>
                    ✕
                  </button>
                </span>
              </summary>
              <div className="section-body">
                <SectionFields s={s} onChange={(patch) => update(i, patch)} />
              </div>
            </details>
          ))}
          <div className="card row">
            <select value={addType} onChange={(e) => setAddType(e.target.value as SectionType)} aria-label="Section type">
              {(Object.keys(TYPE_LABEL) as SectionType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSections((prev) => [...prev, blank(addType)]);
                setStatus({ kind: "dirty" });
              }}
            >
              Add section
            </button>
          </div>
          <p className="tiny muted">
            Tip: type {"{{skool_url}}"} in any button link to use your Skool link, and {"{{lead_magnet_url}}"} for your free guide.
          </p>
        </div>
        <div className="editor-preview" aria-label="Live preview">
          <LandingSections sections={sections} theme={theme} vars={vars} businessName={businessName} form={{ action: "#", pageId: "preview", eventId: "preview", preview: true }} />
        </div>
      </div>
    </div>
  );
}

function Text({ label, value, onChange, area, placeholder }: { label: string; value: string; onChange: (v: string) => void; area?: boolean; placeholder?: string }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {area ? <textarea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /> : <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

function Items<T extends Record<string, string>>({ items, keys, labels, onChange, add }: { items: T[]; keys: (keyof T)[]; labels: string[]; onChange: (items: T[]) => void; add: T }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {items.map((it, i) => (
        <div key={i} className="item-box">
          {keys.map((k, ki) => (
            <Text
              key={String(k)}
              label={labels[ki]}
              value={it[k]}
              area={ki === keys.length - 1}
              onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)))}
            />
          ))}
          <button type="button" className="link-btn small" style={{ alignSelf: "flex-start", color: "var(--bad)" }} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => onChange([...items, { ...add }])}>
        Add item
      </button>
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
          <label className="check">
            <input type="checkbox" checked={s.showForm} onChange={(e) => onChange({ showForm: e.target.checked })} /> Show the signup form here
          </label>
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
          <label className="check">
            <input type="checkbox" checked={s.collectPhone} onChange={(e) => onChange({ collectPhone: e.target.checked })} /> Ask for a phone number
          </label>
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
