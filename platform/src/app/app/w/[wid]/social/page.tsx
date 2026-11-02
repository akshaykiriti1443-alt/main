import Link from "next/link";
import { CalendarIcon, Share2Icon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { listConnections } from "@/server/inbox";
import { listPosts } from "@/server/social";
import { hasFeature } from "@/server/plans";
import { cancelPostAction, schedulePostAction } from "@/actions/marketing";
import { relativeTime, truncate } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Empty, Flash, Locked, PageHead, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const STATUS_CLASS: Record<string, string> = {
  published: "bg-success-soft text-success",
  failed: "bg-destructive/10 text-destructive",
  scheduled: "bg-warning-soft text-warning",
};

export default async function SocialPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace } = await requireWorkspace(wid);
  if (!hasFeature(workspace.plan, "social")) {
    return (
      <>
        <PageHead title="Social planner" sub="Write once, post to Instagram and Facebook on a schedule." />
        <Locked feature="The social planner" wid={wid} />
      </>
    );
  }
  const [connections, posts] = await Promise.all([listConnections(wid), listPosts(wid)]);
  const postable = connections.filter((c) => c.status === "active" && (c.kind === "instagram" || c.kind === "facebook_page"));
  const names = new Map(connections.map((c) => [c.id, c.name]));
  return (
    <>
      <PageHead title="Social planner" sub="Schedule posts to your Instagram and Facebook Page. Instagram posts need an image link." />
      <Flash searchParams={await searchParams} />
      {postable.length === 0 ? (
        <Empty
          icon={Share2Icon}
          title="Connect an account first"
          body="Connect Instagram and Facebook in Settings to start posting."
          action={
            <Button asChild>
              <Link href={`/app/w/${wid}/settings#channels`}>Connect accounts</Link>
            </Button>
          }
        />
      ) : (
        <Panel title="New post">
          <form action={schedulePostAction.bind(null, wid)} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="caption">Caption</FieldLabel>
              <Textarea id="caption" name="caption" rows={5} maxLength={2200} placeholder="Hook first. Then value. Then a call to action: link in bio." />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="mediaUrl">Image link</FieldLabel>
                <Input id="mediaUrl" name="mediaUrl" type="url" placeholder="https://…/image.jpg" />
                <FieldDescription>A public JPG or PNG link. Required for Instagram.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="scheduledAt">When</FieldLabel>
                <Input id="scheduledAt" name="scheduledAt" type="datetime-local" />
                <FieldDescription>Leave blank to post now.</FieldDescription>
              </Field>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Post to</legend>
              <div className="flex flex-wrap gap-2">
                {postable.map((c) => (
                  <Label key={c.id} className="cursor-pointer rounded-lg border px-3 py-2 font-normal has-checked:border-primary/40 has-checked:bg-accent">
                    <input type="checkbox" name="connectionIds" value={c.id} defaultChecked className="size-4 accent-primary" />
                    {c.name}
                    <span className="text-xs text-muted-foreground">({c.kind === "instagram" ? "Instagram" : "Facebook"})</span>
                  </Label>
                ))}
              </div>
            </fieldset>
            <div>
              <SubmitButton>Schedule post</SubmitButton>
            </div>
          </form>
        </Panel>
      )}
      <Panel title="Posts">
        {posts.length === 0 ? (
          <Empty icon={CalendarIcon} title="No posts yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Post</TableHead>
                <TableHead>Accounts</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-80 min-w-56 whitespace-normal">{truncate(p.caption || "(image only)", 80)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.connectionIds.map((id) => names.get(id) ?? "removed").join(", ")}</TableCell>
                  <TableCell className="text-muted-foreground">{p.scheduledAt ? relativeTime(p.scheduledAt) : "—"}</TableCell>
                  <TableCell className="whitespace-normal">
                    <Badge variant="secondary" className={cn("capitalize", STATUS_CLASS[p.status])}>
                      {p.status}
                    </Badge>
                    {p.status === "failed" ? <div className="mt-1 text-xs text-destructive">{Object.values(p.results).find((r) => !r.ok)?.error}</div> : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.status === "scheduled" ? (
                      <form action={cancelPostAction.bind(null, wid, p.id)}>
                        <SubmitButton variant="outline" size="sm">
                          Cancel
                        </SubmitButton>
                      </form>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
