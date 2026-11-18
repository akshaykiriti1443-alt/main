import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Day 5: someone replied to a text, so they go in with Add contact. The server action needs a
// signed-in session, so these check the wiring in the source, the way other page tests here do.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("Leads: Add contact for people who replied to a text", () => {
  const page = read("src/app/app/w/[wid]/leads/page.tsx");
  const action = read("src/actions/crm.ts");

  it("has an Add contact button at the top that opens the form", () => {
    expect(page).toContain("href={`/app/w/${wid}/leads?add=1#add-contact`}");
    expect(page).toContain('data-guide="add-contact"');
    expect(page).toContain('id="add-contact"');
    expect(page).toContain("defaultOpen={adding}");
    // The form sits above the list, not at the bottom of a long page.
    expect(page.indexOf("{addByHand}")).toBeLessThan(page.indexOf("{nobodyYet ? ("));
    // The words the course quotes.
    for (const words of ['title="Add a contact by hand"', ">First name<", ">Phone<", ">Tags<", "Add contact</SubmitButton>"]) expect(page).toContain(words);
  });

  it("comes back to the open form after adding, ready for the next person", () => {
    expect(action).toContain("const back = `/app/w/${wid}/leads?add=1${");
    // Opened from Day 5, the next friend keeps the tag "friend" filled in.
    expect(action).toContain('=== "day5" ? "&from=day5" : ""');
    expect(page).toContain("addContactPreset(sp.from)");
    expect(page).toContain("defaultValue={preset.tags}");
    expect(action).toMatch(/go\(back, \{ ok: created \? "Contact added\."/);
  });

  it("only sends follow-up emails to someone added by hand when the member ticks the box", () => {
    expect(page).toContain('name="welcome"');
    expect(action).toMatch(/const event = \{ type: "lead_created", workspaceId: wid, contactId: contact\.id \} as const;/);
    expect(action).toMatch(/if \(fd\.get\("welcome"\) === "on"\) await emitEvent\(event\);/);
    expect(action.match(/emitEvent\(/g)).toHaveLength(1);
  });

  it("still starts the member's New lead automations when the box is left off", () => {
    expect(action).toMatch(/else await startAutomationsForEvent\(event\);/);
    // Only the email sequences sit behind the box, which is all its label promises.
    expect(action).not.toMatch(/enrollForEvent/);
  });
});
