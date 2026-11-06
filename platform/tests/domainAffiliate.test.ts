import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { activities } from "@/lib/db/schema";
import { affiliateTarget, cleanDomainIdea, getDomainAffiliate, setDomainAffiliate } from "@/server/domainAffiliate";
import { domainClicks } from "@/server/admin";
import { GET } from "@/app/r/domain/route";
import { makeWorkspace } from "./helpers";

const LINK = "https://www.namecheap.com/domains/registration/results/?domain={domain}&affId=onex123";
const call = (qs: string) => GET(new NextRequest(`http://localhost:3000/r/domain?${qs}`));

describe("Get a domain: members buy through the owner's affiliate link", () => {
  it("tidies a member's idea and fills it into the partner's search", () => {
    expect(cleanDomainIdea("  https://www.My Brand.com/  ")).toBe("mybrand.com");
    expect(cleanDomainIdea("fit-dads club!")).toBe("fit-dadsclub");
    expect(affiliateTarget({ url: LINK, partner: "Namecheap" }, "FitDads.com")).toBe(
      "https://www.namecheap.com/domains/registration/results/?domain=fitdads.com&affId=onex123",
    );
    // A link without {domain} is used as-is.
    expect(affiliateTarget({ url: "https://partner.example.com/aff/onex", partner: "X" }, "abc.com")).toBe("https://partner.example.com/aff/onex");
  });

  it("only ever redirects to the owner's link, and counts the click", async () => {
    await setDomainAffiliate(null);
    expect((await call("q=fitdads.com")).headers.get("location")).toBe("http://localhost:3000/");

    await setDomainAffiliate({ url: LINK, partner: "Namecheap" });
    expect(await getDomainAffiliate()).toEqual({ url: LINK, partner: "Namecheap" });
    const { ws } = await makeWorkspace();
    const before = await domainClicks(30);
    const res = await call(`q=${encodeURIComponent("https://evil.example.com")}&w=${ws.id}`);
    const to = new URL(res.headers.get("location")!);
    expect(to.hostname).toBe("www.namecheap.com");
    expect(to.searchParams.get("domain")).toBe("evil.example.com"); // just a search term, never the destination
    expect(to.searchParams.get("affId")).toBe("onex123");

    const db = await getDb();
    const rows = await db.select().from(activities).where(and(eq(activities.workspaceId, ws.id), eq(activities.type, "domain_affiliate_click")));
    expect(rows).toHaveLength(1);
    expect(await domainClicks(30)).toBe(before + 1);
    await setDomainAffiliate(null);
  });

  it("refuses links that aren't public https", async () => {
    await setDomainAffiliate({ url: "http://localhost/aff", partner: "Nope" });
    expect(await getDomainAffiliate()).toBeNull();
    await setDomainAffiliate(null);
  });
});
