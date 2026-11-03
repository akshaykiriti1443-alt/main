"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const num = (s: string, min = 0) => Math.max(min, Number(s) || 0);

function NumField({ id, label, value, onChange, hint, prefix }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; prefix?: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        {prefix ? <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span> : null}
        <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className={prefix ? "pl-6" : undefined} />
      </div>
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );
}

const THRESHOLDS = [
  { level: 2, visitors: 100 },
  { level: 3, visitors: 3000 },
  { level: 4, visitors: 10000 },
];

/** Daily budget → About-page visitors per rolling 30 days → which level's visitor bar you clear. */
export function BudgetPlanner({ initialBudget, initialOrganic, initialPrice }: { initialBudget: number; initialOrganic: number; initialPrice: number }) {
  const [budget, setBudget] = useState(String(initialBudget || 10));
  const [cpv, setCpv] = useState("1");
  const [organic, setOrganic] = useState(String(initialOrganic || 0));
  // Empty until they type their own: a made-up conversion rate would read like an income promise.
  const [conv, setConv] = useState("");
  const [price, setPrice] = useState(String(initialPrice || 29));

  const b = num(budget);
  const c = num(cpv, 0.01);
  const o = num(organic);
  const fromAds = (b * 30) / c;
  const visitors = fromAds + o;
  const paid = (visitors * num(conv)) / 100;
  const cleared = THRESHOLDS.filter((t) => visitors >= t.visitors).map((t) => t.level);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <NumField id="pl-budget" label="Your ad budget / day" prefix="$" value={budget} onChange={setBudget} />
        <NumField id="pl-cpv" label="Cost per About-page visit" prefix="$" value={cpv} onChange={setCpv} hint="Start at $1. Use your real number after a week." />
        <NumField id="pl-organic" label="Organic visitors / 30 days" value={organic} onChange={setOrganic} hint="Bio links, posts, YouTube." />
        <NumField id="pl-conv" label="Visitors who pay (%)" value={conv} onChange={setConv} hint="Your real rate, once you have one." />
        <NumField id="pl-price" label="Price / month" prefix="$" value={price} onChange={setPrice} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Out label="Visitors / 30 days" value={Math.round(visitors).toLocaleString()} sub={`${Math.round(fromAds).toLocaleString()} from ads`} />
        <Out
          label="New paying members"
          value={conv.trim() ? paid.toFixed(paid < 10 ? 1 : 0) : "–"}
          sub={conv.trim() ? `${money(paid * num(price))} a month, if these numbers hold` : "Add “Visitors who pay” to see this"}
        />
        <Out label="Ad spend / month" value={money(b * 30)} />
      </div>

      <p className="text-xs text-muted-foreground">A what-if, not a forecast. Use your real cost per visit and conversion after a week of ads.</p>

      <ol className="grid gap-2 sm:grid-cols-3">
        {THRESHOLDS.map((t) => {
          const ok = cleared.includes(t.level);
          const needPerDay = Math.max(0, ((t.visitors - o) * c) / 30);
          return (
            <li key={t.level} className={cn("rounded-lg border p-3 text-sm", ok && "border-success/40 bg-success-soft")}>
              <div className="font-medium">Level {t.level} · {t.visitors.toLocaleString()} visitors</div>
              <div className="text-muted-foreground">{ok ? "Visitor bar cleared." : `Needs about ${money(needPerDay)}/day in ads at your numbers.`}</div>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted-foreground">
        It&apos;s a rolling 30-day window. Skool only looks at the last 30 days, so visitors don&apos;t stack up month after month. Levels 3 and 4 also need Skool Network sign-ups and consistent organic promo.
      </p>
    </div>
  );
}

/** What-if: if Skool spends X/day on your community, what do you keep at each Growth Boost %? */
export function BoostCalculator({ initialBoost }: { initialBoost: number }) {
  const [spend, setSpend] = useState("0");
  const [roas, setRoas] = useState("2");
  const [boost, setBoost] = useState(String(initialBoost || 30));
  const [retention, setRetention] = useState("80");

  const gross = num(spend) * 30 * num(roas);
  const r = Math.min(0.99, num(retention) / 100);
  const share = Math.min(100, num(boost)) / 100;
  // Recurring: each month adds new members; earlier members stay at the retention rate.
  const runRate = (months: number) => (gross * (1 - Math.pow(r, months))) / (1 - r);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <NumField id="b-spend" label="Skool spends / day" prefix="$" value={spend} onChange={setSpend} hint="What Skool actually spends. It isn't guaranteed." />
        <NumField id="b-roas" label="Revenue per $1 spent" value={roas} onChange={setRoas} hint="First month." />
        <NumField id="b-boost" label="Your Growth Boost %" value={boost} onChange={setBoost} hint="Skool's cut. Default 30%." />
        <NumField id="b-ret" label="Monthly retention %" value={retention} onChange={setRetention} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Out label="New revenue / month" value={money(gross)} sub={`Skool keeps ${money(gross * share)}`} />
        <Out label="You keep, month 1" value={money(gross * (1 - share))} strong />
        <Out label="You keep / month by month 6" value={money(runRate(6) * (1 - share))} sub="Members who stay keep paying" strong />
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[360px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="p-2 font-medium">Growth Boost</th>
              {[30, 50, 70].map((p) => <th key={p} className="p-2 font-medium">{p}%</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2 text-muted-foreground">You keep, month 1</td>
              {[30, 50, 70].map((p) => <td key={p} className="p-2 tabular-nums">{money(gross * (1 - p / 100))}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        A higher boost % gives Skool more reason to spend on you, but you keep less of each member. Skool only takes its Growth Boost cut on members it brings. Members you bring yourself pay you minus Skool&apos;s transaction fee (10% + 30c on Hobby, 2.9% + 30c on Pro). Retention is the multiplier: it raises your Discovery rank and your monthly take.
      </p>
    </div>
  );
}

function Out({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", strong && "border-primary bg-accent")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
