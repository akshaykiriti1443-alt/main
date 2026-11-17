"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

/** One tap between the light page (the default) and the night version. Saved like the app's own setting. */
export function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Switch between light and dark"
      title="Light or dark"
      className="relative grid size-10 shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/[0.07] hover:text-white"
    >
      <SunIcon className="size-[18px] dark:hidden" aria-hidden />
      <MoonIcon className="hidden size-[18px] dark:block" aria-hidden />
    </button>
  );
}
