import { describe, expect, it } from "vitest";
import { SKOOL_DESCRIPTION_MAX, SKOOL_WORDS_RULES, buildPrompt, coverHeadlineFor, fallbackGroupDescription, fallbackKit, launchKitInputSchema, normalizeKit } from "@/server/ai/launchKit";
import { KIT_SUGGEST_FIELDS, fallbackKitSuggestions } from "@/server/ai/kitSuggest";
import { KIT_FIELDS } from "@/app/app/w/[wid]/launch/deal";
import { PLAYBOOKS } from "@/server/playbooks";

// Who it's for → Pain → Path → Prize → Push, everywhere: the cover headline, the 150-character
// description and the About page. Truth rules: only numbers the member typed.

const INPUT = launchKitInputSchema.parse({ businessName: "The 45-Minute Dad", ownerName: "Sam", niche: "strength for busy dads", audience: "busy dads over 35", outcome: "get strong in 3 gym sessions a week", tone: "friendly" });

describe("the AI's rules", () => {
  it("say the five parts, the truth rules and the order of the About page", () => {
    expect(SKOOL_WORDS_RULES).toContain("Who it's for, Pain, Path, Prize, Push");
    expect(SKOOL_WORDS_RULES).toMatch(/never invent proof numbers, member counts, results, testimonials, income or guarantees/);
    expect(SKOOL_WORDS_RULES).toContain("Use only numbers the owner gave");
    expect(SKOOL_WORDS_RULES).toContain("At most 150 characters");
    expect(SKOOL_WORDS_RULES).toContain("For insurance agents doing $10K+/mo");
    expect(SKOOL_WORDS_RULES).toContain("never its numbers or claims");
    const about = ["The Prize in one line", '"Even if" or "Without"', '"This is for you if:"', "The Pain", "The Path", "One Push"].map((s) => SKOOL_WORDS_RULES.indexOf(s));
    expect(about.every((i) => i > 0)).toBe(true);
    expect([...about].sort((a, b) => a - b)).toEqual(about);
  });

  it("the prompt asks for a cover headline, or keeps the member's word for word", () => {
    expect(buildPrompt(INPUT)).toMatch(/write coverHeadline: the Prize in 4 to 8 words, at most 40 characters, numbers only from the answers above/);
    expect(buildPrompt({ ...INPUT, coverHeadline: "Strong in 3 sessions a week" })).toContain('use "Strong in 3 sessions a week" as coverHeadline, word for word');
  });

  it("the free trial is the push only when the member has one", () => {
    expect(buildPrompt({ ...INPUT, price: "$29", trialDays: 7 })).toContain("then the free trial as the push");
    expect(buildPrompt(INPUT)).toContain("(no free trial: none was given)");
    expect(buildPrompt({ ...INPUT, price: "$29", trialDays: 0 })).toContain("(no free trial: none was given)");
  });
});

describe("the cover headline on the kit", () => {
  it("is a form box (40 characters) with a Suggest button field", () => {
    expect(KIT_FIELDS).toContainEqual(["coverHeadline", 40]);
    expect(KIT_SUGGEST_FIELDS).toContain("coverHeadline");
    expect(launchKitInputSchema.parse({ ...INPUT, coverHeadline: "  Strong dads  " }).coverHeadline).toBe("Strong dads");
  });

  it("an AI headline that runs long is cut to the cover's size; a blank one becomes their result", () => {
    const kit = fallbackKit(INPUT);
    expect(kit.coverHeadline).toBe("Get strong in 3 gym sessions a week");
    expect(normalizeKit({ ...kit, coverHeadline: "Get strong in 3 gym sessions a week, without living in the gym, ever again" }).coverHeadline).toBe("Get strong in 3 gym sessions a week");
    expect(coverHeadlineFor({ coverHeadline: "" }, INPUT)).toBe("Get strong in 3 gym sessions a week");
    expect(coverHeadlineFor({ coverHeadline: "AI line" }, { ...INPUT, coverHeadline: "My line" })).toBe("My line");
  });

  it("starter ideas use only the member's own numbers", () => {
    const ideas = fallbackKitSuggestions("coverHeadline", { niche: "strength for busy dads", audience: "busy dads", outcome: "get strong in 3 gym sessions a week" });
    expect(ideas.length).toBeGreaterThanOrEqual(2);
    for (const idea of ideas) {
      expect(idea.length).toBeLessThanOrEqual(40);
      for (const n of idea.match(/\d+/g) ?? []) expect(["3"]).toContain(n);
    }
    const noNumbers = fallbackKitSuggestions("coverHeadline", { niche: "sourdough baking", audience: "home bakers", outcome: "bake a loaf you're proud of" });
    expect(noNumbers.join(" ")).not.toMatch(/\d/);
  });
});

