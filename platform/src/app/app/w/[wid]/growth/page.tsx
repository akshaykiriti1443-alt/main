import Link from "next/link";
import {
  CalculatorIcon,
  CalendarCheckIcon,
  CheckIcon,
  CoinsIcon,
  HistoryIcon,
  LinkIcon,
  MousePointerClickIcon,
  SettingsIcon,
  TargetIcon,
  TrendingUpIcon,
} from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { computeLadder, isAdSource, latestCheckins, LEVELS, requirementLines, skoolLinkFor, skoolTargetFor, skoolVisits } from "@/server/growth";
import { launchDay } from "@/server/path";
import { saveCheckinAction } from "@/actions/growth";
import { relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Callout, Flash, MoreOptions, PageHead, Panel, StepDot } from "@/components/ui";
import { EdgeTable } from "@/components/crm-ui";
import { Badge } from "@/components/ui/badge";
import { CopyButton, SubmitButton } from "@/components/client";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BoostCalculator, BudgetPlanner } from "./calculators";

export const metadata = { title: "Growth ladder" };

/** A flat number tile for inside a panel (a Stat card in a card gets heavy). */
function MiniStat({ icon: Icon, label, value, hint }: { icon: typeof LinkIcon; label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl bg-muted/50 px-4 py-3.5 ring-1 ring-ink/[0.03] ring-inset dark:ring-white/[0.04]">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="truncate font-display text-[30px] leading-none tracking-[-0.01em] tabular-nums">{value}</dd>
      {hint ? <dd className="text-xs text-subtle-foreground">{hint}</dd> : null}
    </div>
  );
}

