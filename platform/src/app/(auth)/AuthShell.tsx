import type { ReactNode } from "react";
import Link from "next/link";
import { env } from "@/lib/env";
import { requestHost } from "@/server/auth";
import { agencyForHost } from "@/server/agency";
import { BrandMark } from "@/components/shell";
import { ThemeToggle } from "@/components/theme";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export async function AuthShell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const agency = await agencyForHost(await requestHost());
  const name = agency?.brand.name || env.platformName;
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-48 -z-10 flex justify-center">
        <div className="h-[420px] w-[720px] rounded-full bg-primary/12 blur-3xl dark:bg-primary/20" />
      </div>
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold text-foreground hover:no-underline" data-slot="brand">
        <BrandMark brand={{ name, logoUrl: agency?.brand.logoUrl, color: agency?.brand.color }} />
        {name}
      </Link>
      <Card className="w-full max-w-sm shadow-lg shadow-primary/5">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-semibold tracking-tight">{title}</CardTitle>
          {sub ? <CardDescription>{sub}</CardDescription> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
