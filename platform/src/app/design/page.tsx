import "@/components/companion.css";
import { notFound } from "next/navigation";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  CrosshairIcon,
  DownloadIcon,
  FlameIcon,
  GlobeIcon,
  MailIcon,
  PlusIcon,
  PowerIcon,
  RocketIcon,
  RouteIcon,
  SkipForwardIcon,
  SparklesIcon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react";
import { AppShell, type NavGroup } from "@/components/AppShell";
import { PENNY_WAVE } from "@/components/penny-art";
import { Callout, Empty, IconTile, LessonTag, MoreOptions, NextStep, PageHead, Panel, Stat, StepDot, TempBadge, type Tone } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

// A living reference for the design system (DESIGN_SYSTEM.md): every shared component inside the
// real app shell, in both themes. Development only; it 404s in production.
export const metadata = { title: "Design system" };

const GROUPS: NavGroup[] = [
  { items: [{ href: "/design/dashboard", label: "Dashboard", icon: "dashboard", exact: true }, { href: "/design/path", label: "Your path", icon: "route" }] },
  {
    title: "Start here",
    items: [
      { href: "/design/ai", label: "Your AI", icon: "bot" },
      { href: "/design/launch", label: "AI launch kit", icon: "sparkles" },
      { href: "/design/sites", label: "Funnels & pages", icon: "globe" },
    ],
  },
  {
    title: "Get members",
    items: [
      { href: "/design/research", label: "Ad research", icon: "search" },
      { href: "/design/ads", label: "Ad review", icon: "megaphone" },
      { href: "/design/growth", label: "Growth ladder", icon: "ladder" },
      { href: "/design", label: "Leads", icon: "users", badge: 3 },
    ],
  },
  {
    title: "Keep members",
    items: [
      { href: "/design/automations", label: "Automations", icon: "workflow", locked: true },
      { href: "/design/unlocks", label: "Unlocks", icon: "gift" },
      { href: "/design/emails", label: "Emails", icon: "mail" },
    ],
  },
  { title: "Account", items: [{ href: "/design/billing", label: "Plan & wallet", icon: "billing" }, { href: "/design/settings", label: "Settings", icon: "settings" }] },
];

const LEADS = [
  { name: "Jamie Doyle", email: "jamie@example.com", from: "Pain ad", t: "hot" as const, stage: "Clicked Skool link", when: "2 min ago" },
  { name: "Priya Nair", email: "priya@example.com", from: "Dream ad", t: "warm" as const, stage: "Opened email 2", when: "18 min ago" },
  { name: "Sofia Alvarez", email: "sofia@example.com", from: "Instagram bio", t: "cold" as const, stage: "New lead", when: "3 h ago" },
];

const SWATCHES: [string, string][] = [
  ["--marshmallow", "Marshmallow (page)"],
  ["--card", "Cloud (surface)"],
  ["--ink", "Galactic ink"],
  ["--violet-600", "Galactic violet"],
  ["--violet-100", "Violet tint"],
  ["--pink-400", "Bubblegum (CTA)"],
  ["--pink-50", "Pink whisper"],
  ["--mist-600", "Mist (muted text)"],
  ["--success", "Success"],
  ["--warning", "Warning"],
  ["--destructive", "Danger"],
  ["--gold", "Gold (Penny)"],
];

