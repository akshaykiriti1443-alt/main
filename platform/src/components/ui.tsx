import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  FlameIcon,
  GraduationCapIcon,
  InfoIcon,
  LightbulbIcon,
  LockIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import type { Temperature } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FlashToast } from "./client";

/** "Lesson 1.2 · Stage 1": ties a page to the classroom, so the course and the app line up. */
export function LessonTag({ lesson, stage, className }: { lesson: string; stage?: string; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full bg-accent px-2.5 text-xs font-semibold text-accent-foreground tabular-nums", className)}>
      <GraduationCapIcon className="size-3.5" aria-hidden />
      Lesson {lesson}
      {stage ? <span className="font-medium opacity-75">· {stage}</span> : null}
    </span>
  );
}

/**
 * The top of every page: what it's for (sub) and the one thing to do first (first).
 * Keep sub to one sentence. "first" reads as an instruction: "Paste your Skool link below."
 */
export function PageHead({
  eyebrow,
  lesson,
  stage,
  title,
  sub,
  first,
  actions,
}: {
  eyebrow?: ReactNode;
  lesson?: string;
  stage?: string;
  title: string;
  sub?: ReactNode;
  first?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 max-w-3xl">
        {lesson || eyebrow ? (
          <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            {lesson ? <LessonTag lesson={lesson} stage={stage} /> : null}
            {eyebrow ? <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{eyebrow}</span> : null}
          </div>
        ) : null}
        <h1 className="text-[30px] leading-[1.08] font-bold md:text-[38px]">{title}</h1>
        {sub ? <p className="mt-2.5 max-w-[62ch] text-base text-muted-foreground md:text-[17px]">{sub}</p> : null}
        {first ? (
          <p className="mt-4 flex w-fit max-w-full items-start gap-2.5 rounded-2xl bg-card py-2 pr-4 pl-2 text-sm shadow-card ring-1 ring-foreground/[0.06]">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
              <ArrowDownIcon className="size-3.5" strokeWidth={2.5} aria-hidden />
            </span>
            <span className="min-w-0 pt-0.5">
              <b className="font-semibold">Do this first:</b> {first}
            </span>
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * The one big thing to do on a page. Indigo, impossible to miss. Give it either an href + cta,
 * or children (a form, a set of buttons).
 */
export function NextStep({
  eyebrow,
  title,
  body,
  href,
  cta,
  icon: Icon,
  children,
  className,
  ...rest
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  href?: string;
  cta?: ReactNode;
  icon?: LucideIcon;
  children?: ReactNode;
  className?: string;
} & Omit<ComponentProps<"section">, "title" | "children">) {
  return (
    <section className={cn("relative isolate overflow-hidden rounded-3xl bg-hero p-6 text-white shadow-lift md:p-8", className)} {...rest}>
      <div aria-hidden className="bg-dots pointer-events-none absolute inset-0 -z-10 text-white/[0.09] [mask-image:linear-gradient(110deg,transparent_35%,black)]" />
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 -z-10 size-64 rounded-full border border-white/15" />
      <div aria-hidden className="pointer-events-none absolute top-10 -right-4 -z-10 size-36 rounded-full border border-white/10" />
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between md:gap-8">
        <div className="flex min-w-0 items-start gap-4">
          {Icon ? (
            <span className="hidden size-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 sm:grid">
              <Icon className="size-6" aria-hidden />
            </span>
          ) : null}
          <div className="grid min-w-0 gap-1.5">
            {eyebrow ? <span className="text-xs font-bold tracking-[0.1em] text-white/75 uppercase">{eyebrow}</span> : null}
            <h2 className="text-2xl leading-tight font-bold text-white md:text-[28px]">{title}</h2>
            {body ? <p className="max-w-[58ch] text-[15px] text-white/85">{body}</p> : null}
          </div>
        </div>
        {href && cta ? (
          <Button size="lg" asChild className="shrink-0 bg-white text-[oklch(0.42_0.2_277)] shadow-[0_1px_0_oklch(1_0_0/40%)_inset,0_10px_24px_-10px_oklch(0.2_0.1_277/60%)] hover:bg-white/92 dark:text-[oklch(0.4_0.2_277)]">
            <Link href={href}>
              {cta}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        ) : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

/** Advanced settings live in here, closed by default, so a beginner sees one thing at a time. */
export function MoreOptions({
  title = "More options",
  sub,
  icon: Icon = SlidersHorizontalIcon,
  children,
  defaultOpen,
  className,
  id,
  ...rest
}: {
  title?: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  id?: string;
} & Omit<ComponentProps<"details">, "title" | "children">) {
  return (
    <details
      data-slot="more"
      id={id}
      open={defaultOpen}
      className={cn("group/more scroll-mt-20 rounded-2xl border border-dashed border-foreground/15 bg-card/40 transition-colors open:border-solid open:border-transparent open:bg-card open:shadow-card open:ring-1 open:ring-foreground/[0.07]", className)}
      {...rest}
    >
      <summary className="flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3.5 select-none hover:bg-muted/50 md:px-5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground group-open/more:bg-accent group-open/more:text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="font-heading text-[15px] font-semibold">{title}</span>
          {sub ? <span className="text-sm text-muted-foreground">{sub}</span> : null}
        </span>
        <ChevronDownIcon data-chevron className="size-4 shrink-0 text-muted-foreground transition-transform" aria-hidden />
      </summary>
      <div className="flex flex-col gap-4 px-4 pt-1 pb-5 md:px-5">{children}</div>
    </details>
  );
}

const TONE_TILE = {
  primary: "bg-accent text-primary",
  success: "bg-success-soft text-success",
  gold: "bg-gold-soft text-gold-foreground",
  hot: "bg-hot-soft text-hot",
  warning: "bg-warning-soft text-warning",
  muted: "bg-muted text-muted-foreground",
} as const;
export type Tone = keyof typeof TONE_TILE;

/** A small rounded icon tile, the app's visual rhythm. */
export function IconTile({ icon: Icon, tone = "primary", className }: { icon: LucideIcon; tone?: Tone; className?: string }) {
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", TONE_TILE[tone], className)}>
      <Icon className="size-[18px]" aria-hidden />
    </span>
  );
}

/** A numbered (or ticked) circle for steps. */
export function StepDot({ n, done, active, className }: { n?: ReactNode; done?: boolean; active?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full border-2 font-heading text-[13px] font-bold tabular-nums",
        done ? "border-success bg-success text-white dark:text-background" : active ? "border-primary bg-primary text-primary-foreground" : "border-foreground/15 text-muted-foreground",
        className,
      )}
    >
      {done ? <CircleCheckIcon className="size-4" strokeWidth={2.5} aria-hidden /> : n}
    </span>
  );
}

export function Stat({ label, value, hint, icon: Icon, tone = "primary" }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: Tone }) {
  return (
    <Card size="sm" className="gap-0">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          {Icon ? <IconTile icon={Icon} tone={tone} className="size-8 rounded-lg" /> : null}
        </div>
        <span className="font-heading text-[28px] leading-none font-bold tracking-tight tabular-nums">{value}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}

/** A titled card section, the building block of most pages. */
export function Panel({
  title,
  sub,
  action,
  children,
  className,
  step,
  icon,
  tone,
  ...rest
}: {
  title?: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** A step number shown before the title. */
  step?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
} & Omit<ComponentProps<"div">, "title" | "children">) {
  return (
    <Card className={className} {...rest}>
      {title || action ? (
        <CardHeader className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-1 basis-48 items-start gap-3">
            {step !== undefined ? <StepDot n={step} active className="mt-px" /> : icon ? <IconTile icon={icon} tone={tone} className="-mt-0.5" /> : null}
            <div className="grid min-w-0 flex-1 gap-1">
              {title ? <CardTitle>{title}</CardTitle> : null}
              {sub ? <CardDescription className="max-w-[70ch]">{sub}</CardDescription> : null}
            </div>
          </div>
          {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

const TEMP = {
  hot: { label: "Hot", className: "bg-hot-soft text-hot" },
  warm: { label: "Warm", className: "bg-gold-soft text-gold-foreground" },
  cold: { label: "Cold", className: "bg-secondary text-muted-foreground" },
} satisfies Record<Temperature, { label: string; className: string }>;

export function TempBadge({ t }: { t: Temperature }) {
  return (
    <Badge variant="secondary" className={TEMP[t].className}>
      {t === "hot" ? <FlameIcon data-icon="inline-start" /> : null}
      {TEMP[t].label}
    </Badge>
  );
}

/** A little composed illustration: a tilted card with the icon, a gold coin and a green dot. */
export function EmptyArt({ icon: Icon, tone = "primary", className }: { icon: LucideIcon; tone?: Tone; className?: string }) {
  return (
    <div aria-hidden className={cn("relative mx-auto size-20", className)}>
      <div className={cn("absolute inset-1 rotate-[8deg] rounded-[22px] opacity-60", TONE_TILE[tone])} />
      <div className="absolute inset-1 -rotate-[4deg] grid place-items-center rounded-[22px] bg-card shadow-card ring-1 ring-foreground/[0.08]">
        <Icon className={cn("size-8", TONE_TILE[tone].split(" ")[1])} strokeWidth={1.75} />
      </div>
      <span className="absolute -top-0.5 -right-1 size-5 rounded-full bg-gold shadow-sm ring-2 ring-card" />
      <span className="absolute bottom-0 -left-1.5 size-3 rounded-full bg-success ring-2 ring-card" />
      <span className="absolute top-3 -left-3 size-1.5 rounded-full bg-primary/40" />
    </div>
  );
}

/** Empty states teach: a small illustration, one sentence, one button. */
export function Empty({
  title,
  body,
  action,
  icon: Icon,
  tone = "primary",
  className,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div data-slot="empty" className={cn("flex w-full min-w-0 flex-col items-center gap-4 rounded-2xl border border-dashed border-foreground/15 bg-muted/35 px-6 py-10 text-center text-balance", className)}>
      {Icon ? <EmptyArt icon={Icon} tone={tone} /> : null}
      <div className="flex max-w-sm flex-col items-center gap-1.5">
        <div className="font-heading text-lg font-semibold tracking-tight">{title}</div>
        {body ? <div className="text-sm/relaxed text-muted-foreground [&_a]:underline [&_a]:underline-offset-4">{body}</div> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}

const TONES = {
  info: { icon: InfoIcon, className: "border-primary/15 bg-accent text-accent-foreground *:data-[slot=alert-description]:text-accent-foreground/85" },
  ok: { icon: CircleCheckIcon, className: "border-success/25 bg-success-soft text-success *:data-[slot=alert-description]:text-success/90" },
  warn: { icon: TriangleAlertIcon, className: "border-warning/25 bg-warning-soft text-warning *:data-[slot=alert-description]:text-warning/90" },
  error: { icon: CircleAlertIcon, className: "border-destructive/25 bg-destructive/10 text-destructive *:data-[slot=alert-description]:text-destructive/90" },
  tip: { icon: LightbulbIcon, className: "border-gold/45 bg-gold-soft text-gold-foreground *:data-[slot=alert-description]:text-gold-foreground/90" },
};

/** An inline message. Use for things that must stay visible; success messages go to a toast via Flash. */
export function Callout({ tone = "info", title, children, action, className }: { tone?: keyof typeof TONES; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const { icon: Icon, className: toneClass } = TONES[tone];
  return (
    <Alert role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl px-4 py-3 has-[>svg]:gap-x-2.5", toneClass, className)}>
      <Icon />
      {title ? <AlertTitle className="font-semibold">{title}</AlertTitle> : null}
      {children || action ? (
        <AlertDescription className={cn("flex flex-wrap items-center justify-between gap-3", !title && "col-start-2")}>
          {children ? <div className="min-w-0">{children}</div> : null}
          {action}
        </AlertDescription>
      ) : null}
    </Alert>
  );
}

type SP = Record<string, string | string[] | undefined>;
/** Shows ?ok= as a toast, and ?error= / ?warn= inline where the user is looking. */
export function Flash({ searchParams }: { searchParams: SP }) {
  const ok = typeof searchParams.ok === "string" ? searchParams.ok : null;
  const error = typeof searchParams.error === "string" ? searchParams.error : null;
  const warn = typeof searchParams.warn === "string" ? searchParams.warn : null;
  return (
    <>
      {ok && !error ? <FlashToast message={ok} /> : null}
      {error ? <Callout tone="error">{error}</Callout> : warn ? <Callout tone="warn">{warn}</Callout> : null}
    </>
  );
}

export function Locked({ feature, wid }: { feature: string; wid: string }) {
  return (
    <Empty
      icon={LockIcon}
      tone="gold"
      title={`${feature} is on the Growth plan`}
      body="Upgrade to unlock it. Your funnels and leads stay exactly as they are."
      action={
        <Button asChild>
          <Link href={`/app/w/${wid}/billing`}>See plans</Link>
        </Button>
      }
    />
  );
}
