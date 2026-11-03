import { ANGLE_HINT, ANGLE_LABEL, adText } from "@/server/ai/adFramework";
import type { ReactNode } from "react";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { CalendarDaysIcon, CheckIcon, GiftIcon, GraduationCapIcon, MailIcon, MegaphoneIcon, PaletteIcon, PencilIcon, RocketIcon, RotateCcwIcon, SparklesIcon, ZapIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { aiGenerations, sites } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { requireWorkspace } from "@/server/tenancy";
import { getLaunchKit } from "@/server/ai/launchKit";
import { siteBaseUrl } from "@/server/sites";
import { launchKitAction } from "@/actions/sites";
import { Callout, Flash, MoreOptions, NextStep, PageHead, Panel, StepDot } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const maxDuration = 300;

/** A block of generated text with its own copy button. */
function Copy({ text, label }: { text: string; label?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {label ? <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span> : <span />}
        <CopyButton text={text} />
      </div>
      <div className="max-h-96 overflow-y-auto rounded-lg border bg-muted/50 px-3.5 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap">{text}</div>
    </div>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <StepDot n={n} active />
        <div className="grid gap-0.5 pt-0.5">
          <h2 className="text-base">{title}</h2>
          {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
      <div className="@2xl/main:pl-10">{children}</div>
    </section>
  );
}

const YOU_GET = ["A live landing page", "A free guide", "3 follow-up emails", "Ad copy", "10 hooks", "A Skool About page", "A 7-day ad plan"];

export default async function LaunchPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  const { workspace, user } = await requireWorkspace(wid);
  const db = await getDb();
  const kitId =
    sp.kit ??
    (sp.new
      ? undefined
      : (
          await db
            .select({ id: aiGenerations.id })
            .from(aiGenerations)
            .where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "launch_kit")))
            .orderBy(desc(aiGenerations.createdAt))
            .limit(1)
        )[0]?.id);
  const result = kitId ? await getLaunchKit(wid, kitId) : null;

  if (!result) {
    const s = workspace.settings;
    return (
      <>
        <PageHead
          lesson="1.2"
          stage="Stage 1"
          title="AI launch kit"
          sub="Answer a few questions and AI writes your whole starter funnel in about a minute: landing page, free guide, emails, ads and your Skool About page."
          first="Fill in the three short steps below, then press Build my launch kit."
        />
        <Flash searchParams={sp} />
        {!env.aiEnabled ? (
          <Callout tone="info">AI isn&apos;t switched on for this server yet, so you&apos;ll get a smart template. The platform owner adds an Anthropic API key to turn on AI copy.</Callout>
        ) : null}

        {/* What you get, as a strip on narrow pages (the side card shows on wide ones). */}
        <ul className="flex flex-wrap gap-2 @4xl/main:hidden" aria-label="What you get">
          {YOU_GET.map((item) => (
            <li key={item} className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-medium shadow-card ring-1 ring-foreground/[0.06]">
              <CheckIcon className="size-3.5 text-success" strokeWidth={3} aria-hidden />
              {item}
            </li>
          ))}
        </ul>

        <div className="grid items-start gap-5 @4xl/main:grid-cols-[minmax(0,1fr)_280px]">
          <form action={launchKitAction.bind(null, wid)}>
            <Card>
              <CardContent className="flex flex-col gap-8">
                <Step n={1} title="About you">
                  <div className="grid gap-5 @2xl/main:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="businessName">Community name</FieldLabel>
                      <Input id="businessName" name="businessName" required minLength={2} defaultValue={s.businessName ?? workspace.name} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="ownerName">Your name</FieldLabel>
                      <Input id="ownerName" name="ownerName" required defaultValue={user.name} />
                    </Field>
                  </div>
                </Step>

                <Step n={2} title="Who you help" hint="Your one sentence from lesson 1.1 covers most of this.">
                  <div className="grid gap-5 @2xl/main:grid-cols-2">
                    <Field className="@2xl/main:col-span-2">
                      <FieldLabel htmlFor="niche">What do you help with?</FieldLabel>
                      <Input id="niche" name="niche" required minLength={3} placeholder="Fat loss for busy dads" defaultValue={s.niche ?? ""} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="audience">Who is it for?</FieldLabel>
                      <Input id="audience" name="audience" required minLength={3} placeholder="Dads 30-50 with desk jobs" defaultValue={s.audience ?? ""} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="outcome">What result do they want?</FieldLabel>
                      <Input id="outcome" name="outcome" required minLength={3} placeholder="Lose 10 lbs in 8 weeks without a gym" />
                    </Field>
                  </div>
                </Step>

                <Step n={3} title="Your Skool group link" hint="Every Join button in your funnel points here.">
                  <Field>
                    <FieldLabel htmlFor="skoolUrl" className="sr-only">
                      Your Skool group link
                    </FieldLabel>
                    <Input id="skoolUrl" name="skoolUrl" type="url" placeholder="https://www.skool.com/your-group/about" defaultValue={s.skoolUrl ?? ""} />
                  </Field>
                </Step>

                <MoreOptions title="Make it yours (optional)" sub="Your free guide idea, your paid offer, tone and brand colour. Skip it and AI picks for you." icon={PaletteIcon}>
                  <div className="grid gap-5 @2xl/main:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="leadMagnetIdea">
                        Free lead magnet idea <span className="font-normal text-muted-foreground">(optional)</span>
                      </FieldLabel>
                      <Input id="leadMagnetIdea" name="leadMagnetIdea" placeholder="Leave blank and AI picks one" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="offer">
                        Your paid offer <span className="font-normal text-muted-foreground">(optional)</span>
                      </FieldLabel>
                      <Input id="offer" name="offer" placeholder="$9/month Skool group with a 7-day free trial" defaultValue={s.offer ?? ""} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="tone">Tone</FieldLabel>
                      <NativeSelect id="tone" name="tone" defaultValue="friendly" className="w-full">
                        <NativeSelectOption value="friendly">Friendly</NativeSelectOption>
                        <NativeSelectOption value="bold">Bold</NativeSelectOption>
                        <NativeSelectOption value="calm">Calm</NativeSelectOption>
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="brandColor">Brand color</FieldLabel>
                      <Input id="brandColor" name="brandColor" type="color" defaultValue="#2A44EE" className="w-16 cursor-pointer p-1" />
                    </Field>
                  </div>
                </MoreOptions>
              </CardContent>
              <CardFooter className="flex-wrap gap-x-4 gap-y-3">
                <SubmitButton size="lg" guide="kit-build" pendingText="Writing your kit… (up to a minute)">
                  <SparklesIcon data-icon="inline-start" />
                  Build my launch kit
                </SubmitButton>
                <span className="text-xs text-muted-foreground">Takes about a minute. Uses 1 AI generation; your plan includes some each month.</span>
              </CardFooter>
            </Card>
          </form>

          <Card size="sm" className="hidden @4xl/main:sticky @4xl/main:top-20 @4xl/main:flex">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SparklesIcon className="size-4 text-primary" aria-hidden />
                What you get
              </CardTitle>
              <CardDescription>In about a minute.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2.5">
                {YOU_GET.map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                      <CheckIcon className="size-3" strokeWidth={3} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const { kit } = result;
  const [site] = await db.select().from(sites).where(eq(sites.workspaceId, wid)).orderBy(desc(sites.createdAt)).limit(1);
  const live = site ? siteBaseUrl(site) : null;
  const adsText = kit.ads.map((a, i) => `${a.angle ? ANGLE_LABEL[a.angle].toUpperCase() : `AD ${i + 1}`}\nPrimary text:\n${adText(a)}\n\nHeadline: ${a.headline}\nDescription: ${a.description}`).join("\n\n---\n\n");
  const emailsText = kit.emails.map((e, i) => `EMAIL ${i + 1}: ${e.subject}\n\n${e.body}`).join("\n\n---\n\n");

  return (
    <>
      <PageHead
        lesson="1.2"
        stage="Stage 1"
        eyebrow={`Made ${result.createdAt.toDateString()} · ${result.model === "template" ? "template" : "AI"}`}
        title="Your launch kit"
        sub="Your funnel is built from this kit. Everything below is yours to copy into Meta Ads Manager, Instagram or Skool."
        actions={
          <Button variant="outline" asChild>
            <Link href={`/app/w/${wid}/launch?new=1`}>
              <RotateCcwIcon data-icon="inline-start" />
              Make another kit
            </Link>
          </Button>
        }
      />
      <Flash searchParams={sp} />

      {site ? (
        <NextStep
          eyebrow="Up next · Lesson 1.3"
          title="Review and publish your funnel"
          body="Your pages are written. Change three lines (headline, free guide name, button), then press Publish."
          href={`/app/w/${wid}/sites/${site.id}`}
          cta="Review & publish funnel"
          icon={RocketIcon}
        />
      ) : null}

      <div className="grid gap-5 @3xl/main:grid-cols-2">
        <Panel icon={GiftIcon} tone="gold" title="Your free lead magnet">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{kit.leadMagnetName}</span>
            <Badge variant="secondary">{kit.leadMagnetType}</Badge>
          </div>
          <p className="text-muted-foreground">
            It&apos;s hosted for you on your funnel
            {live ? (
              <>
                {" "}
                at{" "}
                <a href={`${live}/guide`} target="_blank" rel="noreferrer" className="break-all">
                  {live}/guide
                </a>
              </>
            ) : null}
            . Your first email sends the link.
          </p>
          <Copy text={kit.leadMagnetContent} />
        </Panel>

        <Panel
          icon={CalendarDaysIcon}
          tone="success"
          title="Your 7-day ad plan"
          sub={
            <>
              Start at <span className="font-medium text-foreground hover:text-primary">${kit.adPlan.dailyBudgetUsd}/day</span>. Audience: {kit.adPlan.audience}
            </>
          }
        >
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Objective</TableHead>
                  <TableHead className="text-right">$/day</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kit.adPlan.campaigns.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.why}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.objective}</TableCell>
                    <TableCell className="text-right tabular-nums">${c.budgetUsd}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground marker:text-foreground">
            {kit.adPlan.firstWeek.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ol>
        </Panel>
      </div>

      <Panel icon={MegaphoneIcon} title="Your 3-Pack" sub="Pain, Dream and Lesson. Each one is Hook · Turn · Door, pointed at your Skool link. Launch all three, then fix one part at a time in Ad review." action={<CopyButton text={adsText} label="Copy all ads" />}>
        <div className="grid gap-6 @4xl/main:grid-cols-3">
          {kit.ads.map((a, i) => (
            <div key={i} className="flex min-w-0 flex-col gap-2.5">
              <Copy label={a.angle ? `${ANGLE_LABEL[a.angle]} · ${ANGLE_HINT[a.angle]}` : `Ad ${i + 1}`} text={adText(a)} />
              <p>
                <span className="font-medium">Headline:</span> {a.headline}
              </p>
              <p className="text-muted-foreground">
                <span className="font-medium">Description:</span> {a.description}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-5 @3xl/main:grid-cols-2">
        <Panel icon={ZapIcon} tone="hot" title="10 hooks for Reels and ads" action={<CopyButton text={kit.hooks.map((h, i) => `${i + 1}. ${h}`).join("\n")} label="Copy hooks" />}>
          <ol className="flex flex-col divide-y">
            {kit.hooks.map((h, i) => (
              <li key={i} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground tabular-nums">{i + 1}</span>
                <span>{h}</span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel icon={GraduationCapIcon} title="Skool About page">
          <Copy text={kit.skoolAboutPage} />
        </Panel>
      </div>

      <Panel
        icon={MailIcon}
        tone="success"
        title="Your 3 follow-up emails"
        sub="These already run for every new lead: day 0, day 1 and day 3."
        action={
          <>
            <CopyButton text={emailsText} label="Copy emails" />
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/app/w/${wid}/emails`}>
                <PencilIcon data-icon="inline-start" />
                Edit in Emails
              </Link>
            </Button>
          </>
        }
      >
        <div className="grid gap-6 @4xl/main:grid-cols-3">
          {kit.emails.map((e, i) => (
            <div key={i} className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Email {i + 1}</span>
              <p className="font-medium">{e.subject}</p>
              <Copy text={e.body} />
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
