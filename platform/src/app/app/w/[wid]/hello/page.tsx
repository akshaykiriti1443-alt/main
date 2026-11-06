import { redirect } from "next/navigation";
import { ExternalLinkIcon, HandIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { entryTicketPending, getEntryTicket } from "@/server/unlocks";
import { env } from "@/lib/env";
import { entryTicketAction } from "@/actions/unlocks";
import { Button } from "@/components/ui/button";
import { Callout, StepDot } from "@/components/ui";
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
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 md:py-4">
      {preview && ticketOff ? (
        <Callout tone="info" title="Preview">
          The entry ticket is off, so members don&apos;t see this yet. Turn it on in Platform admin › Members › Entry ticket.
        </Callout>
      ) : null}
      <div className="overflow-hidden rounded-3xl bg-card shadow-float ring-1 ring-ink/[0.06] dark:ring-white/[0.08]">
        <div className="relative isolate flex flex-col items-center gap-4 bg-hero px-6 pt-10 pb-9 text-center text-white md:px-10">
          <div aria-hidden className="bg-stars pointer-events-none absolute inset-0 -z-10 text-white/50" />
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 -z-10 size-72 rounded-full border border-white/[0.12]" />
          <span className="grid size-14 place-items-center rounded-2xl bg-white/[0.12] ring-1 ring-white/20 backdrop-blur-sm">
            <HandIcon className="size-7" aria-hidden />
          </span>
          <span className="text-[11.5px] font-semibold tracking-[0.14em] text-pink-200 uppercase">One last step</span>
          <h1 className="text-[34px] leading-[1.04] tracking-[-0.012em] text-white md:text-[42px]">
            Say hi, <em className="text-pink-200 italic">{first}</em>
          </h1>
          <p className="max-w-md text-[15px] leading-relaxed text-white/80">
            Your account is ready. Before it opens, introduce yourself in the community. Two minutes, and it&apos;s how you meet the people who&apos;ll help you.
          </p>
        </div>
        <div className="flex flex-col gap-7 px-6 py-7 md:px-9">
          <ol className="flex flex-col gap-4 text-sm leading-relaxed">
            <li className="flex gap-3.5">
              <StepDot n={1} active />
              <span className="flex flex-col gap-2.5 pt-0.5">
                <span>
                  <b className="font-semibold">{u.action === "comment" ? "Comment" : "Post"} in the community.</b>{" "}
                  <span className="text-foreground/80">{u.instructions || "Who you are, what you're building, and your daily ad budget."}</span>
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
            <li className="flex gap-3.5">
              <StepDot n={2} />
              <span className="pt-0.5 text-foreground/80">Copy the link to your {kind} (the ⋯ menu › Copy link) and paste it here. Your account opens straight away.</span>
            </li>
          </ol>
          <EntryForm action={entryTicketAction.bind(null, wid)} kind={kind} />
          <p className="border-t border-border/80 pt-5 text-xs leading-relaxed text-muted-foreground">
            Not in the community yet?{" "}
            {env.skoolGroupUrl ? (
              <a href={env.skoolGroupUrl} target="_blank" rel="noreferrer" className="font-medium">
                Join it on Skool
              </a>
            ) : (
              "Join it on Skool"
            )}{" "}
            with this same email, then post. Bought the app directly with a card? You skip this step: refresh this page a minute after paying.
          </p>
        </div>
      </div>
    </div>
  );
}
