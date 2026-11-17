import { ClipboardCheckIcon, CornerDownRightIcon, LockIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RuleLine, RuleStack } from "./fx/rule-stack";
import { CARD, Container, Em, MINI, SectionHead } from "./parts";
import { Browser, MiniLanding, TextBars } from "./visuals";

// The One-Before-You Rule: post, review the post before yours, then get the audit. It happens in
// Skool, by hand. The app only ever sees a link the member pastes in.

const STEPS: { title: string; body: string }[] = [
  { title: "Post your work", body: "Every day has its own section in the group. You post the real thing there: your page, your ads, your numbers. Not a summary of it." },
  { title: "Review the post before yours", body: "Say what you'd keep and what you'd change. “Great post!” is not a review. That is what Pete writes." },
  { title: "Get your audit", body: "Then Akshay, who runs the group, goes through your post himself and tells you what to fix first." },
];

export function Rule() {
  return (
    <section id="rule" className="relative scroll-mt-20 py-24 md:py-36">
      <Container className="grid items-center gap-16 lg:grid-cols-[1fr_0.95fr] lg:gap-20">
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

          <ol className="relative mt-12 flex flex-col">
            <RuleLine className="absolute top-7 bottom-7 left-[23px]" />
            {STEPS.map((s, i) => (
              <li key={s.title} className="reveal relative flex gap-5 py-4 md:gap-6" style={{ transitionDelay: `${i * 90}ms` }}>
                <span className="relative z-[1] grid size-12 shrink-0 place-items-center rounded-full bg-[var(--card)] ring-1 ring-white/15 shadow-[0_0_0_5px_var(--background),0_0_32px_-4px_rgb(124_92_255/0.85),inset_0_1px_0_rgb(255_255_255/0.15)]">
                  <span className="sk-grad font-display text-[22px] leading-none font-semibold tabular-nums">{i + 1}</span>
                </span>
                <div className="min-w-0 pt-1">
                  <h3 className="text-[19px] font-semibold tracking-[-0.02em] text-white md:text-[21px]">{s.title}</h3>
                  <p className="mt-1.5 max-w-[50ch] text-[15px] leading-relaxed text-white/60">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className={cn(CARD, "reveal mt-8 flex max-w-[60ch] flex-col gap-4 rounded-[22px] p-5 text-[14.5px] leading-relaxed text-white/60 md:p-6")}>
            <p>
              <span className="font-semibold text-white">Why bother?</span> You learn more from judging someone else&apos;s page than from staring at your own. Stuck on something? Say so in your post. Stuck people get help first, no review needed.
            </p>
            <p className="flex gap-3 border-t border-white/10 pt-4">
              <LockIcon className="mt-1 size-4 shrink-0 text-[var(--sk-lilac)]" aria-hidden />
              <span>The app never logs in to Skool and never asks for your Skool password. The only thing it ever gets from Skool is a link you paste in yourself.</span>
            </p>
          </div>
        </div>

        <Thread />
      </Container>
    </section>
  );
}

function StepTag({ n, label, tone = "violet" }: { n: number; label: string; tone?: "violet" | "mint" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold tracking-[0.04em]",
        tone === "mint" ? "bg-[var(--sk-mint)]/10 text-[var(--sk-mint)] ring-1 ring-[var(--sk-mint)]/25" : "bg-[#7c5cff]/15 text-[var(--sk-lilac)] ring-1 ring-[var(--sk-lilac)]/30",
      )}
    >
      <span className="tabular-nums">{n}</span>
      <span className="opacity-50">·</span>
      {label}
    </span>
  );
}

function Who({ initials, name, meta, glow }: { initials: string; name: string; meta: string; glow?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white",
          glow ? "bg-[linear-gradient(135deg,#7c5cff,#ff6fae)] shadow-[0_0_16px_-2px_rgb(124_92_255/0.8)]" : "bg-white/10 ring-1 ring-white/10",
        )}
      >
        {initials}
      </span>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[13.5px] font-semibold text-white">{name}</div>
        <div className="truncate text-[11.5px] text-white/45">{meta}</div>
      </div>
    </div>
  );
}

