import { PauseCircleIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { redeemCodeAction } from "@/actions/account";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default async function PausedPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace, agency } = await requireWorkspace(wid, "user", { allowPaused: true });
  const viaAgency = !agency.isPlatform;
  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader className="gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-warning-soft text-warning">
          <PauseCircleIcon className="size-5" />
        </span>
        <CardTitle>
          <h1 className="text-xl font-semibold tracking-tight">{workspace.name} is paused</h1>
        </CardTitle>
        <CardDescription>
          Your pages are offline and automations are stopped. Your funnels, leads and emails are saved and come back the moment access returns.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Flash searchParams={await searchParams} />
        {viaAgency ? (
          <p className="text-sm">Contact {agency.brand.name || agency.name} to turn your account back on.</p>
        ) : workspace.pauseReason === "admin" ? (
          <p className="text-sm">The platform team paused this account. Reply to any email from us to turn it back on.</p>
        ) : (
          <form action={redeemCodeAction.bind(null, wid)} className="flex flex-col gap-4">
            <input type="hidden" name="back" value={`/app/w/${wid}/paused`} />
            <Field>
              <FieldLabel htmlFor="code">This month&apos;s member code</FieldLabel>
              <Input id="code" name="code" required placeholder="From the Skool classroom" />
              <FieldDescription>Rejoined Skool? Your code is in the Start Here lesson.</FieldDescription>
            </Field>
            <SubmitButton className="w-full sm:w-auto sm:self-start">Turn my account back on</SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