describe("the 150-character description: Who + Prize + Path + Push", () => {
  it("packs all four, and the trial only when there is one", () => {
    expect(fallbackGroupDescription(INPUT)).toBe("For busy dads over 35: get strong in 3 gym sessions a week, with a simple plan and a group that keeps you going.");
    expect(fallbackGroupDescription({ ...INPUT, price: "$29", trialDays: 7 })).toBe("For busy dads over 35: get strong in 3 gym sessions a week, with a simple plan and a group that keeps you going. Start with a 7-day free trial.");
    expect(fallbackGroupDescription({ ...INPUT, price: "$29", trialDays: 0 })).not.toMatch(/trial/i);
    expect(fallbackGroupDescription({ ...INPUT, groupWeekly: "A weekly live class, a new lesson, feedback" })).toContain("with a weekly live class and a new lesson");
  });

  it("is never longer than 150 characters, whatever they typed", () => {
    for (let n = 1; n < 60; n += 3) {
      const d = fallbackGroupDescription({ ...INPUT, outcome: "lose ".repeat(n), audience: "dads ".repeat(n), groupWeekly: "live class, ".repeat(n), price: "$29", trialDays: 14 });
      expect(d.length).toBeLessThanOrEqual(SKOOL_DESCRIPTION_MAX);
      expect(d.length).toBeGreaterThan(10);
    }
    // When it's tight, the push and the path give way before the prize.
    const tight = fallbackGroupDescription({ ...INPUT, outcome: "get strong in 3 gym sessions a week and keep it for life while your kids watch you lift", price: "$29", trialDays: 7 });
    expect(tight.length).toBeLessThanOrEqual(150);
    expect(tight).toContain("get strong in 3 gym sessions a week");
  });
});

describe("the template About page", () => {
  it("opens with the Prize, then the objection, Who, Pain, Path and one Push, inventing nothing", () => {
    const about = fallbackKit({ ...INPUT, offer: "$29 a month with a 7-day free trial" }).skoolAboutPage;
    const order = ["🏆 Get strong in 3 gym sessions a week.", "Even if", "This is for you if:", "✅ You're one of these people: busy dads over 35", "❌", "💎 WHAT YOU GET", "👉 $29 a month with a 7-day free trial. Tap Join to start."].map((s) => about.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(about.split("\n")[0]).toBe("🏆 Get strong in 3 gym sessions a week.");
    // Only the member's own numbers.
    for (const n of about.match(/\d+/g) ?? []) expect(["3", "35", "29", "7"]).toContain(n);
    expect(about).not.toMatch(/members|guarantee|testimonial|results in/i);
    expect(fallbackKit(INPUT).skoolAboutPage).toContain("👉 Tap Join and come say hi.");
  });
});

describe("the Claude road", () => {
  it("Day 1 with Claude writes the About page, description and cover headline the same way", () => {
    const day1 = PLAYBOOKS.find((p) => p.name === "day_1_with_claude")!;
    expect(day1.steps).toContain("Who it's for, Pain, Path, Prize, Push");
    expect(day1.steps).toContain("at most 150 characters");
    expect(day1.steps).toContain("Cover headline: the Prize in 4 to 8 words");
    expect(day1.steps).toContain("only numbers I gave you");
  });
});
