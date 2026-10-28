"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AutomationAction, AutomationTrigger } from "@/lib/db/types";

type ActionType = AutomationAction["type"];

const ACTION_LABELS: Record<ActionType, string> = {
  add_tag: "Add a tag",
  remove_tag: "Remove a tag",
  set_stage: "Move to a pipeline stage",
  wait: "Wait",
  send_email: "Send an email",
  enroll_sequence: "Start an email sequence",
  notify_owner: "Email me an alert",
  ai_score: "Score the lead with AI",
  ai_draft_reply: "Draft a reply with AI",
  send_message: "Send a DM / WhatsApp / SMS",
  webhook: "Send to a webhook (Zapier, Make)",
  only_if_temperature: "Continue only if the lead is…",
};

const TRIGGERS: { value: AutomationTrigger["type"]; label: string; hint: string }[] = [
  { value: "lead_created", label: "New lead from a landing page", hint: "Optional: a site ID to limit it to one funnel." },
  { value: "message_received", label: "New message (DM, WhatsApp, SMS)", hint: "Optional: facebook, instagram, whatsapp or sms." },
  { value: "tag_added", label: "Tag added", hint: "The tag to watch for." },
  { value: "temperature_changed", label: "Lead temperature changes", hint: "Optional: hot, warm or cold." },
  { value: "stage_changed", label: "Pipeline stage changes", hint: "Optional: new, engaged, trial, member or lost." },
];

function blankAction(type: ActionType): AutomationAction {
  switch (type) {
    case "add_tag":
    case "remove_tag":
      return { type, tag: "" };
    case "set_stage":
      return { type, stage: "engaged" };
    case "wait":
      return { type, minutes: 60 };
    case "send_email":
      return { type, subject: "", body: "" };
    case "enroll_sequence":
      return { type, sequenceId: "" };
    case "notify_owner":
      return { type, message: "" };
    case "send_message":
      return { type, body: "" };
    case "webhook":
      return { type, url: "" };
    case "only_if_temperature":
      return { type, temperature: "hot" };
    default:
      return { type } as AutomationAction;
  }
}

