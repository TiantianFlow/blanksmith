import { describe, expect, it } from "vitest";

import { decideLink } from "./link-policy";
import type { SiteRule } from "./types";

function standardRule(siteKey: string, relatedDomains: string[] = []): SiteRule {
  return {
    siteKey,
    ruleType: "include",
    scope: "site",
    boundary: "site",
    externalBehavior: "preserve",
    enabled: true,
    relatedDomains,
  };
}

function hostRule(siteKey: string): SiteRule {
  return {
    siteKey,
    ruleType: "include",
    scope: "host",
    boundary: "host",
    externalBehavior: "preserve",
    enabled: true,
    relatedDomains: [],
  };
}

function convertAllRule(siteKey: string): SiteRule {
  return {
    siteKey,
    ruleType: "include",
    scope: "site",
    boundary: "site",
    externalBehavior: "convert-all",
    enabled: true,
    relatedDomains: [],
  };
}

function baseInput(overrides: Partial<Parameters<typeof decideLink>[0]> = {}) {
  return {
    sourceHostname: "news.example.com",
    targetUrl: "https://app.example.com/path",
    effectiveTarget: "_blank",
    rel: null,
    isDownload: false,
    isUnmodifiedPrimaryClick: true,
    rule: standardRule("example.com"),
    ...overrides,
  };
}

describe("decideLink — guards (always preserve)", () => {
  it("preserves when the site is not opted in (rule is null)", () => {
    const decision = decideLink(baseInput({ rule: null }));
    expect(decision.action).toBe("preserve");
  });

  it("preserves when the rule is disabled", () => {
    const decision = decideLink(
      baseInput({
        rule: { ...standardRule("example.com"), enabled: false },
      }),
    );
    expect(decision.action).toBe("preserve");
  });

  it("preserves a non-_blank effective target", () => {
    const decision = decideLink(baseInput({ effectiveTarget: "_self" }));
    expect(decision.action).toBe("preserve");
  });

  it("converts a _blank target written in different case via effectiveTarget", () => {
    // The _blank keyword is matched case-insensitively, so _BLANK still converts.
    const decision = decideLink(baseInput({ effectiveTarget: "_BLANK" }));
    expect(decision.action).toBe("convert");
  });

  it("preserves on a modified click (Ctrl)", () => {
    const decision = decideLink(
      baseInput({ isUnmodifiedPrimaryClick: false }),
    );
    expect(decision.action).toBe("preserve");
  });

  it("preserves a download link", () => {
    const decision = decideLink(baseInput({ isDownload: true }));
    expect(decision.action).toBe("preserve");
  });

  it("preserves a rel=external link (single token)", () => {
    const decision = decideLink(baseInput({ rel: "external" }));
    expect(decision.action).toBe("preserve");
  });

  it("preserves a rel=external link among multiple tokens, any case", () => {
    const decision = decideLink(baseInput({ rel: "noopener External noreferrer" }));
    expect(decision.action).toBe("preserve");
  });

  it("does not treat unrelated rel tokens as external", () => {
    const decision = decideLink(baseInput({ rel: "noopener noreferrer" }));
    expect(decision.action).toBe("convert");
  });

  it("preserves a non-HTTP(S) target (mailto)", () => {
    const decision = decideLink(
      baseInput({ targetUrl: "mailto:user@example.com" }),
    );
    expect(decision.action).toBe("preserve");
  });

  it("preserves a non-HTTP(S) target (tel)", () => {
    const decision = decideLink(baseInput({ targetUrl: "tel:+15551234567" }));
    expect(decision.action).toBe("preserve");
  });
});

describe("decideLink — standard mode conversion", () => {
  it("converts a same-eTLD+1 _blank link on an enabled site", () => {
    const decision = decideLink(baseInput());
    expect(decision.action).toBe("convert");
    expect(typeof decision.reason).toBe("string");
  });

  it("preserves a different eTLD+1 _blank link in standard mode", () => {
    const decision = decideLink(
      baseInput({ targetUrl: "https://other.example/" }),
    );
    expect(decision.action).toBe("preserve");
  });

  it("converts a user related-domain _blank link", () => {
    const decision = decideLink(
      baseInput({
        targetUrl: "https://app.example.org/login",
        rule: standardRule("example.com", ["example.org"]),
      }),
    );
    expect(decision.action).toBe("convert");
  });
});

describe("decideLink — same-host-only mode", () => {
  it("converts the exact same host", () => {
    const decision = decideLink(
      baseInput({
        sourceHostname: "app.example.com",
        targetUrl: "https://app.example.com/next",
        rule: hostRule("app.example.com"),
      }),
    );
    expect(decision.action).toBe("convert");
  });

  it("preserves a sibling subdomain in same-host-only mode", () => {
    const decision = decideLink(
      baseInput({
        sourceHostname: "app.example.com",
        targetUrl: "https://news.example.com/",
        rule: hostRule("app.example.com"),
      }),
    );
    expect(decision.action).toBe("preserve");
  });
});

describe("decideLink — all-targets (convert-all) mode", () => {
  it("converts an otherwise cross-site _blank link on the enabled site", () => {
    const decision = decideLink(
      baseInput({
        targetUrl: "https://unrelated.example/page",
        rule: convertAllRule("example.com"),
      }),
    );
    expect(decision.action).toBe("convert");
  });

  it("still preserves rel=external even in all-targets mode", () => {
    // The external author-declared signal is honored before the convert-all override.
    const decision = decideLink(
      baseInput({
        targetUrl: "https://unrelated.example/page",
        rel: "external",
        rule: convertAllRule("example.com"),
      }),
    );
    expect(decision.action).toBe("preserve");
  });

  it("still preserves downloads even in all-targets mode", () => {
    const decision = decideLink(
      baseInput({
        targetUrl: "https://unrelated.example/file.zip",
        isDownload: true,
        rule: convertAllRule("example.com"),
      }),
    );
    expect(decision.action).toBe("preserve");
  });

  it("still preserves a non-HTTP(S) target even in all-targets mode", () => {
    const decision = decideLink(
      baseInput({
        targetUrl: "mailto:hi@unrelated.example",
        rule: convertAllRule("example.com"),
      }),
    );
    expect(decision.action).toBe("preserve");
  });
});

describe("decideLink — never introduces _blank", () => {
  it("never returns a target attribute or string other than the action/reason", () => {
    const decision = decideLink(baseInput());
    // The decision carries only action + reason; it never instructs the caller
    // to write a target attribute. This is the structural guard for "never add
    // target=_blank".
    expect(Object.keys(decision).sort()).toEqual(["action", "reason"]);
  });
});
