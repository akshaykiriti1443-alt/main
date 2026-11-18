import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { updateWorkspaceSettings } from "@/server/workspace";
import {
  adCountryFor,
  adLaunchDates,
  adStudioDefaults,
  countryFromAddress,
  daysRunningSince,
  FORMAT_LABEL,
  makeAdStudioPack,
  rememberAdCountry,
  reviewAdChoices,
  type StaticConcept,
} from "@/server/ai/adStudio";
import { makeWorkspace } from "./helpers";

const DAY = 86_400_000;
const statics = (n: number) => Array.from({ length: n }, (_, i) => ({ format: (["text_on_colour", "photo_overlay", "notes_app", "checklist", "quote_card"] as const)[i % 5] }) as unknown as StaticConcept);

describe("Ad research and Ad studio: the country starts where the member is", () => {
  it("reads the country at the end of a mailing address, never a state", () => {
    expect(countryFromAddress("123 Main St, Austin, TX 78701, USA")).toBe("US");
    expect(countryFromAddress("1 High St, Leeds LS1 1AA, United Kingdom")).toBe("GB");
    expect(countryFromAddress("12 Queen St, Auckland 1010, New Zealand")).toBe("NZ");
    expect(countryFromAddress("Flat 4, Mumbai 400001, India")).toBe("IN");
    expect(countryFromAddress("5 Rue X, Paris\nFrance")).toBe("FR");
    expect(countryFromAddress("Los Angeles, CA")).toBeNull();
    expect(countryFromAddress("Austin, TX 78701")).toBeNull();
    expect(countryFromAddress("")).toBeNull();
    expect(countryFromAddress(undefined)).toBeNull();
  });

  it("prefers the last pick, then the last pack, then the address", () => {
    expect(adCountryFor({ adCountry: "AU", mailingAddress: "Leeds, UK" }, "CA")).toBe("AU");
    expect(adCountryFor({ mailingAddress: "Leeds, UK" }, "CA")).toBe("CA");
    expect(adCountryFor({ mailingAddress: "Leeds, UK" })).toBe("GB");
    expect(adCountryFor({ adCountry: "ALL" })).toBeNull();
    expect(adCountryFor({}, "ZZ")).toBeNull();
  });

  it("a pick on one screen carries to the other; ALL changes nothing", async () => {
    const { ws } = await makeWorkspace();
    await rememberAdCountry(ws.id, "in");
    const db = await getDb();
    const read = async () => (await db.select().from(workspaces).where(eq(workspaces.id, ws.id)).limit(1))[0];
    expect((await read()).settings.adCountry).toBe("IN");
    await rememberAdCountry(ws.id, "ALL");
    expect((await read()).settings.adCountry).toBe("IN");
    expect(await adStudioDefaults(await read())).toMatchObject({ country: "IN" });
  });

  it("Ad studio isn't fixed at the US: it starts on the address's country with no pack yet", async () => {
    const { ws } = await makeWorkspace();
    await updateWorkspaceSettings(ws.id, { mailingAddress: "1 High St, Leeds, United Kingdom" });
    const db = await getDb();
    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id)).limit(1);
    expect(await adStudioDefaults(row)).toMatchObject({ country: "GB" });
  });
});

describe("Ad review: Which ad? and Days running fill themselves in", () => {
  it("lists Web S1…S5 and Skool S1…S5 from the newest pack of each kind", () => {
    const packs = [
      { pack: { destination: "skool" as const, statics: statics(5) } },
      { pack: { destination: "website" as const, statics: statics(5) } },
      { pack: { destination: "website" as const, statics: statics(3) } },
    ];
    const choices = reviewAdChoices(packs);
    expect(choices.map((c) => c.value)).toEqual(["Web S1", "Web S2", "Web S3", "Web S4", "Web S5", "Skool S1", "Skool S2", "Skool S3", "Skool S4", "Skool S5"]);
    expect(choices[0].destination).toBe("optin");
    expect(choices[5].destination).toBe("skool");
    expect(choices[0].label).toBe("Web S1 · " + FORMAT_LABEL.text_on_colour);
    // Older packs had no destination: they went to the Skool link.
    expect(reviewAdChoices([{ pack: { statics: statics(2) } as never }]).map((c) => c.value)).toEqual(["Skool S1", "Skool S2"]);
    expect(reviewAdChoices([])).toEqual([]);
  });

  it("counts days from the Publish tick, else the day the pack was made", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    const packs = [
      { createdAt: new Date(now.getTime() - 2 * DAY), pack: { destination: "skool" as const } },
      { createdAt: new Date(now.getTime() - 5 * DAY), pack: { destination: "website" as const } },
    ];
    const fromPacks = adLaunchDates(undefined, packs);
    expect(daysRunningSince(fromPacks.optin, now)).toBe(5);
    expect(daysRunningSince(fromPacks.skool, now)).toBe(2);
    const ticked = adLaunchDates({ ticks: { clicks: { at: new Date(now.getTime() - 4 * DAY).toISOString() } } }, packs);
    expect(daysRunningSince(ticked.optin, now)).toBe(4);
    expect(daysRunningSince(adLaunchDates(undefined, []).optin, now)).toBeNull();
    // Today counts as day 1, and nothing goes past 90.
    expect(daysRunningSince(new Date(now.getTime() - 3_600_000), now)).toBe(1);
    expect(daysRunningSince(new Date(now.getTime() - 400 * DAY), now)).toBe(90);
  });

  it("a real pack gives real choices", async () => {
    const { ws } = await makeWorkspace();
    const res = await makeAdStudioPack(ws.id, { budget: 5, country: "GB" });
    if (!res.ok) throw new Error(res.error);
    const choices = reviewAdChoices([{ pack: res.pack }]);
    expect(choices.map((c) => c.value)).toEqual(["Skool S1", "Skool S2", "Skool S3", "Skool S4", "Skool S5"]);
  });
});
