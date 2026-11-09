import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowDownIcon,
  BotIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  MessageSquareTextIcon,
  PlugIcon,
  SparklesIcon,
} from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { listConnectorTokens } from "@/server/connectors";
import { contactBrief, listAiTasks, pendingAiTaskCount } from "@/server/aiTasks";
import { PLAYBOOKS } from "@/server/playbooks";
import { AI_PROVIDERS, type AiProvider } from "@/server/ai/client";
import { completeAiTaskAction, removeAiKeyAction, revokeConnectorAction, saveAiKeyAction, skipAiTaskAction } from "@/actions/connectors";
import { contactName } from "@/server/contacts";
import { relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Callout, Empty, Flash, IconTile, MoreOptions, PageHead, Panel, StepDot } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { NewConnector } from "../settings/connector";

export const metadata = { title: "Your AI" };

const URL_PH = "YOUR_CONNECTOR_URL";
type App = { name: string; plan: string; free: "yes" | "limited" | "no"; steps: string[]; snippet?: string };
const APPS: App[] = [
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
    name: "Cursor and other MCP apps",
    plan: "Any app that supports remote MCP servers over HTTP.",
    free: "limited",
    steps: ["Add a remote (HTTP) MCP server and paste your connector URL. No authentication.", "In Cursor: ~/.cursor/mcp.json with the config below."],
    snippet: JSON.stringify({ mcpServers: { onex: { url: URL_PH } } }, null, 2),
  },
];
// Claude and ChatGPT are what most people pay for; everything else lives under "More apps & playbooks".
const FEATURED = APPS.slice(0, 2);
const OTHER_APPS = APPS.slice(2);

/** Who finished an AI task, in plain words. */
function doneByLabel(doneBy: string) {
  if (doneBy.startsWith("api:")) return `Done by your ${doneBy.slice(4)} key`;
  if (doneBy === "connected AI app") return "Done by your connected AI";
  if (doneBy === "pasted by hand") return "Pasted by you";
  return doneBy;
}

const FREE_BADGE = {
  yes: { label: "Free works", variant: "success" },
  limited: { label: "Free with limits", variant: "gold" },
  no: { label: "Paid plans", variant: "secondary" },
} as const;

