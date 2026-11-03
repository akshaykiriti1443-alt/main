import { redirect } from "next/navigation";
import { ExternalLinkIcon, HandIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { entryTicketPending, getEntryTicket } from "@/server/unlocks";
import { env } from "@/lib/env";
import { entryTicketAction } from "@/actions/unlocks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EntryForm } from "./entry-form";

export const metadata = { title: "Say hi" };

// The entry ticket: the last step before the app opens is one intro post in the community.
export default async function HelloPage({ params }: { params: Promise<{ wid: string }> }) {
  const { wid } = await params;
  const { workspace, user } = await requireWorkspace(wid, "user", { allowPaused: true, allowEntry: true });
  const ticket = await getEntryTicket();
  if (!ticket?.unlock || !(await entryTicketPending(ticket, workspace))) redirect(`/app/w/${wid}`);
  const u = ticket.unlock;
  const first = user.name.split(" ")[0] || "there";
  const communityUrl = u.skoolPostUrl || env.skoolGroupUrl;
  const kind = u.action === "comment" ? "comment" : "post";

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader className="gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary">
          <HandIcon className="size-5" />
        </span>
        <CardTitle>
          <h1 className="text-xl font-semibold tracking-tight">One last step, {first}: say hi 👋</h1>
        </CardTitle>
        <CardDescription>
          Your account is ready. Before it opens, introduce yourself in the community. It takes 2 minutes, it&apos;s how you meet the people who&apos;ll help you, and it&apos;s how this place stays alive.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ol className="flex flex-col gap-3 text-sm">
          <li className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">1</span>
            <span className="flex flex-col gap-2">
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
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">2</span>
            <span>Copy the link to your {kind} (the ⋯ menu › Copy link) and paste it here. Your account opens straight away.</span>
          </li>
        </ol>
        <EntryForm action={entryTicketAction.bind(null, wid)} kind={kind} />
        <p className="text-xs text-muted-foreground">
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
