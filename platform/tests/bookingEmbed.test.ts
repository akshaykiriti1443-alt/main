import { describe, expect, it } from "vitest";
import { bookingPrefill, isEmbed, nextWithName, safeNextPath } from "@/lib/bookingEmbed";

describe("booking page prefill", () => {
  it("takes name, or first_name + last_name, email and phone", () => {
    expect(bookingPrefill({ name: "Jane Smith", email: "jane@brand.com", phone: "+1 555 000 1111" })).toEqual({ name: "Jane Smith", email: "jane@brand.com", phone: "+1 555 000 1111" });
    expect(bookingPrefill({ first_name: "Jane", last_name: "Smith" }).name).toBe("Jane Smith");
    expect(bookingPrefill({ first_name: "Jane" }).name).toBe("Jane");
    // name wins over the split fields; repeated params take the first value.
    expect(bookingPrefill({ name: ["Ann Lee", "x"], first_name: "Jane" }).name).toBe("Ann Lee");
    expect(bookingPrefill({})).toEqual({ name: "", email: "", phone: "" });
  });

  it("cleans what it's given", () => {
    const p = bookingPrefill({ name: "  Jane\n\tSmith\u0000 ", email: " jane @brand.com ", phone: "x".repeat(80), first_name: "y".repeat(300) });
    expect(p.name).toBe("Jane Smith");
    expect(p.email).toBe("jane@brand.com");
    expect(p.phone).toHaveLength(40);
    expect(bookingPrefill({ first_name: "y".repeat(300) }).name.length).toBeLessThanOrEqual(120);
  });

  it("knows the embed flag", () => {
    expect(isEmbed({ embed: "1" })).toBe(true);
    expect(isEmbed({ embed: "true" })).toBe(false);
    expect(isEmbed({})).toBe(false);
  });
});

describe("booking page next=", () => {
  it("accepts same-site paths", () => {
    expect(safeNextPath("/booked")).toBe("/booked");
    expect(safeNextPath("/booked?ref=apply#top")).toBe("/booked?ref=apply#top");
    expect(safeNextPath(["/thanks", "https://evil.com"])).toBe("/thanks");
    expect(safeNextPath("/a/../booked")).toBe("/booked");
  });

  it("refuses anything that could leave the site (open redirects)", () => {
    for (const bad of [
      "https://evil.com",
      "http://evil.com/booked",
      "//evil.com",
      "//evil.com/booked",
      "/\\evil.com",
      "\\\\evil.com",
      "/..//evil.com",
      "/.//evil.com",
      "/a/..//evil.com",
      "/%2e%2e//evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      " /booked",
      "javascript:alert(1)",
      "booked",
      "",
      `/${"a".repeat(600)}`,
    ]) {
      expect(safeNextPath(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(safeNextPath(undefined)).toBeNull();
  });

  it("carries the booker's name to the next page", () => {
    expect(nextWithName("/booked", "Jane Smith")).toBe("/booked?name=Jane+Smith");
    expect(nextWithName("/booked?ref=apply", "Jane")).toBe("/booked?ref=apply&name=Jane");
    expect(nextWithName("/booked", "  ")).toBe("/booked");
    // Never leaves the site, even if handed something unchecked.
    expect(nextWithName("//evil.com", "Jane")).toBe("/?name=Jane");
  });
});
