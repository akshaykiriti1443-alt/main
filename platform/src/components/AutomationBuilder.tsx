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
  set_stage: "Set the lead's stage",
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
  move_opportunity: "Move opportunity to stage",
  create_opportunity: "Create opportunity",
  // Only shows on automations saved before Skool invites were removed. Never offered as a new step.
  skool_invite: "Skool invite (removed)",
};

/** The steps you can add. */
const OFFERED = (Object.keys(ACTION_LABELS) as ActionType[]).filter((t) => t !== "skool_invite");

const TRIGGERS: { value: AutomationTrigger["type"]; label: string; hint: string }[] = [
  { value: "lead_created", label: "New lead from a landing page", hint: "Optional: a site ID to limit it to one funnel." },
  { value: "message_received", label: "New message (DM, WhatsApp, SMS)", hint: "Optional: facebook, instagram, whatsapp or sms." },
  { value: "tag_added", label: "Tag added", hint: "The tag to watch for." },
  { value: "temperature_changed", label: "Lead temperature changes", hint: "Optional: hot, warm or cold." },
  { value: "stage_changed", label: "Lead stage changes", hint: "Optional: new, engaged, trial, member or lost." },
  { value: "opportunity_stage_changed", label: "Opportunity moves to stage", hint: "Optional: a stage name from your Pipeline, like Call booked or Won." },
  { value: "appointment_booked", label: "Appointment booked", hint: "Optional: a booking calendar's link name (its slug), like intro-call." },
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
    case "move_opportunity":
      return { type, stage: "Contacted" };
    case "create_opportunity":
      return { type, title: "", value: 0, stage: "New lead" };
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
  emphasis,
}: {
  workspaceId: string;
  id: string | null;
  initial: { name: string; trigger: AutomationTrigger; actions: AutomationAction[]; active: boolean };
  sequences: { id: string; name: string }[];
  save: (id: string | null, input: { name: string; trigger: unknown; actions: unknown; active: boolean }) => Promise<{ ok: boolean; id?: string; error?: string }>;
  /** Saving is the one thing to do on this screen (a new automation or an AI draft): the pink button. */
  emphasis?: boolean;
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
    <div className="flex flex-col gap-6">
      <Panel>
        <div className="grid gap-4 @xl/main:grid-cols-[1fr_auto] @xl/main:items-end">
          <Field>
            <FieldLabel htmlFor="aname">Name</FieldLabel>
            <Input id="aname" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Label
            htmlFor="aactive"
            className={cn(
              "h-10 cursor-pointer gap-2.5 rounded-full px-3.5 font-medium transition-colors duration-150",
              active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
            )}
          >
            <Switch id="aactive" checked={active} onCheckedChange={setActive} />
            {active ? "Automation is on" : "Automation is off"}
          </Label>
        </div>
      </Panel>

      <div className="flex flex-col">
      <Panel title={<StepTitle icon={ZapIcon} label="When this happens" />} className="ring-gold/45 dark:ring-gold/30">
        <div className="grid gap-4 @xl/main:grid-cols-2">
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
                className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
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

      <div className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-border-strong bg-card/40 p-4 @xl/main:flex-row @xl/main:items-center">
        <span className="flex items-center gap-2.5 text-sm font-semibold @xl/main:mr-1">
          <span className="grid size-7 place-items-center rounded-full border border-dashed border-border-strong text-muted-foreground">
            <PlusIcon className="size-3.5" aria-hidden />
          </span>
          {actions.length ? "Then…" : "First step:"}
        </span>
        <NativeSelect className="w-full @xl/main:w-72" value={addType} onChange={(e) => setAddType(e.target.value as ActionType)} aria-label="Step type">
          {OFFERED.map((t) => (
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

      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-card py-3 pr-5 pl-3 shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
        <Button type="button" variant={emphasis ? "cta" : "default"} onClick={onSave} disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {pending ? "Saving…" : "Save automation"}
        </Button>
        {msg ? (
          <span role="status" className={cn("flex items-center gap-1.5 text-sm", msg.ok ? "text-success" : "text-destructive")}>
            {msg.ok ? <CircleCheckIcon className="size-4" /> : <CircleAlertIcon className="size-4" />}
            {msg.text}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Nothing runs until you save.</span>
        )}
      </div>
    </div>
  );
}

function StepTitle({ label, step, icon: Icon }: { label: string; step?: number; icon?: LucideIcon }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full text-[12.5px] font-semibold tabular-nums",
          Icon ? "bg-gold-soft text-gold-foreground ring-1 ring-gold/50" : "bg-primary text-primary-foreground shadow-press",
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
  return <div aria-hidden className="ml-[37px] h-5 w-px bg-border-strong" />;
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
        <label className="flex flex-wrap items-center gap-2.5 text-sm">
          Wait
          <Input type="number" min={1} value={a.minutes} onChange={(e) => onChange({ minutes: Math.max(1, Number(e.target.value) || 1) })} className="w-28 tabular-nums" />
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
    case "move_opportunity":
      return (
        <>
          <Input value={a.stage} placeholder="Stage name, e.g. Proposal sent" onChange={(e) => onChange({ stage: e.target.value })} aria-label="Stage name" />
          <p className="text-xs text-muted-foreground">Moves the opportunity this automation is about (or their newest open one). No opportunity yet? One is created in your default pipeline.</p>
        </>
      );
    case "create_opportunity":
      return (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,12rem)]">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Name
            <Input value={a.title} placeholder="Blank = their name" onChange={(e) => onChange({ title: e.target.value })} />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Value
            <Input type="number" min={0} value={a.value} onChange={(e) => onChange({ value: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Stage
            <Input value={a.stage} placeholder="Blank = first stage" onChange={(e) => onChange({ stage: e.target.value })} />
          </label>
        </div>
      );
    case "skool_invite":
      return <p className="text-sm text-muted-foreground">Skool invites were removed, so this step is skipped and does nothing. Delete it with the bin icon.</p>;
    default:
      return <p className="text-sm text-muted-foreground">No settings needed.</p>;
  }
}
