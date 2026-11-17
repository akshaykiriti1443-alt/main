import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CARD, Container, Em, Penny, SectionHead } from "./parts";

// What the week costs, and what happens if you leave. The words come from the page so the prices
// and the cancel steps live in one place (src/app/skool/page.tsx and src/lib/leaving.ts).
// Never a date, a countdown or a total we can't know.

export type CostLine = { item: string; price: string; note: ReactNode; payee: string };

export function Cost({ lines, footnote }: { lines: CostLine[]; footnote: ReactNode }) {
  return (
    <section id="cost" className="scroll-mt-20 border-t border-border/60 py-24 md:py-32">
      <Container className="grid items-start gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
        <div className="lg:sticky lg:top-28">
          <SectionHead
            eyebrow="What it costs"
            title={
              <>
                The whole bill, <Em>before you start.</Em>
              </>
            }
            sub="Four things can cost you money, plus one thing Pete thinks you need. Here they all are, with who gets paid. Nothing else turns up later."
          />
          <div className="reveal mt-8 hidden items-center gap-3 lg:flex">
            <Penny size={64} pose="wink" full />
            <span className="max-w-[30ch] text-[13.5px] leading-snug text-muted-foreground">I&apos;m a coin. I take money very seriously.</span>
          </div>
        </div>

        <Receipt lines={lines} footnote={footnote} />
      </Container>
    </section>
  );
}

function Receipt({ lines, footnote }: { lines: CostLine[]; footnote: ReactNode }) {
  return (
    <div className={cn(CARD, "reveal relative overflow-hidden [transition-delay:80ms]")}>
      <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-border-strong px-6 pt-7 pb-5 md:px-9">
        <span className="font-display text-[28px] leading-none md:text-[32px]">Your week</span>
        <span className="text-[11.5px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">Itemised</span>
      </div>
      <ul>
        {lines.map((l) => (
          <li key={l.item} className="grid gap-x-6 gap-y-2 border-b border-dashed border-border-strong/70 px-6 py-6 sm:grid-cols-[1fr_auto] md:px-9">
            <div className="min-w-0">
              <h3 className="text-[16.5px] font-semibold tracking-[-0.012em]">{l.item}</h3>
              <p className="mt-1.5 max-w-[54ch] text-[14.5px] leading-relaxed text-muted-foreground">{l.note}</p>
              <p className="mt-2 text-[12px] font-medium text-subtle-foreground">{l.payee}</p>
            </div>
            <span className="order-first font-display text-[26px] leading-none whitespace-nowrap tabular-nums sm:order-none sm:pt-0.5 sm:text-right">{l.price}</span>
          </li>
        ))}
      </ul>
      <div className="bg-muted/50 px-6 py-5 text-[14px] leading-relaxed md:px-9">{footnote}</div>
    </div>
  );
}

export type CancelPoint = { label: string; body: string };

export function Cancel({ points, lead }: { points: CancelPoint[]; lead: ReactNode }) {
  return (
    <section id="cancel" className="scroll-mt-20 pb-24 md:pb-32">
      <Container>
        <div className={cn(CARD, "reveal grid gap-10 p-7 md:p-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:p-14")}>
          <div>
            <span className="eyebrow">If you cancel</span>
            <h2 className="mt-4 font-display text-[34px] leading-[1.04] font-normal tracking-[-0.012em] md:text-[44px]">
              Leaving is <Em>a fine answer.</Em>
            </h2>
            <div className="mt-4 max-w-[44ch] text-[15.5px] leading-relaxed text-muted-foreground">{lead}</div>
          </div>
          <dl className="flex flex-col">
            {points.map((p) => (
              <div key={p.label} className="grid gap-1.5 border-t border-border py-5 first:border-t-0 first:pt-0 sm:grid-cols-[140px_1fr] sm:gap-6 lg:first:border-t lg:first:pt-5">
                <dt className="text-[13px] font-semibold tracking-[-0.005em] text-foreground">{p.label}</dt>
                <dd className="text-[15px] leading-relaxed text-muted-foreground">{p.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </section>
  );
}
