import { notFound } from "next/navigation";
import { ExternalLinkIcon, GiftIcon, LockKeyholeIcon, ShieldCheckIcon } from "lucide-react";
import { publicUnlock, unlockAvailable } from "@/server/unlocks";
import { claimUnlockAction } from "@/actions/unlocks";
import { ThemeToggle } from "@/components/theme";
import { EmptyArt, StepDot } from "@/components/ui";
import { Button } from "@/components/ui/button";
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
  const initials = community
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="relative isolate flex min-h-svh flex-col items-center px-4 pt-16 pb-12 md:justify-center md:py-16">
      {/* A soft violet dawn behind the card, with a whisper of pink. Marshmallow everywhere else. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex justify-center overflow-hidden">
        <div className="h-[460px] w-[820px] -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow-violet),transparent)] blur-2xl" />
        <div className="absolute top-0 left-[58%] h-[260px] w-[360px] -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow-pink),transparent)] blur-2xl" />
      </div>
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="flex w-full max-w-[520px] flex-col items-center gap-6">
        <span className="inline-flex items-center gap-2.5 rounded-full bg-card py-1.5 pr-4 pl-1.5 text-sm font-medium shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.08]">
          <span className="brand-mark size-7 rounded-full text-[10px]">{initials || "★"}</span>
          {community}
        </span>

        <div className="w-full overflow-hidden rounded-3xl bg-card shadow-float ring-1 ring-ink/[0.06] dark:ring-white/[0.08]">
          <div className="flex flex-col items-center gap-4 px-6 pt-9 pb-7 text-center md:px-10">
            <EmptyArt icon={available ? GiftIcon : LockKeyholeIcon} tone={available ? "gold" : "muted"} />
            <span className="eyebrow">{available ? "A reward for joining in" : "This one has ended"}</span>
            <h1 className="text-[34px] leading-[1.04] tracking-[-0.012em] md:text-[40px]">{unlock.title}</h1>
            {unlock.reward ? <p className="max-w-[42ch] text-[15.5px] leading-relaxed text-muted-foreground">{unlock.reward}</p> : null}
          </div>

          <div className="flex flex-col gap-7 border-t border-border/80 bg-background/40 px-6 py-7 md:px-10 dark:bg-white/[0.01]">
            {!available ? (
              <p className="text-center text-sm text-muted-foreground">This unlock has ended. Keep an eye on the community for the next one.</p>
            ) : (
              <>
                <ol className="flex flex-col gap-4 text-sm leading-relaxed">
                  <li className="flex gap-3.5">
                    <StepDot n={1} active />
                    <span className="flex flex-col gap-2.5 pt-0.5">
                      <span>
                        <b className="font-semibold">
                          {verb} in {community} on Skool.
                        </b>{" "}
                        <span className="text-foreground/80">{unlock.instructions}</span>
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
                  <li className="flex gap-3.5">
                    <StepDot n={2} />
                    <span className="pt-0.5 text-foreground/80">
                      {unlock.action === "comment" ? "Copy the link to your comment (⋯ on your comment › Copy link)" : "Copy the link to your post (⋯ › Copy link)"} and paste it below.
                    </span>
                  </li>
                  <li className="flex gap-3.5">
                    <StepDot n={3} />
                    <span className="pt-0.5 text-foreground/80">Get it right away, plus a copy by email.</span>
                  </li>
                </ol>
                <ClaimForm action={claimUnlockAction.bind(null, unlock.slug)} kind={unlock.action === "comment" ? "comment" : "post"} />
              </>
            )}
          </div>
        </div>

        <p className="flex max-w-md items-start gap-2 text-center text-xs leading-relaxed text-muted-foreground">
          <ShieldCheckIcon className="mt-px size-3.5 shrink-0 text-success" aria-hidden />
          <span>We never ask for your Skool login. We only use your email to send this and keep you posted from {community}.</span>
        </p>
      </div>
    </div>
  );
}
