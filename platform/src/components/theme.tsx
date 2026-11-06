"use client";

import type { ReactNode } from "react";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * A page can pin a theme for its whole visit by setting <html data-force-theme="light"> from an
 * inline script before hydration (the booking page embedded in the light ScaleitAds site does:
 * see EmbedShell). Nothing is saved, so the visitor's own choice is untouched elsewhere.
 */
function pinnedTheme() {
  if (typeof document === "undefined") return undefined;
  const t = document.documentElement.dataset.forceTheme;
  return t === "light" || t === "dark" ? t : undefined;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange forcedTheme={pinnedTheme()}>
      {children}
    </NextThemes>
  );
}

export const THEMES = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Change theme">
          <SunIcon className="dark:hidden" />
          <MoonIcon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEMES.map((t) => (
          <DropdownMenuItem key={t.value} onSelect={() => setTheme(t.value)}>
            <t.icon />
            {t.label}
            {theme === t.value ? <CheckIcon className="ml-auto" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
