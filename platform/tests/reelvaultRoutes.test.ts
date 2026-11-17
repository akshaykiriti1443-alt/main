import { describe, expect, it } from "vitest";
import {
  activeSubItem,
  isReelVaultRoute,
  mirrorableRoute,
  oneXUrl,
  parseRvMessage,
  reelVaultNavItem,
  reelVaultSubnav,
  ROUTE_RE,
  routeFromPath,
  RV_SUBNAV,
  sameRoute,
} from "@/components/reelvault/routes";

const base = "/app/w/00000000-0000-4000-8000-000000000000";

describe("ReelVault's route rule (the same as ReelVault's ROUTE_RE)", () => {
  it("is character for character the contract's pattern", () => {
    expect(ROUTE_RE.source).toBe(
      String.raw`^(home|onboarding|competitors|competitor|discover|reels|reel|working|format|banks|create|outputs|output|settings|help|privacy)(\/[A-Za-z0-9_-]{1,64}){0,2}(\?[A-Za-z0-9_.~%+=&-]{1,200})?$`,
    );
  });

  it.each(["home", "reels", "reel/rl_abcdefghijklmnop", "working?dimension=hook&window=recent", "banks/hooks", "competitor/acc_abc/reels", "outputs?page=2", "privacy"])("accepts %s", (r) => {
    expect(isReelVaultRoute(r)).toBe(true);
  });

  it.each([
    "",
    "//evil.example",
    "https://evil.example",
    "https://evil",
    "admin",
    "login",
    "join",
    "reset",
    "verify",
    "reels/../../x",
    "../reels",
    "reels/",
    "reels/a/b/c",
    "reels?x=<script>",
    "reels#x",
    "Reels",
    `reels/${"a".repeat(65)}`,
    `reels?${"a".repeat(201)}`,
    "reels\n",
  ])("rejects %j", (r) => {
    expect(isReelVaultRoute(r)).toBe(false);
  });

  it("rejects anything over 300 characters even if the pattern fits", () => {
    const long = `reels/${"a".repeat(64)}/${"b".repeat(64)}?${"c".repeat(200)}`;
    expect(ROUTE_RE.test(long)).toBe(true);
    expect(long.length).toBeGreaterThan(300);
    expect(isReelVaultRoute(long)).toBe(false);
    expect(isReelVaultRoute(42)).toBe(false);
    expect(isReelVaultRoute(null)).toBe(false);
  });
});

describe("OneX address <-> ReelVault route", () => {
  it("maps /reelvault to home and back", () => {
    expect(routeFromPath(`${base}/reelvault`, "", base)).toBe("home");
    expect(routeFromPath(`${base}/reelvault/`, "", base)).toBe("home");
    expect(oneXUrl("home", base)).toBe(`${base}/reelvault`);
  });

  it("maps deep links 1:1, with the query", () => {
    expect(routeFromPath(`${base}/reelvault/working`, "?dimension=hook&window=recent", base)).toBe("working?dimension=hook&window=recent");
    expect(routeFromPath(`${base}/reelvault/working`, "dimension=hook&window=recent", base)).toBe("working?dimension=hook&window=recent");
    expect(routeFromPath(`${base}/reelvault/reel/rl_abcdefghijklmnop`, "", base)).toBe("reel/rl_abcdefghijklmnop");
    expect(oneXUrl("working?dimension=hook&window=recent", base)).toBe(`${base}/reelvault/working?dimension=hook&window=recent`);
    expect(oneXUrl("home?tab=jobs", base)).toBe(`${base}/reelvault?tab=jobs`);
  });

  it("falls back to home for anything ReelVault wouldn't take", () => {
    expect(routeFromPath(`${base}/reelvault/admin`, "", base)).toBe("home");
    expect(routeFromPath(`${base}/reelvault/reels/a/b/c`, "", base)).toBe("home");
    expect(routeFromPath(`${base}/reelvault/reels/%2F%2Fevil`, "", base)).toBe("home");
    expect(routeFromPath(`${base}/reelvault/reels`, "?q=<b>", base)).toBe("home");
    expect(routeFromPath(`${base}/ads/studio`, "", base)).toBe("home");
    expect(routeFromPath(`${base}/reelvaultx`, "", base)).toBe("home");
    expect(oneXUrl("//evil.example", base)).toBe(`${base}/reelvault`);
    expect(oneXUrl("admin", base)).toBe(`${base}/reelvault`);
  });

  it.each(["home", "reels", "reel/rl_abcdefghijklmnop", "working?dimension=hook&window=recent", "competitor/acc_1/reels", "home?tab=jobs"])("round-trips %s", (r) => {
    const url = new URL(oneXUrl(r, base), "http://localhost:3000");
    expect(routeFromPath(url.pathname, url.search, base)).toBe(r);
  });

  it("treats the same query written two ways as the same screen", () => {
    expect(sameRoute("reels?q=a%20b", "reels?q=a+b")).toBe(true);
    expect(sameRoute("reels", "reels")).toBe(true);
    expect(sameRoute("reels", "reel")).toBe(false);
    expect(sameRoute("reels", null)).toBe(false);
  });
});

