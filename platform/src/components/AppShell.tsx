import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader, AppSidebar, type NavGroup, type Place, type ShellBrand, type ShellUser } from "./shell";

export type { IconName, NavGroup, NavItem, Place } from "./shell";

export async function AppShell({
  brand,
  groups,
  places = [],
  user,
  banner,
  headerExtra,
  companion,
  children,
}: {
  brand: ShellBrand;
  groups: NavGroup[];
  places?: Place[];
  user: ShellUser;
  banner?: ReactNode;
  /** Small controls in the top bar, before the theme toggle (e.g. the guide button). */
  headerExtra?: ReactNode;
  /** The step-by-step guide, floating over every page. */
  companion?: ReactNode;
  children: ReactNode;
}) {
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar brand={brand} groups={groups} places={places} user={user} />
      <SidebarInset className="min-w-0">
        <AppHeader brand={brand} groups={groups} places={places} extra={headerExtra} />
        {/* A container, so page grids respond to the real width (the guide docks beside it on wide screens). */}
        <div className="@container/main mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-7 px-4 pt-7 pb-20 md:px-10 md:pt-10">
          {banner}
          {children}
        </div>
      </SidebarInset>
      {companion}
    </SidebarProvider>
  );
}
