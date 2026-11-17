import { ClipboardCheckIcon, CornerDownRightIcon, LockIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT, CARD, Container, Em, MINI, SectionHead } from "./parts";
import { TextBars } from "./visuals";

// The One-Before-You Rule: post, review the post before yours, then get the audit. It happens in
// Skool, by hand. The app only ever sees a link the member pastes in.

const STEPS: { title: string; body: string }[] = [
  { title: "Post your work", body: "Every day has its own section in the group. You post the real thing there: your page, your ads, your numbers. Not a summary of it." },
  { title: "Review the post before yours", body: "Say what you'd keep and what you'd change. “Great post!” is not a review. That is what Pete writes." },
  { title: "Get your audit", body: "Then Akshay, who runs the group, goes through your post himself and tells you what to fix first." },
];

export function Rule() {
  return (
    <section id="rule" className="scroll-mt-20 py-24 md:py-32">
      <Container className="grid items-center gap-14 lg:grid-cols-[1fr_0.9fr] lg:gap-20">
        <div>
          <SectionHead
            eyebrow="The house rule"
            title={
              <>
                The One-Before-You <Em>Rule.</Em>
              </>
            }
            sub="Nobody posts into silence here, and nobody gets an audit for free. It takes about as long as writing a decent comment, because that is what it is."
          />
          <ol className="reveal mt-10 flex flex-col">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-5 border-t border-border py-6 last:border-b">
                <span className={cn("w-8 shrink-0 font-display text-[40px] leading-[0.9] tabular-nums", ACCENT)}>{i + 1}</span>
                <div>
                  <h3 className="text-[18px] font-semibold tracking-[-0.015em]">{s.title}</h3>
                  <p className="mt-1.5 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="reveal mt-7 flex max-w-[58ch] flex-col gap-3 text-[14.5px] leading-relaxed text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">Why bother?</span> You learn more from judging someone else&apos;s page than from staring at your own. Stuck on something? Say so in your post. Stuck people get help first, no review needed.
            </p>
            <p className="flex gap-2.5">
              <LockIcon className={cn("mt-1 size-4 shrink-0", ACCENT)} aria-hidden />
              <span>The app never logs in to Skool and never asks for your Skool password. The only thing it ever gets from Skool is a link you paste in yourself.</span>
            </p>
          </div>
        </div>

        <Thread />
      </Container>
    </section>
  );
}

function Reply({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn("mt-3 flex gap-2.5 rounded-xl bg-accent px-3 py-2.5 dark:bg-white/[0.04]", className)}>
      <CornerDownRightIcon className={cn("mt-0.5 size-3.5 shrink-0", ACCENT)} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold text-accent-foreground">{label}</div>
        <TextBars className="mt-2" widths={["w-[94%]", "w-[60%]"]} />
      </div>
    </div>
  );
}

/** One day's section, drawn plainly: three posts in a row, each reviewed by the next. */
function Thread() {
  return (
    <div className="reveal relative [transition-delay:80ms]" aria-hidden>
      <div className={cn(CARD, "relative flex flex-col gap-3 p-5 md:p-7")}>
        <div className="flex items-center justify-between">
          <span className="eyebrow">Day 3 section</span>
          <span className="text-[12px] text-muted-foreground">Oldest first</span>
        </div>

        <div className={cn(MINI, "p-4")}>
          <div className="text-[13.5px] font-semibold">The post before yours</div>
          <TextBars className="mt-2.5" widths={["w-full", "w-[82%]"]} />
          <Reply label="Your review" />
        </div>

        <div className={cn(MINI, "p-4 ring-2 ring-violet-300 dark:ring-violet-400/50")}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13.5px] font-semibold">Your post</span>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">You</span>
          </div>
          <TextBars className="mt-2.5" widths={["w-[96%]", "w-full", "w-[48%]"]} />
          <Reply label="A review from the next person" />
          <div className="mt-2.5 flex gap-2.5 rounded-xl bg-success-soft px-3 py-2.5">
            <ClipboardCheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-success">Your audit, from Akshay</div>
              <div className="mt-1 text-[12px] leading-snug text-foreground/75">What to fix first, in plain words.</div>
            </div>
          </div>
        </div>

        <div className={cn(MINI, "p-4 opacity-70")}>
          <div className="text-[13.5px] font-semibold">The post after yours</div>
          <TextBars className="mt-2.5" widths={["w-[88%]", "w-[54%]"]} />
        </div>
      </div>
    </div>
  );
}
