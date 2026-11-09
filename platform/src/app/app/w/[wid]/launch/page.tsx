import { ANGLE_HINT, ANGLE_LABEL, adText } from "@/server/ai/adFramework";
import type { ReactNode } from "react";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { ArrowRightIcon, CheckIcon, GiftIcon, GraduationCapIcon, ImageIcon, MailIcon, MegaphoneIcon, PaletteIcon, PencilIcon, RocketIcon, RotateCcwIcon, SearchIcon, SparklesIcon, ZapIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { aiGenerations, sites } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { requireWorkspace } from "@/server/tenancy";
import { getLaunchKit } from "@/server/ai/launchKit";
import { siteBaseUrl } from "@/server/sites";
import { launchKitAction } from "@/actions/sites";
import { Callout, Flash, IconTile, MoreOptions, NextStep, PageHead, Panel, StepDot } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export const maxDuration = 300;

/** A block of generated text with its own copy button. */
function Copy({ text, label }: { text: string; label?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        {label ? <span className="text-[11.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{label}</span> : <span />}
        <CopyButton text={text} />
      </div>
      <div className="max-h-96 overflow-y-auto rounded-xl bg-background/70 px-4 py-3.5 text-sm leading-relaxed break-words whitespace-pre-wrap ring-1 ring-ink/[0.06] ring-inset dark:bg-white/[0.02] dark:ring-white/[0.07]">{text}</div>
    </div>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <StepDot n={n} active />
        <div className="grid gap-0.5 pt-[3px]">
          <h2 className="text-[16px] font-semibold tracking-[-0.011em]">{title}</h2>
          {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
      <div className="@2xl/main:pl-10">{children}</div>
    </section>
  );
}

const YOU_GET = ["A live landing page", "A free guide", "3 follow-up emails", "A Skool About page", "10 hooks"];

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
          lesson="1.3"
          stage="Day 1"
          title="AI launch kit"
          sub="Answer a few questions and AI writes your whole starter funnel in about a minute: landing page, free guide, emails and your Skool About page."
          first="Fill in the three short steps below, then press Build my launch kit."
        />
        <Flash searchParams={sp} />
        {!env.aiEnabled ? (
          <Callout tone="info">AI isn&apos;t switched on for this server yet, so you&apos;ll get a smart template. The platform owner adds an Anthropic API key to turn on AI copy.</Callout>
        ) : null}

        {/* What you get, as a strip on narrow pages (the side card shows on wide ones). */}
        <ul className="-mt-2 flex flex-wrap gap-2 @4xl/main:hidden" aria-label="What you get">
          {YOU_GET.map((item) => (
            <li key={item} className="flex items-center gap-1.5 rounded-full bg-card py-1.5 pr-3 pl-2 text-[12.5px] font-medium shadow-xs ring-1 ring-ink/[0.06] dark:ring-white/[0.08]">
              <span className="grid size-4 place-items-center rounded-full bg-success-soft text-success">
                <CheckIcon className="size-2.5" strokeWidth={3.5} aria-hidden />
              </span>
              {item}
            </li>
          ))}
        </ul>

        <div className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_280px]">
          <form action={launchKitAction.bind(null, wid)}>
            <Card className="gap-0 py-0">
              <CardContent className="flex flex-col gap-9 py-7 md:px-8 md:py-8">
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

                <Step n={2} title="Who you help" hint="Unsure? Guess. You can edit every word once it's built.">
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
              <CardFooter className="flex-wrap gap-x-5 gap-y-3 border-border/80 bg-background/60 py-5 md:px-8 dark:bg-white/[0.02]">
                <SubmitButton variant="cta" size="lg" guide="kit-build" pendingText="Writing your kit… (up to a minute)">
                  <SparklesIcon data-icon="inline-start" />
                  Build my launch kit
                </SubmitButton>
                <span className="max-w-[46ch] text-xs leading-relaxed text-muted-foreground">Takes about a minute. Uses 1 AI generation; your plan includes some each month.</span>
              </CardFooter>
            </Card>
          </form>

          <Card size="sm" className="relative hidden @4xl/main:sticky @4xl/main:top-20 @4xl/main:flex">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(80%_100%_at_50%_0%,var(--accent),transparent_75%)] dark:bg-[radial-gradient(80%_100%_at_50%_0%,rgb(118_85_245/0.12),transparent_75%)]" />
            <CardHeader className="relative gap-2">
              <IconTile icon={SparklesIcon} className="size-10 rounded-[14px]" />
              <CardTitle className="mt-1">What you get</CardTitle>
              <CardDescription>All of it, written for you in about a minute.</CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <ul className="flex flex-col gap-3">
                {YOU_GET.map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-[13.5px]">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                      <CheckIcon className="size-3" strokeWidth={3} aria-hidden />
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
        lesson="1.3"
        stage="Day 1"
        eyebrow={`Made ${result.createdAt.toDateString()} · ${result.model === "template" ? "template" : "AI"}`}
        title="Your launch kit"
        sub="Your funnel is built from this kit. Everything below is yours to copy into Skool, your emails or your posts."
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
          eyebrow="Up next · Lesson 1.4"
          title="Review and publish your funnel"
          body="Your pages are written. Change three lines (headline, who it's for, button), then press Publish."
          href={`/app/w/${wid}/sites/${site.id}`}
          cta="Review & publish funnel"
          icon={RocketIcon}
        />
      ) : null}

      <div className="grid gap-6 @3xl/main:grid-cols-2">
        <Panel icon={GiftIcon} tone="gold" title="Your free lead magnet">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{kit.leadMagnetName}</span>
            <Badge variant="gold" className="capitalize">
              {kit.leadMagnetType}
            </Badge>
          </div>
          <p className="leading-relaxed text-muted-foreground">
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
          icon={ImageIcon}
          tone="success"
          title="Your ads come from Ad studio"
          sub="Not from this kit. Tonight's five ads are made in lessons 1.5 and 1.6."
        >
          <ol className="flex flex-col gap-2.5">
            {[
              <>
                <b className="font-semibold text-foreground">Ad research:</b> search your niche, then Analyse with AI.
              </>,
              <>
                <b className="font-semibold text-foreground">Ad studio:</b> press Make my 5 statics, once. Your numbers, five different statics and the exact clicks for Ads Manager.
              </>,
            ].map((line, i) => (
              <li key={i} className="flex gap-3 text-muted-foreground">
                <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-[11px] font-semibold text-success tabular-nums">{i + 1}</span>
                <span className="min-w-0 leading-relaxed">{line}</span>
              </li>
            ))}
          </ol>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/app/w/${wid}/ads/studio`}>
                Open Ad studio
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/app/w/${wid}/ads/research`}>
                <SearchIcon data-icon="inline-start" />
                Ad research
              </Link>
            </Button>
          </div>
        </Panel>
      </div>

      {/* The kit's own ad lines stay as ideas to borrow; Ad studio makes the ads you launch. */}
      <MoreOptions
        icon={MegaphoneIcon}
        title="Spare ad lines from your kit"
        sub="Pain, Dream and Lesson ideas, each as Hook · Turn · Door. Borrow a line if you like it. Your ads come from Ad studio."
      >
        <div className="flex justify-end">
          <CopyButton text={adsText} label="Copy all" />
        </div>
        <div className="grid gap-6 @4xl/main:grid-cols-3">
          {kit.ads.map((a, i) => (
            <div key={i} className="flex min-w-0 flex-col gap-3">
              <Copy label={a.angle ? `${ANGLE_LABEL[a.angle]} · ${ANGLE_HINT[a.angle]}` : `Ad ${i + 1}`} text={adText(a)} />
              <dl className="grid gap-1.5 text-sm">
                <div>
                  <dt className="inline font-semibold">Headline: </dt>
                  <dd className="inline">{a.headline}</dd>
                </div>
                <div className="text-muted-foreground">
                  <dt className="inline font-semibold text-foreground">Description: </dt>
                  <dd className="inline">{a.description}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </MoreOptions>

      <div className="grid gap-6 @3xl/main:grid-cols-2">
        <Panel icon={ZapIcon} tone="hot" title="10 hooks for Reels and ads" action={<CopyButton text={kit.hooks.map((h, i) => `${i + 1}. ${h}`).join("\n")} label="Copy hooks" />}>
          <ol className="flex flex-col divide-y divide-border/80">
            {kit.hooks.map((h, i) => (
              <li key={i} className="flex gap-3 py-3 leading-relaxed first:pt-0 last:pb-0">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-hot-soft text-[11px] font-semibold text-hot tabular-nums">{i + 1}</span>
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
            <div key={i} className="flex min-w-0 flex-col gap-1.5">
              <span className="flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                Email {i + 1}
                <span className="font-medium tracking-normal normal-case text-subtle-foreground">· day {[0, 1, 3][i] ?? i}</span>
              </span>
              <p className="font-semibold">{e.subject}</p>
              <Copy text={e.body} />
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