export default async function GrowthPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace } = await requireWorkspace(wid);
  const base = `/app/w/${wid}`;
  const [checkins, visits, target] = await Promise.all([
    latestCheckins(wid, 8),
    skoolVisits(wid, 30),
    skoolTargetFor(wid, workspace.settings.skoolUrl),
  ]);
  const last = checkins[0] ?? null;
  const ladder = computeLadder(last);
  const link = skoolLinkFor(workspace.slug);
  const stale = !last || Date.now() - last.createdAt.getTime() > 8 * 86_400_000;
  // The first check-in is Day 7. Before that, members come here for the Skool link.
  const beforeFirstCheckin = !last && launchDay(workspace.createdAt) < 7;
  const checkinFirst = stale && !beforeFirstCheckin;

  const checkin = (
    <form action={saveCheckinAction.bind(null, wid)} data-guide="checkin" className="scroll-mt-20" id="checkin">
      <Panel
        icon={CalendarCheckIcon}
        title="Monday check-in"
        sub={
          <>
            Two minutes, once a week. In Skool, open your group › <b className="font-semibold text-foreground">Settings › Growth</b> and copy these numbers (they cover the last 30 days).
            {last ? ` Last one: ${relativeTime(last.createdAt)}.` : ""}
          </>
        }
        className={cn(stale && "ring-violet-200/90 dark:ring-violet-400/20")}
      >
        <div className="grid grid-cols-2 items-end gap-4 @2xl/main:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="aboutVisitors">About-page visitors</FieldLabel>
            <Input id="aboutVisitors" name="aboutVisitors" inputMode="numeric" defaultValue={last?.aboutVisitors ?? ""} placeholder="0" className="tabular-nums" />
          </Field>
          <Field>
            <FieldLabel htmlFor="newPaid">New customers</FieldLabel>
            <Input id="newPaid" name="newPaid" inputMode="numeric" defaultValue={last?.newPaid ?? ""} placeholder="0" className="tabular-nums" />
          </Field>
          <Field>
            <FieldLabel htmlFor="networkSignups">Skool Network sign-ups</FieldLabel>
            <Input id="networkSignups" name="networkSignups" inputMode="numeric" defaultValue={last?.networkSignups ?? ""} placeholder="0" className="tabular-nums" />
          </Field>
          <Field>
            <FieldLabel htmlFor="skoolLevel">Level Skool shows</FieldLabel>
            <NativeSelect id="skoolLevel" name="skoolLevel" defaultValue={String(last?.skoolLevel ?? 1)}>
              {[1, 2, 3, 4].map((n) => (
                <NativeSelectOption key={n} value={String(n)}>
                  Level {n}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Label className="flex cursor-pointer items-start gap-3 rounded-xl bg-muted/50 px-4 py-3 text-sm font-normal ring-1 ring-ink/[0.03] ring-inset dark:ring-white/[0.04]">
          <input type="checkbox" name="linkInBio" defaultChecked={last?.linkInBio ?? false} className="mt-0.5" />
          <span>
            A link to my group is in my bio (Instagram, TikTok or YouTube). <span className="text-muted-foreground">(Level 3 checks this.)</span>
          </span>
        </Label>
        <MoreOptions title="A few extra numbers" sub="Optional. They sharpen your next moves and the planner below.">
          <div className="grid grid-cols-2 items-start gap-4 @2xl/main:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="members">Total members</FieldLabel>
              <Input id="members" name="members" inputMode="numeric" defaultValue={last?.members ?? ""} placeholder="0" />
            </Field>
            <Field>
              <FieldLabel htmlFor="adSpendPerDay">Your ad spend / day ($)</FieldLabel>
              <Input id="adSpendPerDay" name="adSpendPerDay" inputMode="numeric" defaultValue={last?.adSpendPerDay ?? ""} placeholder="10" />
            </Field>
            <Field>
              <FieldLabel htmlFor="postsPerWeek">Organic posts / week</FieldLabel>
              <Input id="postsPerWeek" name="postsPerWeek" inputMode="numeric" defaultValue={last?.postsPerWeek ?? ""} placeholder="5" />
            </Field>
            <Field>
              <FieldLabel htmlFor="boostPercent">Growth Boost %</FieldLabel>
              <Input id="boostPercent" name="boostPercent" inputMode="numeric" defaultValue={last?.boostPercent ?? 30} />
              <FieldDescription>Settings › Discovery.</FieldDescription>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="note">Note to self</FieldLabel>
            <Input id="note" name="note" placeholder="What I changed this week" />
          </Field>
        </MoreOptions>
        <div className="flex flex-wrap items-center gap-3 border-t border-border/80 pt-5">
          <SubmitButton variant={stale ? "cta" : "default"} size="lg" pendingText="Saving…">
            <CheckIcon data-icon="inline-start" />
            Save check-in
          </SubmitButton>
          <span className="text-xs text-muted-foreground">Same time next Monday. Boring on purpose.</span>
        </div>
      </Panel>
    </form>
  );

  return (
    <>
      <PageHead
        lesson="Day 7"
        eyebrow="Get members"
        title="Growth ladder"
        sub="Skool runs ads for communities that climb its levels. See which rung you're on and exactly what gets you to the next one."
        first={beforeFirstCheckin ? "Your first check-in is Day 7. Today you only need the Your Skool link panel below." : stale ? "Do your Monday check-in: copy 4 numbers from Skool › Settings › Growth into the form below." : undefined}
      />
      <Flash searchParams={await searchParams} />

      {/* The ladder itself: four rungs, the one you're climbing to is lit up. */}
      <section aria-label="Skool's growth levels" className="flex flex-col gap-3">
        <ol className="grid gap-3 @xl/main:grid-cols-2 @4xl/main:grid-cols-4">
          {LEVELS.map((l) => {
            const reached = ladder.qualifies >= l.level;
            const here = ladder.qualifies === l.level;
            const isNext = ladder.next?.level === l.level;
            return (
              <li
                key={l.level}
                className={cn(
                  "relative flex flex-col gap-2.5 overflow-hidden rounded-2xl bg-card p-5 shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]",
                  reached && "bg-success-soft ring-success/20 dark:bg-success-soft",
                  isNext && "shadow-lift ring-2 ring-primary dark:ring-violet-400",
                )}
              >
                {isNext ? <span aria-hidden className="pointer-events-none absolute -top-14 -right-12 size-36 rounded-full bg-[radial-gradient(closest-side,var(--accent-strong),transparent)]" /> : null}
                <div className="relative flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "grid size-9 place-items-center rounded-xl text-[15px] font-semibold tabular-nums",
                      reached ? "bg-success text-white dark:text-background" : isNext ? "bg-primary text-primary-foreground shadow-press" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {reached ? <CheckIcon className="size-5" strokeWidth={3} aria-hidden /> : l.level}
                  </span>
                  {here ? (
                    <Badge variant="success" className="bg-success text-white dark:text-background">
                      You&apos;re here
                    </Badge>
                  ) : isNext ? (
                    <Badge>
                      <TargetIcon data-icon="inline-start" /> Next rung
                    </Badge>
                  ) : (
                    <span className="text-[11px] font-semibold tracking-[0.08em] text-subtle-foreground uppercase">Level {l.level}</span>
                  )}
                </div>
                <span className="relative text-[16.5px] leading-tight font-semibold tracking-[-0.012em]">
                  <span className="sr-only">Level {l.level}: </span>
                  {l.name}
                </span>
                {/* On a phone only the rung you're climbing to keeps its details, so the check-in isn't miles down. */}
                <span className={cn("relative text-sm leading-relaxed text-muted-foreground", !isNext && "hidden @xl/main:block")}>{l.reward}</span>
                <ul className={cn("relative mt-auto flex-col gap-1.5 border-t border-border/80 pt-3 text-xs leading-snug", reached && "border-success/15", isNext ? "flex" : "hidden @xl/main:flex")}>
                  {(l.level === 1 ? ["Cover, description, About page, 1 post, invited members"] : requirementLines(l.req)).map((r) => (
                    <li key={r} className="flex gap-1.5">
                      <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", reached ? "bg-success" : isNext ? "bg-primary/60" : "bg-border-strong")} aria-hidden />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-subtle-foreground">Skool decides the spend, and it isn&apos;t guaranteed. Every requirement counts the last 30 days, so it&apos;s a pace, not a pile.</p>
      </section>

      {checkinFirst ? checkin : null}

      <div className="grid items-start gap-6 @4xl/main:grid-cols-[1.15fr_1fr]">
        <Panel icon={TrendingUpIcon} tone="success" title={ladder.next ? `What's between you and Level ${ladder.next.level}` : "You're at the top"} sub={ladder.next?.reward}>
          {ladder.gaps.length ? (
            <ul className="flex flex-col gap-3.5">
              {ladder.gaps.map((g) => (
                <li key={g.label} className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-medium">{g.label}</span>
                    <span className={cn("text-[13px] tabular-nums", g.done ? "font-semibold text-success" : "text-muted-foreground")}>
                      {g.toggle ? (g.done ? "Done" : "Not yet") : `${g.have.toLocaleString()} / ${g.need.toLocaleString()}`}
                    </span>
                  </div>
                  <Progress value={Math.min(100, g.need ? (g.have / g.need) * 100 : 100)} className={g.done ? "*:data-[slot=progress-indicator]:bg-success" : undefined} />
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-col gap-3 rounded-xl bg-accent/60 p-4 ring-1 ring-violet-200/60 ring-inset dark:bg-accent/50 dark:ring-white/[0.05]">
            <span className="eyebrow">Your next moves</span>
            <ol className="flex flex-col gap-3 text-sm leading-relaxed">
              {ladder.moves.map((m, i) => (
                <li key={m} className="flex gap-3">
                  <StepDot n={i + 1} active={i === 0} className="size-6 text-[11.5px]" />
                  <span className="pt-0.5">{m}</span>
                </li>
              ))}
            </ol>
          </div>
          {last && last.skoolLevel !== ladder.qualifies ? (
            <Callout tone="info">
              Skool shows Level {last.skoolLevel}; your numbers point to Level {ladder.qualifies}. Skool reviews levels on its side and needs 2–4 weeks of data for a new group, so a short lag is normal.
            </Callout>
          ) : null}
        </Panel>

        <Panel icon={LinkIcon} title="Your Skool link" sub="Point your Skool-link ads here, not straight at Skool. It counts every click by source and tells Meta about each visit, so your ads learn who actually lands.">
          {target ? (
            <>
              <div className="flex items-center gap-2">
                <Input readOnly value={link} className="font-mono text-xs" aria-label="Your Skool link" />
                <CopyButton text={link} />
              </div>
              <p className="text-xs text-muted-foreground">
                Goes to <span className="break-all">{target}</span>. Add <code>?src=ads</code>, <code>?src=youtube</code> and so on to split sources. In your Instagram and TikTok bios, use your plain skool.com link so Skool credits it as organic promotion.
              </p>
            </>
          ) : (
            <Callout
              tone="warn"
              title="Add your Skool group link first"
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href={`${base}/settings#business`}>
                    <SettingsIcon data-icon="inline-start" />
                    Add it in Settings
                  </Link>
                </Button>
              }
            >
              Your Skool link turns on the moment it knows where your group lives.
            </Callout>
          )}
          <dl className="grid grid-cols-2 gap-3">
            <MiniStat icon={MousePointerClickIcon} label="Clicks, 30 days" value={visits.total.toLocaleString()} hint={visits.total ? "Your own test click counts here" : "Meta may still be warming up"} />
            <MiniStat icon={MousePointerClickIcon} label="From ads, 30 days" value={visits.bySource.filter((r) => isAdSource(r.source)).reduce((n, r) => n + r.count, 0).toLocaleString()} hint="Ad clicks only" />
            <MiniStat icon={LinkIcon} label="Top source" value={visits.bySource[0]?.source ?? "—"} hint={visits.bySource[0] ? `${visits.bySource[0].count} clicks` : "Shows once clicks come in"} />
          </dl>
          {visits.bySource.length > 1 ? (
            <ul className="flex flex-wrap gap-2 text-xs">
              {visits.bySource.slice(0, 8).map((s) => (
                <li key={s.source} className="rounded-full border border-border-strong bg-card px-2.5 py-1">
                  {s.source} · <span className="tabular-nums">{s.count}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {!workspace.settings.metaPixelId ? (
            <p className="text-xs text-muted-foreground">
              Connect your pixel in <Link href={`${base}/settings#tracking`}>Settings</Link> to send ViewContent events.
            </p>
          ) : null}
        </Panel>
      </div>

      {checkinFirst ? null : checkin}

      <div className="flex flex-col gap-3">
        <MoreOptions icon={CalculatorIcon} title="Budget planner" sub="How many About-page visitors your budget buys, and which level's visitor bar it clears.">
          <BudgetPlanner initialBudget={last?.adSpendPerDay ?? 10} initialOrganic={0} initialPrice={29} />
        </MoreOptions>
        <MoreOptions icon={CoinsIcon} title="If Skool spends on you" sub="Plug in what Skool actually spends and see what you keep. Skool decides the spend, and it isn't guaranteed.">
          <BoostCalculator initialBoost={last?.boostPercent ?? 30} />
        </MoreOptions>
      </div>

      {checkins.length > 1 ? (
        <Panel icon={HistoryIcon} tone="muted" title="History" sub="Your last few Monday check-ins. Watch the visitor column climb.">
          <EdgeTable>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Visitors</TableHead>
                <TableHead className="text-right">New paid</TableHead>
                <TableHead className="hidden text-right @xl/main:table-cell">Network</TableHead>
                <TableHead className="text-right">Level</TableHead>
                <TableHead className="hidden @2xl/main:table-cell">Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checkins.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.createdAt.toDateString().replace(/^\w+ /, "")}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.aboutVisitors.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.newPaid}</TableCell>
                  <TableCell className="hidden text-right tabular-nums @xl/main:table-cell">{c.networkSignups}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.skoolLevel}</TableCell>
                  <TableCell className="hidden max-w-56 truncate text-muted-foreground @2xl/main:table-cell">{c.note}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </EdgeTable>
        </Panel>
      ) : null}
    </>
  );
}