describe("mirroring a route ROUTE_RE refuses", () => {
  it("keeps a valid route as it is", () => {
    expect(mirrorableRoute("reels?q=what")).toBe("reels?q=what");
    expect(mirrorableRoute("home")).toBe("home");
  });

  it("percent-encodes the search characters ROUTE_RE refuses, so the screen and its search both show", () => {
    const r = mirrorableRoute("reels?q=what*")!;
    expect(r).toBe("reels?q=what%2A");
    expect(isReelVaultRoute(r)).toBe(true);
    expect(sameRoute(r, "reels?q=what*")).toBe(true);
    expect(oneXUrl(r, base)).toBe(`${base}/reelvault/reels?q=what%2A`);
    const url = new URL(oneXUrl(r, base), "http://localhost:3000");
    expect(routeFromPath(url.pathname, url.search, base)).toBe(r);
    expect(mirrorableRoute("reels?q=it's (great)!")).toBe("reels?q=it%27s%20%28great%29%21");
    expect(mirrorableRoute("reels?q=café")).toBe("reels?q=caf%C3%A9");
  });

  it("falls back to the screen alone when the search can't be shown, and to null for anything else", () => {
    expect(mirrorableRoute(`reels?q=${"*".repeat(150)}`)).toBe("reels");
    expect(mirrorableRoute("reels?q=\ud800")).toBe("reels");
    expect(mirrorableRoute("admin?q=*")).toBeNull();
    expect(mirrorableRoute("//evil.example?x=*")).toBeNull();
    expect(mirrorableRoute("reels/../x?q=*")).toBeNull();
    expect(mirrorableRoute("not a route")).toBeNull();
    expect(mirrorableRoute(42)).toBeNull();
    expect(mirrorableRoute("x".repeat(301))).toBeNull();
  });
});

describe("the ReelVault sub-items in the OneX menu", () => {
  const children = reelVaultSubnav(base);

  it("lists the six screens in order", () => {
    expect(children.map((c) => c.label)).toEqual(["Competitors", "Reels", "What works", "Create", "Outputs", "Settings"]);
    expect(RV_SUBNAV.every((s) => isReelVaultRoute(s.path) && s.also.every((a) => isReelVaultRoute(a)))).toBe(true);
    expect(reelVaultNavItem(base)).toMatchObject({ href: `${base}/reelvault`, label: "ReelVault", icon: "reel" });
  });

  it("lights up the right child, segment-exact", () => {
    const at = (p: string) => activeSubItem(`${base}/reelvault/${p}`, children)?.label;
    expect(at("reels")).toBe("Reels");
    expect(at("reel/rl_abcdefghijklmnop")).toBe("Reels");
    expect(at("competitor/acc_1")).toBe("Competitors");
    expect(at("discover")).toBe("Competitors");
    expect(at("banks/hooks")).toBe("What works");
    expect(at("format/fmt_1")).toBe("What works");
    expect(at("output/out_1")).toBe("Outputs");
    expect(at("onboarding")).toBeUndefined();
    expect(activeSubItem(`${base}/reelvault`, children)).toBeUndefined();
    expect(activeSubItem(`${base}/reelvault/reelsx`, children)).toBeUndefined();
  });
});

describe("messages from the frame", () => {
  it("keeps only well-formed rv: messages", () => {
    expect(parseRvMessage({ type: "rv:ready", route: "reels", title: "Reels" })).toEqual({ type: "rv:ready", route: "reels", title: "Reels" });
    expect(parseRvMessage({ type: "rv:route", route: "reels" })).toEqual({ type: "rv:route", route: "reels", title: "" });
    expect(parseRvMessage({ type: "rv:height", height: 1200 })).toEqual({ type: "rv:height", height: 1200 });
    expect(parseRvMessage({ type: "rv:toast", text: "Saved" })).toEqual({ type: "rv:toast", text: "Saved" });
    expect(parseRvMessage({ type: "rv:signed-out" })).toEqual({ type: "rv:signed-out" });
    expect(parseRvMessage({ type: "rv:error", code: "expired", message: "That link ran out." })).toEqual({ type: "rv:error", code: "expired", message: "That link ran out." });
  });

  it("clips long text and titles", () => {
    expect((parseRvMessage({ type: "rv:toast", text: "x".repeat(500) }) as { text: string }).text).toHaveLength(300);
    expect((parseRvMessage({ type: "rv:ready", route: "home", title: "t".repeat(500) }) as { title: string }).title).toHaveLength(120);
  });

  it.each([
    null,
    "rv:ready",
    [],
    { type: 1 },
    { type: "onex:theme", theme: "dark" },
    { type: "rv:unknown" },
    { type: "rv:height", height: -1 },
    { type: "rv:height", height: 1.5 },
    { type: "rv:height", height: 100_001 },
    { type: "rv:height", height: "100" },
    { type: "rv:toast", text: "   " },
    { type: "rv:error", code: "Bad Code", message: "x" },
    { type: "rv:ready", route: 5 },
    new (class Weird {
      type = "rv:signed-out";
    })(),
  ])("ignores %j", (m) => {
    expect(parseRvMessage(m)).toBeNull();
  });
});
