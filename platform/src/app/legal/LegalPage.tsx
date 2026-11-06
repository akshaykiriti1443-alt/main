import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { env } from "@/lib/env";
import { Wordmark } from "@/components/shell";
import { ThemeToggle } from "@/components/theme";

const OTHERS = [
  ["/legal/privacy", "Privacy"],
  ["/legal/terms", "Terms"],
  ["/legal/data-deletion", "Data deletion"],
] as const;

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col overflow-x-clip bg-background">
      <div aria-hidden className="pointer-events-none absolute top-[-220px] left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow-violet),transparent)] opacity-80" />
      <header className="relative border-b border-border/70 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] w-full max-w-3xl items-center justify-between gap-4 px-5">
          <Link href="/" className="min-w-0 hover:no-underline" data-slot="brand">
            <Wordmark name={env.platformName} />
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="relative mx-auto w-full max-w-3xl flex-1 px-5 pt-14 pb-24 md:pt-20">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted-foreground hover:text-foreground hover:no-underline">
          <ArrowLeftIcon className="size-3.5" aria-hidden /> Back to {env.platformName}
        </Link>
        <h1 className="mt-6 text-[46px] leading-[1] tracking-[-0.015em] md:text-[64px]">{title}</h1>
        <p className="mt-4 text-sm text-muted-foreground">Last updated {updated}</p>
        <div className="my-10 h-px bg-border" />
        <article className="legal flex max-w-[68ch] flex-col gap-4 text-[16px] leading-[1.75] text-foreground/85 [&_h2]:mt-8 [&_h2]:text-[19px] [&_h2]:font-semibold [&_h2]:tracking-[-0.012em] [&_h2]:text-foreground [&_h2:first-child]:mt-0 [&_li]:marker:text-primary">
          {children}
        </article>
        <nav aria-label="Legal" className="mt-16 flex flex-wrap gap-2 border-t border-border pt-8">
          {OTHERS.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-full border border-border-strong bg-card px-4 py-1.5 text-[13.5px] font-medium text-foreground/80 hover:border-violet-200 hover:bg-accent hover:text-accent-foreground hover:no-underline dark:border-white/12 dark:hover:bg-white/[0.06] dark:hover:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
