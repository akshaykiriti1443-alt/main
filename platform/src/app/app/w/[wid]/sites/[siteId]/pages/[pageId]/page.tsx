import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { getPage, getSite, siteVars } from "@/server/sites";
import { savePageAction } from "@/actions/sites";
import { PageEditor } from "@/components/editor/PageEditor";
import { PageHead } from "@/components/ui";

export default async function EditPage({ params }: { params: Promise<{ wid: string; siteId: string; pageId: string }> }) {
  const { wid, siteId, pageId } = await params;
  const { workspace } = await requireWorkspace(wid);
  const site = await getSite(wid, siteId);
  const page = await getPage(wid, pageId);
  if (!site || !page || page.siteId !== site.id) notFound();
  return (
    <>
      <Link
        href={`/app/w/${wid}/sites/${siteId}`}
        className="group -mb-3 inline-flex w-fit max-w-full items-center gap-1.5 truncate rounded-full py-1 pr-3 pl-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground hover:no-underline"
      >
        <ArrowLeftIcon className="size-4 shrink-0 transition-transform duration-150 group-hover:-translate-x-0.5" aria-hidden />
        <span className="truncate">Back to {site.name}</span>
      </Link>
      <PageHead
        lesson="1.4"
        stage="Day 1"
        title={`Edit: ${page.title}`}
        sub="Type on the left, watch the preview on the right. Save, then go back and publish the funnel to make it live."
        first="Change the headline so it sounds like you. Three lines is plenty."
      />
      <PageEditor
        initialTitle={page.title}
        initialSections={page.content.sections}
        theme={site.theme}
        vars={siteVars(site)}
        businessName={workspace.settings.businessName || workspace.name}
        save={savePageAction.bind(null, wid, pageId)}
      />
    </>
  );
}
