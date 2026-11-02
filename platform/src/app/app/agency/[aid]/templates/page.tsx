import Link from "next/link";
import { LayoutTemplateIcon } from "lucide-react";
import { requireAgency, workspaceIdsForAgency, workspacesByIds } from "@/server/tenancy";
import { listTemplates } from "@/server/templates";
import { deleteTemplateAction, saveTemplateFromWorkspaceAction } from "@/actions/agency";
import { relativeTime } from "@/lib/util";
import { Callout, Empty, Flash, PageHead, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AgencyTemplates({ params, searchParams }: { params: Promise<{ aid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { aid } = await params;
  await requireAgency(aid);
  const [templates, wsIds] = await Promise.all([listTemplates(aid), workspaceIdsForAgency(aid)]);
  const workspaces = await workspacesByIds(wsIds);
  return (
    <>
      <PageHead title="Templates" sub="A template copies funnels, email sequences and automations. Build it once in a client account, save it, then load it into every new client." />
      <Flash searchParams={await searchParams} />
      {templates.length === 0 ? (
        <Empty icon={LayoutTemplateIcon} title="No templates yet" />
      ) : (
        <Panel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Owner</TableHead>
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
                  <TableCell>
                    <Badge variant={t.agencyId ? "secondary" : "outline"}>{t.agencyId ? "Your agency" : "Platform"}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{relativeTime(t.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    {t.agencyId ? (
                      <form action={deleteTemplateAction.bind(null, aid, t.id)}>
                        <SubmitButton variant="destructive" size="sm" confirm="Confirm">
                          Delete
                        </SubmitButton>
                      </form>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
      {workspaces.length ? (
        <Panel title="Save a client account as a template">
          <form action={saveTemplateFromWorkspaceAction.bind(null, aid)} className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="workspaceId">Account</FieldLabel>
                <NativeSelect id="workspaceId" name="workspaceId" className="w-full">
                  {workspaces.map((w) => (
                    <NativeSelectOption key={w.id} value={w.id}>
                      {w.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="name">Template name</FieldLabel>
                <Input id="name" name="name" required placeholder="Fitness coach funnel" />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="description">Description</FieldLabel>
                <Input id="description" name="description" />
              </Field>
            </div>
            <div>
              <SubmitButton pendingText="Saving…">Save template</SubmitButton>
            </div>
          </form>
        </Panel>
      ) : (
        <Callout
          tone="info"
          action={
            <Button size="sm" asChild>
              <Link href={`/app/agency/${aid}`}>Add a client</Link>
            </Button>
          }
        >
          Create a client account first, build its funnel, then save it here.
        </Callout>
      )}
    </>
  );
}
