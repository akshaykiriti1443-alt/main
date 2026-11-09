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
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full bg-accent px-2.5 text-[11.5px] font-semibold text-accent-foreground tabular-nums ring-1 ring-violet-200/70 ring-inset dark:ring-white/[0.06]",
        className,
      )}
    >
      <GraduationCapIcon className="size-3.5" aria-hidden />
      Lesson {lesson}
      {stage ? <span className="font-medium opacity-70">· {stage}</span> : null}
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
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {lesson ? <LessonTag lesson={lesson} stage={stage} /> : null}
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          </div>
        ) : null}
        <h1 className="text-[36px] leading-[1.02] tracking-[-0.012em] text-foreground md:text-[46px]">{title}</h1>
        {sub ? <p className="mt-3 max-w-[60ch] text-[15.5px] leading-relaxed text-muted-foreground md:text-[17px]">{sub}</p> : null}
        {first ? (
          <p className="mt-5 flex w-fit max-w-full items-start gap-3 rounded-2xl bg-card py-2.5 pr-4 pl-2.5 text-sm leading-snug shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-press">
              <ArrowDownIcon className="size-3.5" strokeWidth={2.5} aria-hidden />
            </span>
            <span className="min-w-0 pt-[3px]">
              <b className="font-semibold text-foreground">Do this first:</b> <span className="text-foreground/85">{first}</span>
            </span>
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * The one big thing to do on a page: a calm galactic-night panel with the screen's single
 * bubblegum-pink button. Give it either an href + cta, or children (a form, a set of buttons).
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
    <section className={cn("relative isolate overflow-hidden rounded-3xl bg-hero p-6 text-white shadow-lift ring-1 ring-white/10 md:p-9", className)} {...rest}>
      <div aria-hidden className="bg-stars pointer-events-none absolute inset-0 -z-10 text-white/45 [mask-image:linear-gradient(115deg,transparent_30%,black_80%)]" />
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 -z-10 size-72 rounded-full border border-white/[0.12]" />
      <div aria-hidden className="pointer-events-none absolute -top-8 right-6 -z-10 size-40 rounded-full border border-white/[0.08]" />
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-10">
        <div className="flex min-w-0 items-start gap-4">
          {Icon ? (
            <span className="hidden size-12 shrink-0 place-items-center rounded-2xl bg-white/[0.12] ring-1 ring-white/20 backdrop-blur-sm sm:grid">
              <Icon className="size-[22px]" aria-hidden />
            </span>
          ) : null}
          <div className="grid min-w-0 gap-2">
            {eyebrow ? <span className="text-[11.5px] font-semibold tracking-[0.14em] text-pink-200 uppercase">{eyebrow}</span> : null}
            <h2 className="font-display text-[30px] leading-[1.05] tracking-[-0.01em] text-white md:text-[36px]">{title}</h2>
            {body ? <p className="max-w-[58ch] text-[15px] leading-relaxed text-white/80">{body}</p> : null}
          </div>
        </div>
        {href && cta ? (
          <Button variant="cta" size="lg" asChild className="shrink-0">
            <Link href={href} {...(/^https?:/.test(href) ? { target: "_blank", rel: "noreferrer" } : {})}>
              {cta}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        ) : null}
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
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
      className={cn(
        "group/more scroll-mt-20 rounded-2xl border border-dashed border-border-strong bg-card/40 transition-[background-color,box-shadow,border-color] duration-200 open:border-solid open:border-transparent open:bg-card open:shadow-card open:ring-1 open:ring-ink/[0.06] dark:open:ring-white/[0.07]",
        className,
      )}
      {...rest}
    >
      <summary className="flex cursor-pointer items-center gap-3.5 rounded-2xl px-4 py-4 transition-colors select-none hover:bg-accent/50 md:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground transition-colors group-open/more:bg-accent group-open/more:text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="font-heading text-[15px] font-semibold tracking-[-0.01em]">{title}</span>
          {sub ? <span className="text-sm text-muted-foreground">{sub}</span> : null}
        </span>
        <ChevronDownIcon data-chevron className="size-4 shrink-0 text-muted-foreground transition-transform duration-200" aria-hidden />
      </summary>
      <div className="flex flex-col gap-4 px-4 pt-1 pb-5 md:px-5">{children}</div>
    </details>
  );
}

const TONE_TILE = {
  primary: "bg-accent text-primary dark:text-violet-300",
  pink: "bg-cta-soft text-cta-soft-foreground",
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
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl ring-1 ring-current/10 ring-inset", TONE_TILE[tone], className)}>
      <Icon className="size-[18px]" aria-hidden />
    </span>
  );
}

