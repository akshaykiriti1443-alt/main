import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { ArrowRightIcon, ExternalLinkIcon, FileTextIcon, GraduationCapIcon, MailCheckIcon, PlusIcon, RocketIcon, SparklesIcon, UsersIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { contacts, pages } from "@/lib/db/schema";
import type { SiteTheme } from "@/lib/db/types";
import { requireWorkspace } from "@/server/tenancy";
import { listSites, siteBaseUrl } from "@/server/sites";
import { PLANS } from "@/server/plans";
import { createSiteAction } from "@/actions/sites";
import { cn } from "@/lib/utils";
import { Flash, IconTile, MoreOptions, NextStep, PageHead } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export const metadata = { title: "Funnels & pages" };

/** What a funnel is, in three tiles. Shown until you have one, so "funnel" stops being jargon. */
function HowAFunnelWorks() {
  const tiles = [
    { icon: FileTextIcon, title: "Opt-in page", body: "Someone clicks your ad and swaps their email for your free guide.", tone: "primary" as const },
    { icon: MailCheckIcon, title: "Thank-you page", body: "They get the guide, plus 3 emails that follow up for you.", tone: "gold" as const },
    { icon: GraduationCapIcon, title: "Your Skool group", body: "One big Join button sends them to your Skool About page.", tone: "success" as const },
  ];
  return (
    <section aria-labelledby="how-funnel" className="flex flex-col gap-4">
      <h2 id="how-funnel" className="eyebrow">
        How a funnel works
      </h2>
      <ol className="grid gap-3 @2xl/main:grid-cols-3 @2xl/main:gap-4">
        {tiles.map((t, i) => (
          <li key={t.title} className="relative flex gap-3.5 rounded-2xl bg-card p-5 shadow-card ring-1 ring-ink/[0.06] @2xl/main:flex-col dark:ring-white/[0.07]">
            <IconTile icon={t.icon} tone={t.tone} className="size-10 rounded-[14px]" />
            <span className="grid gap-1">
              <span className="text-[11.5px] font-semibold tracking-[0.06em] text-subtle-foreground uppercase tabular-nums">Step {i + 1}</span>
              <span className="text-[15px] font-semibold">{t.title}</span>
              <span className="text-sm leading-relaxed text-muted-foreground">{t.body}</span>
            </span>
            {i < tiles.length - 1 ? (
              <ArrowRightIcon
                className="absolute top-1/2 -right-[14px] z-10 hidden size-6 -translate-y-1/2 rounded-full bg-card p-1 text-subtle-foreground shadow-xs ring-1 ring-ink/[0.06] @2xl/main:block dark:ring-white/[0.08]"
                aria-hidden
              />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * A tiny picture of the funnel's opt-in page in its own colours. Funnels carry their own theme,
 * so this stays light (or dark, for the Dark style) whatever the app theme is. Decorative only.
 */
function FunnelThumb({ theme, address, framed }: { theme: SiteTheme; address: string; framed?: boolean }) {
  const filled = theme.style === "bold" || theme.style === "luxe";
  const dark = theme.style === "dark";
  const surface = filled ? "" : dark ? "bg-ink" : theme.style === "editorial" ? "bg-marshmallow" : "bg-white";
  const strong = filled ? "bg-white" : dark ? "bg-white/85" : "bg-ink/75";
  const line = filled ? "bg-white/45" : dark ? "bg-white/15" : "bg-ink/10";
  const brand = { background: theme.brandColor };
  return (
    <div aria-hidden className={cn("overflow-hidden rounded-t-xl shadow-card ring-1 ring-ink/[0.07] dark:ring-white/10", framed && "@2xl/main:rounded-xl")}>
      <div className="flex h-6 items-center gap-1 border-b border-border bg-card px-2.5">
        <span className="size-1.5 rounded-full bg-border-strong" />
        <span className="size-1.5 rounded-full bg-border-strong" />
        <span className="size-1.5 rounded-full bg-border-strong" />
        <span className="ml-2 min-w-0 truncate rounded-full bg-muted px-2 text-[9.5px] leading-4 text-subtle-foreground">{address}</span>
      </div>
      <div className={`relative flex h-[120px] flex-col justify-center gap-2 px-5 ${surface}`} style={filled ? brand : undefined}>
        {/* Luxe pages are a deep velvet of the brand colour, so the thumbnail darkens it to match. */}
        {theme.style === "luxe" ? <div className="pointer-events-none absolute inset-0 bg-black/60" /> : null}
        {filled ? <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_100%_0%,rgb(255_255_255/0.22),transparent_60%)]" /> : null}
        <span className={`relative h-1.5 w-12 rounded-full ${filled ? "bg-white/55" : "opacity-60"}`} style={filled ? undefined : brand} />
        <span className={`relative h-2.5 w-[72%] rounded-full ${strong}`} />
        <span className={`relative h-2.5 w-[52%] rounded-full ${strong}`} />
        <span className={`relative mt-1 h-1.5 w-[62%] rounded-full ${line}`} />
        <span className={`relative mt-1.5 h-5 w-24 rounded-full shadow-xs ${filled ? "bg-white" : ""}`} style={filled ? undefined : brand} />
      </div>
    </div>
  );
}

export default async function SitesPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace } = await requireWorkspace(wid);
  const sites = await listSites(wid);
  const db = await getDb();
  const counts = await db
    .select({
      siteId: pages.siteId,
      pages: sql<number>`count(*)::int`,
    })
    .from(pages)
    .where(eq(pages.workspaceId, wid))
    .groupBy(pages.siteId);
  const leads = await db
    .select({ siteId: contacts.sourceRef, n: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, wid), eq(contacts.source, "landing_page")))
    .groupBy(contacts.sourceRef);
  const limit = PLANS[workspace.plan].maxSites;
  const base = `/app/w/${wid}`;
  const anyLive = sites.some((s) => s.published);
  const firstDraft = sites.find((s) => !s.published);

  const blankFunnel =
    sites.length < limit ? (
      <MoreOptions
        icon={PlusIcon}
        title={sites.length === 0 ? "Rather build it yourself? Start a blank funnel" : "Start a blank funnel"}
        sub="You get an opt-in page and a thank-you page to fill in."
      >
        <form action={createSiteAction.bind(null, wid)} className="flex flex-col gap-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field className="flex-1">
              <FieldLabel htmlFor="name">Funnel name</FieldLabel>
              <Input id="name" name="name" placeholder="Free workout plan funnel" />
            </Field>
            <SubmitButton variant="outline">Create funnel</SubmitButton>
          </div>
          <FieldDescription>Only you see this name. Your plan includes {limit.toLocaleString()} funnels.</FieldDescription>
        </form>
      </MoreOptions>
    ) : null;

  if (sites.length === 0) {
    return (
      <>
        <PageHead
          lesson="Day 1"
          title="Funnels & pages"
          sub="Your funnel is where your ads send people: a page that collects their email, then points them at your Skool group."
          first="Let the AI launch kit build your first funnel. It takes about a minute."
        />
        <Flash searchParams={await searchParams} />
        <NextStep
          eyebrow="Fastest start · Day 1"
          title="Let AI build your whole funnel"
          body="Answer 6 questions. You get a landing page, a free guide, 3 follow-up emails and a thank-you page that points at Skool."
          href={`${base}/launch`}
          cta="Start the AI launch kit"
          icon={SparklesIcon}
        />
        <HowAFunnelWorks />
        {blankFunnel}
      </>
    );
  }

  return (
    <>
      <PageHead
        lesson="Day 1"
        title="Funnels & pages"
        sub="Your funnels: the pages your ads send people to. Open one to edit its pages or publish it."
        first={anyLive ? undefined : "Open your funnel, check the pages, then press Publish."}
        actions={
          <Button variant="outline" asChild>
            <Link href={`${base}/launch?new=1`}>
              <SparklesIcon data-icon="inline-start" />
              Build one with AI
            </Link>
          </Button>
        }
      />
      <Flash searchParams={await searchParams} />

      {!anyLive && firstDraft ? (
        <NextStep
          eyebrow="Up next · Day 1"
          title="Publish your funnel"
          body="Edit three lines, then press the scary button. You can change anything later and publish again."
          href={`${base}/sites/${firstDraft.id}`}
          cta="Open and publish"
          icon={RocketIcon}
        />
      ) : null}

      {/* One funnel gets a wide card (picture beside the details); two or more sit in a grid. */}
      <ul className={cn("grid gap-5", sites.length > 1 && "@2xl/main:grid-cols-2")}>
        {sites.map((s) => {
          const url = siteBaseUrl(s);
          const address = s.customDomain ?? url.replace(/^https?:\/\//, "");
          const pageCount = counts.find((c) => c.siteId === s.id)?.pages ?? 0;
          const leadCount = leads.find((l) => l.siteId === s.id)?.n ?? 0;
          const wide = sites.length === 1;
          return (
            <li key={s.id}>
              <Card className={cn("group/funnel h-full gap-0 py-0 transition-shadow duration-200 hover:shadow-lift", wide && "@2xl/main:flex-row")}>
                <Link
                  href={`${base}/sites/${s.id}`}
                  className={cn("block bg-muted/50 p-4 pb-0 hover:no-underline dark:bg-white/[0.02]", wide && "@2xl/main:flex @2xl/main:w-[46%] @2xl/main:shrink-0 @2xl/main:items-center @2xl/main:p-6")}
                  tabIndex={-1}
                  aria-hidden
                >
                  <div className="w-full translate-y-px transition-transform duration-200 ease-soft group-hover/funnel:-translate-y-0.5">
                    <FunnelThumb theme={s.theme} address={address} framed={wide} />
                  </div>
                </Link>
                <CardContent className={cn("flex flex-1 flex-col gap-4 border-t border-border/80 py-5", wide && "@2xl/main:border-t-0 @2xl/main:border-l @2xl/main:py-6")}>
                  <div className="flex items-start gap-3">
                    <div className="grid min-w-0 flex-1 gap-1">
                      <Link href={`${base}/sites/${s.id}`} className="truncate text-[16px] font-semibold tracking-[-0.011em] text-foreground hover:text-primary hover:no-underline">
                        {s.name}
                      </Link>
                      {s.published ? (
                        <a href={url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                          <span className="truncate">{address}</span>
                          <ExternalLinkIcon className="size-3 shrink-0" aria-label="Opens the live funnel" />
                        </a>
                      ) : (
                        <span className="truncate text-xs text-muted-foreground">Not published yet</span>
                      )}
                    </div>
                    {s.published ? (
                      <Badge variant="success">
                        <span className="size-1.5 rounded-full bg-current" aria-hidden />
                        Live
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                  </div>

                  <dl className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl bg-background/70 px-3.5 py-2.5 ring-1 ring-ink/[0.05] dark:bg-white/[0.02] dark:ring-white/[0.06]">
                      <dt className="text-xs text-muted-foreground">Pages</dt>
                      <dd className="font-display text-[28px] leading-tight tabular-nums">{pageCount}</dd>
                    </div>
                    <div className="rounded-xl bg-background/70 px-3.5 py-2.5 ring-1 ring-ink/[0.05] dark:bg-white/[0.02] dark:ring-white/[0.06]">
                      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                        <UsersIcon className="size-3" aria-hidden /> Leads
                      </dt>
                      <dd className="font-display text-[28px] leading-tight tabular-nums">{leadCount.toLocaleString()}</dd>
                    </div>
                  </dl>

                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <Button asChild variant={s.published ? "outline" : "default"} size="sm">
                      <Link href={`${base}/sites/${s.id}`}>
                        {s.published ? "Open funnel" : "Open and publish"}
                        <ArrowRightIcon data-icon="inline-end" />
                      </Link>
                    </Button>
                    {s.published ? <CopyButton text={url} label="Copy link" /> : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {blankFunnel}
    </>
  );
}
