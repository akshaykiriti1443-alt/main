import { requirePlatformAdmin } from "@/server/auth";
import Link from "next/link";
import { listAllWorkspaces } from "@/server/admin";
import { adjustWalletAction, setWorkspaceAction } from "@/actions/admin";
import { formatMoney } from "@/lib/util";
import { BoxesIcon } from "lucide-react";
import { Flash, PageHead, Panel } from "@/components/ui";
import { Avatar, EdgeTable } from "@/components/crm-ui";
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
      <PageHead eyebrow="Platform admin" title="Workspaces" sub="Every member and client account. Change a plan or status, or top up a wallet, right in the row." />
      <Flash searchParams={await searchParams} />
      <Panel icon={BoxesIcon} title="All workspaces" sub={`${rows.length} account${rows.length === 1 ? "" : "s"}.`}>
        <EdgeTable>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Workspace</TableHead>
              <TableHead className="hidden @6xl/main:table-cell">Owner</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Plan / status</TableHead>
              <TableHead>Wallet</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ workspace: w, owner, agencyName, isPlatformAgency, balance }) => (
              <TableRow key={w.id}>
                <TableCell className="min-w-52 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={w.name} size="sm" />
                    <div className="grid min-w-0 leading-tight">
                      <Link href={`/app/w/${w.id}`} className="truncate font-medium text-foreground no-underline hover:text-primary hover:no-underline">
                        {w.name}
                      </Link>
                      <span className="mt-0.5 truncate text-xs text-muted-foreground">{isPlatformAgency ? "Member" : `Agency: ${agencyName}`}</span>
                      {owner ? <span className="truncate text-xs text-subtle-foreground @6xl/main:hidden">{owner}</span> : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground @6xl/main:table-cell">{owner ?? <span className="text-subtle-foreground">—</span>}</TableCell>
                <TableCell>
                  <span className="text-[13px]">{w.accessSource}</span>
                  {w.accessVerifiedUntil ? <div className="text-xs text-subtle-foreground">to {w.accessVerifiedUntil.toDateString()}</div> : null}
                </TableCell>
                <TableCell>
                  <form action={setWorkspaceAction.bind(null, w.id)} className="flex items-center gap-1.5">
                    <NativeSelect size="sm" name="plan" defaultValue={w.plan} aria-label="Plan" className="w-40 shrink-0">
                      <NativeSelectOption value="starter">Member</NativeSelectOption>
                      <NativeSelectOption value="growth">Growth</NativeSelectOption>
                      <NativeSelectOption value="owner">Owner (everything)</NativeSelectOption>
                    </NativeSelect>
                    <NativeSelect size="sm" name="status" defaultValue={w.status} aria-label="Status" className="w-28 shrink-0">
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
                      <Input name="amount" type="number" step="0.01" placeholder="±$" className="h-8 w-20" aria-label="Amount" />
                      <Input name="note" placeholder="note" className="h-8 w-24" aria-label="Note" />
                      <SubmitButton variant="outline" size="sm" pendingText="Applying…">
                        Apply
                      </SubmitButton>
                    </form>
                  ) : (
                    <span className="text-xs text-subtle-foreground">Agency wallet</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </EdgeTable>
      </Panel>
    </>
  );
}
