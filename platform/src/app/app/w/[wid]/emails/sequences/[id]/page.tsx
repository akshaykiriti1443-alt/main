import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, MailPlusIcon, SendIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { getSequenceWithSteps } from "@/server/email/sequences";
import { deleteSequenceAction, saveSequenceAction, sendTestEmailAction } from "@/actions/marketing";
import { Flash, MoreOptions, PageHead, Panel } from "@/components/ui";
import { Kicker } from "@/components/crm-ui";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SubmitButton } from "@/components/client";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

export default async function SequencePage({ params, searchParams }: { params: Promise<{ wid: string; id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid, id } = await params;
  await requireWorkspace(wid);
  const seq = await getSequenceWithSteps(wid, id);
  if (!seq) notFound();
  const rows = [...seq.steps, { id: "new", position: seq.steps.length, delayMinutes: (seq.steps.at(-1)?.delayMinutes ?? 0) + 1440, subject: "", body: "" }];
  return (
    <>
      <PageHead
        eyebrow={
          <Link href={`/app/w/${wid}/emails`} className="inline-flex items-center gap-1.5 text-muted-foreground no-underline hover:text-foreground hover:no-underline">
            <ArrowLeftIcon className="size-3.5" aria-hidden /> Emails
          </Link>
        }
        title={seq.name}
        sub="A few emails in a row. Days count from when someone joins the sequence. Clear an email's subject to remove it."
        actions={<Badge variant={seq.active ? "success" : "secondary"}>{seq.active ? "On" : "Off"}</Badge>}
      />
      <Flash searchParams={await searchParams} />
      <form action={saveSequenceAction.bind(null, wid, id)} className="flex flex-col gap-6">
        <Panel icon={SettingsIcon} tone="muted" title="Settings" sub="What starts it, and whether it's on.">
          <div className="grid gap-4 @xl/main:grid-cols-2">
            <Field className="@xl/main:col-span-2">
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" defaultValue={seq.name} />
            </Field>
            <Field>
              <FieldLabel htmlFor="trigger">Starts when</FieldLabel>
              <NativeSelect id="trigger" name="trigger" defaultValue={seq.trigger} className="w-full">
                <NativeSelectOption value="lead_created">Someone becomes a lead</NativeSelectOption>
                <NativeSelectOption value="tag_added">A tag is added</NativeSelectOption>
                <NativeSelectOption value="manual">An automation starts it</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="triggerValue">Tag (for tag trigger)</FieldLabel>
              <Input id="triggerValue" name="triggerValue" defaultValue={seq.triggerValue} placeholder="webinar" />
            </Field>
            <Label className="flex cursor-pointer items-center gap-3 rounded-xl bg-muted/50 px-4 py-3 font-normal ring-1 ring-ink/[0.03] ring-inset @xl/main:col-span-2 dark:ring-white/[0.04]">
              <input type="checkbox" name="active" defaultChecked={seq.active} />
              <span className="grid gap-0.5">
                <span className="font-medium">Sequence is on</span>
                <span className="text-xs text-muted-foreground">Switch it off to pause it. People already in it wait where they are.</span>
              </span>
            </Label>
          </div>
        </Panel>

        <div className="flex flex-col gap-3">
          <Kicker className="px-1">The emails, in order</Kicker>
        {rows.map((s, i) => {
          const isNew = s.id === "new";
          return (
            <Panel
              key={s.id}
              {...(isNew ? { icon: MailPlusIcon, tone: "muted" as const } : { step: i + 1 })}
              title={isNew ? "Add another email" : `Email ${i + 1}`}
              sub={isNew ? "Optional. Leave the subject blank and nothing is added." : undefined}
              className={cn(isNew && "border border-dashed border-border-strong bg-card/40 shadow-none ring-0")}
              action={
                <Label className="gap-2 rounded-full bg-muted/60 py-1 pr-1 pl-3.5 text-[13px] font-medium text-muted-foreground">
                  Send on day
                  <Input
                    name="delayDays"
                    type="number"
                    min={0}
                    max={365}
                    step="0.5"
                    defaultValue={Math.round((s.delayMinutes / 1440) * 2) / 2}
                    className="h-8 w-[72px] rounded-full text-center text-foreground tabular-nums"
                  />
                </Label>
              }
            >
              <div className="flex flex-col gap-4">
                <Field>
                  <FieldLabel htmlFor={`subject-${s.id}`}>Subject</FieldLabel>
                  <Input id={`subject-${s.id}`} name="subject" defaultValue={s.subject} placeholder={isNew ? "Leave blank to skip" : ""} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`body-${s.id}`}>Message</FieldLabel>
                  <Textarea id={`body-${s.id}`} name="body" defaultValue={s.body} rows={8} className="min-h-40" />
                  <FieldDescription>
                    Use {"{{first_name}}"}, {"{{skool_url}}"}, {"{{lead_magnet_url}}"}, {"{{business_name}}"}. Blank line = new paragraph. [Link text](https://…) makes a link.
                  </FieldDescription>
                </Field>
              </div>
            </Panel>
          );
        })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card py-3 pr-3 pl-5 shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
          <span className="text-sm text-muted-foreground">Nothing changes until you save.</span>
          <SubmitButton>Save sequence</SubmitButton>
        </div>
      </form>

      <form action={sendTestEmailAction.bind(null, wid)}>
        <Panel
          icon={SendIcon}
          title="Send yourself a test of email 1"
          sub="See it the way your leads will, in your own inbox."
          action={<SubmitButton variant="outline">Send test</SubmitButton>}
          className="gap-0"
        >
          <input type="hidden" name="back" value={`/app/w/${wid}/emails/sequences/${id}`} />
          <input type="hidden" name="subject" value={seq.steps[0]?.subject ?? ""} />
          <input type="hidden" name="body" value={seq.steps[0]?.body ?? ""} />
        </Panel>
      </form>
      <MoreOptions icon={Trash2Icon} title="Delete sequence" sub="People in it stop getting these emails. Switching it off is usually enough.">
        <form action={deleteSequenceAction.bind(null, wid, id)}>
          <SubmitButton variant="destructive" confirm="Yes, delete">
            Delete
          </SubmitButton>
        </form>
      </MoreOptions>
    </>
  );
}
