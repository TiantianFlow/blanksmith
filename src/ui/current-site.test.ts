import { describe, expect, it } from "vitest";

import {
  deriveCurrentSiteModel,
  draftRule,
  findMatchingExcludes,
  isExcluded,
  originsForScope,
  permissionRequestResult,
} from "./current-site";
import { t } from "./messages";
import type { SiteRule } from "../domain/types";

function sampleRule(overrides: Partial<SiteRule> = {}): SiteRule {
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

describe("deriveCurrentSiteModel — web page detection", () => {
  it("identifies an HTTP(S) tab as a web page", () => {
    const model = deriveCurrentSiteModel("https://news.example.com/article", []);
    expect(model.isWebPage).toBe(true);
    expect(model.hostname).toBe("news.example.com");
    expect(model.registrableDomain).toBe("example.com");
  });

  it("identifies an http tab as a web page", () => {
    const model = deriveCurrentSiteModel("http://localhost:3000/app", []);
    expect(model.isWebPage).toBe(true);
    expect(model.hostname).toBe("localhost");
  });

  it("excludes chrome: pages", () => {
    const model = deriveCurrentSiteModel("chrome://extensions/", []);
    expect(model.isWebPage).toBe(false);
    expect(model.hostname).toBeNull();
  });

  it("excludes chrome-extension: pages", () => {
    const model = deriveCurrentSiteModel("chrome-extension://abc/popup.html", []);
    expect(model.isWebPage).toBe(false);
  });

  it("excludes about: pages", () => {
    const model = deriveCurrentSiteModel("about:blank", []);
    expect(model.isWebPage).toBe(false);
  });

  it("excludes file: pages", () => {
    const model = deriveCurrentSiteModel("file:///Users/x/doc.html", []);
    expect(model.isWebPage).toBe(false);
  });

  it("handles a null/undefined url as a non-web-page state", () => {
    expect(deriveCurrentSiteModel(null, []).isWebPage).toBe(false);
    expect(deriveCurrentSiteModel(undefined, []).isWebPage).toBe(false);
  });

  it("handles an unparseable url as a non-web-page state", () => {
    expect(deriveCurrentSiteModel("not a url", []).isWebPage).toBe(false);
  });
});

describe("deriveCurrentSiteModel — existing rule detection", () => {
  it("detects when a site-scope rule already exists for the registrable domain", () => {
    const rule = sampleRule({ siteKey: "example.com", scope: "site" });
    const model = deriveCurrentSiteModel("https://news.example.com/page", [rule]);
    expect(model.hasRule).toBe(true);
    expect(model.existingRule).toBe(rule);
  });

  it("detects when a host-scope rule exists for the exact hostname", () => {
    const rule = sampleRule({ siteKey: "app.example.com", scope: "host" });
    const model = deriveCurrentSiteModel("https://app.example.com/page", [rule]);
    expect(model.hasRule).toBe(true);
    expect(model.existingRule).toBe(rule);
  });

  it("does not match a host-scope rule on a sibling subdomain", () => {
    const rule = sampleRule({ siteKey: "app.example.com", scope: "host" });
    const model = deriveCurrentSiteModel("https://news.example.com/page", [rule]);
    expect(model.hasRule).toBe(false);
    expect(model.existingRule).toBeNull();
  });

  it("does not match when no rule exists", () => {
    const model = deriveCurrentSiteModel("https://news.example.com/page", []);
    expect(model.hasRule).toBe(false);
    expect(model.existingRule).toBeNull();
  });
});

describe("deriveCurrentSiteModel — human-readable summary", () => {
  it("produces a readable scope summary for a site-scope rule", () => {
    const rule = sampleRule({ scope: "site", boundary: "site", externalBehavior: "preserve" });
    const model = deriveCurrentSiteModel("https://news.example.com/page", [rule]);
    expect(model.scopeSummary).toContain("example.com");
    expect(model.scopeSummary).toContain("subdomain");
  });

  it("produces a readable scope summary for a host-scope rule", () => {
    const rule = sampleRule({ siteKey: "app.example.com", scope: "host", boundary: "host" });
    const model = deriveCurrentSiteModel("https://app.example.com/page", [rule]);
    expect(model.scopeSummary).toContain("app.example.com");
  });

  it("localizes the 'this site' fallback in zh_CN", () => {
    // When both hostname and registrableDomain are null, the notEnabledOn
    // message uses the "this site" fallback. This happens for non-web pages
    // where summarizeScope is not called — but the fallback string must
    // still be localized. Test the fallback directly via the no-rule path
    // with a URL whose registrableDomain is null (bare suffix like "com").
    // Actually the fallback is in summarizeScope which is only called when
    // isWebPage=true. The "this site" fallback triggers when both
    // registrableDomain and hostname are null, which can't happen for a
    // valid HTTP(S) URL. So test the localized thisSite key directly.
    const modelEn = deriveCurrentSiteModel("https://news.example.com/page", [], "en");
    expect(modelEn.scopeSummary).toContain("example.com");
    // The thisSite fallback is tested via the message key, not via a model
    // path that can't trigger it. Just verify the key is localized.
    expect(t("thisSite", "en")).toBe("this site");
    expect(t("thisSite", "zh_CN")).toBe("本站");
  });
});

describe("originsForScope — optional HTTP(S) permission origins", () => {
  it("produces HTTP(S) origins for a site scope (registrable domain + subdomains)", () => {
    const origins = originsForScope("site", "news.example.com", "example.com");
    expect(origins).toEqual([
      "http://*.example.com/*",
      "https://*.example.com/*",
      "http://example.com/*",
      "https://example.com/*",
    ]);
  });

  it("produces HTTP(S) origins for a host scope (exact hostname)", () => {
    const origins = originsForScope("host", "app.example.com", "example.com");
    expect(origins).toEqual([
      "http://app.example.com/*",
      "https://app.example.com/*",
    ]);
  });

  it("produces origins for localhost", () => {
    const origins = originsForScope("host", "localhost", "localhost");
    expect(origins).toEqual(["http://localhost/*", "https://localhost/*"]);
  });

  it("only ever produces http and https schemes (no *://)", () => {
    const origins = originsForScope("site", "news.example.com", "example.com");
    for (const o of origins) {
      expect(o.startsWith("http://") || o.startsWith("https://")).toBe(true);
    }
  });
});

describe("draftRule — normalized rule from a popup Include choice", () => {
  it("drafts a default enabled site-scope rule for a subdomain page", () => {
    const rule = draftRule("news.example.com", "site");
    expect(rule.siteKey).toBe("example.com");
    expect(rule.scope).toBe("site");
    expect(rule.boundary).toBe("site");
    expect(rule.externalBehavior).toBe("preserve");
    expect(rule.enabled).toBe(true);
    expect(rule.relatedDomains).toEqual([]);
  });

  it("drafts a host-scope rule keyed to the exact hostname", () => {
    const rule = draftRule("app.example.com", "host");
    expect(rule.siteKey).toBe("app.example.com");
    expect(rule.scope).toBe("host");
    expect(rule.boundary).toBe("host");
  });

  it("drafts a rule for localhost", () => {
    const rule = draftRule("localhost", "host");
    expect(rule.siteKey).toBe("localhost");
    expect(rule.scope).toBe("host");
  });
});

describe("scope is creation-time-only (M3)", () => {
  it("reports scopeEditable=false when a rule already exists", () => {
    const rule = sampleRule({ scope: "site" });
    const model = deriveCurrentSiteModel("https://news.example.com/page", [rule]);
    expect(model.hasRule).toBe(true);
    expect(model.scopeEditable).toBe(false);
  });

  it("reports scopeEditable=true when no rule exists (new inclusion)", () => {
    const model = deriveCurrentSiteModel("https://news.example.com/page", []);
    expect(model.hasRule).toBe(false);
    expect(model.scopeEditable).toBe(true);
  });

  it("reports scopeEditable=false for non-web pages", () => {
    const model = deriveCurrentSiteModel("chrome://extensions/", []);
    expect(model.scopeEditable).toBe(false);
  });
});

describe("deriveCurrentSiteModel — exclude-only mode synthetic rule summary", () => {
  it("shows a global-active summary, not 'All subdomains of *'", () => {
    const model = deriveCurrentSiteModel(
      "https://news.example.com/page",
      [],
      "en",
      "exclude-only",
    );
    expect(model.hasRule).toBe(true);
    expect(model.scopeSummary).toContain("Active");
    expect(model.scopeSummary).not.toContain("*");
    expect(model.scopeSummary).not.toContain("subdomain");
  });

  it("localizes the global-active summary in zh_CN", () => {
    const model = deriveCurrentSiteModel(
      "https://news.example.com/page",
      [],
      "zh_CN",
      "exclude-only",
    );
    expect(model.scopeSummary).toContain("全局");
    expect(model.scopeSummary).not.toContain("*");
  });

  it("shows not-enabled summary for an excluded page in exclude-only mode", () => {
    const excludeRule = sampleRule({
      siteKey: "example.com",
      ruleType: "exclude",
      enabled: true,
    });
    const model = deriveCurrentSiteModel(
      "https://news.example.com/page",
      [excludeRule],
      "en",
      "exclude-only",
    );
    expect(model.hasRule).toBe(false);
    expect(model.scopeSummary).toContain("Not enabled");
  });

  it("does not show the synthetic rule summary in include-only mode", () => {
    // In include-only mode with no rules, the page is not active.
    const model = deriveCurrentSiteModel(
      "https://news.example.com/page",
      [],
      "en",
      "include-only",
    );
    expect(model.hasRule).toBe(false);
    expect(model.scopeSummary).toContain("Not enabled");
  });
});

describe("isExcluded — explicit active/excluded check for popup onInclude (M-B fix)", () => {
  it("returns false (active) when no exclude rules match", () => {
    // After removing the last exclusion, the page is active.
    // isExcluded must return false so the popup shows success + injects.
    expect(isExcluded([], "news.example.com", "example.com")).toBe(false);
  });

  it("returns true (still excluded) when an overlapping exclude rule remains", () => {
    // Site-scope exclude for example.com remains after removing
    // the host-scope exclude for news.example.com.
    const remainingSiteExclude = sampleRule({
      siteKey: "example.com",
      ruleType: "exclude",
      scope: "site",
      enabled: true,
    });
    expect(isExcluded([remainingSiteExclude], "news.example.com", "example.com")).toBe(true);
  });

  it("returns false (active) when a non-matching exclude rule remains", () => {
    // An exclude rule for a DIFFERENT site (other.example) does not
    // cover news.example.com — the page is still active.
    const nonMatchingExclude = sampleRule({
      siteKey: "other.example",
      ruleType: "exclude",
      scope: "site",
      enabled: true,
    });
    expect(isExcluded([nonMatchingExclude], "news.example.com", "example.com")).toBe(false);
  });

  it("returns false (active) when the only exclude rule is disabled", () => {
    const disabledExclude = sampleRule({
      siteKey: "example.com",
      ruleType: "exclude",
      enabled: false,
    });
    expect(isExcluded([disabledExclude], "news.example.com", "example.com")).toBe(false);
  });

  it("returns false (active) when only include rules exist (no exclude rules)", () => {
    const includeRule = sampleRule({
      siteKey: "example.com",
      ruleType: "include",
      enabled: true,
    });
    expect(isExcluded([includeRule], "news.example.com", "example.com")).toBe(false);
  });

  it("returns true when a host-scope exclude matches the exact hostname", () => {
    const hostExclude = sampleRule({
      siteKey: "news.example.com",
      ruleType: "exclude",
      scope: "host",
      enabled: true,
    });
    expect(isExcluded([hostExclude], "news.example.com", "example.com")).toBe(true);
  });
});

describe("findMatchingExcludes — shared predicate (N2)", () => {
  it("returns both host-scope and site-scope excludes for the same hostname", () => {
    const hostExclude = sampleRule({
      siteKey: "news.example.com",
      ruleType: "exclude",
      scope: "host",
      enabled: true,
    });
    const siteExclude = sampleRule({
      siteKey: "example.com",
      ruleType: "exclude",
      scope: "site",
      enabled: true,
    });
    const matches = findMatchingExcludes(
      [hostExclude, siteExclude],
      "news.example.com",
      "example.com",
    );
    expect(matches).toHaveLength(2);
  });

  it("returns empty array when no excludes match", () => {
    const otherExclude = sampleRule({
      siteKey: "other.example",
      ruleType: "exclude",
      scope: "site",
      enabled: true,
    });
    expect(findMatchingExcludes([otherExclude], "news.example.com", "example.com")).toEqual([]);
  });

  it("isExcluded is consistent with findMatchingExcludes", () => {
    const hostExclude = sampleRule({
      siteKey: "news.example.com",
      ruleType: "exclude",
      scope: "host",
      enabled: true,
    });
    expect(isExcluded([hostExclude], "news.example.com", "example.com")).toBe(
      findMatchingExcludes([hostExclude], "news.example.com", "example.com").length > 0,
    );
  });
});

describe("permissionRequestResult — distinguish user denial from API failure", () => {
  // The popup calls chrome.permissions.request({ origins }) inside a try/catch.
  // A normal false return means the user saw a prompt and clicked "Block."
  // A thrown error means Chrome rejected the request before any prompt
  // (e.g. origins not declared in optional_host_permissions). The popup
  // must show different messages for these two cases so the user knows
  // whether to retry or file a bug.

  it("returns 'denied' when the API resolves to false (user clicked Block)", () => {
    const result = permissionRequestResult(false, undefined);
    expect(result.kind).toBe("denied");
    expect(result.message).toContain("Permission denied");
  });

  it("returns 'request-failed' when the API throws (missing optional_host_permissions)", () => {
    const result = permissionRequestResult(undefined, "origins not declared");
    expect(result.kind).toBe("request-failed");
    expect(result.message).toContain("request failed");
  });

  it("returns 'granted' when the API resolves to true", () => {
    const result = permissionRequestResult(true, undefined);
    expect(result.kind).toBe("granted");
  });

  it("returns 'request-failed' when the API resolves to false but lastError is set", () => {
    // Chrome sets runtime.lastError when the request is rejected pre-prompt.
    // A false result with a lastError is an API failure, not a user denial.
    const result = permissionRequestResult(false, "Requested origin not in optional_host_permissions");
    expect(result.kind).toBe("request-failed");
    expect(result.message).toContain("request failed");
  });
});
