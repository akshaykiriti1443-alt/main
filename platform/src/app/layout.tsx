import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

// Type: Bricolage Grotesque for display moments (page titles, marketing headlines; a variable
// grotesque with optical sizes, so big headlines tighten up on their own), Plus Jakarta Sans for
// every piece of interface, Geist Mono for code. --font-serif keeps its old name so every
// font-display / .serif rule picks up the display face without a rename. See DESIGN_SYSTEM.md.
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans" });
const serif = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-serif", axes: ["opsz", "wdth"] });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: env.platformName, template: `%s · ${env.platformName}` },
  description: "Landing pages, leads, emails and automations for Skool community owners.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf9f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0b1a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(sans.variable, serif.variable, mono.variable)} suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster position="bottom-right" richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