/** One day's section in Skool, drawn as three post cards: your post, your review, your audit. */
function Thread() {
  const cards = [
    // 1. Your post
    <article key="post" className={cn(CARD, "rounded-[22px] p-4 ring-1 ring-[var(--sk-lilac)]/40 md:p-5")}>
      <div className="flex items-center justify-between gap-3">
        <Who initials="FD" name="You, Fit Dads Club" meta="Day 1 section" glow />
        <StepTag n={1} label="Post" />
      </div>
      <p className="mt-3 text-[13.5px] leading-snug text-white/80">My page and my five ads are up. Be honest, I can take it.</p>
      <Browser className="mt-3 rounded-xl">
        <MiniLanding />
      </Browser>
    </article>,

    // 2. Your review of the post before yours
    <article key="review" className={cn(CARD, "rounded-[22px] p-4 md:p-5")}>
      <div className="flex items-center justify-between gap-3">
        <Who initials="M" name="The post before yours" meta="Day 1 section" />
        <StepTag n={2} label="Review" />
      </div>
      <TextBars className="mt-3" widths={["w-full", "w-[78%]"]} />
      <div className={cn(MINI, "mt-3 flex gap-2.5 px-3 py-3")}>
        <CornerDownRightIcon className="mt-0.5 size-3.5 shrink-0 text-[var(--sk-lilac)]" />
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-bold tracking-[0.04em] text-[var(--sk-lilac)]">Your review</div>
          <p className="mt-1 text-[13px] leading-snug text-white/80">Keep the headline. The button says &ldquo;Submit&rdquo;, which tells nobody anything. Try &ldquo;Send me the checklist&rdquo;.</p>
        </div>
      </div>
      <p className="mt-2.5 flex flex-wrap items-baseline gap-x-2 px-1 text-[12px] text-white/40">
        <s className="decoration-[#ff6fae] decoration-2">Great post!</s>
        <span>Pete&apos;s review. Not allowed here.</span>
      </p>
    </article>,

    // 3. Your audit
    <article key="audit" className={cn(CARD, "rounded-[22px] p-4 md:p-5")}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--sk-mint)]/12 text-[var(--sk-mint)] ring-1 ring-[var(--sk-mint)]/30 shadow-[0_0_18px_-4px_rgb(111_242_196/0.6)]">
            <ClipboardCheckIcon className="size-4" />
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13.5px] font-semibold text-white">Your audit, from Akshay</div>
            <div className="truncate text-[11.5px] text-white/45">A reply on your post</div>
          </div>
        </div>
        <StepTag n={3} label="Audit" tone="mint" />
      </div>
      <p className="mt-3 text-[13px] text-white/70">What to fix first, in plain words:</p>
      <ol className="mt-2.5 flex flex-col gap-2">
        {["w-[86%]", "w-[70%]", "w-[54%]"].map((w, i) => (
          <li key={w} className="flex items-center gap-2.5">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[10.5px] font-bold text-white/60 tabular-nums">{i + 1}</span>
            <span className={cn("h-1.5 rounded-full bg-white/10", w)} />
          </li>
        ))}
      </ol>
    </article>,
  ];

  return (
    <figure className="relative isolate">
      <div aria-hidden className="pointer-events-none absolute inset-x-[5%] top-[12%] bottom-[8%] -z-10 rounded-full bg-[radial-gradient(closest-side,rgb(124_92_255/0.35),transparent)] blur-3xl" />
      <div aria-hidden>
        <RuleStack cards={cards} className="mx-auto w-full max-w-[460px]" />
      </div>
      <figcaption className="mt-6 text-center text-[12.5px] text-white/45">A sketch of one day&apos;s section in Skool. The posts are made up.</figcaption>
    </figure>
  );
}
