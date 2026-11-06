import Link from "next/link";
import { ArrowLeftIcon, ArrowRightLeftIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { hasFeature } from "@/server/plans";
import { MoreOptions, PageHead } from "@/components/ui";
import { ImportWizard } from "@/components/import/import-wizard";

export const metadata = { title: "Import contacts" };

export default async function ImportPage({ params }: { params: Promise<{ wid: string }> }) {
  const { wid } = await params;
  const { workspace } = await requireWorkspace(wid);
  const canOpportunities = hasFeature(workspace.plan, "pipelines");

  return (
    <>
      <PageHead
        eyebrow={
          <Link href={`/app/w/${wid}/leads`} className="inline-flex items-center gap-1 text-muted-foreground no-underline hover:text-foreground">
            <ArrowLeftIcon className="size-3.5" aria-hidden /> All leads
          </Link>
        }
        title="Import contacts"
        sub="Bring your people across from GoHighLevel, or any spreadsheet. Nobody gets emailed and no automations run."
        first="In GoHighLevel, export your contacts as a CSV, then drop the file below."
      />

      <MoreOptions icon={ArrowRightLeftIcon} title="How to export from GoHighLevel" sub="Two minutes. Contacts first, then your opportunities.">
        <ol className="grid gap-4 text-sm @2xl/main:grid-cols-2">
          <li className="grid gap-1.5 rounded-xl bg-muted/40 p-4 dark:bg-white/[0.03]">
            <span className="font-semibold">Contacts</span>
            <span className="text-muted-foreground">
              Open <b className="font-medium text-foreground">Contacts</b>, tick the box at the top of the list to select everyone, then choose <b className="font-medium text-foreground">Export</b>. GHL emails you the CSV (or downloads it). Tags, source and the date they were added come across; every other column lands in notes.
            </span>
          </li>
          <li className="grid gap-1.5 rounded-xl bg-muted/40 p-4 dark:bg-white/[0.03]">
            <span className="font-semibold">Opportunities {canOpportunities ? "" : "(Growth plan)"}</span>
            <span className="text-muted-foreground">
              Open <b className="font-medium text-foreground">Opportunities</b>, switch to the list view, and choose <b className="font-medium text-foreground">Export</b>. Import it here after your contacts: missing pipelines and stages are created for you, and each deal is linked to its contact.
            </span>
          </li>
        </ol>
      </MoreOptions>

      <ImportWizard wid={wid} canOpportunities={canOpportunities} defaultCurrency="USD" />
    </>
  );
}
