import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, FlameIcon, GlobeIcon, SearchIcon, SearchXIcon, UploadIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { contactName, listContacts } from "@/server/contacts";
import { addContactAction } from "@/actions/crm";
import type { Stage, Temperature } from "@/lib/db/schema";
import { relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Empty, Flash, MoreOptions, PageHead, TempBadge } from "@/components/ui";
import { Avatar, SegmentedLinks, StageChip } from "@/components/crm-ui";
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
  const db = await getDb();
  const [list, temps, [hottest]] = await Promise.all([
    listContacts(wid, {
      q: sp.q,
      temperature: (sp.temperature as Temperature) || "",
      stage: (sp.stage as Stage) || "",
      tag: sp.tag,
      limit: 50,
      offset: page * 50,
    }),
    // How many people sit at each temperature, for the filter counts.
    db.select({ t: contacts.temperature, n: sql<number>`count(*)::int` }).from(contacts).where(eq(contacts.workspaceId, wid)).groupBy(contacts.temperature),
    // The one person to talk to first.
    db.select().from(contacts).where(and(eq(contacts.workspaceId, wid), eq(contacts.temperature, "hot"))).orderBy(desc(contacts.score), desc(contacts.createdAt)).limit(1),
  ]);
  const count = (t: string) => temps.find((x) => x.t === t)?.n ?? 0;
  const total = temps.reduce((n, x) => n + x.n, 0);
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k]) => !["ok", "error"].includes(k))), ...patch });
    return `?${p.toString()}`;
  };
  const filtered = Boolean(sp.q || sp.temperature || sp.stage || sp.tag || page > 0);
  // Nobody yet, and no filter hiding them: teach instead of showing an empty table and a row of filters.
  const nobodyYet = list.length === 0 && !filtered;
  const temp = sp.temperature ?? "";
  const hotName = hottest ? contactName(hottest) : "";

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
        lesson="2.5"
        stage="Day 6"
        eyebrow="Leads CRM"
        title="Leads"
        sub="Everyone who opted in on your pages or messaged you. Hot leads are the ones most likely to join soon."
        first={nobodyYet ? "Share your funnel link. Sign-ups land here by themselves, already scored." : "Open a hot lead and send them a friendly, personal note."}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/app/w/${wid}/leads/import`}>
              <UploadIcon data-icon="inline-start" />
              Import contacts
            </Link>
          </Button>
        }
      />
      <Flash searchParams={sp} />

      {nobodyYet ? (
        <Card className="gap-0 py-0">
          <Empty
            icon={UsersIcon}
            tone="success"
            className="rounded-none border-0 py-12"
            title="Your first lead is one share away"
            body="Publish your funnel and share the link. Every sign-up shows up here, marked hot, warm or cold, so you know who to talk to first."
            action={
              <Button asChild size="lg" variant="cta">
                <Link href={`/app/w/${wid}/sites`}>
                  <GlobeIcon data-icon="inline-start" />
                  Go to Funnels & pages
                </Link>
              </Button>
            }
          />
          {/* A ghost of the table to come, so the payoff is visible. */}
          <div aria-hidden className="border-t border-border/80 [mask-image:linear-gradient(to_bottom,black,transparent)]">
            {["w-36", "w-28", "w-32"].map((w, i) => (
              <div key={w} className="flex items-center gap-3.5 border-b border-border/60 px-6 py-3.5 last:border-0">
                <span className="size-9 rounded-full bg-muted" />
                <span className="grid flex-1 gap-1.5">
                  <span className={cn("h-2.5 rounded-full bg-foreground/10", w)} />
                  <span className="h-2 w-44 rounded-full bg-foreground/[0.06]" />
                </span>
                <span className={cn("h-[22px] w-16 rounded-full", i === 0 ? "bg-hot-soft" : i === 1 ? "bg-gold-soft" : "bg-secondary")} />
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <>
          {hottest && !filtered ? (
            <section aria-label="Hottest lead right now" className="relative isolate flex flex-col gap-5 overflow-hidden rounded-2xl bg-card p-5 shadow-card ring-1 ring-ink/[0.06] @2xl/main:flex-row @2xl/main:items-center md:p-6 dark:ring-white/[0.07]">
              <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 -z-10 size-64 rounded-full bg-[radial-gradient(closest-side,var(--hot-soft),transparent)] opacity-90 dark:opacity-60" />
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <span className="relative">
                  <Avatar name={hotName} size="xl" />
                  <span className="absolute -right-0.5 -bottom-0.5 grid size-6 place-items-center rounded-full bg-hot-soft text-hot ring-[3px] ring-card">
                    <FlameIcon className="size-3.5" aria-hidden />
                  </span>
                </span>
                <div className="grid min-w-0 gap-1">
                  <span className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-[0.12em] text-hot uppercase">
                    Hottest right now · <span className="tabular-nums">{hottest.score}</span>
                  </span>
                  <span className="truncate font-display text-[28px] leading-[1.05] tracking-[-0.01em]">{hotName}</span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">{hottest.scoreReason || "Scored hot from what they did on your pages and emails."}</span>
                </div>
              </div>
              <Button asChild variant="cta" size="lg" className="shrink-0 self-start @2xl/main:self-center">
                <Link href={`/app/w/${wid}/leads/${hottest.id}`}>
                  Open {hottest.firstName || hotName}
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            </section>
          ) : null}

          <Card className="gap-0 py-0">
            <div className="flex flex-col gap-3 px-4 pt-4 pb-3.5 md:px-6 md:pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Quick temperature filter: one tap for "who's hot right now". */}
                <SegmentedLinks
                  label="Temperature"
                  items={[
                    { key: "all", value: "", label: "Everyone", n: total },
                    { key: "hot", value: "hot", label: "Hot", n: count("hot"), icon: FlameIcon },
                    { key: "warm", value: "warm", label: "Warm", n: count("warm") },
                    { key: "cold", value: "cold", label: "Cold", n: count("cold") },
                  ].map((t) => ({ key: t.key, href: qs({ temperature: t.value, page: "0" }), label: t.label, active: temp === t.value, count: t.n, icon: t.icon }))}
                />
                <span className="text-xs text-subtle-foreground tabular-nums">
                  {filtered ? `${list.length}${list.length === 50 ? "+" : ""} shown` : `${total} ${total === 1 ? "person" : "people"}`}
                </span>
              </div>
              <form method="get" className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="temperature" value={temp} />
                <div className="relative min-w-0 flex-1 basis-full @xl/main:basis-56">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />
                  <Input type="search" name="q" defaultValue={sp.q} placeholder="Search name, email or phone" aria-label="Search" className="rounded-full pl-10" />
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
              <div className="border-t border-border/80 p-4 md:p-6">
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
              </div>
            ) : (
              <div className="border-t border-border/80 [&_tr>*:first-child]:pl-4 [&_tr>*:last-child]:pr-4 md:[&_tr>*:first-child]:pl-6 md:[&_tr>*:last-child]:pr-6">
                <Table>
                  <TableHeader className="bg-muted/35 dark:bg-white/[0.015]">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Lead</TableHead>
                      <TableHead>Temperature</TableHead>
                      <TableHead className="hidden @lg/main:table-cell">Stage</TableHead>
                      <TableHead className="hidden @4xl/main:table-cell">Source</TableHead>
                      <TableHead className="hidden @3xl/main:table-cell">Tags</TableHead>
                      <TableHead className="text-right">Added</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((c) => {
                      const name = contactName(c);
                      return (
                        <TableRow key={c.id} className="group/lead relative">
                          <TableCell className="py-2.5">
                            <div className="flex min-w-0 items-center gap-3">
                              <Avatar name={name} />
                              <div className="grid min-w-0 leading-tight">
                                {/* The name's link covers the whole row, so any part of it opens the lead. */}
                                <Link
                                  href={`/app/w/${wid}/leads/${c.id}`}
                                  className="truncate font-medium text-foreground no-underline before:absolute before:inset-0 before:content-[''] group-hover/lead:text-primary hover:no-underline dark:group-hover/lead:text-violet-300"
                                >
                                  {name}
                                </Link>
                                <span className="mt-0.5 max-w-56 truncate text-xs text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <TempBadge t={c.temperature} />
                              <span className="text-xs text-subtle-foreground tabular-nums">{c.score}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden @lg/main:table-cell">
                            <StageChip stage={c.stage} />
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground capitalize @4xl/main:table-cell">{c.source.replace("_", " ")}</TableCell>
                          <TableCell className="hidden @3xl/main:table-cell">
                            <div className="relative z-10 flex flex-wrap gap-1">
                              {c.tags.slice(0, 3).map((t) => (
                                <Badge key={t} variant="outline" asChild>
                                  <Link href={qs({ tag: t, page: "0" })}>{t}</Link>
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-[13px] text-subtle-foreground">{relativeTime(c.createdAt)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {page > 0 || list.length === 50 ? (
              <div className="flex items-center justify-between gap-2 border-t border-border/80 px-4 py-3 md:px-6">
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
          </Card>
        </>
      )}

      {addByHand}
    </>
  );
}
