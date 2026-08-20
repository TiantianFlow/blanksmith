import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SiteRule } from "../domain/types";
import {
  RULES_STORAGE_KEY,
  RULES_STORAGE_VERSION,
  findRuleForUrl,
  normalizeRelatedDomain,
  readRules,
  removeRule,
  upsertRule,
} from "./site-rules";

// A minimal in-memory chrome.storage.sync fake. Each test gets a fresh store.
function createStorageArea() {
  const store = new Map<string, unknown>();
  const area = {
    get: vi.fn(async (keys?: string | string[] | null) => {
      if (keys === undefined || keys === null) {
        const all: Record<string, unknown> = {};
        for (const [k, v] of store) all[k] = v;
        return all;
      }
      const keyList = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of keyList) {
        if (store.has(k)) out[k] = store.get(k);
      }
      return out;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) store.set(k, v);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) store.delete(k);
    }),
  };
  return { area, store };
}

describe("site-rules storage — empty by default", () => {
  it("returns an empty array when no rules are stored", async () => {
    const { area } = createStorageArea();
    expect(await readRules(area)).toEqual([]);
  });
});

describe("site-rules storage — upsert and read", () => {
  it("persists a valid rule and reads it back", async () => {
    const { area } = createStorageArea();
    const rule: SiteRule = {
      siteKey: "example.com",
      ruleType: "include",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    await upsertRule(area, rule);
    expect(await readRules(area)).toEqual([rule]);
  });

  it("replaces an existing rule with the same siteKey (upsert, not append)", async () => {
    const { area } = createStorageArea();
    const rule: SiteRule = {
      siteKey: "example.com",
      ruleType: "include",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    await upsertRule(area, rule);
    const updated: SiteRule = { ...rule, boundary: "host", scope: "host" };
    await upsertRule(area, updated);
    expect(await readRules(area)).toEqual([updated]);
  });
});

describe("site-rules storage — remove", () => {
  it("removes an include rule by (ruleType, siteKey)", async () => {
    const { area } = createStorageArea();
    const rule: SiteRule = {
      siteKey: "example.com",
      ruleType: "include",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    await upsertRule(area, rule);
    await removeRule(area, "example.com", "include");
    expect(await readRules(area)).toEqual([]);
  });

  it("is a no-op when the rule does not exist", async () => {
    const { area } = createStorageArea();
    await removeRule(area, "missing.com", "include");
    expect(await readRules(area)).toEqual([]);
  });
});

describe("site-rules storage — include/exclude coexistence (regression)", () => {
  it("upserts include and exclude rules for the same siteKey independently", async () => {
    const { area } = createStorageArea();
    const include: SiteRule = {
      siteKey: "example.com",
      ruleType: "include",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    const exclude: SiteRule = {
      siteKey: "example.com",
      ruleType: "exclude",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    await upsertRule(area, include);
    await upsertRule(area, exclude);
    const rules = await readRules(area);
    expect(rules).toHaveLength(2);
    expect(rules.some((r) => r.ruleType === "include" && r.siteKey === "example.com")).toBe(true);
    expect(rules.some((r) => r.ruleType === "exclude" && r.siteKey === "example.com")).toBe(true);
  });

  it("removes only the matching ruleType, preserving the other", async () => {
    const { area } = createStorageArea();
    const include: SiteRule = {
      siteKey: "example.com",
      ruleType: "include",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    const exclude: SiteRule = {
      siteKey: "example.com",
      ruleType: "exclude",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    await upsertRule(area, include);
    await upsertRule(area, exclude);
    // Remove only the include rule
    await removeRule(area, "example.com", "include");
    const rules = await readRules(area);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.ruleType).toBe("exclude");
    expect(rules[0]!.siteKey).toBe("example.com");
  });

  it("upserting an include rule does not overwrite the exclude rule for the same siteKey", async () => {
    const { area } = createStorageArea();
    const exclude: SiteRule = {
      siteKey: "example.com",
      ruleType: "exclude",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    await upsertRule(area, exclude);
    const include: SiteRule = {
      siteKey: "example.com",
      ruleType: "include",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    await upsertRule(area, include);
    const rules = await readRules(area);
    expect(rules).toHaveLength(2);
  });

  it("removes only the exclude rule, preserving the include rule (symmetric)", async () => {
    const { area } = createStorageArea();
    const include: SiteRule = {
      siteKey: "example.com",
      ruleType: "include",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    const exclude: SiteRule = {
      siteKey: "example.com",
      ruleType: "exclude",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    await upsertRule(area, include);
    await upsertRule(area, exclude);
    await removeRule(area, "example.com", "exclude");
    const rules = await readRules(area);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.ruleType).toBe("include");
  });

  it("replaces include in place while exclude coexists", async () => {
    const { area } = createStorageArea();
    const include: SiteRule = {
      siteKey: "example.com",
      ruleType: "include",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    const exclude: SiteRule = {
      siteKey: "example.com",
      ruleType: "exclude",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    await upsertRule(area, include);
    await upsertRule(area, exclude);
    const updatedInclude: SiteRule = { ...include, boundary: "host", scope: "host" };
    await upsertRule(area, updatedInclude);
    const rules = await readRules(area);
    expect(rules).toHaveLength(2);
    const inc = rules.find((r) => r.ruleType === "include");
    const exc = rules.find((r) => r.ruleType === "exclude");
    expect(inc!.boundary).toBe("host");
    expect(inc!.scope).toBe("host");
    expect(exc!.boundary).toBe("site"); // unchanged
  });
});

describe("site-rules storage — message-handler coexistence integration", () => {
  it("seeds include+exclude, removes one, the other survives in returned rules", async () => {
    const { area } = createStorageArea();
    const include: SiteRule = {
      siteKey: "example.com",
      ruleType: "include",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    const exclude: SiteRule = {
      siteKey: "example.com",
      ruleType: "exclude",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    await upsertRule(area, include);
    await upsertRule(area, exclude);
    await removeRule(area, "example.com", "include");
    const rules = await readRules(area);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.ruleType).toBe("exclude");
    expect(rules[0]!.siteKey).toBe("example.com");
  });
});

describe("site-rules storage — overlapping exclude rules removed independently (M-B regression)", () => {
  it("removes both host-scope and site-scope exclude rules for the same hostname", async () => {
    const { area } = createStorageArea();
    // A site can be covered by overlapping exclude rules: a host-scope
    // rule for the exact hostname AND a site-scope rule for the registrable
    // domain. "Include this site" in exclude-only mode must remove BOTH,
    // or the page stays excluded while the popup reports success.
    const hostExclude: SiteRule = {
      siteKey: "news.example.com",
      ruleType: "exclude",
      scope: "host",
      boundary: "host",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    const siteExclude: SiteRule = {
      siteKey: "example.com",
      ruleType: "exclude",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    await upsertRule(area, hostExclude);
    await upsertRule(area, siteExclude);

    // Remove the host-scope exclude rule.
    await removeRule(area, "news.example.com", "exclude");
    let rules = await readRules(area);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.siteKey).toBe("example.com");
    expect(rules[0]!.ruleType).toBe("exclude");

    // Remove the site-scope exclude rule.
    await removeRule(area, "example.com", "exclude");
    rules = await readRules(area);
    expect(rules).toHaveLength(0);
  });

  it("findRuleForUrl returns undefined only after ALL overlapping excludes are removed", async () => {
    const { area } = createStorageArea();
    const hostExclude: SiteRule = {
      siteKey: "news.example.com",
      ruleType: "exclude",
      scope: "host",
      boundary: "host",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    const siteExclude: SiteRule = {
      siteKey: "example.com",
      ruleType: "exclude",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    await upsertRule(area, hostExclude);
    await upsertRule(area, siteExclude);

    // Before removal: excluded (findRuleForUrl returns undefined).
    expect(findRuleForUrl(await readRules(area), "https://news.example.com/page", "exclude-only")).toBeUndefined();

    // After removing only the host-scope exclude: still excluded by site-scope.
    await removeRule(area, "news.example.com", "exclude");
    expect(findRuleForUrl(await readRules(area), "https://news.example.com/page", "exclude-only")).toBeUndefined();

    // After removing the site-scope exclude too: now active (synthetic rule returned).
    await removeRule(area, "example.com", "exclude");
    const rule = findRuleForUrl(await readRules(area), "https://news.example.com/page", "exclude-only");
    expect(rule).toBeDefined();
    expect(rule!.siteKey).toBe("*"); // synthetic default
  });
});

describe("site-rules storage — versioned envelope", () => {
  it("writes a versioned envelope under RULES_STORAGE_KEY", async () => {
    const { area, store } = createStorageArea();
    const rule: SiteRule = {
      siteKey: "example.com",
      ruleType: "include",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: [],
    };
    await upsertRule(area, rule);
    const raw = store.get(RULES_STORAGE_KEY) as { version: number; rules: SiteRule[] };
    expect(raw.version).toBe(RULES_STORAGE_VERSION);
    expect(raw.rules).toEqual([rule]);
  });

  it("tolerates a missing envelope (treats as empty)", async () => {
    const { area } = createStorageArea();
    expect(await readRules(area)).toEqual([]);
  });

  it("drops malformed rules and keeps valid ones", async () => {
    const { area, store } = createStorageArea();
    store.set(RULES_STORAGE_KEY, {
      version: RULES_STORAGE_VERSION,
      rules: [
        {
          siteKey: "example.com",
          ruleType: "include",
          scope: "site",
          boundary: "site",
          externalBehavior: "preserve",
          enabled: true,
          relatedDomains: [],
        },
        { siteKey: "bad.com", scope: "bogus" }, // invalid scope
      ],
    });
    const rules = await readRules(area);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.siteKey).toBe("example.com");
  });
});

describe("normalizeRelatedDomain", () => {
  it("normalizes a subdomain to its registrable domain", () => {
    expect(normalizeRelatedDomain("app.example.com")).toBe("example.com");
  });

  it("normalizes uppercase to lowercase", () => {
    expect(normalizeRelatedDomain("APP.Example.COM")).toBe("example.com");
  });

  it("normalizes a URL-like input to its registrable domain", () => {
    expect(normalizeRelatedDomain("https://app.example.org/path")).toBe("example.org");
  });

  it("returns null for a bare public suffix", () => {
    expect(normalizeRelatedDomain("com")).toBeNull();
    expect(normalizeRelatedDomain("github.io")).toBeNull();
  });

  it("returns null for an empty or whitespace string", () => {
    expect(normalizeRelatedDomain("")).toBeNull();
    expect(normalizeRelatedDomain("   ")).toBeNull();
  });

  it("returns the hostname for an IP address", () => {
    expect(normalizeRelatedDomain("192.168.1.10")).toBe("192.168.1.10");
  });

  it("returns the hostname for localhost", () => {
    expect(normalizeRelatedDomain("localhost")).toBe("localhost");
  });

  it("handles a private-suffix subdomain (user.github.io)", () => {
    expect(normalizeRelatedDomain("user.github.io")).toBe("user.github.io");
  });
});

describe("site-rules storage — related-domain normalization regression (M1)", () => {
  it("normalizes user-entered related domains on upsert (deduped to site key)", async () => {
    const { area } = createStorageArea();
    const rule: SiteRule = {
      siteKey: "example.com",
      ruleType: "include",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      // Two different surface forms that both normalize to "example.org".
      relatedDomains: ["APP.Example.Org", "https://sub.example.org/x"],
    };
    await upsertRule(area, rule);
    const [stored] = await readRules(area);
    // Both forms collapse to the same site key; dedup keeps one entry.
    expect(stored!.relatedDomains).toEqual(["example.org"]);
  });

  it("rejects an invalid related-domain entry by dropping it", async () => {
    const { area } = createStorageArea();
    const rule: SiteRule = {
      siteKey: "example.com",
      ruleType: "include",
      scope: "site",
      boundary: "site",
      externalBehavior: "preserve",
      enabled: true,
      relatedDomains: ["valid.org", "com", "   "],
    };
    await upsertRule(area, rule);
    const [stored] = await readRules(area);
    expect(stored!.relatedDomains).toEqual(["valid.org"]);
  });
});

describe("site-rules storage — upsert validation", () => {
  it("rejects a rule with an invalid scope", async () => {
    const { area } = createStorageArea();
    await expect(
      upsertRule(area, {
        siteKey: "example.com",
        ruleType: "include",
        scope: "bogus" as never,
        boundary: "site",
        externalBehavior: "preserve",
        enabled: true,
        relatedDomains: [],
      }),
    ).rejects.toThrow();
    expect(await readRules(area)).toEqual([]);
  });

  it("rejects a rule with an invalid externalBehavior", async () => {
    const { area } = createStorageArea();
    await expect(
      upsertRule(area, {
        siteKey: "example.com",
        ruleType: "include",
        scope: "site",
        boundary: "site",
        externalBehavior: "bogus" as never,
        enabled: true,
        relatedDomains: [],
      }),
    ).rejects.toThrow();
    expect(await readRules(area)).toEqual([]);
  });

  it("rejects a rule with an empty siteKey", async () => {
    const { area } = createStorageArea();
    await expect(
      upsertRule(area, {
        siteKey: "",
        ruleType: "include",
        scope: "site",
        boundary: "site",
        externalBehavior: "preserve",
        enabled: true,
        relatedDomains: [],
      }),
    ).rejects.toThrow();
    expect(await readRules(area)).toEqual([]);
  });
});

describe("findRuleForUrl — scope matching", () => {
  const siteRule: SiteRule = {
    siteKey: "example.com",
    ruleType: "include",
    scope: "site",
    boundary: "site",
    externalBehavior: "preserve",
    enabled: true,
    relatedDomains: [],
  };
  const hostRuleEntry: SiteRule = {
    siteKey: "app.example.com",
    ruleType: "include",
    scope: "host",
    boundary: "host",
    externalBehavior: "preserve",
    enabled: true,
    relatedDomains: [],
  };

  it("matches a site-scope rule on any subdomain of the registrable domain", () => {
    expect(findRuleForUrl([siteRule], "https://news.example.com/page")).toBe(siteRule);
    expect(findRuleForUrl([siteRule], "https://example.com/")).toBe(siteRule);
  });

  it("does not match a site-scope rule on a different registrable domain", () => {
    expect(findRuleForUrl([siteRule], "https://other.example/")).toBeUndefined();
  });

  it("matches a host-scope rule only on the exact hostname", () => {
    expect(findRuleForUrl([hostRuleEntry], "https://app.example.com/x")).toBe(hostRuleEntry);
  });

  it("does not match a host-scope rule on a sibling subdomain", () => {
    expect(findRuleForUrl([hostRuleEntry], "https://news.example.com/")).toBeUndefined();
  });

  it("does not match a host-scope rule on the apex", () => {
    expect(findRuleForUrl([hostRuleEntry], "https://example.com/")).toBeUndefined();
  });

  it("skips disabled rules", () => {
    const disabled: SiteRule = { ...siteRule, enabled: false };
    expect(findRuleForUrl([disabled], "https://news.example.com/")).toBeUndefined();
  });

  it("returns undefined for an empty rule list", () => {
    expect(findRuleForUrl([], "https://news.example.com/")).toBeUndefined();
  });

  it("returns undefined for a non-HTTP(S) URL", () => {
    expect(findRuleForUrl([siteRule], "mailto:user@example.com")).toBeUndefined();
  });

  it("returns undefined for an unparseable URL", () => {
    expect(findRuleForUrl([siteRule], "not a url")).toBeUndefined();
  });
});
