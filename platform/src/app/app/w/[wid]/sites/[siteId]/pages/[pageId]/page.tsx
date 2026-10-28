import Link from "next/link";
import { notFound } from "next/navigation";
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
      <PageHead
        eyebrow={
          <Link href={`/app/w/${wid}/sites/${siteId}`} className="muted">
            ← {site.name}
          </Link>
        }
        title={`Edit: ${page.title}`}
        sub="Changes show in the preview right away. Save, then publish the funnel to go live."
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
