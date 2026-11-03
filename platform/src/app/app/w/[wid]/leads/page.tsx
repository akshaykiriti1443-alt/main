import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, FlameIcon, GlobeIcon, SearchIcon, SearchXIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { contactName, listContacts } from "@/server/contacts";
import { addContactAction } from "@/actions/crm";
import type { Stage, Temperature } from "@/lib/db/schema";
import { relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Empty, Flash, MoreOptions, PageHead, Panel, TempBadge } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STAGE_LABEL: Record<string, string> = { new: "New", engaged: "Engaged", trial: "On trial", member: "Member", lost: "Lost" };
const STAGE_CLASS: Record<string, string> = {
  new: "bg-accent text-accent-foreground",
  engaged: "bg-gold-soft text-gold-foreground",
  trial: "bg-hot-soft text-hot",
  member: "bg-success-soft text-success",
  lost: "bg-secondary text-muted-foreground",
};

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
  const filtered = Boolean(sp.q || sp.temperature || sp.stage || sp.tag || page > 0);
  // Nobody yet, and no filter hiding them: teach instead of showing an empty table and a row of filters.
  const nobodyYet = list.length === 0 && !filtered;
  const temp = sp.temperature ?? "";

  const addByHand = (
    <MoreOptions
      icon={UserPlusIcon}
      title="Add a contact by hand"
      sub="Friends, past clients, people who DM'd you once. Your first paying member is usually one of them."
    >
      <form action={addContactAction.bind(null, wid)} className="grid gap-4 @2xl/main:grid-cols-2">
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
        <Field className="@2xl/main:col-span-2">
          <FieldLabel htmlFor="tags">Tags</FieldLabel>
          <Input id="tags" name="tags" placeholder="vip, dm" />
          <FieldDescription>Comma separated.</FieldDescription>
        </Field>
        <div className="@2xl/main:col-span-2">
          <SubmitButton>Add contact</SubmitButton>
        </div>
      </form>
    </MoreOptions>
  );

  return (
    <>
      <PageHead
        lesson="3.3"
        stage="Stage 3"
        title="Leads"
        sub="Everyone who opted in on your pages or messaged you. Hot leads are the ones most likely to join soon."
        first={nobodyYet ? "Share your funnel link. Sign-ups land here by themselves, already scored." : "Open a hot lead and send them a friendly Skool DM."}
      />
      <Flash searchParams={sp} />

      {nobodyYet ? (
        <Panel>
          <Empty
            icon={UsersIcon}
            tone="success"
            className="border-0 bg-transparent py-8"
            title="Your first lead is one share away"
            body="Publish your funnel and share the link. Every sign-up shows up here, marked hot, warm or cold, so you know who to talk to first."
            action={
              <Button asChild size="lg">
                <Link href={`/app/w/${wid}/sites`}>
                  <GlobeIcon data-icon="inline-start" />
                  Go to Funnels & pages
                </Link>
              </Button>
            }
          />
        </Panel>
      ) : (
        <Panel>
          <div className="flex flex-col gap-3">
            {/* Quick temperature filter: one tap for "who's hot right now". */}
            <nav aria-label="Temperature" className="flex flex-wrap items-center gap-1.5">
              {[
                { value: "", label: "Everyone" },
                { value: "hot", label: "Hot" },
                { value: "warm", label: "Warm" },
                { value: "cold", label: "Cold" },
              ].map((t) => (
                <Button
                  key={t.value || "all"}
                  asChild
                  size="sm"
                  variant={temp === t.value ? "default" : "outline"}
                  className={cn("rounded-full", temp === t.value && t.value === "hot" && "bg-hot text-white hover:bg-hot/90")}
                >
                  <Link href={qs({ temperature: t.value, page: "0" })} aria-current={temp === t.value ? "page" : undefined}>
                    {t.value === "hot" ? <FlameIcon data-icon="inline-start" /> : null}
                    {t.label}
                  </Link>
                </Button>
              ))}
            </nav>
            <form method="get" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="temperature" value={temp} />
              <div className="relative min-w-0 flex-1 basis-full @xl/main:basis-56">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input type="search" name="q" defaultValue={sp.q} placeholder="Search name, email or phone" aria-label="Search" className="pl-9" />
              </div>
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
              {filtered ? (
                <Button variant="ghost" asChild>
                  <Link href={`/app/w/${wid}/leads`}>Clear</Link>
                </Button>
              ) : null}
            </form>
          </div>

          {list.length === 0 ? (
            <Empty
              icon={SearchXIcon}
              tone="muted"
              title="Nobody matches that"
              body="Try a different search, or clear the filters to see everyone."
              action={
                <Button variant="outline" asChild>
                  <Link href={`/app/w/${wid}/leads`}>Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <div className="-mx-1">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>Temperature</TableHead>
                    <TableHead className="hidden @lg/main:table-cell">Stage</TableHead>
                    <TableHead className="hidden @4xl/main:table-cell">Source</TableHead>
                    <TableHead className="hidden @3xl/main:table-cell">Tags</TableHead>
                    <TableHead className="text-right">Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="py-3">
                        <Link href={`/app/w/${wid}/leads/${c.id}`} className="font-semibold text-foreground hover:text-primary">
                          {contactName(c)}
                        </Link>
                        <div className="max-w-64 truncate text-xs text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ")}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <TempBadge t={c.temperature} />
                          <span className="text-xs text-muted-foreground tabular-nums">{c.score}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden @lg/main:table-cell">
                        <Badge variant="secondary" className={STAGE_CLASS[c.stage]}>
                          {STAGE_LABEL[c.stage] ?? c.stage}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground capitalize @4xl/main:table-cell">{c.source.replace("_", " ")}</TableCell>
                      <TableCell className="hidden @3xl/main:table-cell">
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
            </div>
          )}

          {page > 0 || list.length === 50 ? (
            <div className="flex items-center justify-between gap-2 border-t pt-4">
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
      )}

      {addByHand}
    </>
  );
}
