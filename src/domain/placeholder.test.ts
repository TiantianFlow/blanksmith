import { describe, expect, it } from "vitest";

import { classifyDestination } from "./site-boundary";

// Originally scaffolded ahead of the module to drive Task 1's red runner. Now
// that the real interface exists, it supplies a standard-mode rule and asserts
// the same-eTLD+1 conversion the brief requires.
describe("placeholder domain import", () => {
  it("classifies a same-eTLD+1 pair as the same site", () => {
    expect(
      classifyDestination({
        sourceHostname: "news.example.com",
        targetUrl: "https://app.example.com",
        rule: {
          siteKey: "example.com",
          ruleType: "include",
          scope: "site",
          boundary: "site",
          externalBehavior: "preserve",
          enabled: true,
          relatedDomains: [],
        },
      }),
    ).toBe("convert");
  });
});
