import { ANGLE_HINT, ANGLE_LABEL, adText } from "@/server/ai/adFramework";
import type { ReactNode } from "react";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import {
  ArrowRightIcon,
  CheckIcon,
  CircleAlertIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  GraduationCapIcon,
  ImageIcon,
  MailIcon,
  MegaphoneIcon,
  PaletteIcon,
  PencilIcon,
  RocketIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { aiGenerations } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/server/tenancy";
import { dealFor, getLaunchKit, kitWebsite, termsCheck, trialInOffer, type LaunchKitInput } from "@/server/ai/launchKit";
import { siteBaseUrl } from "@/server/sites";
import { Callout, Flash, IconTile, MoreOptions, NextStep, PageHead, Panel, StepDot } from "@/components/ui";
import { CopyButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { aiRunsFor } from "../ai/runs";
import { OutOfRunsCard, RunsNote } from "../ai/runs-card";
import { buildLaunchKitAction, buildStarterKitAction } from "./actions";
import { DEFAULT_TRIAL_DAYS, TRIAL_CHOICES } from "./deal";
import { KitButtons } from "./kit-buttons";

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

const YOU_GET = ["Your website, ready to publish", "Your free checklist", "3 follow-up emails", "Your Skool About page"];
const trialLabel = (d: number) => (d === 0 ? "No free trial" : `${d}-day free trial`);

export default async function LaunchPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  const { workspace, user } = await requireWorkspace(wid);
  const db = await getDb();
  const [latest] = await db
    .select({ id: aiGenerations.id })
    .from(aiGenerations)
    .where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "launch_kit")))
    .orderBy(desc(aiGenerations.createdAt))
    .limit(1);
  const [result, lastKit, runs] = await Promise.all([
    sp.new ? null : getLaunchKit(wid, sp.kit ?? latest?.id ?? ""),
    latest ? getLaunchKit(wid, latest.id) : null,
    aiRunsFor(workspace),
  ]);

  if (!result) {
    const s = workspace.settings;
    // What they typed (sent back after an error), else their last kit's answers, else what the account knows.
    const last: Partial<LaunchKitInput> = lastKit?.input ?? {};
    const lastDeal = lastKit ? dealFor({ offer: last.offer ?? "", price: last.price, trialDays: last.trialDays }) : trialInOffer(s.offer ?? "");
    const v = (k: keyof LaunchKitInput, fallback = "") => sp[k] ?? (last[k] !== undefined && last[k] !== null ? String(last[k]) : fallback);
    const trialDefault = sp.trialDays ?? String(lastDeal?.days ?? DEFAULT_TRIAL_DAYS);
    // A trial length they saved before that isn't on the menu stays pickable, so a rebuild never changes it quietly.
    const saved = Number(trialDefault);
    const trialChoices: number[] = Number.isInteger(saved) && saved >= 0 && saved <= 90 && !(TRIAL_CHOICES as readonly number[]).includes(saved) ? [saved, ...TRIAL_CHOICES] : [...TRIAL_CHOICES];
    const rebuild = Boolean(lastKit);
    const outOfRuns = runs.kind === "out";
    // Set by the build action when the AI broke: the starter template keeps Day 1 moving.
    const aiFailed = sp.failed === "1";
    return (
      <>
        <PageHead
          lesson="Day 1"
          title="AI launch kit"
          sub="Answer a few questions and AI writes your website, your free checklist, 3 follow-up emails and your Skool About page in about a minute."
          first={rebuild ? "Change any answer, then press Build my launch kit. It rewrites the kit you have; nothing piles up." : "Fill in the four short steps below, then press Build my launch kit."}
          actions={
            rebuild ? (
              <Button variant="outline" asChild>
                <Link href={`/app/w/${wid}/launch`}>Back to my kit</Link>
              </Button>
            ) : null
          }
        />
        <Flash searchParams={sp} />
        <OutOfRunsCard runs={runs} wid={wid} then="come back and press Build my launch kit" />

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
          <form action={buildLaunchKitAction.bind(null, wid)}>
            <Card className="gap-0 py-0">
              <CardContent className="flex flex-col gap-9 py-7 md:px-8 md:py-8">
                <Step n={1} title="About you">
                  <div className="grid gap-5 @2xl/main:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="businessName">Community name</FieldLabel>
                      <Input id="businessName" name="businessName" required minLength={2} maxLength={80} defaultValue={v("businessName", s.businessName ?? workspace.name)} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="ownerName">Your name</FieldLabel>
                      <Input id="ownerName" name="ownerName" required maxLength={60} defaultValue={v("ownerName", user.name)} />
                    </Field>
                  </div>
                </Step>

                <Step n={2} title="Who you help" hint="Unsure? Guess. You can edit every word once it's built.">
                  <div className="grid gap-5 @2xl/main:grid-cols-2">
                    <Field className="@2xl/main:col-span-2">
                      <FieldLabel htmlFor="niche">What do you help with?</FieldLabel>
                      <Input id="niche" name="niche" required minLength={3} maxLength={160} placeholder="Fat loss for busy dads" defaultValue={v("niche", s.niche ?? "")} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="audience">Who is it for?</FieldLabel>
                      <Input id="audience" name="audience" required minLength={3} maxLength={200} placeholder="Dads 30-50 with desk jobs" defaultValue={v("audience", s.audience ?? "")} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="outcome">What result do they want?</FieldLabel>
                      <Input id="outcome" name="outcome" required minLength={3} maxLength={200} placeholder="Lose 10 lbs in 8 weeks without a gym" defaultValue={v("outcome")} />
                    </Field>
                  </div>
                </Step>

                <Step n={3} title="Your free checklist" hint="People get it free on your website in return for their email. It's what your Day 1 ads offer.">
                  <Field>
                    <FieldLabel htmlFor="leadMagnetIdea">
                      Name your free checklist <span className="font-normal text-muted-foreground">(or leave it blank and AI names it)</span>
                    </FieldLabel>
                    <Input id="leadMagnetIdea" name="leadMagnetIdea" maxLength={200} placeholder="The 7-Day Dad Reset" defaultValue={v("leadMagnetIdea")} />
                  </Field>
                </Step>

                <Step n={4} title="Your paid Skool group" hint="Your thank-you page states your price, your free trial and how to cancel, right above the Join button.">
                  <div className="grid gap-5 @2xl/main:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="price">What will you charge a month?</FieldLabel>
                      <Input id="price" name="price" required inputMode="decimal" maxLength={20} pattern=".*[1-9].*" placeholder="$29" className="tabular-nums" defaultValue={sp.price ?? lastDeal?.price ?? ""} />
                      <FieldDescription>The same price you set in Skool, like $29.</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="trialDays">Free trial</FieldLabel>
                      <NativeSelect id="trialDays" name="trialDays" required defaultValue={trialDefault} className="w-full">
                        {trialChoices.map((d) => (
                          <NativeSelectOption key={d} value={String(d)}>
                            {trialLabel(d)}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <FieldDescription>The course uses a 7-day free trial. Match what you switch on in Skool.</FieldDescription>
                    </Field>
                    <Field className="@2xl/main:col-span-2">
                      <FieldLabel htmlFor="skoolUrl">
                        Your Skool group link <span className="font-normal text-muted-foreground">(if you have it yet)</span>
                      </FieldLabel>
                      <Input id="skoolUrl" name="skoolUrl" type="url" maxLength={300} placeholder="https://www.skool.com/your-group/about" defaultValue={sp.skoolUrl ?? s.skoolUrl ?? ""} />
                      <FieldDescription>Every Join button points here. No group yet? Leave it blank and save the link in Settings once your group is open.</FieldDescription>
                    </Field>
                  </div>
                </Step>

                <MoreOptions title="Tone and colour (optional)" sub="Skip it and you get friendly words and our blue." icon={PaletteIcon}>
                  <div className="grid gap-5 @2xl/main:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="tone">Tone</FieldLabel>
                      <NativeSelect id="tone" name="tone" defaultValue={v("tone", "friendly")} className="w-full">
                        <NativeSelectOption value="friendly">Friendly</NativeSelectOption>
                        <NativeSelectOption value="bold">Bold</NativeSelectOption>
                        <NativeSelectOption value="calm">Calm</NativeSelectOption>
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="brandColor">Brand colour</FieldLabel>
                      <Input id="brandColor" name="brandColor" type="color" defaultValue={v("brandColor", "#2A44EE")} className="w-16 cursor-pointer p-1" />
                    </Field>
                  </div>
                </MoreOptions>
              </CardContent>
              <CardFooter className="flex-col items-start gap-3 border-border/80 bg-background/60 py-5 md:px-8 dark:bg-white/[0.02]">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                  <KitButtons starterAction={buildStarterKitAction.bind(null, wid)} rebuild={rebuild} aiDisabled={outOfRuns} offerStarter={outOfRuns || aiFailed} />
                  <RunsNote runs={runs} wid={wid} />
                </div>
                <p className="max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
                  {aiFailed
                    ? "The AI didn't finish. Press Build my launch kit to try again, or use the starter template now and rebuild with AI later. You can edit every word of it."
                    : rebuild
                      ? "Building again rewrites your kit's website (same address) and your 3 emails, so you never end up with two. If your website is live, visitors see the old pages until you press Publish again."
                      : outOfRuns
                        ? "The starter template isn't written by AI. You can edit every word, or build again once your key is in."
                        : "Takes about a minute. If the AI has a hiccup, nothing is built and you can press it again or use the starter template."}
                </p>
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
  const web = await kitWebsite(wid);
  const site = web?.site ?? null;
  const live = site?.published ? siteBaseUrl(site) : null;
  const deal = dealFor({ offer: result.input.offer ?? "", price: result.input.price, trialDays: result.input.trialDays });
  const adsText = kit.ads.map((a, i) => `${a.angle ? ANGLE_LABEL[a.angle].toUpperCase() : `AD ${i + 1}`}\nPrimary text:\n${adText(a)}\n\nHeadline: ${a.headline}\nDescription: ${a.description}`).join("\n\n---\n\n");
  const emailsText = kit.emails.map((e, i) => `EMAIL ${i + 1}: ${e.subject}\n\n${e.body}`).join("\n\n---\n\n");

  return (
    <>
      <PageHead
        lesson="Day 1"
        eyebrow={`Made ${result.createdAt.toDateString()} · ${result.model === "template" ? "starter template" : "written by AI"}`}
        title="Your launch kit"
        sub="Your website is built from this kit. Below: what your thank-you page promises, your free checklist, your Skool About page and your emails."
        actions={
          <Button variant="outline" asChild>
            <Link href={`/app/w/${wid}/launch?new=1`}>
              <RotateCcwIcon data-icon="inline-start" />
              Change answers and rebuild
            </Link>
          </Button>
        }
      />
      <Flash searchParams={sp} />

      {site ? (
        <NextStep
          eyebrow="Up next · Day 1"
          title="Review and publish your website"
          body="Your pages are written. Change three lines (headline, who it's for, button), then press Publish."
          href={`/app/w/${wid}/sites/${site.id}`}
          cta="Review & publish website"
          icon={RocketIcon}
        />
      ) : null}

      <DealPanel wid={wid} deal={deal} siteId={site?.id ?? null} thankYou={web?.thankYou ?? null} />

      <div className="grid gap-6 @3xl/main:grid-cols-2">
        <Panel icon={ClipboardCheckIcon} tone="gold" title="Your free checklist" sub="What people get on your website for their email. Your Day 1 ads offer it by this name.">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-semibold tracking-[-0.012em]">{kit.leadMagnetName}</span>
            <Badge variant="gold">Free checklist</Badge>
          </div>
          <p className="leading-relaxed text-muted-foreground">
            It lives on your website
            {live ? (
              <>
                {" "}
                at{" "}
                <a href={`${live}/guide`} target="_blank" rel="noreferrer" className="break-all">
                  {live}/guide
                </a>
              </>
            ) : (
              " once you publish it"
            )}
            . Your first email sends the link.
          </p>
          <Copy text={kit.leadMagnetContent} />
        </Panel>

        <Panel icon={GraduationCapIcon} title="Your Skool About page" sub="Copy this and paste it into your Skool group's About page, so the page your ads and Join buttons lead to says the same thing.">
          <Copy text={kit.skoolAboutPage} />
        </Panel>
      </div>

      <Panel icon={ImageIcon} tone="success" title="Your ads come from Ad studio" sub="Not from this kit. Today's five ads are made in Ad research and Ad studio, right after your Pixel.">
        <ol className="flex flex-col gap-2.5">
          {[
            <>
              <b className="font-semibold text-foreground">Ad research:</b> paste 3 competitor ads, then press Analyse with AI.
            </>,
            <>
              <b className="font-semibold text-foreground">Ad studio:</b> pick My website and press Make my 5 statics. It already knows your free checklist&apos;s name.
            </>,
          ].map((line, i) => (
            <li key={i} className="flex gap-3 text-muted-foreground">
              <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-[11px] font-semibold text-success tabular-nums">{i + 1}</span>
              <span className="min-w-0 leading-relaxed">{line}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/app/w/${wid}/ads/research`}>
              <SearchIcon data-icon="inline-start" />
              Ad research
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/app/w/${wid}/ads/studio`}>
              Open Ad studio
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </Panel>

      <Panel
        icon={MailIcon}
        tone="success"
        title="Your 3 follow-up emails"
        sub="Every new lead gets these: day 0, day 1 and day 3."
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

      {/* Not part of the week: kept folded as ideas to borrow. */}
      <MoreOptions icon={MegaphoneIcon} title="Spare ad lines from your kit" sub="Pain, Dream and Lesson ideas, each as Hook · Turn · Door. Borrow a line if you like it. Your ads come from Ad studio.">
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
      <MoreOptions icon={ZapIcon} title="Spare hooks" sub="Ten opening lines, for later. Not needed this week.">
        <div className="flex justify-end">
          <CopyButton text={kit.hooks.map((h, i) => `${i + 1}. ${h}`).join("\n")} label="Copy hooks" />
        </div>
        <ol className="flex flex-col divide-y divide-border/80">
          {kit.hooks.map((h, i) => (
            <li key={i} className="flex gap-3 py-3 leading-relaxed first:pt-0 last:pb-0">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-hot-soft text-[11px] font-semibold text-hot tabular-nums">{i + 1}</span>
              <span>{h}</span>
            </li>
          ))}
        </ol>
      </MoreOptions>
    </>
  );
}

/**
 * What the thank-you page tells a visitor before they press Join, read from the page as it is now
 * (edits included): the price, the free trial and how to cancel.
 */
function DealPanel({ wid, deal, siteId, thankYou }: { wid: string; deal: ReturnType<typeof dealFor>; siteId: string | null; thankYou: { id: string; text: string } | null }) {
  const edit = siteId && thankYou ? `/app/w/${wid}/sites/${siteId}/pages/${thankYou.id}` : null;
  if (!deal?.price) {
    return (
      <Callout tone="warn" title="Your thank-you page doesn't know your price yet" action={<Button asChild size="sm"><Link href={`/app/w/${wid}/launch?new=1`}>Add my price and trial</Link></Button>}>
        This kit was built before the price and free trial were asked for. Rebuild it with both, so the page states them and how to cancel.
      </Callout>
    );
  }
  const said = termsCheck(thankYou?.text ?? "", deal);
  const rows: { label: string; value: string; ok: boolean }[] = [
    { label: "Price", value: `${deal.price} a month`, ok: said.price },
    { label: "Free trial", value: deal.days === 0 ? "No free trial" : deal.days ? `${deal.days} days free` : "A free trial", ok: said.trial },
    { label: "How to cancel", value: "In their Skool settings", ok: said.how },
  ];
  const allOk = rows.every((r) => r.ok);
  return (
    <Panel
      icon={FileTextIcon}
      tone={allOk ? "success" : "warning"}
      title={allOk ? "Your thank-you page states the deal" : "Your thank-you page is missing part of the deal"}
      sub={allOk ? "Right above the Join button, in plain words. Keep it there when you edit the page." : "Visitors must see your price, your free trial and how to cancel before they press Join. Add the missing part back."}
      action={
        edit ? (
          <Button asChild variant="outline" size="sm">
            <Link href={edit}>
              <PencilIcon data-icon="inline-start" />
              Edit thank-you page
            </Link>
          </Button>
        ) : null
      }
    >
      <ul className="grid gap-2.5 @2xl/main:grid-cols-3">
        {rows.map((r) => (
          <li key={r.label} className={cn("flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm ring-1 ring-inset", r.ok ? "bg-success-soft/60 ring-success/15" : "bg-warning-soft ring-warning/25")}>
            {r.ok ? <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={3} aria-hidden /> : <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />}
            <span className="grid gap-0.5">
              <span className="font-semibold">{r.label}</span>
              <span className="text-muted-foreground">
                {r.value}
                {r.ok ? "" : " · not on the page"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
