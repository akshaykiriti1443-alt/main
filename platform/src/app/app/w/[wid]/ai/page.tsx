import Link from "next/link";
import { BotIcon, CheckCircle2Icon, ClipboardListIcon, KeyRoundIcon, PlugIcon, SparklesIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { listConnectorTokens } from "@/server/connectors";
import { contactBrief, listAiTasks, pendingAiTaskCount } from "@/server/aiTasks";
import { PLAYBOOKS } from "@/server/playbooks";
import { AI_PROVIDERS, type AiProvider } from "@/server/ai/client";
import { completeAiTaskAction, removeAiKeyAction, revokeConnectorAction, saveAiKeyAction, skipAiTaskAction } from "@/actions/connectors";
import { contactName } from "@/server/contacts";
import { relativeTime } from "@/lib/util";
import { Callout, Empty, Flash, PageHead, Panel, Stat } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { NewConnector } from "../settings/connector";

export const metadata = { title: "Your AI" };

const URL_PH = "YOUR_CONNECTOR_URL";
const APPS: { name: string; plan: string; free: "yes" | "limited" | "no"; steps: string[]; snippet?: string }[] = [
  {
    name: "Claude (claude.ai, desktop and mobile)",
    plan: "Free plan: 1 custom connector. Pro and up: more.",
    free: "yes",
    steps: [
      "Customize › Connectors, then + Add › Add custom connector.",
      "Give it a name (e.g. OneX), paste your connector URL and click Continue. Click Continue again, set Authentication to No sign in, then click Add.",
      "In a chat, open the tools menu and switch the connector on. Then say: “Run my Monday check-in.”",
    ],
  },
  {
    name: "Antigravity CLI (Google, replaces Gemini CLI)",
    plan: "Google's terminal AI. Check Google's plans page for the current free allowance. Gemini CLI now needs a paid Gemini API key; use the same server with httpUrl in ~/.gemini/settings.json.",
    free: "limited",
    steps: [
      "Install Antigravity CLI (agy), then open ~/.gemini/config/mcp_config.json (or .agents/mcp_config.json in a project).",
      "Add the server below and save.",
      "Restart agy and check the server is connected, then ask for a playbook.",
    ],
    snippet: JSON.stringify({ mcpServers: { onex: { serverUrl: URL_PH } } }, null, 2),
  },
  {
    name: "VS Code with GitHub Copilot",
    plan: "Copilot Free has monthly limits. Works in Agent mode.",
    free: "limited",
    steps: ["Create .vscode/mcp.json (or run “MCP: Add Server” from the command palette).", "Paste the config below and click Start above the server.", "Open Copilot Chat in Agent mode and ask for a playbook."],
    snippet: JSON.stringify({ servers: { onex: { type: "http", url: URL_PH } } }, null, 2),
  },
  {
    name: "LM Studio (free, runs AI on your own computer)",
    plan: "Free. Needs a decent computer. Version 0.3.17 or newer.",
    free: "yes",
    steps: ["Program tab › Install › Edit mcp.json.", "Add the server below and save.", "Load a model that supports tool use, then ask for a playbook."],
    snippet: JSON.stringify({ mcpServers: { onex: { url: URL_PH } } }, null, 2),
  },
  {
    name: "ChatGPT",
    plan: "Business, Enterprise and Edu on the web: full support. Plus and Pro: can connect, but ChatGPT may only allow reading (OpenAI limits write actions on personal plans). Free can't add custom MCP servers.",
    free: "no",
    steps: [
      "On chatgpt.com (web), open Plugins (chatgpt.com/plugins). If you don't see the option, turn on Developer mode in Settings first.",
      "Click + › Add custom MCP server, paste your connector URL, set authentication to none, accept the warning and click Create as a plugin.",
      "On Plus or Pro, if saving fails, use the copy-and-paste route under AI tasks below.",
      "On ChatGPT Free? Use the copy-and-paste route under AI tasks below instead.",
    ],
  },
  {
    name: "Cursor and other MCP apps",
    plan: "Any app that supports remote MCP servers over HTTP.",
    free: "limited",
    steps: ["Add a remote (HTTP) MCP server and paste your connector URL. No authentication.", "In Cursor: ~/.cursor/mcp.json with the config below."],
    snippet: JSON.stringify({ mcpServers: { onex: { url: URL_PH } } }, null, 2),
  },
];

/** Who finished an AI task, in plain words. */
function doneByLabel(doneBy: string) {
  if (doneBy.startsWith("api:")) return `Done by your ${doneBy.slice(4)} key`;
  if (doneBy === "connected AI app") return "Done by your connected AI";
  if (doneBy === "pasted by hand") return "Pasted by you";
  return doneBy;
}

const FREE_BADGE = { yes: { label: "Free works", cls: "bg-success-soft text-success" }, limited: { label: "Free with limits", cls: "bg-warning-soft text-warning" }, no: { label: "Paid only", cls: "" } };

export default async function YourAiPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace, role } = await requireWorkspace(wid);
  const s = workspace.settings;
  const [connectors, pending, done, pendingCount] = await Promise.all([
    listConnectorTokens(wid),
    listAiTasks(wid, { status: "pending", limit: 20 }),
    listAiTasks(wid, { status: "done", limit: 8 }),
    pendingAiTaskCount(wid),
  ]);
  const briefs = await Promise.all(pending.map((r) => (r.task.contactId ? contactBrief(wid, r.task.contactId) : Promise.resolve(null))));
  const provider = s.aiKeyEnc && s.aiProvider ? (s.aiProvider as AiProvider) : null;
  const isAdmin = role !== "user";
  const base = `/app/w/${wid}`;

  return (
    <>
      <PageHead
        eyebrow="Your AI, your cost"
        title="Your AI"
        sub="Plug in the AI you already use, free plans included. It reads and writes in this account for you, and the AI bill is yours, never your wallet here."
      />
      <Flash searchParams={await searchParams} />

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat icon={PlugIcon} label="Connected apps" value={connectors.length} hint={connectors.length ? "Connector URLs in use" : "None yet"} />
        <Stat icon={KeyRoundIcon} label="Your API key" value={provider ? AI_PROVIDERS[provider].label : "Off"} hint={provider ? s.aiModel || "Default model" : "Optional"} />
        <Stat icon={ClipboardListIcon} label="AI tasks waiting" value={pendingCount} hint={pendingCount ? "Say “do my AI tasks”" : "All done"} />
        <Stat icon={SparklesIcon} label="Playbooks" value={PLAYBOOKS.length} hint="Ready-made jobs" />
      </div>

      <section id="connect" className="flex scroll-mt-20 flex-col gap-4">
        <Panel
          title="1 · Connect your AI app"
          sub="Create a private connector URL and paste it into your AI app. It works like a password for this one account: your AI can read your leads, write ads, fix pages, switch on automations and do AI tasks. Nothing is deleted, and it never touches your Skool login."
        >
          {isAdmin ? <NewConnector wid={wid} /> : <Callout tone="info">Ask the account owner or an admin to create a connector URL.</Callout>}
          {connectors.length ? (
            <ul className="flex flex-col divide-y rounded-lg border">
              {connectors.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      Created {relativeTime(c.createdAt)}
                      {c.createdByName || c.createdByEmail ? ` by ${c.createdByName || c.createdByEmail}` : ""} · {c.lastUsedAt ? `used ${relativeTime(c.lastUsedAt)}` : "never used"}
                    </span>
                  </span>
                  {isAdmin ? (
                    <form action={revokeConnectorAction.bind(null, wid, c.id)}>
                      <SubmitButton variant="ghost" size="sm" confirm="Remove this connector? The URL stops working.">Remove</SubmitButton>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>

        <div className="grid gap-3 md:grid-cols-2">
          {APPS.map((app) => (
            <details key={app.name} className="group rounded-xl border bg-card p-4 open:shadow-sm">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                <span className="flex flex-col gap-1">
                  <span className="font-medium">{app.name}</span>
                  <span className="text-xs text-muted-foreground">{app.plan}</span>
                </span>
                <Badge variant="secondary" className={FREE_BADGE[app.free].cls}>{FREE_BADGE[app.free].label}</Badge>
              </summary>
              <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-sm">
                {app.steps.map((st) => (
                  <li key={st}>{st}</li>
                ))}
              </ol>
              {app.snippet ? (
                <div className="mt-3 flex flex-col gap-2">
                  <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{app.snippet}</pre>
                  <CopyButton text={app.snippet} label="Copy config" className="self-start" />
                  <span className="text-xs text-muted-foreground">Replace {URL_PH} with your connector URL.</span>
                </div>
              ) : null}
            </details>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Plans and menus change often. If a step looks different, search your app&apos;s help for &ldquo;custom MCP connector&rdquo;.</p>
      </section>

      <section id="playbooks" className="scroll-mt-20">
      <Panel title="2 · Playbooks" sub="Ready-made jobs. Say the line to your connected AI, or pick it from your app's prompts menu (in Claude and VS Code they show up as prompts or slash commands).">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {PLAYBOOKS.map((p) => (
            <div key={p.name} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
              <span className="font-medium">{p.title}</span>
              <span className="text-muted-foreground">{p.description}</span>
              <span className="mt-auto rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs">“{p.say}”</span>
              <CopyButton text={p.say} label="Copy" className="self-start" />
            </div>
          ))}
        </div>
      </Panel>
      </section>

      <section id="tasks" className="scroll-mt-20">
      <Panel
        title="3 · AI tasks from your automations"
        sub={
          <>
            Add an <b>Ask my AI</b> step to any <Link href={`${base}/automations`}>automation</Link>. With an API key it runs straight away. Otherwise it waits here: tell your connected AI &ldquo;do my AI tasks&rdquo;, or copy the prompt into any chat AI (even a free one) and paste the answer back.
          </>
        }
      >
        {pending.length === 0 ? (
          <Empty icon={BotIcon} title="Nothing waiting" body="When an automation asks your AI for something, it shows up here." />
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((r, i) => {
              const brief = briefs[i];
              const prompt = `${r.task.instruction}\n\n${brief ? `About this member: ${JSON.stringify(brief)}` : ""}\n\nReply with only the finished text.`;
              return (
                <li key={r.task.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {r.contact?.id ? <Link href={`${base}/leads/${r.contact.id}`}>{contactName({ firstName: r.contact.firstName ?? "", lastName: r.contact.lastName ?? "", email: r.contact.email, phone: null })}</Link> : "No contact"}
                    </span>
                    <span className="text-xs text-muted-foreground">{r.task.source} · {relativeTime(r.task.createdAt)}</span>
                  </div>
                  <p>{r.task.instruction}</p>
                  {r.task.doneBy.startsWith("error") ? <p className="text-xs text-destructive">Your API key couldn&apos;t do it: {r.task.doneBy.slice(7)}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <CopyButton text={prompt} label="Copy prompt" />
                    <form action={skipAiTaskAction.bind(null, wid, r.task.id)}>
                      <SubmitButton variant="ghost" size="sm">Skip</SubmitButton>
                    </form>
                  </div>
                  <form action={completeAiTaskAction.bind(null, wid, r.task.id)} className="flex flex-col gap-2">
                    <Textarea name="result" rows={2} placeholder="Paste what your AI wrote…" aria-label="AI result" />
                    <SubmitButton size="sm" variant="outline" className="self-start">{r.contact?.id ? "Save on contact" : "Save"}</SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
        {done.length ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Recently done ({done.length})</summary>
            <ul className="mt-2 flex flex-col divide-y">
              {done.map((r) => (
                <li key={r.task.id} className="flex flex-col gap-1.5 py-2">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2Icon className="size-3.5 text-success" /> {doneByLabel(r.task.doneBy)} · {relativeTime(r.task.completedAt)}
                  </span>
                  <p className="whitespace-pre-line">{r.task.result}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <CopyButton text={r.task.result} label="Copy" />
                    {r.contact?.id ? (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`${base}/leads/${r.contact.id}`}>Open contact</Link>
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Panel>
      </section>

      <form id="key" action={saveAiKeyAction.bind(null, wid)} className="scroll-mt-20">
        <Panel
          title="4 · Or add an API key (runs by itself)"
          sub="With a key, every AI feature here (launch kit, ad research, lead scores, reply drafts) and every Ask my AI step runs automatically on your key. Google Gemini, Groq and OpenRouter have free tiers."
          action={isAdmin ? <SubmitButton variant="outline" size="sm">Save key</SubmitButton> : undefined}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="aiProvider">Provider</FieldLabel>
              <NativeSelect id="aiProvider" name="aiProvider" defaultValue={provider ?? "gemini"}>
                <NativeSelectOptGroup label="Free to start">
                  {(["gemini", "groq", "openrouter"] as const).map((k) => (
                    <NativeSelectOption key={k} value={k}>{AI_PROVIDERS[k].label}</NativeSelectOption>
                  ))}
                </NativeSelectOptGroup>
                <NativeSelectOptGroup label="Paid">
                  {(["anthropic", "openai", "custom"] as const).map((k) => (
                    <NativeSelectOption key={k} value={k}>{AI_PROVIDERS[k].label}</NativeSelectOption>
                  ))}
                </NativeSelectOptGroup>
              </NativeSelect>
              <FieldDescription>
                Get a key: {(["gemini", "groq", "openrouter", "anthropic", "openai"] as const).map((k, i) => (
                  <span key={k}>
                    {i ? " · " : ""}
                    <a href={AI_PROVIDERS[k].keyUrl} target="_blank" rel="noreferrer">{AI_PROVIDERS[k].label}</a>
                  </span>
                ))}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="aiKey">API key</FieldLabel>
              <Input id="aiKey" name="aiKey" type="password" autoComplete="off" placeholder={s.aiKeyHint ? `Saved (${s.aiKeyHint})` : "Paste your key"} />
              <FieldDescription>Checked before saving, then stored encrypted.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="aiModel">Model (optional)</FieldLabel>
              <Input id="aiModel" name="aiModel" defaultValue={s.aiModel ?? ""} placeholder="We pick a good one for you" />
            </Field>
            <Field>
              <FieldLabel htmlFor="aiBaseUrl">Base URL (only for Other)</FieldLabel>
              <Input id="aiBaseUrl" name="aiBaseUrl" type="url" defaultValue={s.aiBaseUrl ?? ""} placeholder="https://api.mistral.ai/v1" />
            </Field>
          </div>
          <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            {(Object.keys(AI_PROVIDERS) as AiProvider[]).map((k) => (
              <li key={k}>
                <b className="text-foreground">{AI_PROVIDERS[k].label}:</b> {AI_PROVIDERS[k].note}
              </li>
            ))}
          </ul>
          {provider ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary" className="bg-success-soft text-success">
                On · {AI_PROVIDERS[provider].label} {s.aiKeyHint}
              </Badge>
              {isAdmin ? (
                <Button formAction={removeAiKeyAction.bind(null, wid)} variant="ghost" size="sm">
                  Remove key
                </Button>
              ) : null}
            </div>
          ) : null}
          {isAdmin ? (
            <SubmitButton className="self-start" pendingText="Checking your key…">
              Save key
            </SubmitButton>
          ) : null}
        </Panel>
      </form>
    </>
  );
}
