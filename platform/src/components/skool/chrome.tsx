import Link from "next/link";
import { ArrowRightIcon, LayoutDashboardIcon } from "lucide-react";
import { LogoMark } from "@/components/shell";
import { ThemeSwitch } from "./fx/theme-switch";
import { Container, type Cta } from "./parts";

// The top bar and the footer of the /skool pages (the short sales page and the full tour at
// /skool/inside). Light is the default, the sun/moon button switches to the night version.
// Links carry data-slot so the page's plain-link colour (skool.css) leaves them alone.

export type NavLink = [href: string, label: string];

/** The full tour's sections, in its own order. The footer always links here. */
const TOUR: NavLink[] = [
  ["/skool/inside#week", "The seven days"],
  ["/skool/inside#rule", "The rule"],
  ["/skool/inside#app", "The app"],
  ["/skool/inside#cost", "What it costs"],
  ["/skool/inside#cancel", "If you cancel"],
];

// html[data-scrolled] is set by <Reveal /> after the first few pixels of scroll.

export function Nav({ name, join, loginHref, links }: { name: string; join: Cta; loginHref: string; links: NavLink[] }) {
  return (
    <header className="pointer-events-none sticky top-0 z-40 px-3 pt-3 md:px-5 md:pt-4">
      <div
        className={[
          "pointer-events-auto mx-auto flex h-[60px] max-w-[1180px] items-center justify-between gap-3 rounded-full pr-2 pl-3 md:pl-4",
          "sk-navbar backdrop-blur-xl backdrop-saturate-150",
          "transition-[max-width,height,background-color,box-shadow] duration-500 ease-[cubic-bezier(.16,1,.3,1)]",
          // After the first scroll: a little shorter, firmer glass (skool.css .sk-navbar).
          "[html[data-scrolled]_&]:h-[54px]",
        ].join(" ")}
      >
        <Link href="/skool" className="flex min-w-0 items-center gap-2.5 hover:no-underline" data-slot="brand" aria-label="The Skool Growth Program by ScaleitAds">
          <LogoMark className="size-8 rounded-[10px]" />
          <span className="sk-display shrink-0 text-[21px] text-white">{name}</span>
          <span className="hidden text-[12px] font-medium whitespace-nowrap text-white/40 sm:inline lg:hidden xl:inline">by ScaleitAds</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center lg:flex">
          {links.map(([href, label]) => (
            <a
              key={href}
              href={href}
              data-slot="nav-link"
              className="rounded-full px-3.5 py-2 text-[13.5px] font-medium whitespace-nowrap text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white hover:no-underline"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <ThemeSwitch />
          <Link
            href={loginHref}
            data-slot="nav-link"
            className="hidden rounded-full px-4 py-2 text-[14px] font-medium text-white/70 transition-colors hover:bg-white/[0.07] hover:text-white hover:no-underline sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href={join.href}
            className="sk-cta group h-10! gap-1.5! px-4! text-[14px]! sm:px-5!"
          >
            <span className="relative sm:hidden">Free trial</span>
            <span className="relative hidden sm:inline">Start your free trial</span>
            <ArrowRightIcon className="relative size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Footer({ name, appUrl, skoolUrl }: { name: string; appUrl: string; skoolUrl: string }) {
  const col = "text-white/50 transition-colors hover:text-white hover:no-underline";
  const head = "mb-1 text-[11.5px] font-semibold tracking-[0.18em] text-white/35 uppercase";
  return (
    <footer className="relative isolate overflow-hidden border-t border-white/10">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(201_184_255/0.45),transparent)]" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-220px] left-1/2 -z-10 h-[520px] w-[1000px] max-w-[200%] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(124_92_255/0.22),transparent)]" />

      <Container className="grid gap-14 pt-20 pb-14 md:grid-cols-[1fr_1.6fr] md:pt-24">
        <div className="flex max-w-sm flex-col gap-5">
          <span className="flex items-center gap-2.5">
            <LogoMark className="size-9 rounded-[11px]" />
            <span className="sk-display text-[26px] text-white">{name}</span>
            <span className="text-[12.5px] font-medium text-white/40">by ScaleitAds</span>
          </span>
          <p className="text-[14.5px] leading-relaxed text-white/50">The Skool Growth Program: The Anti-Pete Week course, the {name} app and ReelVault, by ScaleitAds.</p>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-10 text-[14.5px] sm:grid-cols-3">
          <div className="flex flex-col gap-3">
            <span className={head}>Program</span>
            {TOUR.map(([href, label]) => (
              <Link key={href} href={href} data-slot="footer-link" className={col}>
                {label}
              </Link>
            ))}
            <a href={skoolUrl} data-slot="footer-link" className={col}>
              Join on Skool
            </a>
          </div>
          <div className="flex flex-col gap-3">
            <span className={head}>Account</span>
            <Link href={`${appUrl}/login`} data-slot="footer-link" className={col}>
              Log in
            </Link>
            <Link href={`${appUrl}/signup`} data-slot="footer-link" className={col}>
              Sign up
            </Link>
            <Link href={`${appUrl}/app`} data-slot="footer-link" className={`inline-flex items-center gap-1.5 ${col}`}>
              <LayoutDashboardIcon className="size-3.5" aria-hidden /> Dashboard
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            <span className={head}>ScaleitAds</span>
            <Link href="/" data-slot="footer-link" className={col}>
              Meta ads agency
            </Link>
            <Link href={`${appUrl}/legal/privacy`} data-slot="footer-link" className={col}>
              Privacy
            </Link>
            <Link href={`${appUrl}/legal/terms`} data-slot="footer-link" className={col}>
              Terms
            </Link>
          </div>
        </div>
      </Container>

      <Container>
        <p className="border-t border-white/10 py-6 text-[13px] leading-relaxed text-white/40">
          © {new Date().getFullYear()} ScaleitAds. {name} is made by ScaleitAds for people who&apos;d rather build a community than feed an algorithm.
        </p>
      </Container>

      {/* The sign-off: the course's name, huge and faded, sinking off the bottom of the page. */}
      <div aria-hidden className="pointer-events-none overflow-hidden select-none">
        <div className="sk-display -mb-[0.2em] bg-[linear-gradient(180deg,rgb(91_51_232/0.14),rgb(91_51_232/0.04)_55%,transparent_90%)] dark:bg-[linear-gradient(180deg,rgb(255_255_255/0.17),rgb(201_184_255/0.06)_55%,rgb(255_255_255/0)_90%)] bg-clip-text pt-2 text-center text-[length:min(12.5vw,210px)] leading-[0.9] whitespace-nowrap text-transparent">
          Anti-Pete Week
        </div>
      </div>
    </footer>
  );
}
