import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { ArrowRightIcon, ExternalLinkIcon, FlameIcon, LightbulbIcon, SearchIcon, SparklesIcon, TargetIcon, type LucideIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { aiGenerations } from "@/lib/db/schema";
import { isUuid, relativeTime, truncate } from "@/lib/util";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/server/tenancy";
import { adLibraryConfigured, adLibraryWebUrl, searchAdLibraryFor, type LibraryAd } from "@/server/meta/adLibrary";
import type { AdAnalysis } from "@/server/ai/adResearch";
import { ANGLE_HINT, ANGLE_LABEL, type AdAngle } from "@/server/ai/adFramework";
import { adResearchAction } from "@/actions/adResearch";
import { Callout, Empty, Flash, MoreOptions, PageHead, Panel, StepDot } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { aiRunsFor, needsKey } from "../../ai/runs";
import { OutOfRunsCard, RunsNote } from "../../ai/runs-card";

export const metadata = { title: "Ad research" };
export const maxDuration = 300;

const COUNTRIES: [string, string][] = [
  ["ALL", "All countries"],
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["IN", "India"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["ES", "Spain"],
  ["NL", "Netherlands"],
  ["IE", "Ireland"],
];

/** Each angle to borrow gets its own colour, so the three read as a set (Ad studio uses the same). */
const ANGLE_TONE: Record<AdAngle, { bar: string; chip: string }> = {
  pain: { bar: "bg-hot", chip: "bg-hot-soft text-hot" },
  dream: { bar: "bg-gold", chip: "bg-gold-soft text-gold-foreground" },
  lesson: { bar: "bg-primary", chip: "bg-accent text-accent-foreground" },
  proof: { bar: "bg-success", chip: "bg-success-soft text-success" },
};
const CARD = "rounded-2xl bg-card ring-1 ring-ink/[0.06] shadow-xs dark:ring-white/[0.07]";

export default async function AdResearchPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  const { workspace } = await requireWorkspace(wid);
  const q = (sp.q ?? "").slice(0, 100);
  const pageIdRaw = (sp.pageId ?? "").trim();
  const pageId = /^\d{3,30}$/.test(pageIdRaw) ? pageIdRaw : "";
  const pageIdError = pageIdRaw && !pageId ? "A Page ID is only numbers. Open the competitor's ads in the Ad Library and copy the number after view_all_page_id= in the address bar." : "";
  const country = COUNTRIES.some(([c]) => c === sp.country) ? sp.country : "ALL";
  const configured = adLibraryConfigured();
  const webUrl = adLibraryWebUrl({ q: q || workspace.settings.niche || "", pageId, country });

  let ads: LibraryAd[] = [];
  let searchError = "";
  if (configured && (q || pageId)) {
    try {
      ads = await searchAdLibraryFor(wid, { q, pageIds: pageId ? [pageId] : [], countries: [country] });
    } catch (err) {
      searchError = err instanceof Error ? err.message : "Search failed.";
    }
  }

  const runs = await aiRunsFor(workspace);
  const db = await getDb();
  const [row] = await db
    .select()
    .from(aiGenerations)
    .where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_research"), ...(isUuid(sp.analysis) ? [eq(aiGenerations.id, sp.analysis)] : [])))
    .orderBy(desc(aiGenerations.createdAt))
    .limit(1);
  const analysis = row?.output as unknown as AdAnalysis | undefined;
  const analysisQuery = String((row?.input as { query?: unknown } | undefined)?.query ?? "");
  const searchNow = q || pageId;
  const oldAnalysis = Boolean(analysis && !isUuid(sp.analysis) && searchNow && searchNow !== analysisQuery);
  const showResults = configured && Boolean(q || pageId) && !searchError;
  // The guide points at one "Analyse with AI" button: the search results' one when there are ads, else the paste box's.
  const libraryAnalyse = showResults && ads.length > 0;
  const hidden = (
    <>
      <input type="hidden" name="q" value={q} />
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="country" value={country} />
    </>
  );

  const pasteForm = (
    <form action={adResearchAction.bind(null, wid)} className="flex flex-col gap-4">
      {hidden}
      <input type="hidden" name="source" value="paste" />
      <Field>
        <FieldLabel htmlFor="paste">Competitor ads</FieldLabel>
        <Textarea
          id="paste"
          name="paste"
          rows={7}
          className="min-h-40 rounded-xl font-mono text-[13px] leading-relaxed"
          placeholder={"[62 days] Tired of guessing what to eat? Inside our group…\n\n[14 days] Dads: 20 minutes, 3 times a week…"}
        />
        <FieldDescription>
          Leave a blank line between ads. Know how long one has run? Put it in front, like [45 days]. Not sure? Leave it out. We study the patterns; your own ads are always written fresh, never copied.
        </FieldDescription>
      </Field>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {libraryAnalyse ? (
          <SubmitButton variant="outline" pendingText="Reading the ads…">
            Analyse pasted ads
          </SubmitButton>
        ) : (
          <span data-guide="research-analyse" className="inline-flex rounded-full">
            <SubmitButton variant="cta" size="lg" pendingText="Reading the ads… (up to a minute)">
              <SparklesIcon data-icon="inline-start" />
              Analyse with AI
            </SubmitButton>
          </span>
        )}
        <span className="grid gap-0.5">
          <RunsNote runs={runs} wid={wid} />
          <span className="text-xs text-muted-foreground">{needsKey(runs) ? "Press it now and you get a quick read, not written by AI." : "Three or more ads gives the AI something to work with."}</span>
        </span>
      </div>
    </form>
  );

  // Meta's own search, in a new tab: it works for every country, so it's the main route, with live search as an extra.
  const metaSearch = (
    <form className="grid gap-3 @2xl/main:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)_auto] @2xl/main:items-end" action="https://www.facebook.com/ads/library/" method="get" target="_blank" rel="noreferrer">
      <input type="hidden" name="active_status" value="active" />
      <input type="hidden" name="ad_type" value="all" />
      <input type="hidden" name="media_type" value="all" />
      <input type="hidden" name="search_type" value="keyword_unordered" />
      <Field>
        <FieldLabel htmlFor="metaQ">Keyword from your niche</FieldLabel>
        <Input id="metaQ" name="q" defaultValue={q || workspace.settings.niche || ""} placeholder="e.g. fat loss for dads" />
      </Field>
      <Field>
        <FieldLabel htmlFor="metaCountry">Country</FieldLabel>
        <NativeSelect id="metaCountry" name="country" defaultValue={country} className="w-full">
          {COUNTRIES.map(([c, label]) => (
            <NativeSelectOption key={c} value={c}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Button type="submit" variant="outline">
        Search in Meta Ad Library
        <ExternalLinkIcon data-icon="inline-end" />
      </Button>
    </form>
  );

  return (
    <>
      <PageHead
        lesson="Days 1 and 2"
        eyebrow="Get members"
        title="Ad research"
        sub="Copy a few ads your competitors keep paying for, paste them here, and AI shows you what's working in your niche and the gaps nobody uses yet."
        first="Open Meta's Ad Library, copy 3 ads that have run a month or more, paste them below and press Analyse with AI."
      />
      <Flash searchParams={sp} />
      <OutOfRunsCard runs={runs} wid={wid} then="come back and press Analyse with AI" />

      <Panel step={1} title="Copy 3 ads that have run a month or more" sub="Ads that keep running for a month or more are usually the ones making money. It's the best free clue there is.">
        {metaSearch}
        <ol className="grid gap-2 text-sm leading-relaxed @2xl/main:grid-cols-3">
          {[
            "Press Search in Meta Ad Library. It opens in a new tab.",
            "Each ad says when it started running. Pick ones that started a month ago or more.",
            "Select the ad's words, copy them and paste them in step 2. Do this for 3 ads.",
          ].map((t, i) => (
            <li key={t} className="flex gap-2.5 rounded-xl bg-muted/50 p-3 ring-1 ring-ink/[0.03] ring-inset dark:ring-white/[0.04]">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground tabular-nums">{i + 1}</span>
              <span className="min-w-0 text-muted-foreground">{t}</span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel step={2} title="Paste them here, then press Analyse with AI" sub="The words of each ad, with one blank line between ads.">
        {pasteForm}
      </Panel>

      {configured ? (
        <MoreOptions
          icon={SearchIcon}
          title="Or search from here (optional)"
          sub="Live search inside the app. It only shows ads that reached Europe, so your country may show few. The Meta Ad Library route above always works."
          defaultOpen={Boolean(q || pageId)}
        >
          <form className="grid gap-3 @2xl/main:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(10rem,auto)_auto] @2xl/main:items-end">
            <Field>
              <FieldLabel htmlFor="q">Keyword</FieldLabel>
              <Input id="q" name="q" defaultValue={q} placeholder={workspace.settings.niche || "e.g. skool community for coaches"} />
            </Field>
            <Field>
              <FieldLabel htmlFor="pageId">Competitor Page ID</FieldLabel>
              <Input id="pageId" name="pageId" defaultValue={pageIdRaw} inputMode="numeric" placeholder="Optional" aria-invalid={pageIdError ? true : undefined} />
            </Field>
            <Field>
              <FieldLabel htmlFor="country">Country</FieldLabel>
              <NativeSelect id="country" name="country" defaultValue={country} className="w-full">
                {COUNTRIES.map(([c, label]) => (
                  <NativeSelectOption key={c} value={c}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Button type="submit">
              <SearchIcon data-icon="inline-start" />
              Search
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">Competitor Page ID is optional: in the Ad Library, open their ads, and it&apos;s the number after view_all_page_id= in the address bar.</p>
          {pageIdError ? <Callout tone="error">{pageIdError}</Callout> : null}
          {searchError ? <Callout tone="error">{searchError}</Callout> : null}
        </MoreOptions>
      ) : null}

      {showResults ? (
        <Panel
          icon={SearchIcon}
          title={`${ads.length} active ad${ads.length === 1 ? "" : "s"}${ads.length > 30 ? " (showing 30)" : ""}`}
          sub="From your search here. Longest-running first. The flame means it has run 30+ days."
          action={
            ads.length ? (
              <form action={adResearchAction.bind(null, wid)} data-guide="research-analyse">
                {hidden}
                <input type="hidden" name="source" value="library" />
                <SubmitButton variant="cta" pendingText="Reading the ads…">
                  <SparklesIcon data-icon="inline-start" />
                  Analyse with AI
                </SubmitButton>
              </form>
            ) : null
          }
        >
          {ads.length === 0 ? (
            <Empty
              icon={SearchIcon}
              title="Nothing found"
              body="That's common outside Europe. Use Search in Meta Ad Library in step 1 and paste what you find."
              action={
                <Button asChild variant="outline">
                  <a href={webUrl} target="_blank" rel="noreferrer">
                    Open the Ad Library <ExternalLinkIcon data-icon="inline-end" />
                  </a>
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-3 @2xl/main:grid-cols-2">
              {ads.slice(0, 30).map((a) => (
                <li key={a.id} className={cn(CARD, "flex flex-col gap-2.5 p-4 text-sm")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{a.pageName || "Unknown page"}</span>
                    <Badge variant="secondary" className={a.daysRunning >= 30 ? "bg-hot-soft text-hot" : undefined}>
                      {a.daysRunning >= 30 ? <FlameIcon data-icon="inline-start" /> : null}
                      {a.daysRunning} days
                    </Badge>
                  </div>
                  {a.titles[0] ? <span className="font-medium">{truncate(a.titles[0], 120)}</span> : null}
                  <p className="leading-relaxed whitespace-pre-line text-muted-foreground">{truncate(a.bodies[0] ?? "", 320)}</p>
                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/80 pt-2.5 text-xs text-subtle-foreground">
                    <span>{a.platforms.join(", ").toLowerCase()}</span>
                    <a href={a.snapshotUrl} target="_blank" rel="noreferrer">
                      View ad
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {analysis && row ? (
        <>
          {oldAnalysis ? (
            <Callout tone="info" title="This is from your last analysis">
              Click Analyse with AI to redo it for this search.
            </Callout>
          ) : null}
          <Panel
            icon={LightbulbIcon}
            tone="gold"
            title="What's working in your niche"
            sub={`Based on ${analysisQuery || "pasted ads"} · ${relativeTime(row.createdAt)}. ${analysis.summary}`}
          >
            <div className="grid gap-4 @2xl/main:grid-cols-2">
              <List icon={FlameIcon} title="Likely winners" items={analysis.winners.map((w) => `${w.page} (${w.daysRunning} days): ${w.why}`)} />
              <List icon={TargetIcon} title="Hooks they open with" items={analysis.hooks} />
              <List icon={LightbulbIcon} title="Angles" items={analysis.angles} />
              <List icon={SparklesIcon} title="Gaps nobody uses yet" items={analysis.gaps} />
              {analysis.offers.length ? <List icon={TargetIcon} title="What the click gets you" items={analysis.offers} /> : null}
            </div>
          </Panel>
          <Panel
            icon={SparklesIcon}
            title="Angles to borrow"
            sub="Three angles these long-runners suggest: Pain, Dream and Lesson, each as Hook · Turn · Door. Ideas to borrow, not ads to launch. Ad studio writes those."
            action={
              <Button asChild size="sm">
                <Link href={`/app/w/${wid}/ads/studio`}>
                  Open Ad studio <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            }
          >
            <div className="grid gap-4 @4xl/main:grid-cols-3">
              {analysis.drafts.map((d, i) => {
                const legacy = d as unknown as { primaryText?: string };
                const body = legacy.primaryText ?? [d.hook, d.turn, d.door].filter(Boolean).join("\n\n");
                const text = `${body}\n\nHeadline: ${d.headline}`;
                const tone = d.angle ? ANGLE_TONE[d.angle] : ANGLE_TONE.lesson;
                return (
                  <div key={i} className={cn(CARD, "relative flex flex-col gap-3.5 overflow-hidden p-5 pt-6 text-sm")}>
                    <span className={cn("absolute inset-x-0 top-0 h-1", tone.bar)} aria-hidden />
                    <span className={cn("inline-flex h-[22px] w-fit items-center rounded-full px-2.5 text-[11.5px] font-semibold", tone.chip)}>{d.angle ? ANGLE_LABEL[d.angle] : `Ad ${i + 1}`}</span>
                    {d.angle ? <span className="-mt-1.5 text-xs text-muted-foreground">{ANGLE_HINT[d.angle]}</span> : null}
                    {d.turn ? (
                      <dl className="flex flex-col gap-2">
                        {(
                          [
                            ["Hook", d.hook],
                            ["Turn", d.turn],
                            ["Door", d.door],
                          ] as const
                        ).map(([k, v]) => (
                          <div key={k} className="grid gap-0.5">
                            <dt className="text-[11px] font-semibold tracking-[0.08em] text-subtle-foreground uppercase">{k}</dt>
                            <dd className="leading-relaxed">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="whitespace-pre-line">{body}</p>
                    )}
                    <div className="grid gap-1.5 border-t border-border/80 pt-3 leading-relaxed">
                      <span>
                        <b className="font-semibold">Headline:</b> {d.headline}
                      </span>
                      <span className="text-muted-foreground">
                        <b className="font-semibold text-foreground">Creative:</b> {d.creativeIdea}
                      </span>
                    </div>
                    <CopyButton text={text} label="Copy" className="mt-auto self-start" />
                  </div>
                );
              })}
            </div>
            <Callout tone="tip">
              Next: open <Link href={`/app/w/${wid}/ads/studio`}>Ad studio</Link>. Your 🔥 finds are ticked under Borrow from long-running ads, so Make my 5 statics turns them into five different statics, with image prompts and a launch plan.
            </Callout>
          </Panel>
        </>
      ) : (
        <ThreePackPreview />
      )}
    </>
  );
}

/** Before the first analysis: a ghost of what you'll get, so the payoff is visible. */
function ThreePackPreview() {
  return (
    <section aria-label="What you'll get" className="flex flex-col gap-5 rounded-2xl border border-dashed border-border-strong bg-card/40 p-6">
      <div className="flex items-start gap-3">
        <StepDot n={3} />
        <div className="grid gap-0.5">
          <h2 className="text-base">Your analysis lands here</h2>
          <p className="text-sm text-muted-foreground">What&apos;s working in your niche, the gaps nobody uses yet, and three angles to borrow in Ad studio.</p>
        </div>
      </div>
      <div aria-hidden className="grid gap-3 @2xl/main:grid-cols-3">
        {(["pain", "dream", "lesson"] as const).map((k) => (
          <div key={k} className="relative flex flex-col gap-2.5 overflow-hidden rounded-2xl bg-card p-4 pt-5 shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
            <span className={cn("absolute inset-x-0 top-0 h-1", ANGLE_TONE[k].bar)} />
            <span className={cn("inline-flex h-[22px] w-fit items-center rounded-full px-2.5 text-[11.5px] font-semibold", ANGLE_TONE[k].chip)}>{ANGLE_LABEL[k]}</span>
            <span className="h-2 w-11/12 rounded-full bg-foreground/10" />
            <span className="h-2 w-3/4 rounded-full bg-foreground/10" />
            <span className="h-2 w-5/6 rounded-full bg-foreground/[0.07]" />
          </div>
        ))}
      </div>
    </section>
  );
}

function List({ icon: Icon, title, items }: { icon: LucideIcon; title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-4 ring-1 ring-ink/[0.03] ring-inset dark:ring-white/[0.04]">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-primary dark:text-violet-300" aria-hidden />
        {title}
      </span>
      <ul className="flex flex-col gap-2 text-sm leading-relaxed">
        {items.map((it) => (
          <li key={it} className="flex gap-2.5">
            <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-primary/50" aria-hidden />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
