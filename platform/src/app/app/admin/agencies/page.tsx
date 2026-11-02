import { requirePlatformAdmin } from "@/server/auth";
import Link from "next/link";
import { Building2Icon } from "lucide-react";
import { listAllAgencies } from "@/server/admin";
import { adjustWalletAction, setAgencyAction } from "@/actions/admin";
import { formatMoney } from "@/lib/util";
import { Empty, Flash, PageHead, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AdminAgencies({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePlatformAdmin();
  const rows = await listAllAgencies();
  return (
    <>
      <PageHead title="Agencies" sub="Resellers on the Agency tier." />
      <Flash searchParams={await searchParams} />
      {rows.length === 0 ? (
        <Empty icon={Building2Icon} title="No agencies yet" body="Members start one from /app/agency/new." />
      ) : (
        <Panel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agency</TableHead>
                <TableHead className="text-right">Clients</TableHead>
                <TableHead>Plan / status</TableHead>
                <TableHead>Wallet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ agency: a, workspaces, balance }) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link href={`/app/agency/${a.id}`} className="font-medium text-foreground">
                      {a.brand.name || a.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{a.appDomain ?? "no app domain"}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{workspaces}</TableCell>
                  <TableCell>
                    <form action={setAgencyAction.bind(null, a.id)} className="flex items-center gap-1.5">
                      <NativeSelect size="sm" name="plan" defaultValue={a.plan} aria-label="Plan">
                        <NativeSelectOption value="none">none</NativeSelectOption>
                        <NativeSelectOption value="agency">agency</NativeSelectOption>
                      </NativeSelect>
                      <NativeSelect size="sm" name="status" defaultValue={a.status} aria-label="Status">
                        <NativeSelectOption value="active">active</NativeSelectOption>
                        <NativeSelectOption value="paused">paused</NativeSelectOption>
                      </NativeSelect>
                      <SubmitButton variant="outline" size="sm" pendingText="Saving…">
                        Save
                      </SubmitButton>
                    </form>
                  </TableCell>
                  <TableCell>
                    <form action={adjustWalletAction.bind(null, "agency", a.id)} className="flex items-center gap-1.5">
                      <span className="mr-1 font-medium tabular-nums">{formatMoney(balance ?? 0)}</span>
                      <Input name="amount" type="number" step="0.01" placeholder="±$" className="h-7 w-20" aria-label="Amount" />
                      <SubmitButton variant="outline" size="sm" pendingText="Applying…">
                        Apply
                      </SubmitButton>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </>
  );
}
