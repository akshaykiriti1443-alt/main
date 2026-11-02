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
  children,
}: {
  brand: ShellBrand;
  groups: NavGroup[];
  places?: Place[];
  user: ShellUser;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar brand={brand} groups={groups} places={places} user={user} />
      <SidebarInset className="min-w-0">
        <AppHeader brand={brand} groups={groups} places={places} />
        <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 px-4 pt-6 pb-16 md:px-8 md:pt-8">
          {banner}
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
