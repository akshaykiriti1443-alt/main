import { requireAgency } from "@/server/tenancy";
import { saveAgencySettingsAction } from "@/actions/agency";
import { UNIT_PRICES, resalePrice, type UsageUnit } from "@/server/pricing";
import { dnsInstructions } from "@/server/domains";
import { formatMoney } from "@/lib/util";
import { Callout, Flash, PageHead, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const DOMAIN_TONE: Record<string, string> = {
  verified: "bg-success-soft text-success",
  error: "bg-destructive/10 text-destructive",
};

export default async function AgencySettings({ params, searchParams }: { params: Promise<{ aid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { aid } = await params;
  const { agency } = await requireAgency(aid);
  const b = agency.brand;
  const dns = agency.appDomain ? dnsInstructions(agency.appDomain) : null;
  const status = agency.appDomainStatus;
  return (
    <>
      <PageHead title="Branding & pricing" sub="Your clients see your name, logo and colors. Point your own domain at the platform for a fully white-label login." />
      <Flash searchParams={await searchParams} />
      <form action={saveAgencySettingsAction.bind(null, aid)} className="flex flex-col gap-4 md:gap-6">
        <Panel title="Brand">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="brandName">Brand name</FieldLabel>
              <Input id="brandName" name="brandName" defaultValue={b.name ?? agency.name} />
            </Field>
            <Field>
              <FieldLabel htmlFor="supportEmail">Support email</FieldLabel>
              <Input id="supportEmail" name="supportEmail" type="email" defaultValue={b.supportEmail ?? ""} />
            </Field>
            <Field>
              <FieldLabel htmlFor="logoUrl">Logo link (square)</FieldLabel>
              <Input id="logoUrl" name="logoUrl" type="url" defaultValue={b.logoUrl ?? ""} placeholder="https://…/logo.png" />
            </Field>
            <Field>
              <FieldLabel htmlFor="color">Brand color</FieldLabel>
              <input id="color" name="color" type="color" defaultValue={b.color ?? "#2A44EE"} />
            </Field>
          </div>
        </Panel>

        <Panel title="Your app domain">
          {agency.plan !== "agency" ? <Callout tone="info">Your own app domain unlocks with the Agency plan.</Callout> : null}
          <Field className="max-w-[420px]">
            <FieldLabel htmlFor="appDomain">Domain</FieldLabel>
            <Input id="appDomain" name="appDomain" defaultValue={agency.appDomain ?? ""} placeholder="app.youragency.com" />
            <FieldDescription>Clients log in at https://{agency.appDomain || "app.youragency.com"}/login and see only your brand.</FieldDescription>
          </Field>
          {agency.appDomain && dns ? (
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium break-all">{agency.appDomain}</span>
                <Badge variant="secondary" className={DOMAIN_TONE[status] ?? "bg-warning-soft text-warning"}>
                  {status}
                </Badge>
              </div>
              {status !== "verified" ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-mono text-xs">{dns.type}</TableCell>
                      <TableCell className="font-mono text-xs">{dns.name}</TableCell>
                      <TableCell className="font-mono text-xs">{dns.value}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {status === "verified"
                  ? "Your login page is live."
                  : status === "error"
                    ? "We couldn't verify this domain. Check the record above, then save the domain again. Still stuck? Email platform support."
                    : `${dns.note} DNS changes can take up to 24 hours. We check every few minutes.`}
              </p>
            </div>
          ) : null}
        </Panel>

        <Panel title="Resale pricing" sub="Usage comes out of your agency wallet at platform prices. Use these suggested prices when you bill your clients.">
          <Field className="max-w-[200px]">
            <FieldLabel htmlFor="markupPercent">Your markup on usage (%)</FieldLabel>
            <Input id="markupPercent" name="markupPercent" type="number" min={0} max={500} defaultValue={agency.markupPercent} />
          </Field>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">You pay</TableHead>
                <TableHead className="text-right">Suggested client price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(Object.keys(UNIT_PRICES) as UsageUnit[]).map((u) => (
                <TableRow key={u}>
                  <TableCell>{UNIT_PRICES[u].label}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{formatMoney(UNIT_PRICES[u].priceMicros)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatMoney(resalePrice(UNIT_PRICES[u].priceMicros, agency.markupPercent))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>

        <div>
          <SubmitButton pendingText="Saving…">Save</SubmitButton>
        </div>
      </form>
    </>
  );
}
