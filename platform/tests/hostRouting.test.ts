import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hostConfig, isAgencyPath, marketingApex, routeRequest } from "@/lib/hostRouting";
import { middleware } from "@/middleware";

const prod = hostConfig({ appUrl: "https://app.scaleitads.com", marketingHosts: "scaleitads.com, www.scaleitads.com" });
const withRoot = hostConfig({ appUrl: "https://app.scaleitads.com", rootDomain: "scaleitads.com", marketingHosts: "scaleitads.com,www.scaleitads.com" });
const local = hostConfig({ appUrl: "http://localhost:3008" });

describe("hostConfig", () => {
  it("collects app hosts without ports and dedupes them", () => {
    const cfg = hostConfig({ appUrl: "http://localhost:3008", rootDomain: "onex.app", appHosts: "dash.example.com:443, localhost" });
    expect(cfg.appHosts).toEqual(["localhost", "onex.app", "app.onex.app", "www.onex.app", "dash.example.com"]);
    expect(cfg.marketingHosts).toEqual([]);
  });

  it("picks the apex as the canonical marketing host", () => {
    expect(marketingApex(hostConfig({ appUrl: "https://app.x.com", marketingHosts: "www.scaleitads.com,scaleitads.com" }))).toBe("scaleitads.com");
    expect(marketingApex(local)).toBe("");
  });

  it("knows the agency pages", () => {
    expect(["/home", "/watch", "/privacy", "/terms", "/skool", "/apply", "/booked", "/not-yet"].every(isAgencyPath)).toBe(true);
    expect(isAgencyPath("/skoolish")).toBe(false);
    expect(isAgencyPath("/legal/privacy")).toBe(false);
  });
});

describe("marketing hosts (scaleitads.com)", () => {
  it("serves the agency site, /skool and every app path as is", () => {
    for (const p of ["/", "/watch", "/privacy", "/terms", "/skool", "/apply", "/app", "/login", "/signup", "/join", "/api/cron/tick", "/scaleitads/og.png"]) {
      expect(routeRequest("scaleitads.com", p, prod), p).toEqual({ kind: "next" });
    }
  });

  it("redirects www to the apex, keeping the path", () => {
    expect(routeRequest("www.scaleitads.com", "/watch", prod)).toEqual({ kind: "redirect", host: "scaleitads.com", pathname: "/watch", status: 308 });
    expect(routeRequest("WWW.ScaleitAds.com:443", "/", prod)).toEqual({ kind: "redirect", host: "scaleitads.com", pathname: "/", status: 308 });
  });

  it("sends the old GoHighLevel /home URL to /", () => {
    expect(routeRequest("scaleitads.com", "/home", prod)).toEqual({ kind: "redirect", pathname: "/", status: 308 });
  });

  it("serves /apply's own-stack paths on the same host: the lead endpoint, the booking page and manage links", () => {
    for (const cfg of [prod, withRoot]) {
      for (const p of ["/api/scaleitads/apply", "/b/scaleitads/free-ad-account-check", "/b/scaleitads", "/booking/AbCdEfGhIjKlMnOpQrStUvWx12", "/booking/AbCdEfGhIjKlMnOpQrStUvWx12/invite.ics", "/booked", "/not-yet"]) {
        expect(routeRequest("scaleitads.com", p, cfg), p).toEqual({ kind: "next" });
      }
    }
    expect(routeRequest("www.scaleitads.com", "/b/scaleitads/call", prod)).toEqual({ kind: "redirect", host: "scaleitads.com", pathname: "/b/scaleitads/call", status: 308 });
    expect(isAgencyPath("/b/scaleitads/call")).toBe(false);
    expect(isAgencyPath("/booking/x")).toBe(false);
    expect(isAgencyPath("/booked")).toBe(true);
  });

  it("wins over ROOT_DOMAIN when the apex is both", () => {
    expect(routeRequest("scaleitads.com", "/", withRoot)).toEqual({ kind: "next" });
    expect(routeRequest("www.scaleitads.com", "/x", withRoot)).toMatchObject({ kind: "redirect", host: "scaleitads.com" });
  });
});

