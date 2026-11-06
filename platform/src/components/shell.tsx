"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ActivityIcon,
  BoxesIcon,
  Building2Icon,
  CalendarDaysIcon,
  CalendarClockIcon,
  SquareKanbanIcon,
  ChevronsUpDownIcon,
  CreditCardIcon,
  GlobeIcon,
  InboxIcon,
  KeyRoundIcon,
  TrendingUpIcon,
  RouteIcon,
  GiftIcon,
  BotIcon,
  PlugIcon,
  IdCardIcon,
  LayoutDashboardIcon,
  LayoutTemplateIcon,
  LockIcon,
  LogOutIcon,
  MailIcon,
  MegaphoneIcon,
  PaletteIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { THEMES, ThemeToggle } from "@/components/theme";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

/* Server layouts pass icon names (functions can't cross the server/client boundary). */
const ICONS = {
  dashboard: LayoutDashboardIcon,
  sparkles: SparklesIcon,
  globe: GlobeIcon,
  users: UsersIcon,
  inbox: InboxIcon,
  mail: MailIcon,
  workflow: WorkflowIcon,
  calendar: CalendarDaysIcon,
  megaphone: MegaphoneIcon,
  billing: CreditCardIcon,
  settings: SettingsIcon,
  clients: Building2Icon,
  templates: LayoutTemplateIcon,
  palette: PaletteIcon,
  key: KeyRoundIcon,
  boxes: BoxesIcon,
  activity: ActivityIcon,
  shield: ShieldCheckIcon,
  ladder: TrendingUpIcon,
  route: RouteIcon,
  gift: GiftIcon,
  bot: BotIcon,
  search: SearchIcon,
  plug: PlugIcon,
  members: IdCardIcon,
  pipeline: SquareKanbanIcon,
  booking: CalendarClockIcon,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
export type NavItem = { href: string; label: string; icon: IconName; exact?: boolean; badge?: number; locked?: boolean };
export type NavGroup = { title?: string; items: NavItem[] };
/** Another workspace, agency or the admin area the user can jump to. */
export type Place = { href: string; label: string; sub?: string; icon: IconName };
export type ShellBrand = { name: string; sub?: string; logoUrl?: string | null; color?: string | null };
export type ShellUser = { email: string; name?: string | null };

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The most specific nav item that matches the current path. */
function useActiveItem(groups: NavGroup[]) {
  const pathname = usePathname();
  const items = groups.flatMap((g) => g.items).filter((i) => isActive(pathname, i));
  return items.sort((a, b) => b.href.length - a.href.length)[0];
}

function initials(text: string) {
  const parts = text.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || text.slice(0, 2).toUpperCase();
}

export function BrandMark({ brand, className }: { brand: ShellBrand; className?: string }) {
  return (
    <span className={cn("brand-mark", className)} style={brand.color ? { background: brand.color } : undefined}>
      {brand.logoUrl ? <img src={brand.logoUrl} alt="" /> : initials(brand.name)}
    </span>
  );
}

/** The platform's own mark (not a workspace's): a galactic-violet tile with a four-point star. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("brand-mark", className)} aria-hidden>
      <svg viewBox="0 0 32 32" className="size-[62%]" fill="none">
        <path d="M16 4.5c.95 6.5 5 10.55 11.5 11.5-6.5.95-10.55 5-11.5 11.5-.95-6.5-5-10.55-11.5-11.5 6.5-.95 10.55-5 11.5-11.5Z" fill="#fff" />
        <circle cx="25.5" cy="6.5" r="2.4" fill="var(--pink-300)" />
      </svg>
    </span>
  );
}

/** Mark + name in the display serif, for marketing and auth pages. */
export function Wordmark({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-[25px] leading-none tracking-[-0.01em] text-foreground">{name}</span>
    </span>
  );
}

function logout() {
  const form = document.createElement("form");
  form.method = "post";
  form.action = "/logout";
  document.body.appendChild(form);
  form.submit();
}

function Switcher({ brand, places }: { brand: ShellBrand; places: Place[] }) {
  const { isMobile } = useSidebar();
  const head = (
    <>
      <BrandMark brand={brand} />
      <span className="grid flex-1 gap-0.5 text-left leading-tight">
        <span className="truncate text-[14.5px] font-semibold tracking-[-0.01em] text-sidebar-accent-foreground">{brand.name}</span>
        {brand.sub ? <span className="truncate text-xs text-sidebar-foreground/65">{brand.sub}</span> : null}
      </span>
    </>
  );
  if (places.length === 0) {
    return (
      <SidebarMenuButton size="lg" asChild>
        <Link href="/app">{head}</Link>
      </SidebarMenuButton>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="rounded-xl data-[state=open]:bg-sidebar-accent">
          {head}
          <ChevronsUpDownIcon className="ml-auto text-sidebar-foreground/50" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-60" side={isMobile ? "bottom" : "right"} align="start" sideOffset={4}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">Switch to</DropdownMenuLabel>
        {places.map((p) => {
          const Icon = ICONS[p.icon];
          return (
            <DropdownMenuItem key={p.href} asChild>
              <Link href={p.href}>
                <Icon />
                <span className="grid leading-tight">
                  <span className="truncate">{p.label}</span>
                  {p.sub ? <span className="truncate text-xs text-muted-foreground">{p.sub}</span> : null}
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const { isMobile } = useSidebar();
  const label = user.name || user.email;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="rounded-xl data-[state=open]:bg-sidebar-accent">
          <Avatar className="size-8">
            <AvatarFallback className="bg-[linear-gradient(135deg,var(--violet-100),var(--pink-100))] text-[11px] font-semibold text-violet-700 dark:bg-[linear-gradient(135deg,#2b2259,#3a1d3a)] dark:text-violet-200">
              {initials(label)}
            </AvatarFallback>
          </Avatar>
          <span className="grid flex-1 gap-0.5 text-left leading-tight">
            <span className="truncate font-medium text-sidebar-accent-foreground">{label}</span>
            {user.name ? <span className="truncate text-xs text-sidebar-foreground/65">{user.email}</span> : null}
          </span>
          <ChevronsUpDownIcon className="ml-auto text-sidebar-foreground/50" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}>
          <LogOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar({ brand, groups, places, user, attribution }: { brand: ShellBrand; groups: NavGroup[]; places: Place[]; user: ShellUser; attribution?: { label: string; href: string } | null }) {
  const active = useActiveItem(groups);
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="px-2.5 pt-3.5 pb-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <Switcher brand={brand} places={places} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-1 px-0.5 pb-2">
        {groups.map((g, i) => (
          <SidebarGroup key={g.title ?? i} className="py-1.5">
            {g.title ? <SidebarGroupLabel className="h-7">{g.title}</SidebarGroupLabel> : null}
            <SidebarMenu className="gap-px">
              {g.items.map((item) => {
                const Icon = ICONS[item.icon];
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={item === active}
                      tooltip={item.locked ? `${item.label} · Growth plan` : item.label}
                      className="h-9 gap-2.5 rounded-[10px] px-2.5 text-[13.5px] font-medium text-sidebar-foreground [&>svg]:size-[17px] [&>svg]:text-sidebar-foreground/55 [&>svg]:transition-colors hover:[&>svg]:text-sidebar-accent-foreground data-active:bg-sidebar-active data-active:text-sidebar-accent-foreground data-active:shadow-[0_1px_2px_rgb(28_21_56/0.06),0_0_0_1px_rgb(28_21_56/0.05)] data-active:[&>svg]:text-primary dark:data-active:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] dark:data-active:[&>svg]:text-violet-300"
                    >
                      <Link href={item.href} data-nav={item.href} onClick={() => isMobile && setOpenMobile(false)}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.locked ? (
                      <SidebarMenuBadge aria-label="Growth plan">
                        <LockIcon className="size-3 text-sidebar-foreground/40" />
                      </SidebarMenuBadge>
                    ) : item.badge ? (
                      <SidebarMenuBadge className="bg-accent text-accent-foreground peer-data-active/menu-button:bg-primary peer-data-active/menu-button:text-primary-foreground">{item.badge}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/70 px-2.5 py-2.5 group-data-[collapsible=icon]:border-t-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu user={user} />
          </SidebarMenuItem>
        </SidebarMenu>
        {attribution ? (
          <a href={attribution.href} target="_blank" rel="noopener" className="px-2.5 pt-0.5 text-[11px] text-sidebar-foreground/50 hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            {attribution.label}
          </a>
        ) : null}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export function AppHeader({ brand, groups, places, extra }: { brand: ShellBrand; groups: NavGroup[]; places: Place[]; extra?: ReactNode }) {
  const active = useActiveItem(groups);
  const [open, setOpen] = useState(false);
  const [mod, setMod] = useState("Ctrl");

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setMod("⌘");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-10 flex h-[60px] shrink-0 items-center gap-2 border-b border-border/70 bg-background/80 px-3 backdrop-blur-xl backdrop-saturate-150 md:rounded-t-[20px] md:px-6">
      <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
      <Separator orientation="vertical" className="mx-1.5 data-vertical:self-center data-[orientation=vertical]:h-4" />
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[13.5px]">
        <span className="hidden truncate text-muted-foreground sm:inline">{brand.name}</span>
        {active ? (
          <>
            <span aria-hidden className="hidden text-border-strong sm:inline">/</span>
            <span className="truncate font-medium text-foreground">{active.label}</span>
          </>
        ) : null}
      </nav>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-9 justify-center border-transparent bg-muted/70 px-0 font-normal text-muted-foreground shadow-none hover:border-border hover:bg-card hover:text-foreground sm:w-64 sm:justify-start sm:px-3.5 dark:bg-white/[0.05]"
          onClick={() => setOpen(true)}
        >
          <SearchIcon />
          <span className="hidden sm:inline">Search or jump to…</span>
          <Kbd className="ml-auto hidden sm:inline-flex">{mod} K</Kbd>
        </Button>
        {extra}
        <ThemeToggle />
      </div>
      <CommandMenu open={open} onOpenChange={setOpen} groups={groups} places={places} />
    </header>
  );
}

function CommandMenu({ open, onOpenChange, groups, places }: { open: boolean; onOpenChange: (o: boolean) => void; groups: NavGroup[]; places: Place[] }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Jump to a page or run a command">
      <Command>
        <CommandInput placeholder="Type a page or command…" />
        <CommandList>
          <CommandEmpty>Nothing found.</CommandEmpty>
          {groups.map((g, i) => (
            <Fragment key={g.title ?? i}>
              <CommandGroup heading={g.title ?? "Go to"}>
                {g.items.map((item) => {
                  const Icon = ICONS[item.icon];
                  return (
                    <CommandItem key={item.href} value={`${g.title ?? ""} ${item.label}`} onSelect={() => run(() => router.push(item.href))}>
                      <Icon />
                      {item.label}
                      {item.locked ? <LockIcon className="ml-auto size-3 text-muted-foreground" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </Fragment>
          ))}
          {places.length ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Switch to">
                {places.map((p) => {
                  const Icon = ICONS[p.icon];
                  return (
                    <CommandItem key={p.href} value={`switch ${p.label} ${p.sub ?? ""}`} onSelect={() => run(() => router.push(p.href))}>
                      <Icon />
                      {p.label}
                      {p.sub ? <span className="ml-auto text-xs text-muted-foreground">{p.sub}</span> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          ) : null}
          <CommandSeparator />
          <CommandGroup heading="Preferences">
            {THEMES.map((t) => (
              <CommandItem key={t.value} value={`theme ${t.label}`} onSelect={() => run(() => setTheme(t.value))}>
                <t.icon />
                {t.label} theme
              </CommandItem>
            ))}
            <CommandItem value="log out sign out" onSelect={() => run(logout)}>
              <LogOutIcon />
              Log out
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
