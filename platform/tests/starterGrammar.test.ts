import { describe, expect, it } from "vitest";
import { midSentence, ownerSignOff, personFirstName, startsWithAction } from "@/lib/util";
import { fallbackGroupDescription, fallbackKit, launchKitInputSchema } from "@/server/ai/launchKit";
import { fallbackUnlock } from "@/server/ai/unlockSuggest";
import { starterCopy } from "@/server/ai/pageCopy";
import { starterSlides } from "@/server/carousel/shape";
import { glassStarter } from "@/server/siteTemplates";
import type { BusinessContext } from "@/server/ai/businessContext";

// The no-AI starter words read like a person wrote them: what the member typed sits mid-sentence in
// small letters, an action never gets used as a noun, and a name only shows when it is one.

// The gym demo account's answers, exactly as typed on the form.
const GYM = launchKitInputSchema.parse({
  businessName: "The 45-Minute Dad",
  ownerName: "Dad Coach Demo",
  niche: "Getting strong in 3 gym sessions a week",
  audience: "Busy dads over 35",
  outcome: "Get strong without living in the gym",
  leadMagnetIdea: "The 3-Day Dad Strength Plan",
  tone: "friendly",
});

describe("midSentence", () => {
  it("lower-cases a capital first letter", () => {
    expect(midSentence("Busy dads over 35")).toBe("busy dads over 35");
    expect(midSentence("Get strong")).toBe("get strong");
  });
  it("keeps acronyms, brand-style words and I as typed", () => {
    for (const s of ["CEOs who want to sleep", "AI ads", "YouTube creators", "McKinsey alumni", "iPhone photographers", "I want to lift", "I'm a beginner"]) {
      expect(midSentence(s)).toBe(s);
    }
  });
  it("leaves empty and lower-case text alone", () => {
    expect(midSentence("")).toBe("");
    expect(midSentence("busy dads")).toBe("busy dads");
    expect(midSentence("35+ dads")).toBe("35+ dads");
  });
});

describe("personFirstName", () => {
  it("uses the first word when the name box holds a person's name", () => {
    expect(personFirstName("Sam")).toBe("Sam");
    expect(personFirstName("Sam Owner")).toBe("Sam");
    expect(personFirstName("  priya  sharma ")).toBe("Priya");
    expect(personFirstName("Anne-Marie O'Neil")).toBe("Anne-Marie");
  });
  it("gives nothing for a role, a brand or anything not a name", () => {
    for (const s of ["Dad Coach Demo", "Coach Mike", "The 45-Minute Dad", "Dad", "FitTeam2", "Team Strong", "", "   ", "A B C D E"]) {
      expect(personFirstName(s)).toBe("");
    }
  });
  it("signs off with the first name, else the name as typed", () => {
    expect(ownerSignOff("Sam Owner")).toBe("Sam");
    expect(ownerSignOff("Coach Mike")).toBe("Coach Mike");
  });
});

describe("startsWithAction", () => {
  it("spots verbs and -ing words, not things", () => {
    expect(startsWithAction("getting strong in 3 gym sessions a week")).toBe(true);
    expect(startsWithAction("get strong")).toBe(true);
    expect(startsWithAction("Lose 10 lbs")).toBe(true);
    expect(startsWithAction("fat loss")).toBe(false);
    expect(startsWithAction("strength for busy dads")).toBe(false);
    expect(startsWithAction("")).toBe(false);
  });
});