export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <AppShell
      brand={{ name: "Fit Dads Club", sub: "Member plan · OneX" }}
      groups={GROUPS}
      user={{ email: "dana@example.com", name: "Dana Designer" }}
      headerExtra={<span className="guide-toggle is-on"><SparklesIcon aria-hidden /> <span className="hidden md:inline">Guide</span></span>}
      companion={<GuideSample />}
    >
      <PageHead
        lesson="2.5"
        stage="Day 6"
        eyebrow="Leads CRM"
        title="Your leads"
        sub="Everyone who signed up from your pages, hottest first. Message the hot ones today."
        first="Open Jamie, the hottest lead, and send the follow-up Penny drafted."
        actions={
          <>
            <Button variant="outline">
              <DownloadIcon data-icon="inline-start" /> Export
            </Button>
            <Button>
              <PlusIcon data-icon="inline-start" /> Add lead
            </Button>
          </>
        }
      />

      <NextStep eyebrow="Up next · Lesson 1.2" title="Publish your funnel" body="Your pages are written. Change three lines (headline, free guide name, button), then press Publish." href="/design" cta="Review & publish" icon={RocketIcon} />

      <div className="grid gap-4 @3xl/main:grid-cols-3">
        <Stat label="New leads this week" value="12" hint="From 3 ads and your bio link" icon={UsersIcon} />
        <Stat label="Emails opened" value="64%" hint="Welcome sequence, last 30 days" icon={MailIcon} tone="success" />
        <Stat label="Clicks to Skool" value="31" hint="Through your Skool link" icon={GlobeIcon} tone="pink" />
      </div>

      <Panel title="Hottest first" sub="Scored hot, warm or cold from what they did on your pages and emails." icon={FlameIcon} tone="hot" action={<Button variant="secondary" size="sm">View all</Button>}>
        <div className="-mx-6 -mb-6 border-t border-border/80 [&_tr>*:first-child]:pl-6 [&_tr>*:last-child]:pr-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Came from</TableHead>
                <TableHead>Temperature</TableHead>
                <TableHead>Latest</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {LEADS.map((l) => (
                <TableRow key={l.email}>
                  <TableCell>
                    <div className="grid leading-tight">
                      <span className="font-medium">{l.name}</span>
                      <span className="text-xs text-muted-foreground">{l.email}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{l.from}</TableCell>
                  <TableCell>
                    <TempBadge t={l.t} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{l.stage}</TableCell>
                  <TableCell className="text-right text-subtle-foreground">{l.when}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <div className="grid gap-6 @4xl/main:grid-cols-2">
        <Panel title="Add a lead" sub="Inputs, select, textarea, switches." step={1}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="d-name">Name</FieldLabel>
              <Input id="d-name" placeholder="Jamie Doyle" />
            </Field>
            <Field>
              <FieldLabel htmlFor="d-email">Email</FieldLabel>
              <Input id="d-email" type="email" placeholder="jamie@example.com" aria-invalid />
              <FieldDescription>That doesn&apos;t look like an email yet.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="d-src">Came from</FieldLabel>
              <NativeSelect id="d-src" className="w-full">
                <NativeSelectOption>Pain ad</NativeSelectOption>
                <NativeSelectOption>Dream ad</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="d-note">Note</FieldLabel>
              <Textarea id="d-note" placeholder="Anything worth remembering" />
            </Field>
            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2.5 text-sm">
                <Switch defaultChecked /> Send the welcome emails
              </label>
              <label className="flex items-center gap-2.5 text-sm">
                <Checkbox defaultChecked /> Tag as hot
              </label>
            </div>
          </FieldGroup>
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel title="Buttons" sub="One pink per screen. Violet for normal primary actions." icon={SparklesIcon}>
            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="cta">
                Claim your account <ArrowRightIcon data-icon="inline-end" />
              </Button>
              <Button>Publish</Button>
              <Button variant="secondary">Preview</Button>
              <Button variant="outline">Cancel</Button>
              <Button variant="ghost">Skip</Button>
              <Button variant="destructive">Delete</Button>
              <Button variant="link">Learn more</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Button size="xs">xs</Button>
              <Button size="sm">Small</Button>
              <Button>Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" variant="outline" aria-label="Add">
                <PlusIcon />
              </Button>
            </div>
          </Panel>

          <Panel title="Badges, tiles, steps" icon={WorkflowIcon} tone="primary">
            <div className="flex flex-wrap gap-2">
              <Badge>3 new</Badge>
              <Badge variant="soft">Draft</Badge>
              <Badge variant="pink">Recommended</Badge>
              <Badge variant="success">Published</Badge>
              <Badge variant="warning">Needs review</Badge>
              <Badge variant="gold">Reward</Badge>
              <Badge variant="destructive">Failed</Badge>
              <Badge variant="outline">Pain ad</Badge>
              <Badge variant="secondary">Cold</Badge>
              <LessonTag lesson="1.2" stage="Day 1" />
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {(["primary", "pink", "success", "gold", "hot", "warning", "muted"] as Tone[]).map((t) => (
                <IconTile key={t} icon={SparklesIcon} tone={t} />
              ))}
              <span className="mx-2 h-6 w-px bg-border" />
              <StepDot n={1} done />
              <StepDot n={2} active />
              <StepDot n={3} />
            </div>
            <Progress value={38} aria-label="Example progress" />
          </Panel>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="hot">Hot</TabsTrigger>
          <TabsTrigger value="warm">Warm</TabsTrigger>
          <TabsTrigger value="cold">Cold</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <Tabs defaultValue="seq">
            <TabsList variant="line">
              <TabsTrigger value="seq">Sequences</TabsTrigger>
              <TabsTrigger value="camp">Campaigns</TabsTrigger>
              <TabsTrigger value="set">Settings</TabsTrigger>
            </TabsList>
          </Tabs>
        </TabsContent>
      </Tabs>

      <div className="grid gap-3">
        <Callout tone="info" title="Your Pixel is connected">Every visit and sign-up now reaches Meta.</Callout>
        <Callout tone="ok">Saved. Your page is live.</Callout>
        <Callout tone="warn" title="Your AI isn't connected">Connect it in Your AI to write pages and ads.</Callout>
        <Callout tone="error">That link has expired. Ask for a new one.</Callout>
        <Callout tone="tip" title="Penny's tip">Hot leads reply best within the hour.</Callout>
      </div>

      <MoreOptions sub="Tags, custom fields and import.">
        <p className="text-sm text-muted-foreground">Advanced settings live in here, closed by default.</p>
      </MoreOptions>

      <Empty icon={UsersIcon} title="No leads yet" body="Publish your funnel and share your link. Every sign-up lands here, scored hot, warm or cold." action={<Button>Publish your funnel</Button>} />

      <Panel title="Palette" sub="The tokens everything above is built from. Rules in DESIGN_SYSTEM.md.">
        <div className="grid grid-cols-2 gap-3 @2xl/main:grid-cols-4 @4xl/main:grid-cols-6">
          {SWATCHES.map(([v, label]) => (
            <div key={v} className="overflow-hidden rounded-xl ring-1 ring-ink/[0.07] dark:ring-white/10">
              <div className="h-14" style={{ background: `var(${v})` }} />
              <div className="px-3 py-2 text-xs leading-tight">
                <div className="font-semibold">{label}</div>
                <code className="text-muted-foreground">{v}</code>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </AppShell>
  );
}

/** A static copy of Penny's card, so the guide's retint can be reviewed without a workspace. */
function GuideSample() {
  return (
    <>
      <style>{`@media (min-width:1280px){[data-slot="sidebar-inset"]{margin-right:396px!important}}`}</style>
      <aside className="guide-card" aria-label="Penny, your guide (sample)">
        <header className="guide-head">
          <svg viewBox="34 26 128 128" width={42} height={42} className="guide-head-face" aria-hidden dangerouslySetInnerHTML={{ __html: PENNY_WAVE }} />
          <div className="guide-head-text">
            <b>Penny</b>
            <span>Your guide · 4 of 23 done</span>
          </div>
          <span className="guide-icon">
            <ChevronDownIcon />
          </span>
          <span className="guide-icon">
            <PowerIcon />
          </span>
        </header>
        <div className="guide-progress">
          <span style={{ width: "18%" }} />
        </div>
        <div className="guide-body">
          <section className="guide-step">
            <span className="guide-kicker">Step 5 of 23 · Lesson 1.2</span>
            <h3>Publish your funnel</h3>
            <p className="guide-why">It goes online the moment you press it. Nothing is permanent: change anything later and publish again.</p>
            <p className="guide-here">You&apos;re in the right place. Here&apos;s how:</p>
            <ol className="guide-how">
              <li>Open the funnel Penny is pointing at.</li>
              <li>Change the headline, the free guide name and the button.</li>
              <li>Press Publish.</li>
            </ol>
            <span className="guide-go">
              <CrosshairIcon aria-hidden /> Show me where
            </span>
            <div className="guide-row">
              <span className="guide-link">
                <SkipForwardIcon aria-hidden /> Skip this step
              </span>
              <span className="guide-link">
                <RouteIcon aria-hidden /> All steps
              </span>
            </div>
          </section>
          <details className="guide-about" open>
            <summary>About this page: Leads</summary>
            <p>Everyone who signed up, with where they came from and how warm they are.</p>
          </details>
        </div>
      </aside>
    </>
  );
}
