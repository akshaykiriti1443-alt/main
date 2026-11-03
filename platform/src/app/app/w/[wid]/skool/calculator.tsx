"use client";

import { useState } from "react";
import { CheckCircle2Icon, ScaleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SubmitButton } from "@/components/client";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveSkoolPriceAction } from "@/actions/skool";

// Skool's published fees (verify on skool.com/pricing): Hobby $9/mo + 10%, Pro $99/mo + 2.9%,
// plus ~$0.30 per transaction on both. The $0.30 cancels out of the crossover, so it's price-driven.
const HOBBY_BASE = 9;
const HOBBY_RATE = 0.1;
const PRO_BASE = 99;
const PRO_RATE = 0.029;
const PER_TXN = 0.3;

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/**
 * Step 1 on Skool members: save your member price (the form the guide points at), with a
 * Hobby-or-Pro check beside it that uses the same price.
 */
export function PlanCalculator({
  wid,
  initialMembers,
  initialPrice,
  saved,
  primary,
}: {
  wid: string;
  initialMembers: number;
  initialPrice: number;
  /** A price is already saved. */
  saved?: boolean;
  /** This is the one thing to do on the page right now. */
  primary?: boolean;
}) {
  const [members, setMembers] = useState(String(initialMembers || 20));
  const [price, setPrice] = useState(String(initialPrice || 9));

  const m = Math.max(0, Number(members) || 0);
  const p = Math.max(0, Number(price) || 0);
  const revenue = m * p;
  const hobby = HOBBY_BASE + HOBBY_RATE * revenue + PER_TXN * m;
  const pro = PRO_BASE + PRO_RATE * revenue + PER_TXN * m;
  const hobbyCheaper = hobby <= pro;
  const saving = Math.abs(hobby - pro);
  // Where Pro overtakes Hobby: 9 + 0.10·m·p = 99 + 0.029·m·p  ->  m = 90 / (0.071·p)
  const crossover = p > 0 ? Math.ceil((PRO_BASE - HOBBY_BASE) / ((HOBBY_RATE - PRO_RATE) * p)) : 0;

  return (
    <div className="grid gap-5 @3xl/main:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <form data-guide="member-price" action={saveSkoolPriceAction.bind(null, wid)} className="flex flex-col gap-4 rounded-2xl bg-muted/50 p-4 ring-1 ring-foreground/[0.05] ring-inset">
        <Field>
          <FieldLabel htmlFor="price">Price per member, per month</FieldLabel>
          <div className="relative max-w-48">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-heading text-lg font-semibold text-muted-foreground">$</span>
            <Input id="price" name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="h-12 pl-7 font-heading text-xl font-semibold tabular-nums md:text-xl" />
          </div>
          <FieldDescription>The same price members pay in Skool. It also tells Meta what a paying member is worth.</FieldDescription>
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton variant={primary ? "default" : "outline"} size={primary ? "lg" : "default"} pendingText="Saving…">
            Save member price
          </SubmitButton>
          {saved ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
              <CheckCircle2Icon className="size-4" aria-hidden /> Saved
            </span>
          ) : null}
        </div>
      </form>

      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div className="grid gap-0.5">
            <span className="flex items-center gap-1.5 font-heading text-[15px] font-semibold">
              <ScaleIcon className="size-4 text-primary" aria-hidden /> Hobby vs Pro calculator
            </span>
            <span className="text-xs text-muted-foreground">Start on Hobby. Switch when the math says so.</span>
          </div>
          <Field className="w-24 shrink-0 gap-1">
            <FieldLabel htmlFor="calc-members" className="text-xs">
              Members
            </FieldLabel>
            <Input id="calc-members" inputMode="numeric" value={members} onChange={(e) => setMembers(e.target.value)} className="h-8 tabular-nums" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Plan name="Hobby" base="$9/mo + 10%" cost={hobby} best={hobbyCheaper} />
          <Plan name="Pro" base="$99/mo + 2.9%" cost={pro} best={!hobbyCheaper} />
        </div>

        <p className="text-sm">
          {p === 0 ? (
            <span className="text-muted-foreground">Enter your member price to compare.</span>
          ) : hobbyCheaper ? (
            <>
              <b>Stay on Hobby.</b> It saves you about <b>{money(saving)}/month</b>. At your price, Pro wins around <b>{crossover.toLocaleString()} members</b> ({money(crossover * p)}/mo).
            </>
          ) : (
            <>
              <b>Switch to Pro.</b> It saves you about <b>{money(saving)}/month</b>. The crossover was around <b>{crossover.toLocaleString()} members</b>.
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">Estimate only, monthly billing. Annual billing is cheaper on both. Check current fees on skool.com/pricing.</p>
      </div>
    </div>
  );
}

function Plan({ name, base, cost, best }: { name: string; base: string; cost: number; best: boolean }) {
  return (
    <div className={cn("relative rounded-xl border bg-card p-3", best && "border-success/50 bg-success-soft/60 ring-1 ring-success/20")}>
      {best ? (
        <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-success">
          <CheckCircle2Icon className="size-3.5" aria-hidden /> Cheaper
        </span>
      ) : null}
      <div className="text-sm font-semibold">{name}</div>
      <div className="text-xs text-muted-foreground">{base}</div>
      <div className="mt-1.5 font-heading text-2xl font-bold tabular-nums">
        {money(cost)}
        <span className="font-sans text-sm font-normal text-muted-foreground">/mo</span>
      </div>
    </div>
  );
}