/** One app's setup steps, folded. */
function AppSteps({ app, open }: { app: App; open?: boolean }) {
  return (
    <details open={open} className="group/app rounded-xl bg-card ring-1 ring-ink/[0.07] transition-shadow duration-200 open:shadow-card dark:ring-white/[0.08]">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 transition-colors select-none hover:bg-accent/50 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 text-[14px] font-medium">{app.name}</span>
        <Badge variant={FREE_BADGE[app.free].variant}>{FREE_BADGE[app.free].label}</Badge>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open/app:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-3.5 border-t border-border/80 px-4 pt-3.5 pb-4">
        <p className="text-xs leading-relaxed text-muted-foreground">{app.plan}</p>
        <ol className="flex flex-col gap-2.5 text-sm">
          {app.steps.map((st, i) => (
            <li key={st} className="flex gap-2.5">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground tabular-nums ring-1 ring-violet-200/70 ring-inset dark:ring-white/[0.06]">{i + 1}</span>
              <span className="min-w-0 leading-relaxed">{st}</span>
            </li>
          ))}
        </ol>
        {app.snippet ? (
          <div className="flex flex-col gap-2">
            <pre className="overflow-x-auto rounded-xl bg-muted/70 p-3.5 font-mono text-xs leading-relaxed ring-1 ring-ink/[0.04] ring-inset dark:ring-white/[0.05]">{app.snippet}</pre>
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={app.snippet} label="Copy config" />
              <span className="text-xs text-muted-foreground">Replace {URL_PH} with your connector URL.</span>
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}

/** A numbered step inside one of the two paths. */
function PathStep({ n, title, children, last }: { n: number; title: string; children: ReactNode; last?: boolean }) {
  return (
    <li className="relative flex gap-3.5">
      {!last ? <span aria-hidden className="absolute top-9 bottom-1 left-[13.5px] w-px bg-border-strong" /> : null}
      <StepDot n={n} className="relative bg-card" />
      <div className={cn("flex min-w-0 flex-1 flex-col gap-3", !last && "pb-7")}>
        <h3 className="pt-[3px] text-[15px] font-semibold tracking-[-0.011em]">{title}</h3>
        {children}
      </div>
    </li>
  );
}

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
  const connected = connectors.length > 0 || Boolean(provider);
  const firstPlaybook = PLAYBOOKS[0];

  const tasksPanel = (
    <section id="tasks" className="scroll-mt-20">
      <Panel
        icon={ClipboardListIcon}
        tone={pending.length ? "gold" : "muted"}
        title={pending.length ? `${pendingCount} AI ${pendingCount === 1 ? "task" : "tasks"} waiting` : "AI tasks from your automations"}
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
                <li key={r.task.id} className="flex flex-col gap-3 rounded-xl bg-background/60 p-4 text-sm ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {r.contact?.id ? <Link href={`${base}/leads/${r.contact.id}`}>{contactName({ firstName: r.contact.firstName ?? "", lastName: r.contact.lastName ?? "", email: r.contact.email, phone: null })}</Link> : "No contact"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {r.task.source} · {relativeTime(r.task.createdAt)}
                    </span>
                  </div>
                  <p>{r.task.instruction}</p>
                  {r.task.doneBy.startsWith("error") ? <p className="text-xs text-destructive">Your API key couldn&apos;t do it: {r.task.doneBy.slice(7)}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <CopyButton text={prompt} label="Copy prompt" />
                    <form action={skipAiTaskAction.bind(null, wid, r.task.id)}>
                      <SubmitButton variant="ghost" size="sm">
                        Skip
                      </SubmitButton>
                    </form>
                  </div>
                  <form action={completeAiTaskAction.bind(null, wid, r.task.id)} className="flex flex-col gap-2">
                    <Textarea name="result" rows={2} placeholder="Paste what your AI wrote…" aria-label="AI result" />
                    <SubmitButton size="sm" className="self-start">
                      {r.contact?.id ? "Save on contact" : "Save"}
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
        {done.length ? (
          <details className="group/done text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground [&::-webkit-details-marker]:hidden">
              <ChevronDownIcon className="size-4 transition-transform group-open/done:rotate-180" aria-hidden />
              Recently done ({done.length})
            </summary>
            <ul className="mt-2 flex flex-col divide-y">
              {done.map((r) => (
                <li key={r.task.id} className="flex flex-col gap-1.5 py-2.5">
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
  );

  return (
    <>
      <PageHead
        lesson="3.1"
        stage="Day 8"
        title="Your AI"
        sub="Plug in the AI you already use, free plans included. It does the writing and busywork in this account, and the AI bill is yours, never your wallet here."
        first={connected ? "You're connected. Try a playbook line in your AI app." : "Pick the path that sounds like you. One is plenty."}
      />
      <Flash searchParams={await searchParams} />

      {connected ? (
        <Callout tone="ok" title="Your AI is plugged in">
          {[
            connectors.length ? `${connectors.length} connected ${connectors.length === 1 ? "app" : "apps"}` : null,
            provider ? `API key on: ${AI_PROVIDERS[provider].label}${s.aiKeyHint ? ` ${s.aiKeyHint}` : ""}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          . Say <b>&ldquo;{firstPlaybook?.say ?? "Run my Monday check-in in OneX."}&rdquo;</b> to see it work.
        </Callout>
      ) : null}

      {pending.length ? tasksPanel : null}

      {/* The choice. On a narrow page the two paths stack, so these jump to the right one. */}
      <nav aria-label="Choose your path" className="grid gap-3 @sm/main:grid-cols-2 @4xl/main:hidden">
        {[
          { href: "#connect", icon: PlugIcon, tone: "primary" as const, title: "I pay for Claude or ChatGPT", sub: "Connect it with a private link" },
          { href: "#key", icon: KeyRoundIcon, tone: "success" as const, title: "I want it free", sub: "Use a free Google Gemini key" },
        ].map((c) => (
          <a
            key={c.href}
            href={c.href}
            data-slot="choice"
            className="group flex items-center gap-3 rounded-2xl bg-card p-3.5 text-foreground shadow-card ring-1 ring-ink/[0.06] transition-shadow duration-150 hover:no-underline hover:shadow-lift hover:ring-primary/30 dark:ring-white/[0.07]"
          >
            <IconTile icon={c.icon} tone={c.tone} />
            <span className="grid min-w-0 flex-1">
              <span className="text-[14.5px] font-semibold">{c.title}</span>
              <span className="text-xs text-muted-foreground">{c.sub}</span>
            </span>
            <ArrowDownIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-y-0.5" aria-hidden />
          </a>
        ))}
      </nav>

      <div className="grid items-start gap-5 @4xl/main:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {/* Path 1: a paid AI app, connected with a private link. */}
        <Card id="connect" className="relative scroll-mt-20 shadow-lift ring-2 ring-primary/20 dark:ring-primary/40">
          {/* The recommended path carries a faint violet glow along its top edge. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(70%_100%_at_25%_0%,var(--accent),transparent_75%)] dark:bg-[radial-gradient(70%_100%_at_25%_0%,rgb(118_85_245/0.12),transparent_75%)]" />
          <CardContent className="relative flex flex-col gap-7">
            <div className="flex items-start gap-3.5">
              <IconTile icon={PlugIcon} className="size-11 rounded-2xl [&_svg]:size-5" />
              <div className="grid min-w-0 flex-1 gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[19px] tracking-[-0.015em]">I pay for Claude or ChatGPT</h2>
                  <Badge variant="soft">Best results</Badge>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Connect it once with a private link. Then your AI can read your leads, write ads, fix pages, switch on automations and do AI tasks. Nothing is deleted, and it never touches your Skool login.
                </p>
              </div>
            </div>
            <ol className="flex flex-col">
              <PathStep n={1} title="Make your private link">
                {isAdmin ? <NewConnector wid={wid} cta={!connected} /> : <Callout tone="info">Ask the account owner or an admin to create a connector URL.</Callout>}
                {connectors.length ? (
                  <ul className="flex flex-col divide-y divide-border/80 overflow-hidden rounded-xl bg-background/60 ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
                    {connectors.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className={cn("size-2 shrink-0 rounded-full", c.lastUsedAt ? "bg-success ring-3 ring-success/15" : "bg-border-strong")} aria-hidden />
                          <span className="min-w-0">
                            <span className="font-medium">{c.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              Created {relativeTime(c.createdAt)}
                              {c.createdByName || c.createdByEmail ? ` by ${c.createdByName || c.createdByEmail}` : ""} · {c.lastUsedAt ? `used ${relativeTime(c.lastUsedAt)}` : "never used"}
                            </span>
                          </span>
                        </span>
                        {isAdmin ? (
                          <form action={revokeConnectorAction.bind(null, wid, c.id)}>
                            <SubmitButton variant="ghost" size="sm" confirm="Remove this connector? The URL stops working.">
                              Remove
                            </SubmitButton>
                          </form>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </PathStep>
              <PathStep n={2} title="Paste it into your app">
                <div className="flex flex-col gap-2">
                  {FEATURED.map((app, i) => (
                    <AppSteps key={app.name} app={app} open={i === 0 && connectors.length > 0} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Using something else? VS Code, Cursor, LM Studio and more are under <a href="#more">More apps &amp; playbooks</a>. Plans and menus change often: if a step looks different, search your app&apos;s help for &ldquo;custom MCP connector&rdquo;.
                </p>
              </PathStep>
              <PathStep n={3} title="Ask it for a job" last>
                <div className="flex flex-wrap items-center gap-2.5 rounded-2xl rounded-bl-md bg-accent p-2 pl-3.5 ring-1 ring-violet-200/70 ring-inset dark:ring-white/[0.06]">
                  <MessageSquareTextIcon className="size-4 shrink-0 text-primary dark:text-violet-300" aria-hidden />
                  <span className="min-w-0 flex-1 text-[14px] font-medium text-accent-foreground">&ldquo;{firstPlaybook?.say ?? "Run my Monday check-in in OneX."}&rdquo;</span>
                  <CopyButton text={firstPlaybook?.say ?? "Run my Monday check-in in OneX."} />
                </div>
              </PathStep>
            </ol>
          </CardContent>
        </Card>

        {/* Path 2: free, with an API key. The form id stays "key": saving comes back to #key. */}
        <form id="key" data-guide="ai-key" action={saveAiKeyAction.bind(null, wid)} className="scroll-mt-20">
          <Card>
            <CardContent className="flex flex-col gap-7">
              <div className="flex items-start gap-3.5">
                <IconTile icon={KeyRoundIcon} tone="success" className="size-11 rounded-2xl [&_svg]:size-5" />
                <div className="grid min-w-0 flex-1 gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[19px] tracking-[-0.015em]">I want it free</h2>
                    <Badge variant="success">Free</Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">Paste a free Google Gemini key. Every AI button here (launch kit, ad research, lead scores, reply drafts) and every Ask my AI step then runs by itself on your key.</p>
                </div>
              </div>

              {provider ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-success-soft px-3.5 py-2.5 text-sm text-success ring-1 ring-success/15 ring-inset">
                  <CheckCircle2Icon className="size-4" aria-hidden />
                  <span className="flex-1 font-medium">
                    On · {AI_PROVIDERS[provider].label} {s.aiKeyHint}
                    {s.aiModel ? ` · ${s.aiModel}` : ""}
                  </span>
                  {isAdmin ? (
                    <Button formAction={removeAiKeyAction.bind(null, wid)} variant="ghost" size="sm" className="text-success hover:text-success">
                      Remove key
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <ol className="flex flex-col">
                <PathStep n={1} title="Get a free key">
                  <p className="text-sm text-muted-foreground">Sign in with your Google account and press Create API key. Takes about a minute.</p>
                  <Button variant="outline" asChild className="self-start">
                    <a href={AI_PROVIDERS.gemini.keyUrl} target="_blank" rel="noreferrer">
                      Get a free Gemini key
                      <ExternalLinkIcon data-icon="inline-end" />
                    </a>
                  </Button>
                </PathStep>
                <PathStep n={2} title="Paste it here and save" last>
                  <Field>
                    <FieldLabel htmlFor="aiKey">API key</FieldLabel>
                    <Input id="aiKey" name="aiKey" type="password" autoComplete="off" className="h-10" placeholder={s.aiKeyHint ? `Saved (${s.aiKeyHint})` : "Paste your key"} />
                    <FieldDescription>Checked before saving, then stored encrypted. {AI_PROVIDERS.gemini.note}</FieldDescription>
                  </Field>
                  <MoreOptions title="Use a different provider" sub="Groq, OpenRouter, Claude or ChatGPT API, or your own." icon={SparklesIcon} className="bg-transparent">
                    <Field>
                      <FieldLabel htmlFor="aiProvider">Provider</FieldLabel>
                      <NativeSelect id="aiProvider" name="aiProvider" defaultValue={provider ?? "gemini"}>
                        <NativeSelectOptGroup label="Free to start">
                          {(["gemini", "groq", "openrouter"] as const).map((k) => (
                            <NativeSelectOption key={k} value={k}>
                              {AI_PROVIDERS[k].label}
                            </NativeSelectOption>
                          ))}
                        </NativeSelectOptGroup>
                        <NativeSelectOptGroup label="Paid">
                          {(["anthropic", "openai", "custom"] as const).map((k) => (
                            <NativeSelectOption key={k} value={k}>
                              {AI_PROVIDERS[k].label}
                            </NativeSelectOption>
                          ))}
                        </NativeSelectOptGroup>
                      </NativeSelect>
                      <FieldDescription>
                        Get a key:{" "}
                        {(["gemini", "groq", "openrouter", "anthropic", "openai"] as const).map((k, i) => (
                          <span key={k}>
                            {i ? " · " : ""}
                            <a href={AI_PROVIDERS[k].keyUrl} target="_blank" rel="noreferrer">
                              {AI_PROVIDERS[k].label}
                            </a>
                          </span>
                        ))}
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="aiModel">Model (optional)</FieldLabel>
                      <Input id="aiModel" name="aiModel" defaultValue={s.aiModel ?? ""} placeholder="We pick a good one for you" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="aiBaseUrl">Base URL (only for Other)</FieldLabel>
                      <Input id="aiBaseUrl" name="aiBaseUrl" type="url" defaultValue={s.aiBaseUrl ?? ""} placeholder="https://api.mistral.ai/v1" />
                    </Field>
                    <ul className="grid gap-1.5 text-xs text-muted-foreground">
                      {(Object.keys(AI_PROVIDERS) as AiProvider[]).map((k) => (
                        <li key={k}>
                          <b className="text-foreground">{AI_PROVIDERS[k].label}:</b> {AI_PROVIDERS[k].note}
                        </li>
                      ))}
                    </ul>
                  </MoreOptions>
                  {isAdmin ? (
                    <SubmitButton className="self-start" pendingText="Checking your key…">
                      <KeyRoundIcon data-icon="inline-start" />
                      Save key
                    </SubmitButton>
                  ) : (
                    <Callout tone="info">Ask the account owner or an admin to add a key.</Callout>
                  )}
                </PathStep>
              </ol>
            </CardContent>
          </Card>
        </form>
      </div>

      <MoreOptions
        id="more"
        title="More apps & playbooks"
        sub="Other AI apps, ready-made jobs to ask for, and the AI task queue."
        icon={SparklesIcon}
        defaultOpen={false}
      >
        <section id="playbooks" className="flex scroll-mt-20 flex-col gap-3">
          <div className="grid gap-0.5">
            <h3>Playbooks</h3>
            <p className="text-sm text-muted-foreground">Ready-made jobs. Say the line to your connected AI, or pick it from your app&apos;s prompts menu (in Claude and VS Code they show up as prompts or slash commands).</p>
          </div>
          <ul className="grid gap-2.5 @2xl/main:grid-cols-2">
            {PLAYBOOKS.map((p) => (
              <li key={p.name} className="flex flex-col gap-2 rounded-xl bg-card p-4 text-sm ring-1 ring-ink/[0.07] dark:ring-white/[0.08]">
                <span className="font-semibold">{p.title}</span>
                <span className="leading-relaxed text-muted-foreground">{p.description}</span>
                <div className="mt-auto flex items-center gap-2 pt-1.5">
                  <span className="min-w-0 flex-1 truncate rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">&ldquo;{p.say}&rdquo;</span>
                  <CopyButton text={p.say} label="Copy" />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <div className="grid gap-0.5">
            <h3>Other AI apps</h3>
            <p className="text-sm text-muted-foreground">Same private link from step 1, pasted somewhere else.</p>
          </div>
          <div className="grid gap-2 @3xl/main:grid-cols-2">
            {OTHER_APPS.map((app) => (
              <AppSteps key={app.name} app={app} />
            ))}
          </div>
        </section>

        {pending.length ? null : tasksPanel}
      </MoreOptions>
    </>
  );
}
