import Link from "next/link";
import { LayoutDashboardIcon } from "lucide-react";
import { Wordmark } from "@/components/shell";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { Container, type Cta } from "./parts";

// The top bar and the footer of the /skool page. The links follow the page's own order.

const SECTIONS: [href: string, label: string][] = [
  ["#week", "The week"],
  ["#rule", "The rule"],
  ["#app", "The app"],
  ["#cost", "What it costs"],
  ["#faq", "Questions"],
];

export function Nav({ name, join, loginHref }: { name: string; join: Cta; loginHref: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/70 backdrop-blur-xl backdrop-saturate-150 transition-colors duration-200 [html[data-scrolled]_&]:border-border/70">
      <Container className="flex h-[68px] items-center justify-between gap-4">
        <Link href="/skool" className="flex items-center gap-2.5 hover:no-underline" data-slot="brand" aria-label="The Skool Growth Program by ScaleitAds">
          <Wordmark name={name} />
          <span className="hidden text-[12.5px] font-medium text-muted-foreground sm:inline">by ScaleitAds</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {SECTIONS.map(([href, label]) => (
            <a key={href} href={href} data-slot="nav-link" className="rounded-full px-3.5 py-2 text-[14px] font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button variant="ghost" asChild className="hidden sm:inline-flex">
            <Link href={loginHref}>Log in</Link>
          </Button>
          <Button variant="cta" asChild>
            <Link href={join.href}>
              <span className="sm:hidden">Free trial</span>
              <span className="hidden sm:inline">Start your free trial</span>
            </Link>
          </Button>
        </div>
      </Container>
    </header>
  );
}

export function Footer({ name, appUrl, skoolUrl }: { name: string; appUrl: string; skoolUrl: string }) {
  const col = "text-foreground/75 hover:text-foreground hover:no-underline";
  const head = "text-[11.5px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase";
  return (
    <footer className="border-t border-border/70">
      <Container className="flex flex-col gap-8 py-12 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-xs flex-col gap-3">
          <span className="flex items-center gap-2.5">
            <Wordmark name={name} />
            <span className="text-[12.5px] font-medium text-muted-foreground">by ScaleitAds</span>
          </span>
          <p className="text-[14px] leading-relaxed text-muted-foreground">The Skool Growth Program: The Anti-Pete Week course, the {name} app and ReelVault, by ScaleitAds.</p>
        </div>
        <div className="flex flex-wrap gap-x-14 gap-y-6 text-[14px]">
          <div className="flex flex-col gap-2.5">
            <span className={head}>Program</span>
            {SECTIONS.slice(0, 4).map(([href, label]) => (
              <a key={href} href={href} className={col}>
                {label}
              </a>
            ))}
            <a href="#cancel" className={col}>
              If you cancel
            </a>
            <a href={skoolUrl} className={col}>
              Join on Skool
            </a>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className={head}>Account</span>
            <Link href={`${appUrl}/login`} className={col}>
              Log in
            </Link>
            <Link href={`${appUrl}/signup`} className={col}>
              Sign up
            </Link>
            <Link href={`${appUrl}/app`} className={`inline-flex items-center gap-1.5 ${col}`}>
              <LayoutDashboardIcon className="size-3.5" aria-hidden /> Dashboard
            </Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className={head}>ScaleitAds</span>
            <Link href="/" className={col}>
              Meta ads agency
            </Link>
            <Link href={`${appUrl}/legal/privacy`} className={col}>
              Privacy
            </Link>
            <Link href={`${appUrl}/legal/terms`} className={col}>
              Terms
            </Link>
          </div>
        </div>
      </Container>
      <Container className="border-t border-border/60 py-6 text-[13px] text-subtle-foreground">
        © {new Date().getFullYear()} ScaleitAds. {name} is made by ScaleitAds for people who&apos;d rather build a community than feed an algorithm.
      </Container>
    </footer>
  );
}
