import { describe, expect, it } from "vitest";

import { classifyDestination } from "./site-boundary";
import type { SiteRule } from "./types";

function includeRule(overrides: Partial<SiteRule> = {}): SiteRule {
  return {
    siteKey: "example.com",
    ruleType: "include",
    scope: "site",
    boundary: "site",
    externalBehavior: "preserve",
    enabled: true,
    relatedDomains: [],
    ...overrides,
  };
}

function excludeRule(overrides: Partial<SiteRule> = {}): SiteRule {
  return {
    siteKey: "example.com",
    ruleType: "exclude",
    scope: "site",
    boundary: "site",
    externalBehavior: "preserve",
    enabled: true,
    relatedDomains: [],
    ...overrides,
  };
}

describe("classifyDestination — include rules (unchanged behavior)", () => {
  it("converts same-eTLD+1 for an include rule", () => {
    expect(
      classifyDestination({
        sourceHostname: "news.example.com",
        targetUrl: "https://app.example.com/path",
        rule: includeRule(),
      }),
    ).toBe("convert");
  });

  it("preserves different eTLD+1 for an include rule", () => {
    expect(
      classifyDestination({
        sourceHostname: "news.example.com",
        targetUrl: "https://other.example/",
        rule: includeRule(),
      }),
    ).toBe("preserve");
  });
});

describe("classifyDestination — exclude rules in exclude-only mode", () => {
  // In exclude-only mode, the content script is active on ALL pages
  // except those matching an exclude rule. The rule passed to
  // classifyDestination is the matching exclude rule (if any), and
  // the destination policy is the same as include rules — the exclude
  // rule's boundary/relatedDomains/externalBehavior apply the same way
  // for pages that ARE active (i.e., not excluded).
  //
  // The key difference is in findRuleForUrl and registration, not in
  // classifyDestination itself — the classifier just checks if the
  // destination is same-property, regardless of whether the source
  // rule is include or exclude.

  it("converts same-eTLD+1 for an exclude rule (same policy logic)", () => {
    expect(
      classifyDestination({
        sourceHostname: "news.example.com",
        targetUrl: "https://app.example.com/path",
        rule: excludeRule(),
      }),
    ).toBe("convert");
  });

  it("preserves different eTLD+1 for an exclude rule", () => {
    expect(
      classifyDestination({
        sourceHostname: "news.example.com",
        targetUrl: "https://other.example/",
        rule: excludeRule(),
      }),
    ).toBe("preserve");
  });
});

describe("GlobalMode type", () => {
  it("include-only is the default mode", () => {
    const mode: import("./types").GlobalMode = "include-only";
    expect(mode).toBe("include-only");
  });

  it("exclude-only is the global mode", () => {
    const mode: import("./types").GlobalMode = "exclude-only";
    expect(mode).toBe("exclude-only");
  });
});

describe("RuleType type", () => {
  it("include is a valid rule type", () => {
    const rt: import("./types").RuleType = "include";
    expect(rt).toBe("include");
  });

  it("exclude is a valid rule type", () => {
    const rt: import("./types").RuleType = "exclude";
    expect(rt).toBe("exclude");
  });
});
