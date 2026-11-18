import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { pageContentSchema, siteThemeSchema } from "@/lib/db/types";
import { GLASS_BRAND, glassStarter } from "@/server/siteTemplates";
import { LANDING_STYLES, LandingSections } from "@/components/landing/LandingSections";

// next/font only works inside Next's build.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: {} });
  return { Geist: font, Instrument_Serif: font, Nunito: font };
});

describe("the Glass style", () => {
  it("is a theme value the schema accepts, and older values still parse", () => {
    expect(siteThemeSchema.parse({ style: "glass" }).style).toBe("glass");
    for (const style of ["bold", "clean", "dark", "editorial", "luxe"]) expect(siteThemeSchema.parse({ style }).style).toBe(style);
    expect(siteThemeSchema.parse({}).style).toBe("bold");
    expect(siteThemeSchema.safeParse({ style: "glossy" }).success).toBe(false);
    expect(LANDING_STYLES).toContain("glass");
    // Every style the schema allows has a renderer (an unknown one would quietly fall back to Bold).
    expect([...LANDING_STYLES].sort()).toEqual([...siteThemeSchema.shape.style.removeDefault().options].sort());
  });

  it("renders with its own class and the aurora behind the page", () => {
    const starter = glassStarter({ name: "Fit Dads", niche: "busy dads" });
    const html = renderToStaticMarkup(
      createElement(LandingSections, {
        sections: starter.sections,
        theme: starter.theme,
        vars: { skool_url: "https://www.skool.com/fit-dads", lead_magnet_name: starter.leadMagnetName },
        form: { action: "/api/public/lead", pageId: "p", eventId: "e" },
        businessName: "Fit Dads",
        standalone: true,
      }),
    );
    expect(html).toContain("style-glass");
    expect(html).toMatch(/class="lp-page-deco"[^>]*><i><\/i><i><\/i><i><\/i><\/div>/);
    expect(html).toContain("--lp-glass-bg");
    // Other styles keep an empty decoration layer.
    const bold = renderToStaticMarkup(
      createElement(LandingSections, {
        sections: starter.sections,
        theme: { ...starter.theme, style: "bold" },
        vars: {},
        form: { action: "/api/public/lead", pageId: "p", eventId: "e" },
        businessName: "Fit Dads",
      }),
    );
    expect(bold).toContain('<div class="lp-page-deco" aria-hidden="true"></div>');
  });
});

describe("glassStarter", () => {
  it("returns a Glass theme and pages that pass the site schemas", () => {
    const s = glassStarter({ name: "Fit Dads", niche: "busy dads" });
    expect(s.theme).toEqual({ style: "glass", brandColor: GLASS_BRAND, font: "sans" });
    expect(siteThemeSchema.parse(s.theme)).toEqual(s.theme);
    expect(s.pages.map((p) => [p.slug, p.kind])).toEqual([
      ["", "optin"],
      ["thank-you", "thankyou"],
    ]);
    for (const p of s.pages) expect(pageContentSchema.parse(p.content)).toEqual(p.content);
    expect(s.leadMagnetName.length).toBeLessThanOrEqual(120);
  });

  it("builds a Skool community landing page: hero with the form, benefits, steps, FAQ, Join button", () => {
    const s = glassStarter({ name: "Fit Dads" });
    expect(s.sections.map((x) => x.type)).toEqual(["hero", "benefits", "steps", "faq", "cta"]);
    const hero = s.sections[0];
    expect(hero.type === "hero" && hero.showForm).toBe(true);
    const cta = s.sections[4];
    expect(cta.type === "cta" && cta.buttonUrl).toBe("{{skool_url}}");
    const thanks = s.pages[1].content.sections[0];
    expect(thanks.type === "cta" && thanks.buttonUrl).toBe("{{skool_url}}");
    // Section ids are unique within the page.
    expect(new Set(s.sections.map((x) => x.id)).size).toBe(s.sections.length);
  });

  it("uses plain placeholder words: no invented numbers or testimonials", () => {
    const s = glassStarter({ name: "Fit Dads", niche: "busy dads" });
    const text = JSON.stringify(s.pages.map((p) => p.content)).replace(/"id":"[^"]+"/g, "");
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/testimonial|five stars|★|"[^"]*" -/i);
    expect(text).toContain("Fit Dads");
  });

  it("copes with a blank name, a long niche and a custom brand colour", () => {
    const s = glassStarter({ name: "   ", niche: "x".repeat(300), brandColor: "#0F766E" });
    expect(s.theme.brandColor).toBe("#0F766E");
    for (const p of s.pages) expect(() => pageContentSchema.parse(p.content)).not.toThrow();
    expect(glassStarter({ name: "A", brandColor: "teal" }).theme.brandColor).toBe(GLASS_BRAND);
  });
});