describe("the no-AI launch kit, from the gym demo's answers", () => {
  const kit = fallbackKit(GYM);
  const all = JSON.stringify(kit);

  it("puts the audience mid-sentence in small letters", () => {
    expect(kit.eyebrow).toBe("Free for busy dads over 35");
    expect(kit.subheadline).toBe("Get the free 3-Day Dad Strength Plan. It shows busy dads over 35 the first steps that work.");
    expect(kit.aboutBody).toMatch(/^I help busy dads over 35 with getting strong in 3 gym sessions a week\./);
    expect(kit.skoolAboutPage).toContain("✅ You're one of these people: busy dads over 35");
    expect(kit.skoolGroupDescription).toMatch(/^For busy dads over 35: get strong without living in the gym/);
    expect(all).not.toMatch(/(?:for|shows|help|people:) Busy dads/);
    expect(all).not.toMatch(/(?:with|on|get) Getting strong/);
  });

  it("never names 'Dad' from the owner box: it says me", () => {
    expect(kit.skoolAboutPage).toContain("🔹 Help from me when you're stuck");
    expect(kit.benefits[2].body).toBe("Get help from me and the group.");
    expect(kit.aboutTitle).toBe("A bit about me");
    expect(all).not.toMatch(/from Dad|I'm Dad/);
    // Emails sign with the name as typed when it isn't a plain first name.
    expect(kit.emails[0].body.endsWith("Dad Coach Demo")).toBe(true);
  });

  it("uses an action outcome as an action", () => {
    expect(kit.hooks).toContain("If you want to get strong without living in the gym, watch this.");
    expect(kit.hooks).toContain("The 10-minute plan to get strong without living in the gym.");
    expect(kit.hooks).toContain("Most people get this wrong. Here's the fix.");
  });

  it("still uses a real first name, and keeps acronyms", () => {
    const sam = fallbackKit({ ...GYM, ownerName: "Sam Jones", audience: "CEOs who skip the gym" });
    expect(sam.aboutTitle).toBe("Hi, I'm Sam");
    expect(sam.skoolAboutPage).toContain("🔹 Help from Sam when you're stuck");
    expect(sam.eyebrow).toBe("Free for CEOs who skip the gym");
    expect(sam.emails[2].body.endsWith("Sam")).toBe(true);
  });

  it("the group description keeps the audience small too", () => {
    expect(fallbackGroupDescription({ audience: "Busy dads over 35", outcome: "Lose 10 lbs" })).toMatch(/^For busy dads over 35: lose 10 lbs/);
  });
});

describe("Suggest an unlock, with no AI", () => {
  const ctx = (niche: string, outcome = ""): Pick<BusinessContext, "niche" | "outcome" | "audience" | "leadMagnetName"> => ({ niche, outcome, audience: "", leadMagnetName: "" });

  it("puts an action topic after the noun", () => {
    const s = fallbackUnlock(ctx("Getting strong in 3 gym sessions a week", "Get strong without living in the gym"));
    expect(s.title).toBe("My starter checklist for getting strong in 3 gym sessions a week");
    expect(s.reward).toBe("The first steps I'd take to get strong without living in the gym.");
    expect(s.instructions).toBe("Make a post: your name, where you are today, and the one thing you're stuck on.");
  });

  it("keeps a short thing in front", () => {
    const s = fallbackUnlock(ctx("Fat loss", "lose 10 lbs in 8 weeks"));
    expect(s.title).toBe("My fat loss starter checklist");
    expect(s.reward).toBe("The first steps I'd take to lose 10 lbs in 8 weeks.");
    expect(s.instructions).toContain("where you are with fat loss today");
  });

  it("reads right for a long noun topic, a gerund result and nothing at all", () => {
    expect(fallbackUnlock(ctx("strength for busy dads over 35")).title).toBe("My starter checklist for strength for busy dads over 35");
    expect(fallbackUnlock(ctx("AI ads")).title).toBe("My AI ads starter checklist");
    expect(fallbackUnlock(ctx("yoga", "Getting your first 10 clients")).reward).toBe("The first steps I'd take toward getting your first 10 clients.");
    expect(fallbackUnlock(ctx("")).title).toBe("My 7-day starter checklist");
  });
});

describe("other no-AI templates", () => {
  const ctx: BusinessContext = {
    businessName: "The 45-Minute Dad",
    ownerName: "Dad Coach Demo",
    niche: "Getting strong",
    audience: "Busy dads over 35",
    outcome: "Get strong",
    offer: "",
    leadMagnetName: "",
    skoolUrl: "",
    tone: "friendly",
  };
  it("page editor starter lines", () => {
    expect(starterCopy("eyebrow", "hero", ctx)).toBe("Free for busy dads over 35");
    expect(starterCopy("subheadline", "hero", ctx)).toBe("A simple plan for busy dads over 35. Start with one small step today.");
    expect(starterCopy("body", "text", ctx)).toMatch(/^I help busy dads over 35 with getting strong\./);
    expect(starterCopy("title", "text", ctx)).toBe("About The 45-Minute Dad");
  });
  it("carousel starter never uses an action as a noun", () => {
    expect(starterSlides("Getting strong in 3 gym sessions")[1].lines[0]).toBe("Pick one habit you can do in 10 minutes.");
    expect(starterSlides("Fat loss")[1].lines[0]).toBe("Pick one fat loss habit you can do in 10 minutes.");
  });
  it("the Glass website starter", () => {
    expect(glassStarter({ name: "X", niche: "Busy dads" }).sections[0]).toMatchObject({ eyebrow: "Free guide for busy dads" });
  });
});
