import Link from "next/link";
import { CheckCircle2Icon, CircleIcon, LinkIcon, MousePointerClickIcon, TargetIcon, TrendingUpIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { computeLadder, latestCheckins, LEVELS, requirementLines, skoolLinkFor, skoolTargetFor, skoolVisits } from "@/server/growth";
import { skoolMemberCounts } from "@/server/skool";
import { saveCheckinAction } from "@/actions/growth";
import { relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Callout, Flash, PageHead, Panel, Stat } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BoostCalculator, BudgetPlanner } from "./calculators";

export const metadata = { title: "Growth ladder" };

export default async function GrowthPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace } = await requireWorkspace(wid);
  const base = `/app/w/${wid}`;
  const [checkins, visits, target, counts] = await Promise.all([
    latestCheckins(wid, 8),
    skoolVisits(wid, 30),
    skoolTargetFor(wid, workspace.settings.skoolUrl),
    skoolMemberCounts(wid),
  ]);
  const last = checkins[0] ?? null;
  const ladder = computeLadder(last);
  const link = skoolLinkFor(workspace.slug);
  const stale = !last || Date.now() - last.createdAt.getTime() > 8 * 86_400_000;

  return (
    <>
      <PageHead
        eyebrow="Skool growth"
        title="Growth ladder"
        sub="Skool advertises communities that climb its levels: custom ads at Level 2, a dedicated campaign at Level 3, a partnership campaign with video ads at Level 4. Skool decides the spend, and it isn't guaranteed. Every requirement is the last 30 days."
      />
      <Flash searchParams={await searchParams} />

      {/* The ladder */}
      <ol className="grid gap-3 md:grid-cols-4">
        {LEVELS.map((l) => {
          const reached = ladder.qualifies >= l.level;
          const isNext = ladder.next?.level === l.level;
          return (
            <li key={l.level} className={cn("flex flex-col gap-1.5 rounded-xl border bg-card p-4", reached && "border-success/40 bg-success-soft", isNext && "border-primary ring-2 ring-primary/20")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Level {l.level}</span>
                {reached ? <CheckCircle2Icon className="size-4 text-success" /> : isNext ? <TargetIcon className="size-4 text-primary" /> : <CircleIcon className="size-4 text-muted-foreground/50" />}
              </div>
              <span className="font-semibold">{l.name}</span>
              <span className="text-sm">{l.reward}</span>
              <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                {l.level === 1 ? <li>Cover, description, About page, 1 post, invited members</li> : requirementLines(l.req).map((r) => <li key={r}>{r}</li>)}
              </ul>
            </li>
          );
        })}
      </ol>

      {stale ? (
        <Callout tone="info" title={last ? `Your last check-in was ${relativeTime(last.createdAt)}` : "Do your first check-in"}>
          Open Skool › your group › Settings › Growth. Copy 4 numbers into the check-in below. It takes 2 minutes, every Monday.
        </Callout>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Panel title={ladder.next ? `What's between you and Level ${ladder.next.level}` : "You're at the top"} sub={ladder.next?.reward}>
          {ladder.gaps.length ? (
            <ul className="flex flex-col gap-3">
              {ladder.gaps.map((g) => (
                <li key={g.label} className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-2 text-sm">
                    <span>{g.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {g.toggle ? (g.done ? "Done" : "Not yet") : `${g.have.toLocaleString()} / ${g.need.toLocaleString()}`}
                    </span>
                  </div>
                  <Progress value={Math.min(100, g.need ? (g.have / g.need) * 100 : 100)} className={cn("h-2", g.done && "[&>[data-slot=progress-indicator]]:bg-success")} />
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Your next moves</span>
            <ul className="flex flex-col gap-2 text-sm">
              {ladder.moves.map((m) => (
                <li key={m} className="flex gap-2.5">
                  <TrendingUpIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>
          {last && last.skoolLevel !== ladder.qualifies ? (
            <Callout tone="info">
              Skool shows Level {last.skoolLevel}; your numbers point to Level {ladder.qualifies}. Skool reviews levels on its side and needs 2–4 weeks of data for a new group, so a short lag is normal.
            </Callout>
          ) : null}
        </Panel>

        <Panel title="Your Skool link" sub="Point your ads here, not straight at Skool. It sends visitors to your About page instantly, counts every click by source, and tells Meta about each visit (ViewContent), so your ads learn who actually lands.">
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
            <Callout tone="warn">
              Add your Skool group link in <Link href={`${base}/settings#business`}>Settings</Link> to turn on your Skool link.
            </Callout>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={MousePointerClickIcon} label="Clicks, 30 days" value={visits.total.toLocaleString()} />
            <Stat icon={LinkIcon} label="Top source" value={visits.bySource[0]?.source ?? "—"} hint={visits.bySource[0] ? `${visits.bySource[0].count} clicks` : undefined} />
          </div>
          {visits.bySource.length > 1 ? (
            <ul className="flex flex-wrap gap-2 text-xs">
              {visits.bySource.slice(0, 8).map((s) => (
                <li key={s.source} className="rounded-full border px-2 py-1">
                  {s.source} · {s.count}
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

      <form action={saveCheckinAction.bind(null, wid)}>
        <Panel title="Monday check-in" sub="From Skool › Settings › Growth (last 30 days). Your history below shows the trend." action={<SubmitButton size="sm" pendingText="Saving…">Save check-in</SubmitButton>}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="aboutVisitors">About-page visitors</FieldLabel>
              <Input id="aboutVisitors" name="aboutVisitors" inputMode="numeric" defaultValue={last?.aboutVisitors ?? ""} placeholder="0" />
            </Field>
            <Field>
              <FieldLabel htmlFor="newPaid">New customers</FieldLabel>
              <Input id="newPaid" name="newPaid" inputMode="numeric" defaultValue={last?.newPaid ?? ""} placeholder="0" />
            </Field>
            <Field>
              <FieldLabel htmlFor="networkSignups">Skool Network sign-ups</FieldLabel>
              <Input id="networkSignups" name="networkSignups" inputMode="numeric" defaultValue={last?.networkSignups ?? ""} placeholder="0" />
            </Field>
            <Field>
              <FieldLabel htmlFor="skoolLevel">Level Skool shows</FieldLabel>
              <NativeSelect id="skoolLevel" name="skoolLevel" defaultValue={String(last?.skoolLevel ?? 1)}>
                {[1, 2, 3, 4].map((n) => (
                  <NativeSelectOption key={n} value={String(n)}>Level {n}</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="members">Total members</FieldLabel>
              <Input id="members" name="members" inputMode="numeric" defaultValue={last?.members ?? (counts.members + counts.trials || "")} placeholder="0" />
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
          <Label className="flex items-center gap-2 text-sm font-normal">
            <input type="checkbox" name="linkInBio" defaultChecked={last?.linkInBio ?? false} />
            My skool.com link is in my Instagram, TikTok and YouTube bios.
          </Label>
          <Field>
            <FieldLabel htmlFor="note">Note to self</FieldLabel>
            <Input id="note" name="note" placeholder="What I changed this week" />
          </Field>
          <SubmitButton className="self-start" pendingText="Saving…">
            Save check-in
          </SubmitButton>
        </Panel>
      </form>

      <Panel title="Budget planner" sub="How many About-page visitors your budget buys, and which level's visitor bar it clears.">
        <BudgetPlanner initialBudget={last?.adSpendPerDay ?? 10} initialOrganic={0} initialPrice={workspace.settings.skoolMemberPrice ?? 29} />
      </Panel>

      <Panel title="If Skool spends on you" sub="Skool decides what it spends on your ads, and it isn't guaranteed. Plug in what Skool actually spends and see what you keep.">
        <BoostCalculator initialBoost={last?.boostPercent ?? 30} />
      </Panel>

      {checkins.length > 1 ? (
        <Panel title="History">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Visitors</TableHead>
                <TableHead className="text-right">New paid</TableHead>
                <TableHead className="text-right">Network</TableHead>
                <TableHead className="text-right">Skool level</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checkins.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.createdAt.toDateString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.aboutVisitors.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.newPaid}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.networkSignups}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.skoolLevel}</TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">{c.note}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      ) : null}
    </>
  );
}
