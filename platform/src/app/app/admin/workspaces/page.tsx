import { requirePlatformAdmin } from "@/server/auth";
import Link from "next/link";
import { listAllWorkspaces } from "@/server/admin";
import { adjustWalletAction, setWorkspaceAction } from "@/actions/admin";
import { formatMoney } from "@/lib/util";
import { Flash, PageHead, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AdminWorkspaces({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePlatformAdmin();
  const rows = await listAllWorkspaces();
  return (
    <>
      <PageHead title="Workspaces" sub="Every member and client account." />
      <Flash searchParams={await searchParams} />
      <Panel>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workspace</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Plan / status</TableHead>
              <TableHead>Wallet</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ workspace: w, owner, agencyName, isPlatformAgency, balance }) => (
              <TableRow key={w.id}>
                <TableCell>
                  <Link href={`/app/w/${w.id}`} className="font-medium text-foreground">
                    {w.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{isPlatformAgency ? "Member" : `Agency: ${agencyName}`}</div>
                </TableCell>
                <TableCell>{owner ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  {w.accessSource}
                  {w.accessVerifiedUntil ? <div className="text-xs text-muted-foreground">to {w.accessVerifiedUntil.toDateString()}</div> : null}
                </TableCell>
                <TableCell>
                  <form action={setWorkspaceAction.bind(null, w.id)} className="flex items-center gap-1.5">
                    <NativeSelect size="sm" name="plan" defaultValue={w.plan} aria-label="Plan">
                      <NativeSelectOption value="starter">Member</NativeSelectOption>
                      <NativeSelectOption value="growth">Growth</NativeSelectOption>
                    </NativeSelect>
                    <NativeSelect size="sm" name="status" defaultValue={w.status} aria-label="Status">
                      <NativeSelectOption value="active">active</NativeSelectOption>
                      <NativeSelectOption value="grace">grace</NativeSelectOption>
                      <NativeSelectOption value="paused">paused</NativeSelectOption>
                    </NativeSelect>
                    <Label className="gap-1.5 px-1 text-xs font-normal text-muted-foreground">
                      <input type="checkbox" name="lifetime" className="accent-primary" /> lifetime
                    </Label>
                    <SubmitButton variant="outline" size="sm" pendingText="Saving…">
                      Save
                    </SubmitButton>
                  </form>
                </TableCell>
                <TableCell>
                  {isPlatformAgency ? (
                    <form action={adjustWalletAction.bind(null, "workspace", w.id)} className="flex items-center gap-1.5">
                      <span className="mr-1 font-medium tabular-nums">{formatMoney(balance ?? 0)}</span>
                      <Input name="amount" type="number" step="0.01" placeholder="±$" className="h-7 w-20" aria-label="Amount" />
                      <Input name="note" placeholder="note" className="h-7 w-24" aria-label="Note" />
                      <SubmitButton variant="outline" size="sm" pendingText="Applying…">
                        Apply
                      </SubmitButton>
                    </form>
                  ) : (
                    <span className="text-xs text-muted-foreground">agency wallet</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </>
  );
}
