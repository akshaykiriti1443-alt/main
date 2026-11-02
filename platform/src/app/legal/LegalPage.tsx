import type { ReactNode } from "react";
import Link from "next/link";
import { env } from "@/lib/env";
import { BrandMark } from "@/components/shell";
import { ThemeToggle } from "@/components/theme";
import { Separator } from "@/components/ui/separator";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 font-semibold text-foreground hover:no-underline" data-slot="brand">
            <BrandMark brand={{ name: env.platformName }} />
            <span className="truncate">{env.platformName}</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 md:py-16">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">{title}</h1>
          <p className="text-sm text-muted-foreground">Last updated {updated}</p>
        </div>
        <Separator className="my-8" />
        <article className="legal flex flex-col gap-4 text-[15px] leading-7 text-foreground/90 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h2:first-child]:mt-0">
          {children}
        </article>
      </main>
    </div>
  );
}
