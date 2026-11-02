import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon, CheckIcon, InboxIcon, MessageSquareTextIcon, RocketIcon, SparklesIcon } from "lucide-react";
import { env } from "@/lib/env";
import { getCurrentUser, requestHost } from "@/server/auth";
import { agencyForHost } from "@/server/agency";
import { BrandMark } from "@/components/shell";
import { ThemeToggle } from "@/components/theme";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STEPS = [
  { icon: SparklesIcon, title: "Answer 6 questions", body: "Tell the AI who you help and what you offer. No design or copywriting skills needed." },
  { icon: RocketIcon, title: "Publish your funnel", body: "Get a landing page, free guide, 3 follow-up emails and ad copy. One click puts it live." },
  { icon: InboxIcon, title: "Work your leads", body: "Every lead lands in one list, scored hot, warm or cold, so you know who to message first." },
];

const TIERS = [
  {
    name: "Member",
    price: "Included",
    note: "With your Skool membership.",
    features: ["AI launch kit: page, lead magnet, emails, ads", "Landing pages with Meta Pixel + Conversions API", "Lead list and 3-email follow-up", "Custom ad review"],
  },
  {
    name: "Growth",
    price: "Monthly + usage",
    note: "For owners who sell every day.",
    featured: true,
    features: ["One inbox for Instagram, Facebook, WhatsApp and SMS", "AI lead scoring and reply drafts", "Automations, email campaigns, social planner", "Custom domains. Pay as you go for messages"],
  },
  {
    name: "Agency",
    price: "Resell it",
    note: "Your brand. Your clients.",
    features: ["Unlimited client sub-accounts", "Your logo, colors and app domain", "Templates you can load into any account", "Set your own prices"],
  },
];

export default async function Home() {
  const agency = await agencyForHost(await requestHost());
  if (agency) redirect("/login");
  const user = await getCurrentUser();
  const name = env.platformName;
  const cta = user ? { href: "/app", label: "Open dashboard" } : { href: "/signup", label: "Claim your account" };

  return (
    <div className="relative min-h-svh overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 -z-10 flex justify-center">
        <div className="h-[480px] w-[960px] rounded-full bg-primary/15 blur-3xl dark:bg-primary/20" />
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 md:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold text-foreground hover:no-underline" data-slot="brand">
          <BrandMark brand={{ name }} />
          {name}
        </Link>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          {user ? null : (
            <Button variant="ghost" asChild>
              <Link href="/login">Log in</Link>
            </Button>
          )}
          <Button asChild>
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-24 px-4 pt-14 pb-20 md:px-6 md:pt-24">
        <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <Badge variant="outline" className="h-7 gap-1.5 bg-background/60 px-3 text-sm font-normal backdrop-blur">
            <SparklesIcon className="text-primary" />
            For Skool owners, coaches and trainers
          </Badge>
          <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl">
            Your funnel, leads and inbox. <span className="text-primary">Built in one minute.</span>
          </h1>
          <p className="max-w-2xl text-lg text-pretty text-muted-foreground md:text-xl">
            Tell the AI who you help. It writes your landing page, lead magnet, emails and ads. Leads land in one inbox with a hot, warm or cold score.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <Button size="lg" className="h-11 px-5 text-base" asChild>
              <Link href={user ? "/app" : "/signup"}>
                {user ? "Open dashboard" : "Start with your member code"}
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
            {user ? null : (
              <Button size="lg" variant="outline" className="h-11 px-5 text-base" asChild>
                <Link href="/login">I already have an account</Link>
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Included with your Skool membership</p>
        </section>

        <section aria-labelledby="how" className="flex flex-col gap-8">
          <div className="text-center">
            <h2 id="how" className="text-2xl font-semibold tracking-tight md:text-3xl">How it works</h2>
            <p className="mt-2 text-muted-foreground">Three steps from idea to your first lead.</p>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <Card className="h-full">
                  <CardHeader className="gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground">
                        <s.icon className="size-4.5" />
                      </span>
                      <span className="text-sm font-medium text-muted-foreground">Step {i + 1}</span>
                    </div>
                    <CardTitle className="text-lg">{s.title}</CardTitle>
                    <CardDescription className="text-[15px] leading-relaxed">{s.body}</CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="plans" className="flex flex-col gap-8">
          <div className="text-center">
            <h2 id="plans" className="text-2xl font-semibold tracking-tight md:text-3xl">Start free. Grow when you're ready.</h2>
            <p className="mt-2 text-muted-foreground">Upgrading keeps every funnel and lead exactly as it is.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {TIERS.map((t) => (
              <Card key={t.name} className={cn("relative", t.featured && "ring-2 ring-primary")}>
                {t.featured ? <Badge className="absolute top-4 right-4">Best for daily selling</Badge> : null}
                <CardHeader className="gap-1.5">
                  <CardDescription className="font-medium">{t.name}</CardDescription>
                  <CardTitle className="text-2xl font-semibold tracking-tight">{t.price}</CardTitle>
                  <CardDescription>{t.note}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-2.5 text-sm">
                    {t.features.map((f) => (
                      <li key={f} className="flex gap-2.5">
                        <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground md:py-16">
          <MessageSquareTextIcon aria-hidden className="absolute -top-6 -right-6 size-40 opacity-10" />
          <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">Your first lead could land today.</h2>
          <p className="mx-auto mt-3 max-w-xl text-primary-foreground/80 md:text-lg">It takes about a minute to set up. Grab this month's code from your Skool classroom and go.</p>
          <Button size="lg" variant="secondary" className="mt-7 h-11 px-5 text-base" asChild>
            <Link href={cta.href}>
              {cta.label}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground md:px-6">
          <span>
            © {new Date().getFullYear()} {name}
          </span>
          <nav className="flex gap-5">
            <Link href="/legal/privacy" className="text-muted-foreground">Privacy</Link>
            <Link href="/legal/terms" className="text-muted-foreground">Terms</Link>
            <Link href="/legal/data-deletion" className="text-muted-foreground">Data deletion</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
