"use client";

import { useState } from "react";
import { CheckCircle2Icon } from "lucide-react";
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

export function PlanCalculator({ wid, initialMembers, initialPrice }: { wid: string; initialMembers: number; initialPrice: number }) {
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
    <div className="flex flex-col gap-4">
      <form action={saveSkoolPriceAction.bind(null, wid)} className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="calc-members">Members</FieldLabel>
          <Input id="calc-members" inputMode="numeric" value={members} onChange={(e) => setMembers(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="price">Price / member / month</FieldLabel>
          <Input id="price" name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          <FieldDescription>Saving this also sets the value on your Meta Subscribe events.</FieldDescription>
        </Field>
        <div className="col-span-2">
          <SubmitButton variant="outline" size="sm" pendingText="Saving…">Save member price</SubmitButton>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3">
        <Plan name="Hobby" base="$9/mo + 10%" cost={hobby} best={hobbyCheaper} />
        <Plan name="Pro" base="$99/mo + 2.9%" cost={pro} best={!hobbyCheaper} />
      </div>

      <div className="rounded-lg border bg-muted/50 p-3 text-sm">
        {p === 0 ? (
          <span className="text-muted-foreground">Enter your member price to compare.</span>
        ) : hobbyCheaper ? (
          <span>
            <b>Stay on Hobby.</b> It saves you about <b>{money(saving)}/month</b> right now. At your price, switch to Pro around{" "}
            <b>{crossover.toLocaleString()} members</b> ({money(crossover * p)}/mo revenue).
          </span>
        ) : (
          <span>
            <b>Switch to Pro.</b> It saves you about <b>{money(saving)}/month</b> now. The crossover was around{" "}
            <b>{crossover.toLocaleString()} members</b>.
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Estimate only, monthly billing. Annual billing is cheaper on both. Confirm current fees on skool.com/pricing.
      </p>
    </div>
  );
}

function Plan({ name, base, cost, best }: { name: string; base: string; cost: number; best: boolean }) {
  return (
    <div className={cn("relative rounded-lg border p-3", best && "border-primary bg-accent")}>
      {best ? (
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
          <CheckCircle2Icon className="size-3.5" /> Cheaper
        </span>
      ) : null}
      <div className="text-sm font-medium">{name}</div>
      <div className="text-xs text-muted-foreground">{base}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums">{money(cost)}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
    </div>
  );
}
