import { redirect } from "next/navigation";
import { ExternalLinkIcon, HandIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { entryTicketPending, getEntryTicket } from "@/server/unlocks";
import { env } from "@/lib/env";
import { entryTicketAction } from "@/actions/unlocks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StepDot } from "@/components/ui";
import { EntryForm } from "./entry-form";

export const metadata = { title: "Say hi" };

// The entry ticket: the last step before the app opens is one intro post in the community.
export default async function HelloPage({ params }: { params: Promise<{ wid: string }> }) {
  const { wid } = await params;
  const { workspace, user, viewAs } = await requireWorkspace(wid, "user", { allowPaused: true, allowEntry: true });
  const ticket = await getEntryTicket();
  const preview = viewAs === "entry";
  if (!preview && (!ticket?.unlock || !(await entryTicketPending(ticket, workspace)))) redirect(`/app/w/${wid}`);
  // In "View as: Entry ticket" the owner sees this screen even before the ticket is set up.
  const u = ticket?.unlock ?? { action: "post" as const, instructions: "Introduce yourself: who you are, what you're building, and your daily ad budget.", skoolPostUrl: "" };
  const ticketOff = !ticket?.on;
  const first = user.name.split(" ")[0] || "there";
  const communityUrl = u.skoolPostUrl || env.skoolGroupUrl;
  const kind = u.action === "comment" ? "comment" : "post";

  return (
    <Card className="mx-auto w-full max-w-xl overflow-hidden py-0">
      <div className="relative isolate flex flex-col items-center gap-3 bg-hero px-6 pt-8 pb-7 text-center text-white">
        <div aria-hidden className="bg-dots pointer-events-none absolute inset-0 -z-10 text-white/[0.08]" />
        <span className="grid size-14 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25">
          <HandIcon className="size-7" aria-hidden />
        </span>
        <h1 className="text-[26px] leading-tight font-bold text-white md:text-3xl">One last step, {first}: say hi 👋</h1>
        <p className="max-w-md text-[15px] text-white/85">
          Your account is ready. Before it opens, introduce yourself in the community. Two minutes, and it&apos;s how you meet the people who&apos;ll help you.
        </p>
      </div>
      <CardContent className="flex flex-col gap-6 pt-0 pb-6">
        {preview && ticketOff ? (
          <p className="rounded-xl border border-gold/45 bg-gold-soft px-3 py-2 text-xs text-gold-foreground">
            Preview: the entry ticket is off, so members don&apos;t see this yet. Turn it on in Platform admin › Members › Entry ticket.
          </p>
        ) : null}
        <ol className="flex flex-col gap-4 text-sm">
          <li className="flex gap-3">
            <StepDot n={1} active />
            <span className="flex flex-col gap-2 pt-1">
              <span>
                <b>{u.action === "comment" ? "Comment" : "Post"} in the community.</b> {u.instructions || "Who you are, what you're building, and your daily ad budget."}
              </span>
              {communityUrl ? (
                <Button asChild variant="outline" size="sm" className="self-start">
                  <a href={communityUrl} target="_blank" rel="noreferrer">
                    {u.skoolPostUrl ? "Open the post" : "Open the community"} <ExternalLinkIcon data-icon="inline-end" />
                  </a>
                </Button>
              ) : null}
            </span>
          </li>
          <li className="flex gap-3">
            <StepDot n={2} />
            <span className="pt-1">Copy the link to your {kind} (the ⋯ menu › Copy link) and paste it here. Your account opens straight away.</span>
          </li>
        </ol>
        <EntryForm action={entryTicketAction.bind(null, wid)} kind={kind} />
        <p className="border-t pt-4 text-xs text-muted-foreground">
          Not in the community yet?{" "}
          {env.skoolGroupUrl ? (
            <a href={env.skoolGroupUrl} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
              Join it on Skool
            </a>
          ) : (
            "Join it on Skool"
          )}{" "}
          with this same email, then post. Bought the app directly with a card? You skip this step: refresh this page a minute after paying.
        </p>
      </CardContent>
    </Card>
  );
}
