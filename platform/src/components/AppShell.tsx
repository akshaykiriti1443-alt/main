import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader, AppSidebar, type NavGroup, type Place, type ShellBrand, type ShellUser } from "./shell";

export type { IconName, NavGroup, NavItem, Place } from "./shell";

export async function AppShell({
  brand,
  groups,
  places = [],
  user,
  banner,
  footnote,
  headerExtra,
  companion,
  children,
}: {
  brand: ShellBrand;
  groups: NavGroup[];
  places?: Place[];
  user: ShellUser;
  banner?: ReactNode;
  /** Quiet notes drawn after the page (membership and card info), never above the next step. */
  footnote?: ReactNode;
  /** Small controls in the top bar, before the theme toggle (e.g. the guide button). */
  headerExtra?: ReactNode;
  /** The step-by-step guide, floating over every page. */
  companion?: ReactNode;
  children: ReactNode;
}) {
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  // "OneX by ScaleitAds", only on the platform's own screens (agency-branded ones name their agency in `sub`).
  const ours = brand.name === env.platformName || Boolean(brand.sub?.endsWith(env.platformName));
  const attribution = ours && env.platformBy ? { label: `${env.platformName} by ${env.platformBy}`, href: env.platformByUrl } : null;
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar brand={brand} groups={groups} places={places} user={user} attribution={attribution} />
      <SidebarInset className="min-w-0">
        <AppHeader brand={brand} groups={groups} places={places} extra={headerExtra} />
        {/* A container, so page grids respond to the real width (the guide docks beside it on wide screens). */}
        <div className="@container/main mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-8 px-4 pt-8 pb-24 md:px-10 md:pt-12 xl:px-12">
          {banner}
          {children}
          {footnote ? <div className="flex flex-col gap-3 pt-4 text-sm text-muted-foreground">{footnote}</div> : null}
        </div>
      </SidebarInset>
      {companion}
    </SidebarProvider>
  );
}
