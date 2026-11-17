import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { WEEK } from "@/lib/week";

// The public /skool pages: the short sales page (/skool) and the full tour (/skool/inside). Each
// tells its story in order, real prices only, no pressure, no fake proof, and every app menu name
// they mention is a real menu item.

const ROOT = path.join(process.cwd(), "src");
const NO_PRESSURE = /\b(hurry|last chance|don't miss|you'd lose|you will lose|act now|lock it in|goes up soon|limited spots|spots left|only \d+ left)\b|\d+ days? left|\bcountdown\b/i;
const FAKE_PROOF = /testimonial|\d[\d,]* (members|students|coaches) (joined|already)|made \$|earned \$|\$\d+k/i;
const JARGON = /\b(server|platform owner|wallet|CAPI|Conversions API|env)\b/i;

async function render(live: boolean, page: "short" | "inside" = "inside") {
  vi.resetModules();
  vi.doMock("@/lib/reelvault", () => ({ reelVaultConfigured: () => live }));
  const mod = page === "short" ? await import("@/app/skool/page") : await import("@/app/skool/inside/page");
  return renderToStaticMarkup(mod.default());
}
const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

describe("/skool short page", () => {
  it("says the whole offer up top, then the wins, the price and the questions", async () => {
    const t = text(await render(true, "short"));
    const order = ["without a following", "One membership. Three parts.", "Then nobody came.", "Seven days.", "No made-up reviews.", "How every day works", "What it costs", "Good to know", "Want every detail?"];
    let at = -1;
    for (const s of order) {
      const i = t.indexOf(s, at + 1);
      expect(i, s).toBeGreaterThan(at);
      at = i;
    }
    for (const d of [1, 2, 3, 4, 5, 6, 7]) expect(t).toContain(`Day ${d}`);
    // The ads are part of the course's story, but the money is never hidden: named in the price box and the FAQ.
    expect(t).toContain("about $15 a day on your own card");
    expect(t).toContain("about $15 a day while you test");
    expect(t).toContain("Skool bills you automatically unless you cancel");
    expect(t).toContain("The course, the OneX app and ReelVault");
    expect(t).toContain("Do I need a following or an audience first?");
    expect(t).not.toMatch(NO_PRESSURE);
    expect(t).not.toMatch(FAKE_PROOF);
    expect(t).not.toMatch(JARGON);
    expect(t).not.toContain("—");
    expect(t).not.toMatch(/(Claude|ChatGPT)[^.?]*instead/);
  });

  it("says plainly when ReelVault isn't switched on", async () => {
    const t = text(await render(false, "short"));
    expect(t).toContain("Being set up");
    expect(t).toContain("The course and the OneX app");
  });

  it("joins on Skool, links the full tour, and every in-page link has a target", async () => {
    const html = await render(true, "short");
    expect(html).toContain('href="https://www.skool.com/0-to-1x-academy-9129/about"');
    expect(html).toContain('href="http://localhost:3000/signup"');
    expect(html).toContain('href="/skool/inside"');
    for (const m of html.matchAll(/href="#([a-z-]+)"/g)) expect(html, m[1]).toContain(`id="${m[1]}"`);
  });
});

describe("/skool/inside page", () => {
  it("renders the whole story in order, with ReelVault live", async () => {
    const t = text(await render(true));
    const order = ["Meet Pete", "We were all Pete once", "Seven days.", "One-Before-You", "The app does it.", "ReelVault:", "What it costs", "If you cancel", "Good to know"];
    let at = -1;
    for (const s of order) {
      const i = t.indexOf(s, at + 1);
      expect(i, s).toBeGreaterThan(at);
      at = i;
    }
    for (const d of [1, 2, 3, 4, 5, 6, 7]) expect(t).toContain(`Day ${d}`);
    // The day titles are the app's own, in the app's order.
    for (const d of WEEK) expect(t, `Day ${d.day}`).toContain(d.title);
    expect(t).toContain("About $15 a day");
    expect(t).toContain("Skool bills you automatically unless you cancel");
    expect(t).toContain("opens right inside the app");
    expect(t).not.toContain("opens in a new tab");
    expect(t).toContain("The course, the OneX app and ReelVault");
    expect(t).not.toMatch(NO_PRESSURE);
    expect(t).not.toMatch(FAKE_PROOF);
    expect(t).not.toMatch(JARGON);
    expect(t).not.toContain("—");
    // A Claude or ChatGPT subscription only adds chat; the app's buttons still need the member's key.
    expect(t).not.toMatch(/(Claude|ChatGPT)[^.?]*\binstead\b/);
    expect(t).toContain("buttons still run on your key");
    expect(t).toContain("buttons still use your key");
  });

  it("says plainly when ReelVault isn't switched on", async () => {
    const html = await render(false);
    const t = text(html);
    expect(t).toContain("being set up");
    expect(t).not.toContain("opens right inside the app");
    expect(t).toContain("The course and the OneX app");
    expect(html).not.toMatch(/>ReelVault<\/li>|ReelVault<\/span><\/li>/);
  });

  it("every join button goes to the Skool group, and every account link to the app", async () => {
    const html = await render(true);
    expect(html).toContain('href="https://www.skool.com/0-to-1x-academy-9129/about"');
    expect(html).toContain('href="http://localhost:3000/signup"');
    expect(html).toContain('href="http://localhost:3000/login"');
    for (const id of ["week", "rule", "app", "cost", "cancel", "faq", "reelvault", "pete"]) expect(html).toContain(`id="${id}"`);
    for (const m of html.matchAll(/href="#([a-z-]+)"/g)) expect(html, m[1]).toContain(`id="${m[1]}"`);
  });

  it("menu names on the page are the app's own", () => {
    // The menu lives in nav.ts; ReelVault's entry (and its sub-items) comes from components/reelvault/routes.ts.
    const menu = [...["layout.tsx", "nav.ts"].map((f) => path.join(ROOT, "app/app/w/[wid]", f)), path.join(ROOT, "components/reelvault/routes.ts")]
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    const chips = new Set<string>();
    // The section files and their motion pieces in components/skool/fx/.
    for (const f of readdirSync(path.join(ROOT, "components/skool"), { recursive: true, withFileTypes: true })) {
      if (!f.isFile() || !/\.tsx?$/.test(f.name)) continue;
      const src = readFileSync(path.join(f.parentPath, f.name), "utf8");
      for (const m of src.matchAll(/label: "([^"]+)"/g)) chips.add(m[1]);
    }
    const page = readFileSync(path.join(ROOT, "app/skool/content.tsx"), "utf8");
    for (const m of page.matchAll(/tools: \[([^\]]+)\]/g)) for (const n of m[1].matchAll(/"([^"]+)"/g)) chips.add(n[1]);
    expect(chips.size).toBeGreaterThan(5);
    for (const c of chips) expect(menu, c).toContain(`label: "${c}"`);
  });
});
