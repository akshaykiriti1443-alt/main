import Link from "next/link";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { contactName, listContacts } from "@/server/contacts";
import { addContactAction } from "@/actions/crm";
import type { Stage, Temperature } from "@/lib/db/schema";
import { relativeTime } from "@/lib/util";
import { Empty, Flash, PageHead, Panel, TempBadge } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function LeadsPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  await requireWorkspace(wid);
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const list = await listContacts(wid, {
    q: sp.q,
    temperature: (sp.temperature as Temperature) || "",
    stage: (sp.stage as Stage) || "",
    tag: sp.tag,
    limit: 50,
    offset: page * 50,
  });
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k]) => !["ok", "error"].includes(k))), ...patch });
    return `?${p.toString()}`;
  };
  return (
    <>
      <PageHead title="Leads" sub="Everyone who opted in or messaged you. Hot leads are most likely to join soon." />
      <Flash searchParams={sp} />

      <Panel>
        <form method="get" className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-full sm:basis-56">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" name="q" defaultValue={sp.q} placeholder="Search name, email or phone" aria-label="Search" className="pl-8" />
          </div>
          <NativeSelect name="temperature" defaultValue={sp.temperature ?? ""} aria-label="Temperature">
            <NativeSelectOption value="">All temperatures</NativeSelectOption>
            <NativeSelectOption value="hot">Hot</NativeSelectOption>
            <NativeSelectOption value="warm">Warm</NativeSelectOption>
            <NativeSelectOption value="cold">Cold</NativeSelectOption>
          </NativeSelect>
          <NativeSelect name="stage" defaultValue={sp.stage ?? ""} aria-label="Stage">
            <NativeSelectOption value="">All stages</NativeSelectOption>
            <NativeSelectOption value="new">New</NativeSelectOption>
            <NativeSelectOption value="engaged">Engaged</NativeSelectOption>
            <NativeSelectOption value="trial">On trial</NativeSelectOption>
            <NativeSelectOption value="member">Member</NativeSelectOption>
            <NativeSelectOption value="lost">Lost</NativeSelectOption>
          </NativeSelect>
          <Input name="tag" defaultValue={sp.tag} placeholder="Tag" aria-label="Tag" className="w-28" />
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>

        {list.length === 0 ? (
          <Empty icon={UsersIcon} title="No leads match" body="Leads appear here when people opt in on your pages or message you." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Temperature</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="text-right">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/app/w/${wid}/leads/${c.id}`} className="font-medium text-foreground hover:text-primary">
                      {contactName(c)}
                    </Link>
                    <div className="text-xs text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ")}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <TempBadge t={c.temperature} />
                      <span className="text-xs text-muted-foreground tabular-nums">{c.score}</span>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{c.stage}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">{c.source.replace("_", " ")}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.tags.slice(0, 4).map((t) => (
                        <Badge key={t} variant="outline" asChild>
                          <Link href={qs({ tag: t, page: "0" })}>{t}</Link>
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{relativeTime(c.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {page > 0 || list.length === 50 ? (
          <div className="flex items-center justify-between gap-2">
            {page > 0 ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={qs({ page: String(page - 1) })}>
                  <ChevronLeftIcon data-icon="inline-start" /> Newer
                </Link>
              </Button>
            ) : (
              <span />
            )}
            {list.length === 50 ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={qs({ page: String(page + 1) })}>
                  Older <ChevronRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </Panel>

      <Card className="py-0">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 font-medium [&::-webkit-details-marker]:hidden">
            <UserPlusIcon className="size-4 text-muted-foreground" aria-hidden />
            <span className="flex-1">Add a contact by hand</span>
            <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <form action={addContactAction.bind(null, wid)} className="grid gap-4 border-t px-4 py-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="firstName">First name</FieldLabel>
              <Input id="firstName" name="firstName" />
            </Field>
            <Field>
              <FieldLabel htmlFor="lastName">Last name</FieldLabel>
              <Input id="lastName" name="lastName" />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" />
            </Field>
            <Field>
              <FieldLabel htmlFor="phone">Phone</FieldLabel>
              <Input id="phone" name="phone" type="tel" />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="tags">Tags</FieldLabel>
              <Input id="tags" name="tags" placeholder="vip, dm" />
              <FieldDescription>Comma separated.</FieldDescription>
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton>Add contact</SubmitButton>
            </div>
          </form>
        </details>
      </Card>
    </>
  );
}
