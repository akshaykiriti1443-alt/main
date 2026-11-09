import type { ReactNode } from "react";
import Link from "next/link";
import { CheckIcon, FlameIcon, PaletteIcon, SparklesIcon } from "lucide-react";
import { env } from "@/lib/env";
import { requestHost } from "@/server/auth";
import { agencyForHost } from "@/server/agency";
import { PENNY_WAVE } from "@/components/penny-art";
import { BrandMark, Wordmark } from "@/components/shell";
import { ThemeToggle } from "@/components/theme";
import { LessonTag } from "@/components/ui";

/** The night side of the page: why you're here, in a few short lines. */
export type AuthAside = { eyebrow: string; title: string; points: string[]; scene?: "member" | "agency" };

const DEFAULT_ASIDE: AuthAside = {
  eyebrow: "For Skool community owners",
  title: "Your whole Skool funnel, in one calm place.",
  points: ["A landing page and free guide, written by AI", "Leads that sort themselves into hot, warm and cold", "The Skool growth ladder, one step at a time", "Bring your own AI. Free plans work"],
};

const CARD = "absolute rounded-2xl bg-card text-card-foreground shadow-float ring-1 ring-black/5 dark:ring-white/10";

/** A little scene: your next step, a fresh lead and Penny (for agencies: your brand and client accounts). Pure decoration. */
function Scene({ variant = "member" }: { variant?: "member" | "agency" }) {
  return (
    <div aria-hidden className="relative mx-auto h-[300px] w-full max-w-[440px] select-none">
      {variant === "agency" ? (
        <>
          <div className={`${CARD} top-0 left-0 w-[80%] -rotate-[3deg] p-4`}>
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-[10px] bg-[#0f7a57] text-xs font-bold text-white">GL</span>
              <div className="grid">
                <span className="text-[16px] font-semibold tracking-[-0.01em]">Growth Lab</span>
                <span className="text-xs text-muted-foreground">app.growthlab.co</span>
              </div>
              <PaletteIcon className="ml-auto size-4 text-muted-foreground" />
            </div>
            <div className="mt-3 flex gap-1.5">
              {["bg-[#0f7a57]", "bg-ink", "bg-[#e8b341]", "bg-muted"].map((c) => (
                <span key={c} className={`h-6 flex-1 rounded-md ${c}`} />
              ))}
            </div>
          </div>
          <div className={`${CARD} right-0 bottom-2 w-[78%] rotate-[2.5deg] p-4`}>
            <div className="text-[10.5px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Client accounts</div>
            <ul className="mt-2.5 flex flex-col gap-2 text-sm">
              {["Fit Dads Club", "Yoga for Runners"].map((n) => (
                <li key={n} className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-success" />
                  <span className="flex-1 font-medium">{n}</span>
                  <span className="text-xs font-semibold text-muted-foreground">Active</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <>
          <div className={`${CARD} top-0 left-0 w-[82%] -rotate-[3deg] p-4`}>
            <div className="text-[10.5px] font-semibold tracking-[0.12em] text-accent-foreground uppercase">Up next · Lesson 1.4</div>
            <div className="mt-1.5 font-display text-[24px] leading-[1.05]">Publish your funnel</div>
            <div className="mt-1 text-[13px] text-muted-foreground">Edit three lines, then press the scary button.</div>
            <div className="mt-3.5 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full w-[22%] rounded-full bg-[linear-gradient(90deg,var(--violet-500),var(--pink-400))]" />
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">3 of 26</span>
            </div>
          </div>
          <div className={`${CARD} right-0 bottom-3 w-[80%] rotate-[2.5deg] p-3.5`}>
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--violet-100),var(--pink-100))] text-xs font-semibold text-violet-700">JD</span>
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
      <svg
        viewBox="0 0 200 200"
        className="absolute top-[30%] right-[-2%] size-[104px] rotate-6 drop-shadow-[0_10px_24px_rgb(0_0_0/0.35)]"
        dangerouslySetInnerHTML={{ __html: PENNY_WAVE }}
      />
      <span className="absolute -top-3 right-[22%] size-1.5 rounded-full bg-white/60" />
      <span className="absolute bottom-0 left-[8%] size-3 rounded-full bg-pink-300 shadow-[0_0_16px_rgb(255_166_200/0.8)]" />
      <span className="absolute top-[54%] left-[3%] size-1.5 rounded-full bg-white/50" />
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
    <div className="relative flex min-h-svh overflow-x-clip bg-background">
      {/* The form side: marshmallow, nothing else. */}
      <div className="relative flex min-w-0 flex-1 flex-col px-5 py-5 sm:px-10 lg:px-14">
        <div aria-hidden className="pointer-events-none absolute top-[-160px] left-1/2 -z-0 h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow-violet),transparent)] opacity-70 lg:left-[45%]" />
        <div className="relative flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 text-foreground hover:no-underline" data-slot="brand">
            {agency ? (
              <>
                <BrandMark brand={{ name, logoUrl: agency.brand.logoUrl, color: agency.brand.color }} />
                <span className="text-[17px] font-semibold tracking-[-0.01em]">{name}</span>
              </>
            ) : (
              <Wordmark name={name} />
            )}
          </Link>
          <ThemeToggle />
        </div>

        <main className="relative mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12">
          {lesson ? <LessonTag lesson={lesson} stage={stage} className="mb-5 self-start" /> : null}
          <h1 className="text-[42px] leading-[1.02] tracking-[-0.015em] md:text-[52px]">{title}</h1>
          {sub ? <p className="mt-3.5 text-[15.5px] leading-relaxed text-muted-foreground">{sub}</p> : null}
          <div className="mt-9">{children}</div>

          {/* On phones the night side folds into a short list under the form. */}
          <ul className="mt-10 flex flex-col gap-3 border-t border-border pt-7 lg:hidden">
            {aside.points.slice(0, 3).map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm text-muted-foreground">
                <span className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full bg-accent text-primary dark:text-violet-300">
                  <CheckIcon className="size-3" strokeWidth={3} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </main>

        <footer className="relative flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-subtle-foreground lg:justify-start">
          <span>
            © {name}
            {!agency && env.platformBy ? (
              <>
                {" "}by{" "}
                <a href={env.platformByUrl} className="text-subtle-foreground hover:text-foreground">
                  {env.platformBy}
                </a>
              </>
            ) : null}
          </span>
          <Link href="/legal/terms" className="text-subtle-foreground hover:text-foreground">
            Terms
          </Link>
          <Link href="/legal/privacy" className="text-subtle-foreground hover:text-foreground">
            Privacy
          </Link>
        </footer>
      </div>

      {/* The night side: what you get, with a little scene. Desktop only. */}
      <aside className="bg-galaxy relative isolate m-3 hidden w-[46%] max-w-[660px] flex-col justify-between overflow-hidden rounded-[28px] p-10 text-white shadow-lift ring-1 ring-white/10 lg:flex xl:p-14">
        <div aria-hidden className="bg-stars pointer-events-none absolute inset-0 -z-10 text-white/50" />
        <div aria-hidden className="pointer-events-none absolute -top-28 -right-28 -z-10 size-96 rounded-full border border-white/[0.1]" />
        <div aria-hidden className="pointer-events-none absolute -top-8 -right-8 -z-10 size-56 rounded-full border border-white/[0.07]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-20 -z-10 h-80 w-[560px] rounded-full bg-[radial-gradient(closest-side,rgb(255_133_181/0.18),transparent)]" />

        <div className="flex flex-col gap-5">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-pink-200 uppercase ring-1 ring-white/15">
            <SparklesIcon className="size-3.5" aria-hidden />
            {aside.eyebrow}
          </span>
          <h2 className="max-w-[15ch] font-display text-[44px] leading-[1.02] font-normal tracking-[-0.015em] text-white xl:text-[54px]">{aside.title}</h2>
        </div>

        <Scene variant={aside.scene} />

        <ul className="flex flex-col gap-3.5">
          {aside.points.map((p) => (
            <li key={p} className="flex items-start gap-3 text-[15px] text-white/85">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/[0.12] text-pink-200 ring-1 ring-white/20">
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