describe("the app host (app.scaleitads.com)", () => {
  it("opens the app at /", () => {
    expect(routeRequest("app.scaleitads.com", "/", prod)).toEqual({ kind: "redirect", pathname: "/app", status: 307 });
    expect(routeRequest("app.scaleitads.com", "/", withRoot)).toEqual({ kind: "redirect", pathname: "/app", status: 307 });
  });

  it("serves app paths as is", () => {
    for (const p of ["/app", "/app/w/123/leads", "/login", "/signup", "/join", "/legal/privacy", "/api/webhooks/skool", "/go/abc", "/u/abc", "/s/fit-dads"]) {
      expect(routeRequest("app.scaleitads.com", p, prod), p).toEqual({ kind: "next" });
    }
  });

  it("keeps the booking page, manage links and the apply endpoint on the app host too (never bounced to the marketing site)", () => {
    for (const p of ["/b/scaleitads/free-ad-account-check", "/booking/AbCdEfGhIjKlMnOpQrStUvWx12", "/api/scaleitads/apply"]) {
      expect(routeRequest("app.scaleitads.com", p, prod), p).toEqual({ kind: "next" });
      expect(routeRequest("localhost:3013", p, local), p).toEqual({ kind: "next" });
    }
    // On members' custom domains they're app paths, not site pages.
    expect(routeRequest("fitdads.com", "/b/fit-dads/intro-call", prod)).toEqual({ kind: "next" });
    expect(routeRequest("fitdads.com", "/booking/AbCdEfGhIjKlMnOpQrStUvWx12", prod)).toEqual({ kind: "next" });
  });

  it("sends agency pages to the marketing site, so each page has one URL", () => {
    expect(routeRequest("app.scaleitads.com", "/skool", prod)).toEqual({ kind: "redirect", host: "scaleitads.com", pathname: "/skool", status: 308 });
    expect(routeRequest("app.scaleitads.com", "/privacy", prod)).toEqual({ kind: "redirect", host: "scaleitads.com", pathname: "/privacy", status: 308 });
    expect(routeRequest("app.scaleitads.com", "/home", prod)).toEqual({ kind: "redirect", host: "scaleitads.com", pathname: "/", status: 308 });
  });

  it("serves agency pages itself when no marketing host is set", () => {
    const solo = hostConfig({ appUrl: "https://app.example.com" });
    expect(routeRequest("app.example.com", "/skool", solo)).toEqual({ kind: "next" });
    expect(routeRequest("app.example.com", "/home", solo)).toEqual({ kind: "rewrite", pathname: "/" });
  });
});

describe("localhost", () => {
  it("opens the app at / and previews every marketing page at its path", () => {
    expect(routeRequest("localhost:3008", "/", local)).toEqual({ kind: "redirect", pathname: "/app", status: 307 });
    expect(routeRequest("localhost:3008", "/home", local)).toEqual({ kind: "rewrite", pathname: "/" });
    for (const p of ["/skool", "/watch", "/privacy", "/terms", "/apply"]) expect(routeRequest("localhost:3008", p, local), p).toEqual({ kind: "next" });
  });

  it("stays local even when marketing hosts are configured", () => {
    expect(routeRequest("localhost", "/skool", hostConfig({ appUrl: "http://localhost:3008", marketingHosts: "scaleitads.com" }))).toEqual({ kind: "next" });
  });

  it("can preview the marketing host on scaleitads.localhost", () => {
    const cfg = hostConfig({ appUrl: "http://localhost:3008", marketingHosts: "scaleitads.localhost,www.scaleitads.localhost" });
    expect(routeRequest("scaleitads.localhost:3008", "/", cfg)).toEqual({ kind: "next" });
    expect(routeRequest("www.scaleitads.localhost:3008", "/terms", cfg)).toEqual({ kind: "redirect", host: "scaleitads.localhost", pathname: "/terms", status: 308 });
  });
});

