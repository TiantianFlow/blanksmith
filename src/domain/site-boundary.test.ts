import { describe, expect, it } from "vitest";

import { classifyDestination, getSiteKey } from "./site-boundary";
import type { SiteRule } from "./types";

// Standard-mode rule anchored on example.com: converts same eTLD+1, preserves
// everything else unless a related domain is declared.
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

describe("getSiteKey", () => {
  it("returns the registrable domain for a subdomain", () => {
    expect(getSiteKey("news.example.com")).toBe("example.com");
  });

  it("returns the registrable domain for the apex", () => {
    expect(getSiteKey("example.com")).toBe("example.com");
  });

  it("returns null for the public suffix itself", () => {
    // `com` is a public suffix, not a registrable domain.
    expect(getSiteKey("com")).toBeNull();
  });

  it("returns null for the empty string", () => {
    expect(getSiteKey("")).toBeNull();
  });

  it("treats a private-suffix subdomain as its own registrable domain", () => {
    // `github.io` is a PSL PRIVATE suffix. With allowPrivateDomains the
    // registrable domain of `user.github.io` is `user.github.io` itself, so
    // `user.github.io` and `other.github.io` are different properties by
    // default. This is derived from neutral PSL data, not a preset site list.
    expect(getSiteKey("user.github.io")).toBe("user.github.io");
  });

  it("returns null for a bare private suffix (github.io itself)", () => {
    // The private suffix is not a usable site key, mirroring bare ICANN TLDs.
    expect(getSiteKey("github.io")).toBeNull();
  });

  it("returns the hostname for a bare IPv4 address", () => {
    expect(getSiteKey("192.168.1.10")).toBe("192.168.1.10");
  });

  it("returns the hostname for localhost", () => {
    expect(getSiteKey("localhost")).toBe("localhost");
  });
});

describe("classifyDestination — standard (site) mode", () => {
  it("converts a sibling subdomain within the same eTLD+1", () => {
    expect(
      classifyDestination({
        sourceHostname: "news.example.com",
        targetUrl: "https://app.example.com/path",
        rule: standardRule("example.com"),
      }),
    ).toBe("convert");
  });

  it("converts to the apex within the same eTLD+1", () => {
    expect(
      classifyDestination({
        sourceHostname: "app.example.com",
        targetUrl: "https://example.com/",
        rule: standardRule("example.com"),
      }),
    ).toBe("convert");
  });

  it("preserves a different eTLD+1", () => {
    expect(
      classifyDestination({
        sourceHostname: "news.example.com",
        targetUrl: "https://other.example",
        rule: standardRule("example.com"),
      }),
    ).toBe("preserve");
  });

  it("preserves an unrelated third-party domain", () => {
    expect(
      classifyDestination({
        sourceHostname: "news.example.com",
        targetUrl: "https://cdn.thirdparty.net/x",
        rule: standardRule("example.com"),
      }),
    ).toBe("preserve");
  });

  it("converts a user-declared related domain across eTLD+1", () => {
    expect(
      classifyDestination({
        sourceHostname: "news.example.com",
        targetUrl: "https://app.example.org/login",
        rule: standardRule("example.com", ["example.org"]),
      }),
    ).toBe("convert");
  });

  it("removing a related domain restores preservation", () => {
    // Without the related-domain entry, the same cross-eTLD+1 target preserves.
    expect(
      classifyDestination({
        sourceHostname: "news.example.com",
        targetUrl: "https://app.example.org/login",
        rule: standardRule("example.com", []),
      }),
    ).toBe("preserve");
  });

  it("does not convert a related-domain sibling that was not declared", () => {
    // Declaring example.org must not also admit example.dev.
    expect(
      classifyDestination({
        sourceHostname: "news.example.com",
        targetUrl: "https://app.example.dev/login",
        rule: standardRule("example.com", ["example.org"]),
      }),
    ).toBe("preserve");
  });
});

