import type { ReactNode } from "react";
import { ReceiptTextIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tilt } from "./fx/motion";
import { CARD, Container, Em, Penny, SectionHead } from "./parts";

// What the week costs, and what happens if you leave. The words come from the page so the prices
// and the cancel steps live in one place (src/app/skool/page.tsx and src/lib/leaving.ts).
// Never a date, a countdown or a total we can't know.

export type CostLine = { item: string; price: string; note: ReactNode; payee: string };

export function Cost({ lines, footnote }: { lines: CostLine[]; footnote: ReactNode }) {
  return (
    <section id="cost" className="relative scroll-mt-24 py-24 md:py-36">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.12),transparent)]" />
      <Container className="grid items-start gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
        <div className="lg:sticky lg:top-32">
          <SectionHead
            eyebrow="What it costs"
            title={
              <>
                The whole bill, <Em>before you start.</Em>
              </>
            }
            sub="Four things can cost you money, plus one thing Pete thinks you need. Here they all are, with who gets paid. Nothing else turns up later."
          />
          <div className="reveal mt-10 flex items-center gap-4 [transition-delay:140ms]">
            <Penny size={76} pose="wink" full className="shrink-0 drop-shadow-[0_12px_30px_rgb(124_92_255/0.35)]" />
            <span className="relative max-w-[30ch] rounded-2xl rounded-bl-md bg-white/[0.05] px-4 py-3 text-[14px] leading-snug text-white/70 ring-1 ring-white/10 backdrop-blur">
              Every number here is the real one.
            </span>
          </div>
        </div>

        <Receipt lines={lines} footnote={footnote} />
      </Container>
    </section>
  );
}

/** A barcode for the bottom of the receipt. Decoration only: it encodes nothing. */
const BARS = "21311241132213121411213112132241";

function Receipt({ lines, footnote }: { lines: CostLine[]; footnote: ReactNode }) {
  const [first, ...rest] = lines;
  return (
    <div className="reveal [transition-delay:80ms]">
      <Tilt max={3} className="rounded-[28px]">
        <div className={cn(CARD, "overflow-hidden")}>
          {/* The top of the receipt. */}
          <div className="flex items-center justify-between gap-4 px-5 pt-7 pb-6 md:px-8">
            <div className="flex min-w-0 items-center gap-3.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10" aria-hidden>
                <ReceiptTextIcon className="size-5 text-[var(--sk-lilac)]" />
              </span>
              <div className="min-w-0">
                <div className="sk-display text-[28px] text-white md:text-[32px]">Your week</div>
                <div className="mt-1 text-[12.5px] text-white/45">Every line, and who gets paid</div>
              </div>
            </div>
            <span className="hidden shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-white/50 uppercase ring-1 ring-white/10 sm:inline-flex">
              Itemised
            </span>
          </div>

          {/* The membership: the one line that's a subscription, so it gets the light. */}
          {first ? (
            <div className="px-2.5 md:px-3.5">
              <div className="sk-beam rounded-[22px] bg-[radial-gradient(120%_140%_at_0%_0%,rgb(124_92_255/0.2),transparent_60%)] ring-1 ring-violet-300/15 ring-inset">
                <span className="flex items-center gap-2 px-5 pt-6 text-[11px] font-semibold tracking-[0.16em] text-[var(--sk-lilac)] uppercase md:px-6">
                  <span className="size-1.5 rounded-full bg-[var(--sk-pink)] shadow-[0_0_10px_2px_rgb(255_111_174/0.7)]" aria-hidden />
                  Your membership
                </span>
                <Line line={first} featured />
              </div>
            </div>
          ) : null}

          <ul className="mt-2 px-5 md:px-8">
            {rest.map((l) => (
              <li key={l.item} className="border-t border-dashed border-white/[0.12] first:border-t-0">
                <Line line={l} />
              </li>
            ))}
          </ul>

          {/* The bottom: a double rule, the footnote and a barcode, like the end of a till roll. */}
          <div className="mt-2 border-t border-white/10 bg-white/[0.025] px-5 pt-6 pb-8 md:px-8">
            <div aria-hidden className="h-[4px] border-y border-white/15" />
            <div className="mt-5 text-[15px] leading-relaxed text-white/65">{footnote}</div>
            <div className="mt-7 flex flex-col items-center gap-2.5" aria-hidden>
              <div className="flex h-10 items-stretch gap-[3px] opacity-35">
                {BARS.split("").map((w, i) => (
                  <span key={i} className="rounded-[1px] bg-white" style={{ width: Number(w) * 1.5 }} />
                ))}
              </div>
              <span className="text-[11px] font-semibold tracking-[0.3em] text-white/30 uppercase">That&apos;s the lot</span>
            </div>
          </div>
        </div>
      </Tilt>
    </div>
  );
}

function Line({ line, featured }: { line: CostLine; featured?: boolean }) {
  return (
    <div className={featured ? "px-5 pt-3.5 pb-7 md:px-6" : "py-6 md:py-7"}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
        <h3 className="min-w-0 text-[17px] leading-snug font-semibold tracking-[-0.015em] text-white sm:max-w-[58%] md:text-[18px]">{line.item}</h3>
        <span aria-hidden className="mb-[7px] hidden h-0 min-w-6 flex-1 border-b-2 border-dotted border-white/20 sm:block" />
        <span className={cn("sk-display shrink-0 text-[34px] leading-none whitespace-nowrap tabular-nums md:text-[40px]", featured ? "sk-grad pb-[0.06em]" : "text-white")}>{line.price}</span>
      </div>
      <p className="mt-3 max-w-[58ch] text-[14.5px] leading-relaxed text-white/60">{line.note}</p>
      <p className="mt-3.5 inline-flex items-center gap-2 rounded-full bg-white/[0.04] py-1 pr-3 pl-2.5 text-[12px] font-medium text-white/55 ring-1 ring-white/10">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--sk-mint)]" />
        {line.payee}
      </p>
    </div>
  );
}

export type CancelPoint = { label: string; body: string };

export function Cancel({ points, lead }: { points: CancelPoint[]; lead: ReactNode }) {
  return (
    <section id="cancel" className="scroll-mt-24 pb-24 md:pb-36">
      <Container className="grid items-start gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
        <div className="reveal lg:sticky lg:top-32">
          <span className="sk-eyebrow">If you cancel</span>
          <h2 className="sk-display mt-5 text-[clamp(38px,5vw,64px)] text-white">
            Leaving is <Em>a fine answer.</Em>
          </h2>
          <div className="mt-5 max-w-[44ch] text-[16px] leading-relaxed text-white/60 md:text-[17px]">{lead}</div>
        </div>
        <dl className={cn(CARD, "reveal divide-y divide-white/[0.08] overflow-hidden [transition-delay:80ms]")}>
          {points.map((p, i) => (
            <div key={p.label} className="grid gap-2.5 px-5 py-6 sm:grid-cols-[180px_1fr] sm:gap-8 md:px-8 md:py-7">
              <dt className="flex items-center gap-3 text-[14.5px] font-semibold tracking-[-0.01em] text-white sm:items-start">
                <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.05] text-[12px] font-semibold text-[var(--sk-lilac)] tabular-nums ring-1 ring-white/10">
                  {i + 1}
                </span>
                <span className="sm:pt-1">{p.label}</span>
              </dt>
              <dd className="text-[15px] leading-relaxed text-white/60 sm:pt-0.5">{p.body}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
