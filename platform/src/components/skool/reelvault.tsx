import { ClapperboardIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RvReels } from "./fx/rv-reels";
import { Container, Em, MenuChip } from "./parts";

// ReelVault, the second tool. It opens right inside the OneX app, from its menu, so this
// section says only what it does today and, when it isn't switched on yet, says that plainly.

const PARTS: { name: string; body: string; dot: string }[] = [
  { name: "The hook", body: "The first line, the one that stops the thumb.", dot: "bg-[var(--sk-lilac)] shadow-[0_0_10px_#c9b8ff]" },
  { name: "The middle", body: "What they actually show, beat by beat.", dot: "bg-[var(--sk-pink)] shadow-[0_0_10px_#ff8cc1]" },
  { name: "The ask", body: "What they tell you to do at the end, and how.", dot: "bg-[var(--sk-gold)] shadow-[0_0_10px_#ffd36f]" },
];

export function ReelVaultSection({ live }: { live: boolean }) {
  return (
    <section id="reelvault" className="scroll-mt-20 pb-24 md:pb-36">
      <Container>
        <div className="reveal sk-beam rounded-[36px]">
          <div className="sk-island relative isolate overflow-hidden rounded-[36px] bg-[linear-gradient(180deg,#0e0a26,#07051a_70%)] p-6 shadow-[0_60px_140px_-60px_rgb(74_34_207/0.7),inset_0_1px_0_rgb(255_255_255/0.08)] dark:shadow-[0_60px_140px_-60px_rgb(0_0_0/1),inset_0_1px_0_rgb(255_255_255/0.08)] sm:p-8 md:p-12 lg:p-16">
            {/* Cinema lighting: a spotlight from above, a pink wash, stars and a faint grid. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
              <div className="bg-stars absolute inset-0 text-white/35" />
              <div className="absolute -top-[30%] left-1/2 h-[80%] w-[120%] -translate-x-1/2 bg-[radial-gradient(50%_55%_at_50%_0%,rgb(201_184_255/0.2),transparent)] lg:left-[72%] lg:w-[80%]" />
              <div className="absolute -right-[20%] -bottom-[30%] h-[70%] w-[70%] rounded-full bg-[radial-gradient(closest-side,rgb(255_111_174/0.22),transparent)] blur-2xl" />
              <div className="absolute -bottom-[20%] -left-[15%] h-[60%] w-[60%] rounded-full bg-[radial-gradient(closest-side,rgb(124_92_255/0.3),transparent)] blur-2xl" />
              <div className="sk-gridlines absolute inset-0 opacity-40" />
            </div>

            <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.95fr] lg:gap-14">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="sk-eyebrow">
                    <ClapperboardIcon className="size-3.5" aria-hidden /> Also in the toolkit
                  </span>
                  <Status live={live} />
                </div>
                <h2 className="sk-h2 mt-5 text-white" style={{ fontSize: "clamp(38px, 5.4vw, 72px)" }}>
                  ReelVault: <Em>borrow what already works.</Em>
                </h2>
                <p className="mt-6 max-w-[52ch] text-[16px] leading-relaxed text-white/65 md:text-[17.5px]">
                  Ad research shows you the ads that keep running in your niche. ReelVault does the same for reels. Pick the ones people actually watch, and it writes out what was said, splits each one into its parts and helps you write your own version for your group.
                </p>
                <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-white/65 md:text-[17.5px]">
                  Pete watches a viral reel and thinks &ldquo;I should do one of those.&rdquo; <span className="text-white">You get the skeleton of it, and a script with your name on it.</span>
                </p>

                <dl className="mt-9 grid max-w-[56ch] gap-3 text-[14.5px] leading-relaxed sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/[0.035] p-4 ring-1 ring-white/[0.08]">
                    <dt className="font-semibold text-white">Where it lives</dt>
                    <dd className="mt-1 text-white/60">
                      {live
                        ? "The ReelVault item in your app's menu. It opens right inside the app, already signed in."
                        : "It's being set up. When it's ready it appears in your app's menu as ReelVault, already signed in."}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-white/[0.035] p-4 ring-1 ring-white/[0.08]">
                    <dt className="font-semibold text-white">Who pays for the AI</dt>
                    <dd className="mt-1 text-white/60">You, the same way as the app: your own AI, at your own provider&apos;s price.</dd>
                  </div>
                </dl>
                {live ? (
                  <p className="mt-6 flex items-center gap-2.5 text-[13.5px] text-white/60">
                    <MenuChip>ReelVault</MenuChip>
                    opens right inside the app
                  </p>
                ) : null}
              </div>

              <figure className="flex min-w-0 flex-col items-center">
                <RvReels />
                <ol aria-label="What ReelVault splits a reel into" className="mt-10 grid w-full max-w-[460px] gap-2.5 sm:grid-cols-3">
                  {PARTS.map((p) => (
                    <li key={p.name} className="rounded-2xl bg-white/[0.04] px-3.5 py-3 ring-1 ring-white/[0.09] backdrop-blur-sm">
                      <div className="flex items-center gap-2">
                        <span className={cn("size-2 shrink-0 rounded-full", p.dot)} />
                        <span className="text-[13px] font-semibold text-white">{p.name}</span>
                      </div>
                      <div className="mt-1 text-[12.5px] leading-snug text-white/55">{p.body}</div>
                    </li>
                  ))}
                </ol>
                <figcaption className="mt-5 text-center text-[12.5px] text-white/45">A sketch, not a real reel. The bar along the bottom is the hook, the middle and the ask.</figcaption>
              </figure>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/** Says plainly whether ReelVault is switched on yet. */
function Status({ live }: { live: boolean }) {
  return live ? (
    <span className="inline-flex h-7 items-center gap-2 rounded-full bg-[var(--sk-mint)]/10 px-3 text-[12px] font-semibold text-[var(--sk-mint)] ring-1 ring-[var(--sk-mint)]/25">
      <span className="size-1.5 rounded-full bg-[var(--sk-mint)] shadow-[0_0_8px_#6ff2c4]" /> In your app&apos;s menu
    </span>
  ) : (
    <span className="inline-flex h-7 items-center gap-2 rounded-full bg-[var(--sk-gold)]/10 px-3 text-[12px] font-semibold text-[var(--sk-gold)] ring-1 ring-[var(--sk-gold)]/25">
      <span className="relative flex size-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-[var(--sk-gold)]/60 motion-reduce:hidden" />
        <span className="size-1.5 rounded-full bg-[var(--sk-gold)]" />
      </span>
      Being set up
    </span>
  );
}