describe("classifyDestination — private-suffix multi-tenant hosts", () => {
  // On a PSL private suffix like github.io, each account is its own
  // registrable domain. Standard (site) mode must preserve a cross-account
  // link by default (no preset list involved — the boundary comes from the
  // PSL via allowPrivateDomains), while a same-account link still converts.
  it("preserves a cross-account link on the same private suffix", () => {
    expect(
      classifyDestination({
        sourceHostname: "user.github.io",
        targetUrl: "https://other.github.io/repo",
        rule: standardRule("user.github.io"),
      }),
    ).toBe("preserve");
  });

  it("converts a same-account link (different path) on a private suffix", () => {
    expect(
      classifyDestination({
        sourceHostname: "user.github.io",
        targetUrl: "https://user.github.io/repo/blob",
        rule: standardRule("user.github.io"),
      }),
    ).toBe("convert");
  });
});

describe("classifyDestination — same-host-only mode", () => {
  it("converts the exact same hostname", () => {
    expect(
      classifyDestination({
        sourceHostname: "app.example.com",
        targetUrl: "https://app.example.com/next",
        rule: hostRule("app.example.com"),
      }),
    ).toBe("convert");
  });

  it("preserves a sibling subdomain even within the same eTLD+1", () => {
    expect(
      classifyDestination({
        sourceHostname: "app.example.com",
        targetUrl: "https://news.example.com/",
        rule: hostRule("app.example.com"),
      }),
    ).toBe("preserve");
  });

  it("preserves the apex when the source is a subdomain", () => {
    expect(
      classifyDestination({
        sourceHostname: "app.example.com",
        targetUrl: "https://example.com/",
        rule: hostRule("app.example.com"),
      }),
    ).toBe("preserve");
  });
});

describe("classifyDestination — all-targets (convert-all) mode", () => {
  it("converts an otherwise cross-site link when externalBehavior is convert-all", () => {
    expect(
      classifyDestination({
        sourceHostname: "news.example.com",
        targetUrl: "https://unrelated.example/page",
        rule: {
          siteKey: "example.com",
          ruleType: "include",
          scope: "site",
          boundary: "site",
          externalBehavior: "convert-all",
          enabled: true,
          relatedDomains: [],
        },
      }),
    ).toBe("convert");
  });
});

describe("classifyDestination — IP and localhost", () => {
  it("converts same-IP host navigation", () => {
    expect(
      classifyDestination({
        sourceHostname: "192.168.1.10",
        targetUrl: "http://192.168.1.10/admin",
        rule: standardRule("192.168.1.10"),
      }),
    ).toBe("convert");
  });

  it("preserves navigation from an IP to a different IP", () => {
    expect(
      classifyDestination({
        sourceHostname: "192.168.1.10",
        targetUrl: "http://10.0.0.5/",
        rule: standardRule("192.168.1.10"),
      }),
    ).toBe("preserve");
  });

  it("converts localhost to localhost", () => {
    expect(
      classifyDestination({
        sourceHostname: "localhost",
        targetUrl: "http://localhost:3000/app",
        rule: standardRule("localhost"),
      }),
    ).toBe("convert");
  });

  it("preserves localhost to a named host", () => {
    expect(
      classifyDestination({
        sourceHostname: "localhost",
        targetUrl: "https://example.com/",
        rule: standardRule("localhost"),
      }),
    ).toBe("preserve");
  });
});

describe("classifyDestination — scheme and parse robustness", () => {
  it("preserves a non-HTTP(S) target (mailto)", () => {
    expect(
      classifyDestination({
        sourceHostname: "news.example.com",
        targetUrl: "mailto:user@example.com",
        rule: standardRule("example.com"),
      }),
    ).toBe("preserve");
  });

  it("preserves a javascript: target", () => {
    expect(
      classifyDestination({
        sourceHostname: "news.example.com",
        targetUrl: "javascript:void(0)",
        rule: standardRule("example.com"),
      }),
    ).toBe("preserve");
  });

  it("preserves when the target URL fails to parse", () => {
    expect(
      classifyDestination({
        sourceHostname: "news.example.com",
        targetUrl: "not a url",
        rule: standardRule("example.com"),
      }),
    ).toBe("preserve");
  });

  it("treats http and https as scheme-compatible within the same eTLD+1", () => {
    expect(
      classifyDestination({
        sourceHostname: "https.example.com",
        targetUrl: "http://app.example.com/",
        rule: standardRule("example.com"),
      }),
    ).toBe("convert");
  });
});
