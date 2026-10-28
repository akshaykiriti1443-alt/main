import { listTemplates } from "@/server/templates";
import { deleteTemplateAction } from "@/actions/agency";
import { relativeTime } from "@/lib/util";
import { Empty, Flash, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function AdminTemplates({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const templates = await listTemplates(null);
  return (
    <>
      <PageHead title="Platform templates" sub="Every agency can load these. To make one, open any workspace › Settings › Save as a template." />
      <Flash searchParams={await searchParams} />
      {templates.length === 0 ? <Empty title="No platform templates yet" body="Build a great funnel in your own workspace, then save it as a template from its Settings page." /> : (
        <div className="table-wrap"><table><thead><tr><th>Template</th><th>Created</th><th></th></tr></thead><tbody>
          {templates.map((t) => (
            <tr key={t.id}><td><strong>{t.name}</strong><div className="tiny muted">{t.description}</div></td><td className="small muted">{relativeTime(t.createdAt)}</td><td><form action={deleteTemplateAction.bind(null, null, t.id)}><SubmitButton className="btn btn-sm btn-danger" confirm="Confirm">Delete</SubmitButton></form></td></tr>
          ))}
        </tbody></table></div>
      )}
    </>
  );
}
