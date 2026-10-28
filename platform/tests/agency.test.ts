import { describe, expect, it } from "vitest";
import { createAgency, createSubAccount, listSubAccounts } from "@/server/agency";
import { listAllAgencies, listAllWorkspaces } from "@/server/admin";
import { createUser } from "@/server/auth";
import { upsertContact } from "@/server/contacts";
import { chargeUsage, getOrCreateWallet, creditWallet, billingWalletFor } from "@/server/wallet";

describe("agency tier", () => {
  it("creates sub-accounts with owners, counts contacts and bills the agency wallet", async () => {
    const owner = await createUser({ email: `agency-${Date.now()}@example.com`, name: "Agency Owner", password: "password123" });
    const agency = await createAgency(owner.id, "Growth Lab");
    const ws = await createSubAccount({ agencyId: agency.id, agencyName: "Growth Lab", name: "Coach Maria", ownerEmail: `maria-${Date.now()}@example.com`, ownerName: "Maria" });
    await upsertContact({ workspaceId: ws.id, email: "a@example.com", source: "manual" });
    await upsertContact({ workspaceId: ws.id, email: "b@example.com", source: "manual" });

    const subs = await listSubAccounts(agency.id);
    expect(subs).toHaveLength(1);
    expect(subs[0].owner).toMatch(/^maria-/);
    expect(subs[0].contacts).toBe(2);

    const all = await listAllWorkspaces();
    expect(all.find((r) => r.workspace.id === ws.id)?.owner).toMatch(/^maria-/);
    const agencies = await listAllAgencies();
    expect(agencies.find((a) => a.agency.id === agency.id)?.workspaces).toBe(1);

    // Sub-account usage spends from the agency wallet.
    const { wallet } = await billingWalletFor(ws.id);
    expect(wallet.ownerType).toBe("agency");
    const agencyWallet = await getOrCreateWallet("agency", agency.id);
    await creditWallet(agencyWallet.id, 10_000_000, { type: "adjustment", description: "seed" });
    for (let i = 0; i < 30; i++) await chargeUsage(ws.id, "ai_generation"); // growth includes 30
    const billed = await chargeUsage(ws.id, "ai_generation");
    expect(billed.billedMicros).toBe(500_000);
    expect((await getOrCreateWallet("agency", agency.id)).balanceMicros).toBe(9_500_000);
  });
});

describe("team", () => {
  it("invites and removes members but never the owner", async () => {
    const { makeWorkspace } = await import("./helpers");
    const { inviteMember, listMembers, removeMember } = await import("@/server/team");
    const { ws, user } = await makeWorkspace();
    const res = await inviteMember({ workspaceId: ws.id, workspaceName: ws.name, email: `staff-${Date.now()}@example.com`, name: "Staff", role: "user" });
    expect(res.isNew).toBe(true);
    let members = await listMembers(ws.id);
    expect(members).toHaveLength(2);
    const staff = members.find((m) => m.role === "user")!;
    await removeMember(ws.id, user.id); // owner: ignored
    await removeMember(ws.id, staff.userId);
    members = await listMembers(ws.id);
    expect(members.map((m) => m.role)).toEqual(["owner"]);
  });
});
