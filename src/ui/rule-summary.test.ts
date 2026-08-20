import { describe, expect, it } from "vitest";

import { summarizeRule, summarizeRuleBadges } from "./rule-summary";
import type { SiteRule } from "../domain/types";

function siteRule(overrides: Partial<SiteRule> = {}): SiteRule {
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

describe("summarizeRule — English", () => {
  it("summarizes a site-scope rule with site boundary and preserve", () => {
    const summary = summarizeRule(siteRule(), "en");
    expect(summary).toContain("example.com");
    expect(summary).toContain("All subdomains");
    expect(summary).toContain("same registrable domain");
    expect(summary).toContain("preserve");
  });

  it("summarizes a host-scope rule with host boundary", () => {
    const rule = siteRule({ siteKey: "app.example.com", scope: "host", boundary: "host" });
    const summary = summarizeRule(rule, "en");
    expect(summary).toContain("app.example.com");
    expect(summary).toContain("Only");
    expect(summary).toContain("exact same host");
  });

  it("flags convert-all as advanced", () => {
    const rule = siteRule({ externalBehavior: "convert-all" });
    const summary = summarizeRule(rule, "en");
    expect(summary).toContain("advanced");
  });

  it("shows related-domain count when non-zero", () => {
    const rule = siteRule({ relatedDomains: ["example.org", "example.net"] });
    const summary = summarizeRule(rule, "en");
    expect(summary).toContain("2");
    expect(summary).toContain("related");
  });

  it("does not show related-domain count when zero", () => {
    const summary = summarizeRule(siteRule(), "en");
    expect(summary).not.toContain("related");
  });

  it("marks disabled rules", () => {
    const rule = siteRule({ enabled: false });
    const summary = summarizeRule(rule, "en");
    expect(summary.toLowerCase()).toContain("paused");
  });
});

describe("summarizeRule — Chinese", () => {
  it("summarizes a site-scope rule in zh_CN", () => {
    const summary = summarizeRule(siteRule(), "zh_CN");
    expect(summary).toContain("example.com");
    expect(summary).toContain("子域名");
    expect(summary).toContain("同站");
    expect(summary).toContain("保留");
  });

  it("summarizes a host-scope rule in zh_CN", () => {
    const rule = siteRule({ siteKey: "app.example.com", scope: "host", boundary: "host" });
    const summary = summarizeRule(rule, "zh_CN");
    expect(summary).toContain("app.example.com");
    expect(summary).toContain("仅");
    expect(summary).toContain("地址");
  });

  it("flags convert-all as advanced in zh_CN", () => {
    const rule = siteRule({ externalBehavior: "convert-all" });
    const summary = summarizeRule(rule, "zh_CN");
    expect(summary).toContain("高级");
  });

  it("shows related-domain count in zh_CN", () => {
    const rule = siteRule({ relatedDomains: ["example.org"] });
    const summary = summarizeRule(rule, "zh_CN");
    expect(summary).toContain("关联");
    expect(summary).toContain("1");
  });

  it("marks disabled rules in zh_CN", () => {
    const rule = siteRule({ enabled: false });
    const summary = summarizeRule(rule, "zh_CN");
    expect(summary).toContain("已暂停");
  });
});

describe("summarizeRuleBadges — visible chips on compact rows", () => {
  it("returns an advanced badge for convert-all rules", () => {
    const rule = siteRule({ externalBehavior: "convert-all" });
    const badges = summarizeRuleBadges(rule, "en");
    expect(badges).toContain("Advanced");
  });

  it("does not return an advanced badge for preserve rules", () => {
    const badges = summarizeRuleBadges(siteRule(), "en");
    expect(badges).not.toContain("Advanced");
  });

  it("returns a related-domains badge with count when non-zero", () => {
    const rule = siteRule({ relatedDomains: ["example.org", "example.net"] });
    const badges = summarizeRuleBadges(rule, "en");
    expect(badges.some((b) => b.includes("2") && b.includes("related"))).toBe(true);
  });

  it("does not return a related-domains badge when zero", () => {
    const badges = summarizeRuleBadges(siteRule(), "en");
    expect(badges.every((b) => !b.includes("related"))).toBe(true);
  });

  it("localizes advanced badge in zh_CN", () => {
    const rule = siteRule({ externalBehavior: "convert-all" });
    const badges = summarizeRuleBadges(rule, "zh_CN");
    expect(badges).toContain("高级");
  });

  it("localizes related badge in zh_CN with count", () => {
    const rule = siteRule({ relatedDomains: ["example.org"] });
    const badges = summarizeRuleBadges(rule, "zh_CN");
    expect(badges.some((b) => b.includes("1") && b.includes("关联"))).toBe(true);
  });

  it("returns an empty array for a plain preserve rule with no related domains", () => {
    const badges = summarizeRuleBadges(siteRule(), "en");
    expect(badges).toEqual([]);
  });
});
