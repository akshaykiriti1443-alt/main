import { LayoutTemplateIcon } from "lucide-react";
import { requirePlatformAdmin } from "@/server/auth";
import { listTemplates } from "@/server/templates";
import { deleteTemplateAction } from "@/actions/agency";
import { relativeTime } from "@/lib/util";
import { Empty, Flash, PageHead, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AdminTemplates({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePlatformAdmin();
  const templates = await listTemplates(null);
  return (
    <>
      <PageHead title="Platform templates" sub="Every agency can load these. To make one, open any workspace › Settings › Save as a template." />
      <Flash searchParams={await searchParams} />
      {templates.length === 0 ? (
        <Empty icon={LayoutTemplateIcon} title="No platform templates yet" body="Build a great funnel in your own workspace, then save it as a template from its Settings page." />
      ) : (
        <Panel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="min-w-56 whitespace-normal">
                    <div className="font-medium">{t.name}</div>
                    {t.description ? <div className="text-xs text-muted-foreground">{t.description}</div> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{relativeTime(t.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <form action={deleteTemplateAction.bind(null, null, t.id)}>
                      <SubmitButton variant="destructive" size="sm" confirm="Confirm">
                        Delete
                      </SubmitButton>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </>
  );
}