export function AutomationBuilder({
  workspaceId,
  id,
  initial,
  sequences,
  save,
}: {
  workspaceId: string;
  id: string | null;
  initial: { name: string; trigger: AutomationTrigger; actions: AutomationAction[]; active: boolean };
  sequences: { id: string; name: string }[];
  save: (id: string | null, input: { name: string; trigger: unknown; actions: unknown; active: boolean }) => Promise<{ ok: boolean; id?: string; error?: string }>;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [trigger, setTrigger] = useState<AutomationTrigger>(initial.trigger);
  const [actions, setActions] = useState<AutomationAction[]>(initial.actions);
  const [active, setActive] = useState(initial.active);
  const [addType, setAddType] = useState<ActionType>("add_tag");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const setAction = (i: number, patch: Partial<AutomationAction>) => setActions((prev) => prev.map((a, j) => (j === i ? ({ ...a, ...patch } as AutomationAction) : a)));
  const move = (i: number, dir: -1 | 1) =>
    setActions((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const onSave = () =>
    start(async () => {
      const res = await save(id, { name, trigger, actions, active });
      if (res.ok) {
        setMsg({ ok: true, text: "Saved." });
        if (!id && res.id) router.replace(`/app/w/${workspaceId}/automations/${res.id}`);
        else router.refresh();
      } else setMsg({ ok: false, text: res.error ?? "Couldn't save." });
    });

  const hint = TRIGGERS.find((t) => t.value === trigger.type)?.hint;

  return (
    <div className="stack">
      <div className="card form-grid">
        <div className="field"><label htmlFor="aname">Name</label><input id="aname" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <label className="check" style={{ alignSelf: "flex-end" }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Automation is on</label>
      </div>
      <div className="card stack">
        <span className="eyebrow">When this happens</span>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="ttype">Trigger</label>
            <select id="ttype" value={trigger.type} onChange={(e) => setTrigger({ type: e.target.value as AutomationTrigger["type"], value: "" })}>
              {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="tvalue">Filter</label><input id="tvalue" value={trigger.value} onChange={(e) => setTrigger({ ...trigger, value: e.target.value })} /><span className="help">{hint}</span></div>
        </div>
      </div>
      {actions.map((a, i) => (
        <div key={i} className="card stack">
          <div className="row-between">
            <span className="eyebrow">Then · step {i + 1}: {ACTION_LABELS[a.type]}</span>
            <span className="row" style={{ gap: 4 }}>
              <button type="button" className="btn btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button type="button" className="btn btn-sm" onClick={() => move(i, 1)} disabled={i === actions.length - 1} aria-label="Move down">↓</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => setActions((p) => p.filter((_, j) => j !== i))} aria-label="Remove step">✕</button>
            </span>
          </div>
          <ActionFields a={a} sequences={sequences} onChange={(patch) => setAction(i, patch)} />
        </div>
      ))}
      <div className="card row">
        <select value={addType} onChange={(e) => setAddType(e.target.value as ActionType)} aria-label="Step type">
          {(Object.keys(ACTION_LABELS) as ActionType[]).map((t) => <option key={t} value={t}>{ACTION_LABELS[t]}</option>)}
        </select>
        <button type="button" className="btn" onClick={() => setActions((p) => [...p, blankAction(addType)])}>Add step</button>
      </div>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={pending}>{pending ? "Saving…" : "Save automation"}</button>
        {msg ? <span className="small" style={{ color: msg.ok ? "var(--good)" : "var(--bad)" }}>{msg.text}</span> : null}
      </div>
    </div>
  );
}

function ActionFields({ a, sequences, onChange }: { a: AutomationAction; sequences: { id: string; name: string }[]; onChange: (p: Partial<AutomationAction>) => void }) {
  switch (a.type) {
    case "add_tag":
    case "remove_tag":
      return <input value={a.tag} placeholder="tag name" onChange={(e) => onChange({ tag: e.target.value })} aria-label="Tag" />;
    case "set_stage":
      return (
        <select value={a.stage} onChange={(e) => onChange({ stage: e.target.value as typeof a.stage })} aria-label="Stage">
          {["new", "engaged", "trial", "member", "lost"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      );
    case "wait":
      return (
        <label className="row small">Wait <input type="number" min={1} value={a.minutes} onChange={(e) => onChange({ minutes: Math.max(1, Number(e.target.value) || 1) })} style={{ width: 110 }} /> minutes ({(a.minutes / 60).toFixed(1)} hours)</label>
      );
    case "send_email":
      return (
        <>
          <input value={a.subject} placeholder="Subject" onChange={(e) => onChange({ subject: e.target.value })} aria-label="Subject" />
          <textarea value={a.body} placeholder="Message. You can use {{first_name}} and {{skool_url}}." onChange={(e) => onChange({ body: e.target.value })} aria-label="Message" />
        </>
      );
    case "enroll_sequence":
      return (
        <select value={a.sequenceId} onChange={(e) => onChange({ sequenceId: e.target.value })} aria-label="Sequence">
          <option value="">Pick a sequence…</option>
          {sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      );
    case "notify_owner":
      return <input value={a.message} placeholder="What should the alert say?" onChange={(e) => onChange({ message: e.target.value })} aria-label="Alert message" />;
    case "send_message":
      return <textarea value={a.body} placeholder="Hey {{first_name}}! Thanks for reaching out…" onChange={(e) => onChange({ body: e.target.value })} aria-label="Message" />;
    case "webhook":
      return <input value={a.url} placeholder="https://hooks.zapier.com/…" onChange={(e) => onChange({ url: e.target.value })} aria-label="Webhook URL" />;
    case "only_if_temperature":
      return (
        <select value={a.temperature} onChange={(e) => onChange({ temperature: e.target.value as typeof a.temperature })} aria-label="Temperature">
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </select>
      );
    default:
      return <p className="small muted">No settings needed.</p>;
  }
}
