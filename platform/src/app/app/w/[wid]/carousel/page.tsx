import Link from "next/link";
import { GalleryHorizontalEndIcon, Trash2Icon } from "lucide-react";
import { env } from "@/lib/env";
import { isUuid, relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/server/tenancy";
import { connectorInUse } from "@/server/connectors";
import { AI_PROVIDERS, aiCredsFor } from "@/server/ai/client";
import { businessContext } from "@/server/ai/businessContext";
import { CAROUSEL_LOOK_LABEL } from "@/server/carousel/shape";
import { getCarousel, latestHandle, listCarousels } from "@/server/carousel/store";
import { Callout, Flash, PageHead, Panel } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { aiRunsFor, CLAUDE_JOBS } from "../ai/runs";
import { ClaudeRoadCard } from "../ai/runs-card";
import { deleteCarouselAction } from "./actions";
import { CarouselStudio } from "./studio";
import { toView, type CarouselView } from "./view";

export const metadata = { title: "Make my carousel" };

export default async function CarouselPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  const { workspace, role } = await requireWorkspace(wid);
  const canEdit = role === "owner" || role === "admin";
  const [list, runs, claude, handle, ctx, creds] = await Promise.all([listCarousels(wid, 30), aiRunsFor(workspace), connectorInUse(wid), latestHandle(wid), businessContext(wid), aiCredsFor(wid)]);
  const current = isUuid(sp.id) ? (list.find((c) => c.id === sp.id) ?? (await getCarousel(wid, sp.id))) : null;
  const base = `/app/w/${wid}`;
  const aiLine = creds ? `Runs on your ${AI_PROVIDERS[creds.provider].label} key.` : env.aiEnabled ? "Uses one of your included AI runs." : "No AI is connected yet, so you get a starter to change.";
  const say = CLAUDE_JOBS.carousel.say;

  return (
    <>
      <PageHead
        lesson="Day 1"
        eyebrow="Your first post"
        title="Make my carousel"
        sub="Turn one idea into 4 to 8 slides for Instagram. No camera, no editing. Post them with music."
        first={!current && canEdit ? "Type what your post is about and press Write it for me. Or paste your ReelVault script." : undefined}
      />
      <Flash searchParams={sp} />

      {claude ? <ClaudeRoadCard runs={runs} wid={wid} job="carousel" /> : null}

      {canEdit ? (
        <CarouselStudio wid={wid} initial={current ? toView(current) : null} defaultHandle={handle} topicHint={ctx.audience || ""} aiLine={aiLine} />
      ) : (
        <Callout tone="info">Only the account owner or an admin can make carousels here. You can still open the saved ones below.</Callout>
      )}

      {list.length ? (
        <Panel icon={GalleryHorizontalEndIcon} title="Your carousels" sub="Open one to see its slides and download them again.">
          <ul className="-mx-6 -mb-6 flex flex-col divide-y divide-border/80 border-t border-border/80">
            {list.map((c) => (
              <li key={c.id} className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-3.5", c.id === current?.id && "bg-accent/50")}>
                <Link href={`${base}/carousel?id=${c.id}`} className="grid min-w-0 flex-1 basis-56 gap-0.5 text-foreground no-underline hover:text-primary hover:no-underline">
                  <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{c.title}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {c.slides.length} slides · {CAROUSEL_LOOK_LABEL[c.look]} · {relativeTime(c.createdAt)}
                  </span>
                </Link>
                {canEdit ? (
                  <form action={deleteCarouselAction.bind(null, wid, c.id)}>
                    <SubmitButton variant="ghost" size="sm" pendingText="Deleting…">
                      <Trash2Icon data-icon="inline-start" />
                      Delete
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {!claude && canEdit ? (
        <Callout tone="tip" title="Got Claude? It can make these for you" action={<CopyButton text={say} label="Copy" />}>
          Connect it in <Link href={`${base}/ai`}>Your AI</Link>, then say: &ldquo;{say}&rdquo;
        </Callout>
      ) : null}
    </>
  );
}
