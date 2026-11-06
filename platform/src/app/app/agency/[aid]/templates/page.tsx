import Link from "next/link";
import { LayoutTemplateIcon, SaveIcon } from "lucide-react";
import { requireAgency, workspaceIdsForAgency, workspacesByIds } from "@/server/tenancy";
import { listTemplates } from "@/server/templates";
import { deleteTemplateAction, saveTemplateFromWorkspaceAction } from "@/actions/agency";
import { relativeTime } from "@/lib/util";
import { Callout, Empty, Flash, IconTile, PageHead, Panel } from "@/components/ui";
import { EdgeTable } from "@/components/crm-ui";
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
      <PageHead eyebrow="Agency" title="Templates" sub="A template copies funnels, email sequences and automations. Build it once in a client account, save it, then load it into every new client." />
      <Flash searchParams={await searchParams} />
      {templates.length === 0 ? (
        <Empty icon={LayoutTemplateIcon} title="No templates yet" body="Build one great client account, then save it below. Every new client can start from it." />
      ) : (
        <Panel icon={LayoutTemplateIcon} title="Your templates" sub="Pick one when you add a client.">
          <EdgeTable>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
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
                  <TableCell className="min-w-56 py-3 whitespace-normal">
                    <div className="flex items-start gap-3">
                      <IconTile icon={LayoutTemplateIcon} tone={t.agencyId ? "primary" : "muted"} className="size-8 rounded-[10px]" />
                      <div className="grid gap-0.5">
                        <span className="font-medium">{t.name}</span>
                        {t.description ? <span className="text-xs text-muted-foreground">{t.description}</span> : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.agencyId ? "soft" : "outline"}>{t.agencyId ? "Your agency" : "Platform"}</Badge>
                  </TableCell>
                  <TableCell className="text-[13px] text-subtle-foreground">{relativeTime(t.createdAt)}</TableCell>
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
          </EdgeTable>
        </Panel>
      )}
      {workspaces.length ? (
        <Panel icon={SaveIcon} title="Save a client account as a template" sub="Copies its funnels, email sequences and automations. Contacts never come along.">
          <form action={saveTemplateFromWorkspaceAction.bind(null, aid)} className="flex flex-col gap-5">
            <div className="grid gap-4 @xl/main:grid-cols-2">
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
              <Field className="@xl/main:col-span-2">
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
