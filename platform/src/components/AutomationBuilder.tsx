"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, CircleAlertIcon, CircleCheckIcon, PlusIcon, Trash2Icon, ZapIcon, type LucideIcon } from "lucide-react";
import type { AutomationAction, AutomationTrigger } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

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
  ask_my_ai: "Ask my AI (your Claude, ChatGPT or Gemini)",
  skool_invite: "Invite to my Skool group",
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
    case "ask_my_ai":
      return { type, instruction: "" };
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
        // Drop any ?draft= from the address, so the saved automation shows instead of the AI's draft.
        if (res.id && (!id || window.location.search)) router.replace(`/app/w/${workspaceId}/automations/${res.id}`);
        else router.refresh();
      } else setMsg({ ok: false, text: res.error ?? "Couldn't save." });
    });

  const hint = TRIGGERS.find((t) => t.value === trigger.type)?.hint;

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field>
            <FieldLabel htmlFor="aname">Name</FieldLabel>
            <Input id="aname" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Label htmlFor="aactive" className="h-8 font-normal">
            <Switch id="aactive" checked={active} onCheckedChange={setActive} />
            Automation is on
          </Label>
        </div>
      </Panel>

      <div className="flex flex-col">
      <Panel title={<StepTitle icon={ZapIcon} label="When this happens" />} className="ring-1 ring-gold/40">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ttype">Trigger</FieldLabel>
            <NativeSelect id="ttype" className="w-full" value={trigger.type} onChange={(e) => setTrigger({ type: e.target.value as AutomationTrigger["type"], value: "" })}>
              {TRIGGERS.map((t) => (
                <NativeSelectOption key={t.value} value={t.value}>
                  {t.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="tvalue">Filter</FieldLabel>
            <Input id="tvalue" value={trigger.value} onChange={(e) => setTrigger({ ...trigger, value: e.target.value })} />
            <FieldDescription>{hint}</FieldDescription>
          </Field>
        </div>
      </Panel>

      {actions.map((a, i) => (
        <div key={i} className="flex flex-col">
        <Connector />
        <Panel
          title={<StepTitle step={i + 1} label={`Then: ${ACTION_LABELS[a.type]}`} />}
          action={
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                <ArrowUpIcon />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === actions.length - 1} aria-label="Move down">
                <ArrowDownIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setActions((p) => p.filter((_, j) => j !== i))}
                aria-label="Remove step"
              >
                <Trash2Icon />
              </Button>
            </div>
          }
        >
          <ActionFields a={a} sequences={sequences} onChange={(patch) => setAction(i, patch)} />
        </Panel>
        </div>
      ))}
      <Connector />

      <div className="flex flex-col gap-2 rounded-2xl border-2 border-dashed border-foreground/15 bg-muted/30 p-3.5 sm:flex-row sm:items-center">
        <span className="text-sm font-semibold sm:mr-1">{actions.length ? "Then…" : "First step:"}</span>
        <NativeSelect className="w-full sm:w-72" value={addType} onChange={(e) => setAddType(e.target.value as ActionType)} aria-label="Step type">
          {(Object.keys(ACTION_LABELS) as ActionType[]).map((t) => (
            <NativeSelectOption key={t} value={t}>
              {ACTION_LABELS[t]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="button" variant="outline" onClick={() => setActions((p) => [...p, blankAction(addType)])}>
          <PlusIcon data-icon="inline-start" />
          Add step
        </Button>
      </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" onClick={onSave} disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {pending ? "Saving…" : "Save automation"}
        </Button>
        {msg ? (
          <span role="status" className={cn("flex items-center gap-1.5 text-sm", msg.ok ? "text-success" : "text-destructive")}>
            {msg.ok ? <CircleCheckIcon className="size-4" /> : <CircleAlertIcon className="size-4" />}
            {msg.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StepTitle({ label, step, icon: Icon }: { label: string; step?: number; icon?: LucideIcon }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full font-heading text-[13px] font-bold tabular-nums",
          Icon ? "bg-gold-soft text-gold-foreground ring-1 ring-gold/50" : "bg-primary text-primary-foreground",
        )}
      >
        {Icon ? <Icon className="size-3.5" /> : step}
      </span>
      {label}
    </span>
  );
}

/** The little line between steps, so the flow reads top to bottom. */
function Connector() {
  return <div aria-hidden className="ml-[33px] h-4 w-0.5 rounded-full bg-foreground/15" />;
}

function ActionFields({ a, sequences, onChange }: { a: AutomationAction; sequences: { id: string; name: string }[]; onChange: (p: Partial<AutomationAction>) => void }) {
  switch (a.type) {
    case "add_tag":
    case "remove_tag":
      return <Input value={a.tag} placeholder="tag name" onChange={(e) => onChange({ tag: e.target.value })} aria-label="Tag" />;
    case "set_stage":
      return (
        <NativeSelect className="w-full sm:w-64" value={a.stage} onChange={(e) => onChange({ stage: e.target.value as typeof a.stage })} aria-label="Stage">
          {["new", "engaged", "trial", "member", "lost"].map((s) => (
            <NativeSelectOption key={s} value={s}>
              {s}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      );
    case "wait":
      return (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Wait
          <Input type="number" min={1} value={a.minutes} onChange={(e) => onChange({ minutes: Math.max(1, Number(e.target.value) || 1) })} className="w-28" />
          <span className="text-muted-foreground">minutes ({(a.minutes / 60).toFixed(1)} hours)</span>
        </label>
      );
    case "send_email":
      return (
        <>
          <Input value={a.subject} placeholder="Subject" onChange={(e) => onChange({ subject: e.target.value })} aria-label="Subject" />
          <Textarea value={a.body} placeholder="Message. You can use {{first_name}} and {{skool_url}}." onChange={(e) => onChange({ body: e.target.value })} aria-label="Message" />
        </>
      );
    case "enroll_sequence":
      return (
        <NativeSelect className="w-full sm:w-72" value={a.sequenceId} onChange={(e) => onChange({ sequenceId: e.target.value })} aria-label="Sequence">
          <NativeSelectOption value="">Pick a sequence…</NativeSelectOption>
          {sequences.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {s.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      );
    case "notify_owner":
      return <Input value={a.message} placeholder="What should the alert say?" onChange={(e) => onChange({ message: e.target.value })} aria-label="Alert message" />;
    case "send_message":
      return <Textarea value={a.body} placeholder="Hey {{first_name}}! Thanks for reaching out…" onChange={(e) => onChange({ body: e.target.value })} aria-label="Message" />;
    case "webhook":
      return <Input value={a.url} placeholder="https://hooks.zapier.com/…" onChange={(e) => onChange({ url: e.target.value })} aria-label="Webhook URL" />;
    case "ask_my_ai":
      return (
        <>
          <Textarea
            value={a.instruction}
            placeholder="Write a warm 2-line welcome DM for {{first_name}} that asks what made them join."
            onChange={(e) => onChange({ instruction: e.target.value })}
            aria-label="What should your AI do?"
          />
          <p className="text-xs text-muted-foreground">
            Runs on your own AI, never your wallet: instantly with your API key, or next time you tell your connected Claude, ChatGPT or Gemini to &ldquo;do my AI tasks&rdquo;. The result lands on the contact. Set it up in Your AI.
          </p>
        </>
      );
    case "only_if_temperature":
      return (
        <NativeSelect className="w-full sm:w-64" value={a.temperature} onChange={(e) => onChange({ temperature: e.target.value as typeof a.temperature })} aria-label="Temperature">
          <NativeSelectOption value="hot">Hot</NativeSelectOption>
          <NativeSelectOption value="warm">Warm</NativeSelectOption>
          <NativeSelectOption value="cold">Cold</NativeSelectOption>
        </NativeSelect>
      );
    case "skool_invite":
      return (
        <p className="text-sm text-muted-foreground">
          Skool emails this person an invite to your group, through the Skool webhook you connect in <b>Skool members</b>. Each person is only invited once. On a paid
          group, only invite people who&apos;ve already paid you.
        </p>
      );
    default:
      return <p className="text-sm text-muted-foreground">No settings needed.</p>;
  }
}
