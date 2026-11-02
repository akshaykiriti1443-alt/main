import { requirePlatformAdmin } from "@/server/auth";
import { listCodes } from "@/server/access";
import { createCodeAction } from "@/actions/admin";
import { env } from "@/lib/env";
import { Flash, PageHead, Panel } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function monthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 7, 23, 59)); // 7 extra days of overlap
  return { start: start.toISOString().slice(0, 16), end: end.toISOString().slice(0, 16) };
}

export default async function CodesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePlatformAdmin();
  const codes = await listCodes();
  const r = monthRange();
  const now = Date.now();
  return (
    <>
      <PageHead title="Member codes" sub="Post one code a month in your paid Skool classroom. Members enter it to sign up and to stay active. Only paying members can see it." />
      <Flash searchParams={await searchParams} />
      <Panel title="New code">
        <form action={createCodeAction} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="code">Code</FieldLabel>
              <Input id="code" name="code" required placeholder="NOV-ROCKET-27" className="uppercase" />
            </Field>
            <Field>
              <FieldLabel htmlFor="label">Label</FieldLabel>
              <Input id="label" name="label" placeholder="November 2026" />
            </Field>
            <Field>
              <FieldLabel htmlFor="validFrom">Valid from (UTC)</FieldLabel>
              <Input id="validFrom" name="validFrom" type="datetime-local" defaultValue={r.start} />
            </Field>
            <Field>
              <FieldLabel htmlFor="validUntil">Valid until (UTC)</FieldLabel>
              <Input id="validUntil" name="validUntil" type="datetime-local" defaultValue={r.end} required />
              <FieldDescription>Overlap the next month by a week so nobody gets locked out on the 1st.</FieldDescription>
            </Field>
          </div>
          <div>
            <SubmitButton pendingText="Creating…">Create code</SubmitButton>
          </div>
        </form>
      </Panel>
      <Panel>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Valid</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Signup link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.map((c) => {
              const live = c.validFrom.getTime() <= now && c.validUntil.getTime() >= now;
              const link = `${env.appUrl}/signup?code=${encodeURIComponent(c.code)}`;
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-semibold">{c.code}</TableCell>
                  <TableCell>{c.label}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.validFrom.toDateString()} → {c.validUntil.toDateString()}
                  </TableCell>
                  <TableCell>
                    {live ? (
                      <Badge variant="secondary" className="bg-success-soft text-success">
                        Live
                      </Badge>
                    ) : c.validUntil.getTime() < now ? (
                      <Badge variant="secondary">Expired</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-warning-soft text-warning">
                        Upcoming
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <CopyButton text={link} label="Copy link" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>
    </>
  );
}
