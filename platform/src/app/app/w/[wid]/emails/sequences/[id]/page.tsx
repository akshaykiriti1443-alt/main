import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { getSequenceWithSteps } from "@/server/email/sequences";
import { deleteSequenceAction, saveSequenceAction, sendTestEmailAction } from "@/actions/marketing";
import { Flash, PageHead, Panel } from "@/components/ui";
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
          <Link href={`/app/w/${wid}/emails`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-3.5" aria-hidden /> Emails
          </Link>
        }
        title={seq.name}
        sub="Delays count from when the person joins the sequence. Leave an email's subject blank to remove it."
      />
      <Flash searchParams={await searchParams} />
      <form action={saveSequenceAction.bind(null, wid, id)} className="flex flex-col gap-4">
        <Panel title="Settings">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
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
            <Label className="font-normal sm:col-span-2">
              <input type="checkbox" name="active" defaultChecked={seq.active} /> Sequence is on
            </Label>
          </div>
        </Panel>

        {rows.map((s, i) => {
          const isNew = s.id === "new";
          return (
            <Panel
              key={s.id}
              title={isNew ? "Add another email" : `Email ${i + 1}`}
              className={isNew ? "bg-muted/30" : undefined}
              action={
                <Label className="font-normal text-muted-foreground">
                  Send on day
                  <Input
                    name="delayDays"
                    type="number"
                    min={0}
                    max={365}
                    step="0.5"
                    defaultValue={Math.round((s.delayMinutes / 1440) * 2) / 2}
                    className="h-7 w-20 text-foreground"
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
        <div>
          <SubmitButton>Save sequence</SubmitButton>
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        <form action={sendTestEmailAction.bind(null, wid)}>
          <Panel title="Send yourself a test of email 1" className="h-full">
            <input type="hidden" name="back" value={`/app/w/${wid}/emails/sequences/${id}`} />
            <input type="hidden" name="subject" value={seq.steps[0]?.subject ?? ""} />
            <input type="hidden" name="body" value={seq.steps[0]?.body ?? ""} />
            <div>
              <SubmitButton variant="outline">Send test</SubmitButton>
            </div>
          </Panel>
        </form>
        <form action={deleteSequenceAction.bind(null, wid, id)}>
          <Panel title="Delete sequence" sub="People in it stop getting these emails." className="h-full">
            <div>
              <SubmitButton variant="destructive" confirm="Yes, delete">
                Delete
              </SubmitButton>
            </div>
          </Panel>
        </form>
      </div>
    </>
  );
}
