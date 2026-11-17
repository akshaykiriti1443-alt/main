import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));

const { go } = await import("@/actions/helpers");
const where = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return (e as { url: string }).url;
  }
  throw new Error("expected a redirect");
};

describe("go(): the message after a save", () => {
  it("puts the message before a #hash, so the page can read it", () => {
    expect(where(() => go("/app/w/1/ai#key", { ok: "Your key works." }))).toBe("/app/w/1/ai?ok=Your+key+works.#key");
    expect(where(() => go("/app/w/1/settings?x=1#tracking", { error: "No" }))).toBe("/app/w/1/settings?x=1&error=No#tracking");
    expect(where(() => go("/app/w/1/ads?review=abc", { warn: "Hm" }))).toBe("/app/w/1/ads?review=abc&warn=Hm");
    expect(where(() => go("/app/w/1"))).toBe("/app/w/1");
  });
});
