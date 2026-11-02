import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { requireAgency } from "@/server/tenancy";
import { listSubAccounts } from "@/server/agency";
import { listTemplates } from "@/server/templates";
import { createSubAccountAction, setSubAccountStatusAction } from "@/actions/agency";
import { Empty, Flash, PageHead, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AgencyHome({ params, searchParams }: { params: Promise<{ aid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { aid } = await params;
  const { agency } = await requireAgency(aid);
  const [subs, templates] = await Promise.all([listSubAccounts(aid), listTemplates(aid)]);
  return (
    <>
      <PageHead eyebrow={agency.brand.name || agency.name} title="Client accounts" sub="Each client gets their own funnels, leads, inbox and automations. Usage is billed to your agency wallet." />
      <Flash searchParams={await searchParams} />
      {subs.length === 0 ? (
        <Empty icon={UsersIcon} title="No clients yet" body="Add your first client below. Load a template to give them a ready-made funnel." />
      ) : (
        <Panel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Contacts</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.map(({ workspace: w, contacts, owner }) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <Link href={`/app/w/${w.id}`} className="font-medium text-foreground">
                      {w.name}
                    </Link>
                    <div className="text-xs text-muted-foreground capitalize">{w.plan}</div>
                  </TableCell>
                  <TableCell>{owner ?? <span className="text-muted-foreground">no owner yet</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{contacts}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={w.status === "active" ? "bg-success-soft text-success" : "bg-destructive/10 text-destructive"}>
                      {w.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/app/w/${w.id}`}>Open</Link>
                      </Button>
                      <form action={setSubAccountStatusAction.bind(null, aid, w.id, w.status === "paused" ? "active" : "paused")}>
                        <SubmitButton variant={w.status === "paused" ? "outline" : "destructive"} size="sm" confirm={w.status === "paused" ? undefined : "Confirm pause"}>
                          {w.status === "paused" ? "Unpause" : "Pause"}
                        </SubmitButton>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
      <Panel title="Add a client">
        <form action={createSubAccountAction.bind(null, aid)} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="name">Business name</FieldLabel>
              <Input id="name" name="name" required placeholder="Coach Maria Fitness" />
            </Field>
            <Field>
              <FieldLabel htmlFor="templateId">Start from</FieldLabel>
              <NativeSelect id="templateId" name="templateId" defaultValue="" className="w-full">
                <NativeSelectOption value="">Blank account with defaults</NativeSelectOption>
                {templates.map((t) => (
                  <NativeSelectOption key={t.id} value={t.id}>
                    {t.name}
                    {t.agencyId ? "" : " (platform)"}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="ownerName">Client&apos;s name (optional)</FieldLabel>
              <Input id="ownerName" name="ownerName" />
            </Field>
            <Field>
              <FieldLabel htmlFor="ownerEmail">Client&apos;s email (optional)</FieldLabel>
              <Input id="ownerEmail" name="ownerEmail" type="email" />
              <FieldDescription>We email them a link to set their password.</FieldDescription>
            </Field>
          </div>
          <div>
            <SubmitButton pendingText="Creating…">Create client account</SubmitButton>
          </div>
        </form>
      </Panel>
    </>
  );
}
