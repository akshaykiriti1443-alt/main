import { notFound } from "next/navigation";
import { ExternalLinkIcon, LockOpenIcon } from "lucide-react";
import { publicUnlock, unlockAvailable } from "@/server/unlocks";
import { claimUnlockAction } from "@/actions/unlocks";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClaimForm } from "./claim-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const row = await publicUnlock((await params).slug);
  return { title: row ? `Unlock: ${row.unlock.title}` : "Unlock", robots: { index: false } };
}

// Public claim page: post or comment in the Skool community, paste the link, get the reward.
export default async function UnlockPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const row = await publicUnlock(slug);
  if (!row) notFound();
  const { unlock, workspace } = row;
  const community = workspace.settings.businessName || workspace.name;
  const available = unlockAvailable(row);
  const verb = unlock.action === "comment" ? "Comment" : "Post";

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-48 -z-10 flex justify-center">
        <div className="h-[420px] w-[720px] rounded-full bg-primary/12 blur-3xl dark:bg-primary/20" />
      </div>
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{community}</p>
      <Card className="w-full max-w-lg shadow-lg shadow-primary/5">
        <CardHeader className="gap-3 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
            <LockOpenIcon className="size-6" />
          </span>
          <CardTitle className="text-2xl font-semibold tracking-tight">{unlock.title}</CardTitle>
          {unlock.reward ? <CardDescription className="text-base">{unlock.reward}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {!available ? (
            <p className="text-center text-sm text-muted-foreground">This unlock has ended. Keep an eye on the community for the next one.</p>
          ) : (
            <>
              <ol className="flex flex-col gap-3 text-sm">
                <li className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">1</span>
                  <span className="flex flex-col gap-2">
                    <span>
                      <b>{verb} in {community} on Skool.</b> {unlock.instructions}
                    </span>
                    {unlock.skoolPostUrl ? (
                      <Button asChild variant="outline" size="sm" className="self-start">
                        <a href={unlock.skoolPostUrl} target="_blank" rel="noreferrer">
                          Open the post <ExternalLinkIcon data-icon="inline-end" />
                        </a>
                      </Button>
                    ) : null}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">2</span>
                  <span>
                    {unlock.action === "comment" ? "Copy the link to your comment (⋯ on your comment › Copy link)" : "Copy the link to your post (⋯ › Copy link)"} and paste it below.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">3</span>
                  <span>Get it right away, plus a copy by email.</span>
                </li>
              </ol>
              <ClaimForm action={claimUnlockAction.bind(null, unlock.slug)} kind={unlock.action === "comment" ? "comment" : "post"} />
            </>
          )}
        </CardContent>
      </Card>
      <p className="max-w-lg text-center text-xs text-muted-foreground">
        We never ask for your Skool login. We only use your email to send this and keep you posted from {community}.
      </p>
    </div>
  );
}
