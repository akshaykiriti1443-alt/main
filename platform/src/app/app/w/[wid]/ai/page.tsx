import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRightIcon,
  BotIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  MessageSquareTextIcon,
  PlugIcon,
  RefreshCwIcon,
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
import { checkAiKeyAction } from "./actions";
import { aiRunsFor, type AiRuns } from "./runs";

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
      "In a chat, open the tools menu and switch the connector on. Then say the line in step 3 below.",
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
// Claude comes first: it's how Day 1 gets written. ChatGPT and everything else live under "Playbooks and more apps".
const CLAUDE = APPS[0];
const OTHER_APPS = APPS.slice(1);

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

/** A numbered step in a short list of steps. */
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
  const [connectors, pending, done, pendingCount, runs] = await Promise.all([
    listConnectorTokens(wid),
    listAiTasks(wid, { status: "pending", limit: 20 }),
    listAiTasks(wid, { status: "done", limit: 8 }),
    pendingAiTaskCount(wid),
    aiRunsFor(workspace),
  ]);
  const briefs = await Promise.all(pending.map((r) => (r.task.contactId ? contactBrief(wid, r.task.contactId) : Promise.resolve(null))));
  const provider = s.aiKeyEnc && s.aiProvider ? (s.aiProvider as AiProvider) : null;
  const isAdmin = role !== "user";
  const base = `/app/w/${wid}`;
  // Day 1 is when most people connect, so the first job to try is the one that builds Day 1 for them.
  const firstPlaybook = PLAYBOOKS.find((p) => p.name === "day_1_with_claude") ?? PLAYBOOKS[0];

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

  // Saving a key checks it with the provider first, so a saved key is a key that worked. Save key is
  // never pink: the screen's one pink button is Create connector URL (Claude first).
  const keyForm = (
    <form data-guide="ai-key" action={saveAiKeyAction.bind(null, wid)} className="flex flex-col">
      <ol className="flex flex-col">
        <PathStep n={1} title="Open Google AI Studio">
          <p className="text-sm leading-relaxed text-muted-foreground">Sign in with any Google account. A Gmail address works. It opens in a new tab, so keep this one open.</p>
          <Button variant="outline" asChild className="self-start">
            <a href={AI_PROVIDERS.gemini.keyUrl} target="_blank" rel="noreferrer">
              Open Google AI Studio
              <ExternalLinkIcon data-icon="inline-end" />
            </a>
          </Button>
        </PathStep>
        <PathStep n={2} title="Press Create API key, then copy it">
          <p className="text-sm leading-relaxed text-muted-foreground">
            If Google asks you to pick a project, pick any one or make a new one. The name doesn&apos;t matter. Your key is one long line of letters and numbers, usually starting with <b className="font-semibold text-foreground">AIza</b>. Press the copy button next to it.
          </p>
        </PathStep>
        <PathStep n={3} title="Paste it here and press Save key" last>
          <Field>
            <FieldLabel htmlFor="aiKey">Your Gemini key</FieldLabel>
            <Input id="aiKey" name="aiKey" type="password" autoComplete="off" className="h-10" placeholder={s.aiKeyHint ? `Saved (${s.aiKeyHint})` : "Paste your key"} />
            <FieldDescription>We check it with Google before saving, then keep it locked away. {AI_PROVIDERS.gemini.note}</FieldDescription>
          </Field>
          <MoreOptions title="Use a different AI" sub="Groq, OpenRouter, Claude or ChatGPT, or your own." icon={SparklesIcon} className="bg-transparent">
            <Field>
              <FieldLabel htmlFor="aiProvider">Which AI</FieldLabel>
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
              <FieldLabel htmlFor="aiBaseUrl">Web address (only for Other)</FieldLabel>
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
            <SubmitButton variant="default" size="lg" className="self-start" pendingText="Checking your key with Google…">
              <KeyRoundIcon data-icon="inline-start" />
              Save key
            </SubmitButton>
          ) : (
            <Callout tone="info">Ask the account owner or an admin to add the key.</Callout>
          )}
        </PathStep>
      </ol>
    </form>
  );

  // Connected means Claude has used a link at least once. A link nobody has pasted in yet is only made,
  // and Day 1's AI step doesn't tick from it.
  const connected = connectors.some((c) => c.lastUsedAt);
  const linkMade = connectors.length > 0;
  // No link and no key yet: making the link is the one thing to do here.
  const fresh = !linkMade && !provider;

  return (
    <>
      <PageHead
        lesson="Day 1"
        title="Your AI"
        sub="Connect your Claude and it writes your website, your emails and your ads, then saves them straight into this app. No Claude? A free Gemini key works too."
        first={
          connected
            ? "Your Claude is connected. Ask it to build your Day 1, then head back to Your path."
            : provider
              ? "Your key works. Head back to Your path for the next step."
              : linkMade
                ? "Your connector URL is made. Paste it into Claude (step 2) and say the line in step 3. Your path ticks this step once Claude uses it."
                : "Start with step 1 under Connect your Claude. Have Claude open in another tab."
        }
      />
      <Flash searchParams={await searchParams} />

      {pending.length ? tasksPanel : null}

      <Card id="connect" className={cn("relative scroll-mt-20", fresh ? "shadow-lift ring-2 ring-primary/20 dark:ring-primary/40" : connected ? "shadow-lift ring-2 ring-success/25" : "")}>
        {/* The one thing to do here carries a faint violet glow along its top edge. */}
        {fresh ? (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(70%_100%_at_25%_0%,var(--accent),transparent_75%)] dark:bg-[radial-gradient(70%_100%_at_25%_0%,rgb(118_85_245/0.12),transparent_75%)]" />
        ) : null}
        <CardContent className="relative flex flex-col gap-7">
          <div className="flex items-start gap-3.5">
            <IconTile icon={connected ? CheckCircle2Icon : PlugIcon} tone={connected ? "success" : "primary"} className="size-11 rounded-2xl [&_svg]:size-5" />
            <div className="grid min-w-0 flex-1 gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[19px] tracking-[-0.015em]">Connect your Claude</h2>
                <Badge variant={connected ? "success" : "soft"}>{connected ? "Connected" : linkMade ? "Link made · waiting for Claude" : "Best way · about 3 minutes"}</Badge>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Claude writes your website, your free checklist, your emails and your ads, and saves them straight into this app. It runs on your own Claude plan, and the free plan works too.
              </p>
            </div>
          </div>
          <ol className="flex flex-col">
            <PathStep n={1} title="Make your connector URL">
              <p className="text-sm leading-relaxed text-muted-foreground">It&apos;s a private link to your account, like a password. Copy it as soon as it shows.</p>
              {isAdmin ? <NewConnector wid={wid} cta={fresh} /> : <Callout tone="info">Ask the account owner or an admin to make the link.</Callout>}
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
                        <SubmitButton variant="ghost" size="sm" confirm="Remove this link? It stops working.">
                          Remove
                        </SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </PathStep>
          <PathStep n={2} title="Paste it into Claude">
            <AppSteps app={CLAUDE} open />
            <p className="text-xs text-muted-foreground">
              Use ChatGPT or another app? Its steps are under <a href="#more">Playbooks and more apps</a>. Apps change their menus often: if a step looks different, search your app&apos;s help for &ldquo;custom connector&rdquo;.
            </p>
          </PathStep>
          <PathStep n={3} title="Ask Claude to build your Day 1" last>
            <p className="text-sm leading-relaxed text-muted-foreground">
              It builds your website from our premium template, writes your free checklist and your welcome emails, and can fix any page. Your website stays a draft until you say &ldquo;publish it&rdquo;, and a new email sequence starts switched off.
            </p>
            <div className="flex flex-wrap items-center gap-2.5 rounded-2xl rounded-bl-md bg-accent p-2 pl-3.5 ring-1 ring-violet-200/70 ring-inset dark:ring-white/[0.06]">
              <MessageSquareTextIcon className="size-4 shrink-0 text-primary dark:text-violet-300" aria-hidden />
              <span className="min-w-0 flex-1 text-[14px] font-medium text-accent-foreground">&ldquo;{firstPlaybook?.say ?? "Run my Monday check-in in OneX."}&rdquo;</span>
              <CopyButton text={firstPlaybook?.say ?? "Run my Monday check-in in OneX."} />
            </div>
          </PathStep>
        </ol>
        </CardContent>
      </Card>

      {provider ? (
        <>
          <KeyWorks wid={wid} provider={provider} hint={s.aiKeyHint} model={s.aiModel} isAdmin={isAdmin} />
          <MoreOptions icon={KeyRoundIcon} title="Use a different key" sub="Paste a new key to replace the one you have. It's checked before it's saved.">
            {keyForm}
          </MoreOptions>
        </>
      ) : (
        <Card id="key" className="scroll-mt-20">
          <CardContent className="flex flex-col gap-7">
            <div className="flex items-start gap-3.5">
              <IconTile icon={KeyRoundIcon} tone="success" className="size-11 rounded-2xl [&_svg]:size-5" />
              <div className="grid min-w-0 flex-1 gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[19px] tracking-[-0.015em]">No Claude? A free Gemini key works too</h2>
                  <Badge variant="success">Free · about 2 minutes</Badge>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Three steps with any Google account, and the free tier doesn&apos;t ask for a card. A key also runs the AI buttons inside this app (your launch kit, ad research and your ads) with no runs to count.
                </p>
              </div>
            </div>
            <RunsStatus runs={runs} />
            {keyForm}
          </CardContent>
        </Card>
      )}

      <MoreOptions id="more" title="Playbooks and more apps" sub="Ready-made jobs to ask your connected app for, other apps it works in, and AI tasks from your automations." icon={SparklesIcon} defaultOpen={false}>
        <section id="playbooks" className="flex scroll-mt-20 flex-col gap-3">
          <div className="grid gap-0.5">
            <h3>Playbooks</h3>
            <p className="text-sm text-muted-foreground">Ready-made jobs. Say the line to your connected app, or pick it from that app&apos;s prompts menu.</p>
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
            <p className="text-sm text-muted-foreground">ChatGPT and the rest: the same connector URL, pasted somewhere else.</p>
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