/** A numbered (or ticked) circle for steps. */
export function StepDot({ n, done, active, className }: { n?: ReactNode; done?: boolean; active?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full border font-sans text-[12.5px] font-semibold tabular-nums",
        done
          ? "border-success bg-success text-white dark:text-background"
          : active
            ? "border-primary bg-primary text-primary-foreground shadow-press"
            : "border-border-strong bg-card text-muted-foreground",
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
      <CardContent className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
          {Icon ? <IconTile icon={Icon} tone={tone} className="size-8 rounded-[10px]" /> : null}
        </div>
        <span className="font-display text-[38px] leading-[0.95] tracking-[-0.01em] tabular-nums">{value}</span>
        {hint ? <span className="text-xs leading-snug text-muted-foreground">{hint}</span> : null}
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

/** A little composed illustration: a tilted card with the icon, a gold coin and two candy dots. */
export function EmptyArt({ icon: Icon, tone = "primary", className }: { icon: LucideIcon; tone?: Tone; className?: string }) {
  return (
    <div aria-hidden className={cn("relative mx-auto size-20", className)}>
      <div className={cn("absolute inset-1 rotate-[8deg] rounded-[22px] opacity-70", TONE_TILE[tone])} />
      <div className="absolute inset-1 -rotate-[4deg] grid place-items-center rounded-[22px] bg-card shadow-lift ring-1 ring-ink/[0.06] dark:ring-white/[0.08]">
        <Icon className={cn("size-8", TONE_TILE[tone].split(" ")[1])} strokeWidth={1.6} />
      </div>
      <span className="absolute -top-0.5 -right-1 size-5 rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffe7a3,var(--gold)_60%)] shadow-sm ring-2 ring-card" />
      <span className="absolute bottom-0.5 -left-1.5 size-3 rounded-full bg-pink-300 ring-2 ring-card" />
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
    <div
      data-slot="empty"
      className={cn(
        "flex w-full min-w-0 flex-col items-center gap-5 rounded-2xl border border-dashed border-border-strong bg-[radial-gradient(80%_100%_at_50%_0%,var(--accent),transparent_70%)] px-6 py-12 text-center text-balance dark:bg-[radial-gradient(80%_100%_at_50%_0%,rgb(118_85_245/0.08),transparent_70%)]",
        className,
      )}
    >
      {Icon ? <EmptyArt icon={Icon} tone={tone} /> : null}
      <div className="flex max-w-sm flex-col items-center gap-1.5">
        <div className="font-heading text-[17px] font-semibold tracking-[-0.012em]">{title}</div>
        {body ? <div className="text-sm/relaxed text-muted-foreground [&_a]:underline [&_a]:underline-offset-4">{body}</div> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/* Calm callouts: a soft tint, the tone on the icon and title only, body copy in ink. */
const CALM_BODY = "text-foreground *:data-[slot=alert-description]:text-foreground/75";
const TONES = {
  info: { icon: InfoIcon, className: cn(CALM_BODY, "border-violet-200/80 bg-accent *:[svg]:text-primary *:data-[slot=alert-title]:text-accent-foreground dark:border-white/[0.08] dark:*:[svg]:text-violet-300") },
  ok: { icon: CircleCheckIcon, className: cn(CALM_BODY, "border-success/20 bg-success-soft *:[svg]:text-success *:data-[slot=alert-title]:text-success") },
  warn: { icon: TriangleAlertIcon, className: cn(CALM_BODY, "border-warning/25 bg-warning-soft *:[svg]:text-warning *:data-[slot=alert-title]:text-warning") },
  error: { icon: CircleAlertIcon, className: cn(CALM_BODY, "border-destructive/20 bg-destructive-soft *:[svg]:text-destructive *:data-[slot=alert-title]:text-destructive") },
  tip: { icon: LightbulbIcon, className: cn(CALM_BODY, "border-pink-200/80 bg-cta-soft *:[svg]:text-cta-soft-foreground *:data-[slot=alert-title]:text-cta-soft-foreground dark:border-pink-400/20") },
};

/** An inline message. Use for things that must stay visible; success messages go to a toast via Flash. */
export function Callout({ tone = "info", title, children, action, className }: { tone?: keyof typeof TONES; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const { icon: Icon, className: toneClass } = TONES[tone];
  return (
    <Alert role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl px-4 py-3.5 leading-relaxed has-[>svg]:gap-x-3", toneClass, className)}>
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
