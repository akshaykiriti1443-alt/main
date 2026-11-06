import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, SendIcon, UsersIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { countAudience, getCampaign } from "@/server/email/campaigns";
import { saveCampaignAction, sendTestEmailAction } from "@/actions/marketing";
import { Flash, IconTile, PageHead, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const chip =
  "h-9 cursor-pointer gap-2 rounded-full border border-border-strong bg-card px-3.5 font-medium capitalize shadow-xs transition-colors duration-150 hover:border-violet-200 hover:bg-accent/50 has-checked:border-violet-300 has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-[3px] has-focus-visible:ring-ring/20 dark:bg-white/[0.03] dark:hover:border-white/20 dark:has-checked:border-violet-400/40 dark:has-checked:bg-accent";

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ wid: string; id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid, id } = await params;
  await requireWorkspace(wid);
  const c = await getCampaign(wid, id);
  if (!c) notFound();
  const audienceSize = await countAudience(wid, c.audience);
  const locked = c.status !== "draft";
  const temps = c.audience.temperatures ?? [];
  const stages = c.audience.stages ?? [];
  return (
    <>
      <PageHead
        eyebrow={
          <Link href={`/app/w/${wid}/emails`} className="inline-flex items-center gap-1.5 text-muted-foreground no-underline hover:text-foreground hover:no-underline">
            <ArrowLeftIcon className="size-3.5" aria-hidden /> Emails
          </Link>
        }
        title={c.name}
        sub={
          locked
            ? `Status: ${c.status}. ${c.recipients ? `${c.recipients} recipients.` : ""}`
            : `Write it once, pick who gets it, send. ${audienceSize} ${audienceSize === 1 ? "person matches" : "people match"} this audience right now.`
        }
      />
      <Flash searchParams={await searchParams} />
      <form action={saveCampaignAction.bind(null, wid, id)} className="flex flex-col gap-6">
        <fieldset disabled={locked} className="flex min-w-0 flex-col gap-6">
          <Panel step={1} title="Message" sub="Write it like a note to one person, not a newsletter.">
            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="name">Internal name</FieldLabel>
                <Input id="name" name="name" defaultValue={c.name} />
              </Field>
              <Field>
                <FieldLabel htmlFor="subject">Subject</FieldLabel>
                <Input id="subject" name="subject" defaultValue={c.subject} />
              </Field>
              <Field>
                <FieldLabel htmlFor="body">Message</FieldLabel>
                <Textarea id="body" name="body" rows={10} defaultValue={c.body} className="min-h-48" />
                <FieldDescription>Same placeholders as sequences. Unsubscribed people never get broadcasts.</FieldDescription>
              </Field>
            </div>
          </Panel>

          <Panel
            step={2}
            title="Audience"
            sub="Leave everything unticked to send to all subscribed contacts."
            action={
              <Badge variant="soft" className="tabular-nums">
                <UsersIcon data-icon="inline-start" />
                {audienceSize} {audienceSize === 1 ? "person" : "people"} now
              </Badge>
            }
          >
            <div className="flex flex-col gap-5">
              <FieldSet className="gap-2">
                <FieldLegend variant="label">Temperature</FieldLegend>
                <div className="flex flex-wrap gap-2">
                  {(["hot", "warm", "cold"] as const).map((t) => (
                    <Label key={t} className={chip}>
                      <input type="checkbox" name="temperatures" value={t} defaultChecked={temps.includes(t)} /> {t}
                    </Label>
                  ))}
                </div>
              </FieldSet>
              <FieldSet className="gap-2">
                <FieldLegend variant="label">Stage</FieldLegend>
                <div className="flex flex-wrap gap-2">
                  {(["new", "engaged", "trial", "member", "lost"] as const).map((s) => (
                    <Label key={s} className={chip}>
                      <input type="checkbox" name="stages" value={s} defaultChecked={stages.includes(s)} /> {s}
                    </Label>
                  ))}
                </div>
              </FieldSet>
              <Field>
                <FieldLabel htmlFor="tags">Tags</FieldLabel>
                <Input id="tags" name="tags" defaultValue={(c.audience.tags ?? []).join(", ")} />
                <FieldDescription>Any of these, comma separated.</FieldDescription>
              </Field>
              <Field className="@xl/main:max-w-72">
                <FieldLabel htmlFor="sendAt">Send at (optional)</FieldLabel>
                <Input id="sendAt" name="sendAt" type="datetime-local" />
              </Field>
            </div>
          </Panel>
        </fieldset>
        {!locked ? (
          <div className="flex flex-wrap items-center gap-3">
            {/* Order matters: pressing Enter submits the first button, which must stay "save". */}
            <Button type="submit" variant="outline" size="lg" name="intent" value="save">
              Save draft
            </Button>
            <Button type="submit" variant="cta" size="lg" name="intent" value="schedule">
              <SendIcon data-icon="inline-start" />
              Save & send
            </Button>
            <span className="text-xs text-muted-foreground">Sends now, or at the time you picked.</span>
          </div>
        ) : null}
      </form>
      <Card size="sm">
        <CardContent>
          <form action={sendTestEmailAction.bind(null, wid)} className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-3 text-sm text-muted-foreground">
              <IconTile icon={SendIcon} className="size-8 rounded-[10px]" /> Preview it in your own inbox first.
            </span>
            <input type="hidden" name="back" value={`/app/w/${wid}/emails/campaigns/${id}`} />
            <input type="hidden" name="subject" value={c.subject} />
            <input type="hidden" name="body" value={c.body} />
            <SubmitButton variant="outline">Send me a test</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