/** Where the member stands before they have a key: how many included runs are left, in one line. */
function RunsStatus({ runs }: { runs: AiRuns }) {
  if (runs.kind === "free") {
    const left = runs.total - runs.used;
    return (
      <Callout tone="info">
        You have {left} of {runs.total} free AI {runs.total === 1 ? "run" : "runs"} left this month. With your own key you stop counting.
      </Callout>
    );
  }
  if (runs.kind === "out") return <Callout tone="warn">You&apos;ve used your {runs.total} free AI runs this month. Add your key below and every AI button works again.</Callout>;
  if (runs.kind === "off") return <Callout tone="info">No AI is connected yet, so the AI buttons give a starter template. Add your key below and they write for you.</Callout>;
  return null;
}

/** The confirmation: a saved key is one the provider said yes to. */
function KeyWorks({ wid, provider, hint, model, isAdmin }: { wid: string; provider: AiProvider; hint?: string; model?: string; isAdmin: boolean }) {
  const p = AI_PROVIDERS[provider];
  return (
    <Card id="key" className="scroll-mt-20 shadow-lift ring-2 ring-success/25">
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-start gap-3.5">
          <IconTile icon={CheckCircle2Icon} tone="success" className="size-11 rounded-2xl [&_svg]:size-5" />
          <div className="grid min-w-0 flex-1 gap-1.5">
            <h2 className="text-[19px] tracking-[-0.015em]">Your key works</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {p.label} {hint}
              {model ? ` · ${model}` : ""}. We checked it with {p.label} when you saved it. AI launch kit, Ad research, Ad studio and Ad review now run on your key, with no runs to count.
              {p.free ? ` ${p.note}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link href={`/app/w/${wid}/path`}>
              Back to Your path
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
          <form action={checkAiKeyAction.bind(null, wid)}>
            <SubmitButton variant="outline" pendingText="Checking…">
              <RefreshCwIcon data-icon="inline-start" />
              Check my key
            </SubmitButton>
          </form>
          {isAdmin ? (
            <form action={removeAiKeyAction.bind(null, wid)}>
              <SubmitButton variant="ghost" confirm="Remove your key? The AI buttons stop using it.">
                Remove key
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
