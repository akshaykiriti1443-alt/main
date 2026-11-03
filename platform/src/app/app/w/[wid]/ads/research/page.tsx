import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { ExternalLinkIcon, FlameIcon, LightbulbIcon, SearchIcon, SparklesIcon, TargetIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { aiGenerations } from "@/lib/db/schema";
import { isUuid, truncate } from "@/lib/util";
import { requireWorkspace } from "@/server/tenancy";
import { adLibraryConfigured, adLibraryWebUrl, searchAdLibrary, type LibraryAd } from "@/server/meta/adLibrary";
import type { AdAnalysis } from "@/server/ai/adResearch";
import { ANGLE_HINT, ANGLE_LABEL } from "@/server/ai/adFramework";
import { adResearchAction } from "@/actions/adResearch";
import { Callout, Empty, Flash, PageHead, Panel } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

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

export default async function AdResearchPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  const { workspace } = await requireWorkspace(wid);
  const q = (sp.q ?? "").slice(0, 100);
  const pageId = /^\d{3,30}$/.test(sp.pageId ?? "") ? sp.pageId : "";
  const country = COUNTRIES.some(([c]) => c === sp.country) ? sp.country : "ALL";
  const configured = adLibraryConfigured();
  const webUrl = adLibraryWebUrl({ q: q || workspace.settings.niche || "", pageId, country });

  let ads: LibraryAd[] = [];
  let searchError = "";
  if (configured && (q || pageId)) {
    try {
      ads = await searchAdLibrary({ q, pageIds: pageId ? [pageId] : [], countries: [country] });
    } catch (err) {
      searchError = err instanceof Error ? err.message : "Search failed.";
    }
  }

  const db = await getDb();
  const [row] = await db
    .select()
    .from(aiGenerations)
    .where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_research"), ...(isUuid(sp.analysis) ? [eq(aiGenerations.id, sp.analysis)] : [])))
    .orderBy(desc(aiGenerations.createdAt))
    .limit(1);
  const analysis = row?.output as unknown as AdAnalysis | undefined;
  const hidden = (
    <>
      <input type="hidden" name="q" value={q} />
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="country" value={country} />
    </>
  );

  return (
    <>
      <PageHead
        eyebrow="Ads"
        title="Ad research"
        sub="See what your competitors are running right now in the Meta Ad Library. The ads that have run longest are usually the ones making money. AI reads them and writes your next 3 ads."
      />
      <Flash searchParams={sp} />

      <Panel title="Search the Ad Library" sub="A keyword from your niche (“fat loss for dads”), or a competitor's Facebook Page ID for everything they run.">
        <form className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <Field>
            <FieldLabel htmlFor="q">Keyword</FieldLabel>
            <Input id="q" name="q" defaultValue={q} placeholder={workspace.settings.niche || "e.g. skool community for coaches"} />
          </Field>
          <Field>
            <FieldLabel htmlFor="pageId">Competitor Page ID</FieldLabel>
            <Input id="pageId" name="pageId" defaultValue={pageId} inputMode="numeric" placeholder="Optional" />
          </Field>
          <Field>
            <FieldLabel htmlFor="country">Country</FieldLabel>
            <NativeSelect id="country" name="country" defaultValue={country}>
              {COUNTRIES.map(([c, label]) => (
                <NativeSelectOption key={c} value={c}>{label}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Button type="submit">
            <SearchIcon data-icon="inline-start" />
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button asChild variant="outline" size="sm">
            <a href={webUrl} target="_blank" rel="noreferrer">
              Open in Meta Ad Library <ExternalLinkIcon data-icon="inline-end" />
            </a>
          </Button>
          <span className="text-muted-foreground">The website shows every active ad, in every country, with images and videos.</span>
        </div>
        {!configured ? (
          <Callout tone="info" title="Live search isn't connected on this server yet">
            Open the Ad Library link above, copy the ads you like into the box below, and AI does the rest. To search from here, the platform owner adds a Meta Ad Library token (META_AD_LIBRARY_TOKEN).
          </Callout>
        ) : (
          <p className="text-xs text-muted-foreground">
            Meta&apos;s API returns ads that reached the EU, plus political ads. For ads shown only in your country, use the website link and paste them below.
          </p>
        )}
        {searchError ? <Callout tone="error">{searchError}</Callout> : null}
      </Panel>

      {configured && (q || pageId) && !searchError ? (
        <Panel
          title={`${ads.length} active ads`}
          sub="Longest-running first. 🔥 = running 30+ days."
          action={
            ads.length ? (
              <form action={adResearchAction.bind(null, wid)}>
                {hidden}
                <input type="hidden" name="source" value="library" />
                <SubmitButton size="sm" pendingText="Reading the ads…">
                  <SparklesIcon data-icon="inline-start" />
                  Analyse with AI
                </SubmitButton>
              </form>
            ) : null
          }
        >
          {ads.length === 0 ? (
            <Empty icon={SearchIcon} title="Nothing found" body="Try a broader keyword, or open the Ad Library website." />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {ads.slice(0, 30).map((a) => (
                <li key={a.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{a.pageName || "Unknown page"}</span>
                    <Badge variant="secondary" className={a.daysRunning >= 30 ? "bg-warning-soft text-warning" : undefined}>
                      {a.daysRunning >= 30 ? <FlameIcon data-icon="inline-start" /> : null}
                      {a.daysRunning} days
                    </Badge>
                  </div>
                  {a.titles[0] ? <span className="font-medium">{truncate(a.titles[0], 120)}</span> : null}
                  <p className="whitespace-pre-line text-muted-foreground">{truncate(a.bodies[0] ?? "", 320)}</p>
                  <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{a.platforms.join(", ").toLowerCase()}</span>
                    <a href={a.snapshotUrl} target="_blank" rel="noreferrer">View ad</a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      <form action={adResearchAction.bind(null, wid)}>
        {hidden}
        <input type="hidden" name="source" value="paste" />
        <Panel
          title="Paste ads you found"
          sub="From the Ad Library website: copy each ad's text. Leave a blank line between ads. Add how long it has run, like [45 days], if you can see it."
          action={<SubmitButton size="sm" variant="outline" pendingText="Reading the ads…">Analyse pasted ads</SubmitButton>}
        >
          <Field>
            <Textarea name="paste" rows={6} placeholder={"[62 days] Tired of guessing what to eat? Inside our group…\n\n[14 days] Dads: 20 minutes, 3 times a week…"} aria-label="Competitor ads" />
            <FieldDescription>We study patterns. Your new ads are always written fresh, never copied.</FieldDescription>
          </Field>
        </Panel>
      </form>

      {analysis ? (
        <>
          <Panel title="What's working in your niche" sub={analysis.summary}>
            <div className="grid gap-4 md:grid-cols-2">
              <List icon={FlameIcon} title="Likely winners" items={analysis.winners.map((w) => `${w.page} (${w.daysRunning} days): ${w.why}`)} />
              <List icon={TargetIcon} title="Hooks they open with" items={analysis.hooks} />
              <List icon={LightbulbIcon} title="Angles" items={analysis.angles} />
              <List icon={SparklesIcon} title="Gaps nobody uses yet" items={analysis.gaps} />
            </div>
            {analysis.offers.length ? <List icon={TargetIcon} title="What the click gets you" items={analysis.offers} /> : null}
          </Panel>
          <Panel title="Your 3-Pack" sub="Pain, Dream and Lesson, each built as Hook · Turn · Door. Point them at your Skool link (Growth ladder) and launch all three at your budget tier.">
            <div className="grid gap-3 lg:grid-cols-3">
              {analysis.drafts.map((d, i) => {
                const legacy = d as unknown as { primaryText?: string };
                const body = legacy.primaryText ?? [d.hook, d.turn, d.door].filter(Boolean).join("\n\n");
                const text = `${body}\n\nHeadline: ${d.headline}`;
                return (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {d.angle ? `${ANGLE_LABEL[d.angle]} · ${ANGLE_HINT[d.angle]}` : `Ad ${i + 1}`}
                    </span>
                    {d.turn ? (
                      <dl className="flex flex-col gap-1.5">
                        <div><dt className="inline font-semibold">Hook: </dt><dd className="inline">{d.hook}</dd></div>
                        <div><dt className="inline font-semibold">Turn: </dt><dd className="inline">{d.turn}</dd></div>
                        <div><dt className="inline font-semibold">Door: </dt><dd className="inline">{d.door}</dd></div>
                      </dl>
                    ) : (
                      <p className="whitespace-pre-line">{body}</p>
                    )}
                    <span><b>Headline:</b> {d.headline}</span>
                    <span className="text-muted-foreground"><b>Creative:</b> {d.creativeIdea}</span>
                    <CopyButton text={text} label="Copy ad" className="mt-auto self-start" />
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Then check results in <Link href={`/app/w/${wid}/ads`}>Ad review</Link> after 72 hours.
            </p>
          </Panel>
        </>
      ) : null}
    </>
  );
}

function List({ icon: Icon, title, items }: { icon: typeof FlameIcon; title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{title}</span>
      <ul className="flex flex-col gap-1.5 text-sm">
        {items.map((it) => (
          <li key={it} className="flex gap-2">
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
