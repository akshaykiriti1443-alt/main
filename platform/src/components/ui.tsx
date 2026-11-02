import type { ReactNode } from "react";
import Link from "next/link";
import { CircleAlertIcon, CircleCheckIcon, FlameIcon, InfoIcon, LockIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import type { Temperature } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty as EmptyRoot, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { FlashToast } from "./client";

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-xs font-medium text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{title}</h1>
        {sub ? <p className="mt-1.5 max-w-[70ch] text-muted-foreground">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon }) {
  return (
    <Card size="sm" className="gap-1.5">
      <CardHeader className="flex items-center justify-between">
        <CardDescription className="font-medium">{label}</CardDescription>
        {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden /> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-0.5">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}

/** A titled card section, the building block of most pages. */
export function Panel({ title, sub, action, children, className }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      {title || action ? (
        <CardHeader className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="grid min-w-0 flex-1 basis-56 gap-1">
            {title ? <CardTitle>{title}</CardTitle> : null}
            {sub ? <CardDescription>{sub}</CardDescription> : null}
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

const TEMP = {
  hot: { label: "Hot", className: "bg-hot-soft text-hot" },
  warm: { label: "Warm", className: "bg-warning-soft text-warning" },
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

export function Empty({ title, body, action, icon: Icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <EmptyRoot className="border py-10">
      <EmptyHeader>
        {Icon ? (
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
        ) : null}
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        {body ? <EmptyDescription>{body}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </EmptyRoot>
  );
}

const TONES = {
  info: { icon: InfoIcon, className: "border-primary/20 bg-accent text-accent-foreground *:data-[slot=alert-description]:text-accent-foreground/85" },
  ok: { icon: CircleCheckIcon, className: "border-success/25 bg-success-soft text-success *:data-[slot=alert-description]:text-success/90" },
  warn: { icon: TriangleAlertIcon, className: "border-warning/25 bg-warning-soft text-warning *:data-[slot=alert-description]:text-warning/90" },
  error: { icon: CircleAlertIcon, className: "border-destructive/25 bg-destructive/10 text-destructive *:data-[slot=alert-description]:text-destructive/90" },
};

/** An inline message. Use for things that must stay visible; success messages go to a toast via Flash. */
export function Callout({ tone = "info", title, children, action, className }: { tone?: keyof typeof TONES; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const { icon: Icon, className: toneClass } = TONES[tone];
  return (
    <Alert role={tone === "error" ? "alert" : "status"} className={cn("px-3.5 py-3", toneClass, className)}>
      <Icon />
      {title ? <AlertTitle>{title}</AlertTitle> : null}
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
