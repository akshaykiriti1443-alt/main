import Link from "next/link";
import { requireWorkspace } from "@/server/tenancy";
import { getBoard } from "@/server/pipelines";
import { hasFeature } from "@/server/plans";
import { Flash, Locked, PageHead } from "@/components/ui";
import { PipelineBoard } from "@/components/pipeline/board";
import { AddOpportunityButton, PipelineProvider, PipelineSwitcher } from "@/components/pipeline/provider";
import type { BoardData } from "@/components/pipeline/shared";

export const metadata = { title: "Pipeline" };

const SUB = "Everyone who might buy is a card here: drag it right as they get closer to yes, just like opportunities in GoHighLevel.";
const QUIET_DAYS = 14;

export default async function PipelinePage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  const { workspace } = await requireWorkspace(wid);
  if (!hasFeature(workspace.plan, "pipelines")) {
    return (
      <>
        <PageHead eyebrow="Get members" title="Pipeline" sub={SUB} />
        <Locked feature="Pipelines" wid={wid} />
      </>
    );
  }

  const board = await getBoard(wid, typeof sp.p === "string" ? sp.p : null);
  // Plain JSON for the client: no Dates, nothing server-only.
  const data: BoardData = {
    pipeline: {
      id: board.pipeline.id,
      name: board.pipeline.name,
      currency: board.pipeline.currency,
      isDefault: board.pipeline.isDefault,
      stages: board.pipeline.stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
    },
    pipelines: board.pipelines.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault, stageCount: p.stages.length })),
    columns: board.columns.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      deals: c.deals.map((d) => ({
        id: d.id,
        title: d.title,
        stageId: d.stageId,
        status: d.status,
        valueCents: d.valueCents,
        currency: d.currency,
        source: d.source,
        notes: d.notes,
        stageChangedAt: d.stageChangedAt.getTime(),
        createdAt: d.createdAt.getTime(),
        contact: d.contact,
      })),
    })),
    now: Date.now(),
  };
  const empty = board.columns.every((c) => c.deals.length === 0);
  // The open card that has waited longest in one stage, if it's gone quiet: that's today's first job.
  const quiet = board.columns
    .flatMap((c) => c.deals.filter((d) => d.status === "open").map((d) => ({ d, stage: c.name, days: Math.floor((data.now - d.stageChangedAt.getTime()) / 86_400_000) })))
    .filter((x) => x.days >= QUIET_DAYS)
    .sort((a, b) => b.days - a.days)[0];

  return (
    <PipelineProvider wid={wid} data={data}>
      <PageHead
        eyebrow="Get members"
        title="Pipeline"
        sub={SUB}
        first={
          empty ? (
            <>
              Add your first opportunity, or <Link href={`/app/w/${wid}/leads/import`}>import your GHL opportunities CSV</Link>.
            </>
          ) : quiet ? (
            quiet.d.contact ? (
              <>
                Check in with {quiet.d.contact.name}. They&apos;ve sat in {quiet.stage} for {quiet.days} days.
              </>
            ) : (
              <>
                Follow up on &ldquo;{quiet.d.title}&rdquo;. It&apos;s sat in {quiet.stage} for {quiet.days} days.
              </>
            )
          ) : (
            "Drag a card to the right when someone moves closer to yes."
          )
        }
        actions={
          // One row from md up, so the two never stack beside "Do this first".
          <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
            <PipelineSwitcher />
            {empty ? null : <AddOpportunityButton />}
          </div>
        }
      />
      <Flash searchParams={sp} />
      <PipelineBoard />
    </PipelineProvider>
  );
}
