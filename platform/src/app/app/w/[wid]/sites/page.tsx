import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { ArrowRightIcon, ExternalLinkIcon, FileTextIcon, GlobeIcon, GraduationCapIcon, MailCheckIcon, PlusIcon, RocketIcon, SparklesIcon, UsersIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { contacts, pages } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { listSites, siteBaseUrl } from "@/server/sites";
import { PLANS } from "@/server/plans";
import { createSiteAction } from "@/actions/sites";
import { cn } from "@/lib/utils";
import { Flash, MoreOptions, NextStep, PageHead } from "@/components/ui";
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
    { icon: FileTextIcon, title: "Opt-in page", body: "Someone clicks your ad and swaps their email for your free guide.", tone: "bg-accent text-primary" },
    { icon: MailCheckIcon, title: "Thank-you page", body: "They get the guide, plus 3 emails that follow up for you.", tone: "bg-gold-soft text-gold-foreground" },
    { icon: GraduationCapIcon, title: "Your Skool group", body: "One big Join button sends them to your Skool About page.", tone: "bg-success-soft text-success" },
  ];
  return (
    <section aria-labelledby="how-funnel" className="flex flex-col gap-3">
      <h2 id="how-funnel" className="text-[17px]">
        How a funnel works
      </h2>
      <ol className="grid gap-3 @2xl/main:grid-cols-3">
        {tiles.map((t, i) => (
          <li key={t.title} className="relative flex gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/[0.07] @2xl/main:flex-col">
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", t.tone)}>
              <t.icon className="size-5" aria-hidden />
            </span>
            <span className="grid gap-0.5">
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">Step {i + 1}</span>
              <span className="font-heading font-semibold">{t.title}</span>
              <span className="text-sm text-muted-foreground">{t.body}</span>
            </span>
            {i < tiles.length - 1 ? (
              <ArrowRightIcon className="absolute top-1/2 -right-3 z-10 hidden size-6 -translate-y-1/2 rounded-full bg-background p-1 text-muted-foreground ring-1 ring-foreground/10 @2xl/main:block" aria-hidden />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
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
          lesson="1.3"
          stage="Stage 1"
          title="Funnels & pages"
          sub="Your funnel is where your ads send people: a page that collects their email, then points them at your Skool group."
          first="Let the AI launch kit build your first funnel. It takes about a minute."
        />
        <Flash searchParams={await searchParams} />
        <NextStep
          eyebrow="Fastest start · Lesson 1.2"
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
        lesson="1.3"
        stage="Stage 1"
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
          eyebrow="Up next · Lesson 1.3"
          title="Publish your funnel"
          body="Edit three lines, then press the scary button. You can change anything later and publish again."
          href={`${base}/sites/${firstDraft.id}`}
          cta="Open and publish"
          icon={RocketIcon}
        />
      ) : null}

      <ul className="grid gap-4 @2xl/main:grid-cols-2">
        {sites.map((s) => {
          const url = siteBaseUrl(s);
          const pageCount = counts.find((c) => c.siteId === s.id)?.pages ?? 0;
          const leadCount = leads.find((l) => l.siteId === s.id)?.n ?? 0;
          return (
            <li key={s.id}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", s.published ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>
                      <GlobeIcon className="size-5" aria-hidden />
                    </span>
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <Link href={`${base}/sites/${s.id}`} className="truncate font-heading text-[17px] font-semibold text-foreground hover:text-primary hover:no-underline">
                        {s.name}
                      </Link>
                      {s.published ? (
                        <a href={url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                          <span className="truncate">{s.customDomain ?? url.replace(/^https?:\/\//, "")}</span>
                          <ExternalLinkIcon className="size-3 shrink-0" aria-label="Opens the live funnel" />
                        </a>
                      ) : (
                        <span className="truncate text-xs text-muted-foreground">Not published yet</span>
                      )}
                    </div>
                    {s.published ? (
                      <Badge variant="secondary" className="bg-success-soft text-success">
                        <span className="size-1.5 rounded-full bg-current" aria-hidden />
                        Live
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                  </div>

                  <dl className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-muted/60 px-3 py-2">
                      <dt className="text-xs text-muted-foreground">Pages</dt>
                      <dd className="font-heading text-xl font-bold tabular-nums">{pageCount}</dd>
                    </div>
                    <div className="rounded-xl bg-muted/60 px-3 py-2">
                      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                        <UsersIcon className="size-3" aria-hidden /> Leads
                      </dt>
                      <dd className="font-heading text-xl font-bold tabular-nums">{leadCount.toLocaleString()}</dd>
                    </div>
                  </dl>

                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm">
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
