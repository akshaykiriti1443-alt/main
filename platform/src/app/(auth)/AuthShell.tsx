import type { ReactNode } from "react";
import Link from "next/link";
import { CheckIcon, FlameIcon, GiftIcon, PaletteIcon, SparklesIcon } from "lucide-react";
import { env } from "@/lib/env";
import { requestHost } from "@/server/auth";
import { agencyForHost } from "@/server/agency";
import { BrandMark } from "@/components/shell";
import { ThemeToggle } from "@/components/theme";
import { LessonTag } from "@/components/ui";

/** The warm side of the page: why you're here, in four short lines. */
export type AuthAside = { eyebrow: string; title: string; points: string[]; scene?: "member" | "agency" };

const DEFAULT_ASIDE: AuthAside = {
  eyebrow: "For Skool community owners",
  title: "Your whole Skool funnel, in one place.",
  points: ["A landing page and free guide, written by AI", "Leads that sort themselves into hot, warm and cold", "The Skool growth ladder, one step at a time", "Bring your own AI. Free plans work"],
};

const CARD = "absolute rounded-2xl bg-card text-card-foreground shadow-lift ring-1 ring-black/5";

/** A little scene: your next step, a fresh lead and a gold coin (for agencies: your brand and client accounts). Pure decoration. */
function Scene({ variant = "member" }: { variant?: "member" | "agency" }) {
  return (
    <div aria-hidden className="relative mx-auto h-[290px] w-full max-w-[420px] select-none">
      {variant === "agency" ? (
        <>
          <div className={`${CARD} top-0 left-0 w-[80%] -rotate-[4deg] p-4`}>
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-[10px] bg-[oklch(0.62_0.17_160)] font-heading text-xs font-bold text-white">GL</span>
              <div className="grid">
                <span className="font-heading text-[17px] font-bold">Growth Lab</span>
                <span className="text-xs text-muted-foreground">app.growthlab.co</span>
              </div>
              <PaletteIcon className="ml-auto size-4 text-muted-foreground" />
            </div>
            <div className="mt-3 flex gap-1.5">
              {["bg-[oklch(0.62_0.17_160)]", "bg-[oklch(0.3_0.05_265)]", "bg-[oklch(0.85_0.13_85)]", "bg-muted"].map((c) => (
                <span key={c} className={`h-6 flex-1 rounded-md ${c}`} />
              ))}
            </div>
          </div>
          <div className={`${CARD} right-0 bottom-2 w-[78%] rotate-[3deg] p-3.5`}>
            <div className="text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">Client accounts</div>
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {[
                ["Fit Dads Club", "$97/mo"],
                ["Yoga for Runners", "$149/mo"],
              ].map(([n, p]) => (
                <li key={n} className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-success" />
                  <span className="flex-1 font-medium">{n}</span>
                  <span className="text-xs font-semibold text-success tabular-nums">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <>
          <div className={`${CARD} top-0 left-0 w-[82%] -rotate-[4deg] p-4`}>
            <div className="text-[10px] font-bold tracking-[0.1em] text-primary uppercase">Up next · Lesson 1.3</div>
            <div className="mt-1 font-heading text-lg font-bold">Publish your funnel</div>
            <div className="mt-0.5 text-[13px] text-muted-foreground">Edit three lines, then press the scary button.</div>
            <div className="mt-3 flex items-center gap-2">
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full w-[22%] rounded-full bg-success" />
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">3 of 23</span>
            </div>
          </div>
          <div className={`${CARD} right-0 bottom-2 w-[80%] rotate-[3deg] p-3.5`}>
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent font-heading text-xs font-bold text-primary">JD</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">Jamie signed up</div>
                <div className="truncate text-xs text-muted-foreground">from your Pain ad · just now</div>
              </div>
              <span className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full bg-hot-soft px-2 text-[11px] font-semibold text-hot">
                <FlameIcon className="size-3" /> Hot
              </span>
            </div>
          </div>
        </>
      )}
      <div className="absolute top-[40%] right-[3%] grid size-16 rotate-12 place-items-center rounded-full bg-gold text-[oklch(0.38_0.09_70)] shadow-lift ring-4 ring-white/25">
        <GiftIcon className="size-7" strokeWidth={2.25} />
      </div>
      <span className="absolute -top-3 right-[22%] size-2.5 rounded-full bg-white/50" />
      <span className="absolute bottom-0 left-[8%] size-3.5 rounded-full bg-success ring-2 ring-white/30" />
      <span className="absolute top-[52%] left-[4%] size-2 rounded-full bg-white/40" />
    </div>
  );
}

export async function AuthShell({
  title,
  sub,
  children,
  aside = DEFAULT_ASIDE,
  lesson,
  stage,
}: {
  title: string;
  sub?: ReactNode;
  children: ReactNode;
  aside?: AuthAside;
  /** Lesson tag above the title, when a course lesson sends you here. */
  lesson?: string;
  stage?: string;
}) {
  const agency = await agencyForHost(await requestHost());
  const name = agency?.brand.name || env.platformName;
  return (
    <div className="flex min-h-svh bg-background">
      {/* The form side. */}
      <div className="flex min-w-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 font-heading text-lg font-bold text-foreground hover:no-underline" data-slot="brand">
            <BrandMark brand={{ name, logoUrl: agency?.brand.logoUrl, color: agency?.brand.color }} />
            {name}
          </Link>
          <ThemeToggle />
        </div>

        <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          {lesson ? <LessonTag lesson={lesson} stage={stage} className="mb-4 self-start" /> : null}
          <h1 className="text-[30px] leading-[1.1] font-bold md:text-[34px]">{title}</h1>
          {sub ? <p className="mt-2.5 text-[15px] text-muted-foreground">{sub}</p> : null}
          <div className="mt-7">{children}</div>

          {/* On phones the warm side folds into a short list under the form. */}
          <ul className="mt-9 flex flex-col gap-2.5 border-t border-dashed pt-6 lg:hidden">
            {aside.points.slice(0, 3).map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <span className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full bg-success-soft text-success">
                  <CheckIcon className="size-3" strokeWidth={3} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </main>

        <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground lg:justify-start">
          <span>© {name}</span>
          <Link href="/legal/terms" className="text-muted-foreground">
            Terms
          </Link>
          <Link href="/legal/privacy" className="text-muted-foreground">
            Privacy
          </Link>
        </footer>
      </div>

      {/* The warm side: what you get, with a little scene. Desktop only. */}
      <aside className="relative isolate m-3 hidden w-[46%] max-w-[640px] flex-col justify-between overflow-hidden rounded-[28px] bg-hero p-10 text-white shadow-lift lg:flex xl:p-12">
        <div aria-hidden className="bg-dots pointer-events-none absolute inset-0 -z-10 text-white/[0.08] [mask-image:linear-gradient(160deg,transparent_30%,black)]" />
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 -z-10 size-80 rounded-full border border-white/15" />
        <div aria-hidden className="pointer-events-none absolute -top-6 -right-6 -z-10 size-44 rounded-full border border-white/10" />

        <div className="flex flex-col gap-3">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold tracking-[0.08em] text-white uppercase ring-1 ring-white/20">
            <SparklesIcon className="size-3.5" aria-hidden />
            {aside.eyebrow}
          </span>
          <h2 className="max-w-[16ch] text-[34px] leading-[1.08] font-bold text-white xl:text-[40px]">{aside.title}</h2>
        </div>

        <Scene variant={aside.scene} />

        <ul className="flex flex-col gap-3">
          {aside.points.map((p) => (
            <li key={p} className="flex items-start gap-3 text-[15px] text-white/90">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/20 ring-1 ring-white/25">
                <CheckIcon className="size-3" strokeWidth={3} aria-hidden />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