describe("members' sites keep working exactly as before", () => {
  it("rewrites <slug>.ROOT_DOMAIN to /s/<slug>", () => {
    expect(routeRequest("fit-dads.scaleitads.com", "/", withRoot)).toEqual({ kind: "rewrite", pathname: "/s/fit-dads" });
    expect(routeRequest("fit-dads.scaleitads.com", "/privacy", withRoot)).toEqual({ kind: "rewrite", pathname: "/s/fit-dads/privacy" });
    expect(routeRequest("fit-dads.scaleitads.com", "/skool", withRoot)).toEqual({ kind: "rewrite", pathname: "/s/fit-dads/skool" });
    expect(routeRequest("fit-dads.scaleitads.com", "/api/public/lead", withRoot)).toEqual({ kind: "next" });
  });

  it("rewrites custom domains to /d/<host>, agency page names included", () => {
    expect(routeRequest("fitdads.com", "/", prod)).toEqual({ kind: "rewrite", pathname: "/d/fitdads.com" });
    expect(routeRequest("www.fitdads.com", "/terms", prod)).toEqual({ kind: "rewrite", pathname: "/d/www.fitdads.com/terms" });
    expect(routeRequest("fitdads.com", "/home", prod)).toEqual({ kind: "rewrite", pathname: "/d/fitdads.com/home" });
  });

  it("serves the white-label dashboard paths on any domain", () => {
    for (const p of ["/login", "/app", "/api/x", "/legal/terms"]) expect(routeRequest("app.agency.co", p, prod), p).toEqual({ kind: "next" });
  });

  it("never treats IPs or preview deployments as customer domains", () => {
    expect(routeRequest("127.0.0.1:3000", "/", prod)).toEqual({ kind: "next" });
    expect(routeRequest("[::1]:3000", "/x", prod)).toEqual({ kind: "next" });
    expect(routeRequest("onex-git-main.vercel.app", "/", prod)).toEqual({ kind: "next" });
    expect(routeRequest("", "/", prod)).toEqual({ kind: "next" });
  });
});

describe("middleware", () => {
  afterEach(() => vi.unstubAllEnvs());
  const call = (url: string, host = new URL(url).host, headers: Record<string, string> = {}) => middleware(new NextRequest(url, { headers: { host, ...headers } }));

  it("redirects www to the apex with the query string intact", () => {
    vi.stubEnv("MARKETING_HOSTS", "scaleitads.com,www.scaleitads.com");
    const res = call("https://www.scaleitads.com/watch?utm_source=fb&fbclid=1", "www.scaleitads.com", { "x-forwarded-proto": "https" });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://scaleitads.com/watch?utm_source=fb&fbclid=1");
  });

  it("serves the marketing home page at / on the marketing host", () => {
    vi.stubEnv("MARKETING_HOSTS", "scaleitads.com");
    const res = call("https://scaleitads.com/");
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets /apply's lead POST and the embedded booking page through on the marketing host", () => {
    vi.stubEnv("MARKETING_HOSTS", "scaleitads.com,www.scaleitads.com");
    const lead = middleware(new NextRequest("https://scaleitads.com/api/scaleitads/apply", { method: "POST", body: "{}", headers: { host: "scaleitads.com", "content-type": "application/json" } }));
    expect(lead.headers.get("x-middleware-next")).toBe("1");
    expect(lead.headers.get("location")).toBeNull();
    const cal = call("https://scaleitads.com/b/scaleitads/free-ad-account-check?embed=1&next=%2Fbooked&first_name=Jane");
    expect(cal.headers.get("x-middleware-next")).toBe("1");
    expect(call("https://scaleitads.com/booking/AbCdEfGhIjKlMnOpQrStUvWx12").headers.get("x-middleware-next")).toBe("1");
  });

  it("opens the app at / on the app host", () => {
    const res = call("http://localhost:3000/");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/app");
  });

  it("rewrites custom domains as before", () => {
    const res = call("https://fitdads.com/about?ref=ig");
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://fitdads.com/d/fitdads.com/about?ref=ig");
  });

  it("reads ROOT_DOMAIN for members' subdomains", () => {
    vi.stubEnv("ROOT_DOMAIN", "scaleitads.com");
    vi.stubEnv("MARKETING_HOSTS", "scaleitads.com");
    expect(call("https://fit-dads.scaleitads.com/").headers.get("x-middleware-rewrite")).toBe("https://fit-dads.scaleitads.com/s/fit-dads");
    expect(call("https://scaleitads.com/").headers.get("x-middleware-next")).toBe("1");
  });
});
