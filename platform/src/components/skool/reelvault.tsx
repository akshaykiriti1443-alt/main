import { ClapperboardIcon, PenLineIcon, PlayIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, MenuChip } from "./parts";
import { TextBars } from "./visuals";

// ReelVault, the second tool. It opens right inside the OneX app, from its menu, so this
// section says only what it does today and, when it isn't switched on yet, says that plainly.

const PARTS: { name: string; body: string }[] = [
  { name: "The hook", body: "The first line, the one that stops the thumb." },
  { name: "The middle", body: "What they actually show, beat by beat." },
  { name: "The ask", body: "What they tell you to do at the end, and how." },
];

export function ReelVaultSection({ live }: { live: boolean }) {
  return (
    <section id="reelvault" className="scroll-mt-20 pb-24 md:pb-32">
      <Container>
        <div className="reveal relative isolate overflow-hidden rounded-[32px] bg-galaxy p-7 text-white shadow-lift ring-1 ring-white/10 md:p-12 lg:p-14">
          <div aria-hidden className="bg-stars pointer-events-none absolute inset-0 -z-10 text-white/45" />
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.95fr] lg:gap-16">
            <div>
              <span className="inline-flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.14em] text-violet-200 uppercase">
                <ClapperboardIcon className="size-3.5" aria-hidden /> Also in the toolkit
              </span>
              <h2 className="mt-4 font-display text-[38px] leading-[1.02] font-normal tracking-[-0.015em] text-white md:text-[54px]">
                ReelVault: <em className="italic text-violet-200">borrow what already works.</em>
              </h2>
              <p className="mt-5 max-w-[52ch] text-[16px] leading-relaxed text-white/75 md:text-[17px]">
                Ad research shows you the ads that keep running in your niche. ReelVault does the same for reels. Pick the ones people actually watch, and it writes out what was said, splits each one into its parts and helps you write your own version for your group.
              </p>
              <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-white/75 md:text-[17px]">
                Pete watches a viral reel and thinks &ldquo;I should do one of those.&rdquo; You get the skeleton of it, and a script with your name on it.
              </p>

              <dl className="mt-8 grid max-w-[52ch] gap-4 border-t border-white/15 pt-6 text-[14.5px] leading-relaxed sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-white">Where it lives</dt>
                  <dd className="mt-1 text-white/70">
                    {live
                      ? "The ReelVault item in your app's menu. It opens right inside the app, already signed in."
                      : "It's being set up. When it's ready it appears in your app's menu as ReelVault, already signed in."}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-white">Who pays for the AI</dt>
                  <dd className="mt-1 text-white/70">You, the same way as the app: your own AI, at your own provider&apos;s price.</dd>
                </div>
              </dl>
              {live ? (
                <p className="mt-6 flex items-center gap-2.5 text-[13.5px] text-white/70">
                  <MenuChip className="bg-white/10 text-white ring-white/15">ReelVault</MenuChip>
                  opens right inside the app
                </p>
              ) : null}
            </div>

            <ReelPicture />
          </div>
        </div>
      </Container>
    </section>
  );
}

/** A reel and its breakdown, drawn plainly. No real reel, no real creator. */
function ReelPicture() {
  return (
    <figure className="flex flex-col items-center gap-4">
      <div aria-hidden className="flex w-full max-w-[460px] items-center gap-4 sm:gap-6">
        <div className="relative aspect-[9/16] w-[38%] shrink-0 overflow-hidden rounded-[22px] bg-[linear-gradient(160deg,#2c1679,#7a57f0)] ring-4 ring-white/15">
          <span className="bg-stars absolute inset-0 text-white/40" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-11 place-items-center rounded-full bg-white/20 backdrop-blur">
              <PlayIcon className="ml-0.5 size-5 fill-white text-white" />
            </span>
          </span>
          <span className="absolute inset-x-3 bottom-3 flex gap-1">
            <span className="h-1 w-[18%] rounded-full bg-white" />
            <span className="h-1 flex-1 rounded-full bg-white/60" />
            <span className="h-1 w-[22%] rounded-full bg-white/35" />
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          {PARTS.map((p, i) => (
            <div key={p.name} className="rounded-2xl bg-white/[0.07] px-3.5 py-3 ring-1 ring-white/10 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <span className={cn("h-1.5 w-5 rounded-full", i === 0 ? "bg-white" : i === 1 ? "bg-white/60" : "bg-white/35")} />
                <span className="text-[12.5px] font-semibold text-white">{p.name}</span>
              </div>
              <div className="mt-1 hidden text-[12px] leading-snug text-white/65 sm:block">{p.body}</div>
            </div>
          ))}
          <div className="rounded-2xl bg-card px-3.5 py-3 text-foreground shadow-lift">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold">
              <PenLineIcon className="size-3.5 text-primary dark:text-violet-300" /> Your version
            </div>
            <TextBars className="mt-2" widths={["w-full", "w-[70%]"]} />
          </div>
        </div>
      </div>
      <figcaption className="text-center text-[12.5px] text-white/60">A sketch, not a real reel. The bar along the bottom is the hook, the middle and the ask.</figcaption>
    </figure>
  );
}
