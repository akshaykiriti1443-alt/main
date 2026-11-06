import { describe, expect, it } from "vitest";
import { fillTemplate } from "@/lib/util";

describe("fillTemplate", () => {
  it("fills merge fields and leaves unknown ones empty", () => {
    expect(fillTemplate("Hi {{first_name}}, {{ missing }}!", { first_name: "Jo" })).toBe("Hi Jo, !");
  });
  it("never doubles 'your' or reads 'your The'", () => {
    const t = "Here's your {{lead_magnet_name}} 📥";
    expect(fillTemplate(t, { lead_magnet_name: "your free guide" })).toBe("Here's your free guide 📥");
    expect(fillTemplate(t, { lead_magnet_name: "The 5-Minute Bedtime Script" })).toBe("Here's your 5-Minute Bedtime Script 📥");
    expect(fillTemplate(t, { lead_magnet_name: "Bedtime Script" })).toBe("Here's your Bedtime Script 📥");
    // Elsewhere the name stays exactly as written.
    expect(fillTemplate("Here it is: [{{lead_magnet_name}}](x)", { lead_magnet_name: "The 5-Minute Bedtime Script" })).toBe("Here it is: [The 5-Minute Bedtime Script](x)");
  });
});
