// Versioned site-rule storage over chrome.storage.sync.
//
// The storage layer owns validation and normalization of user-entered data:
// related-domain entries are normalized to the same tldts site-key contract the
// policy layer uses (getSiteKey), so "APP.Example.Org", "sub.example.org", and
// "https://sub.example.org/x" all collapse to "example.org". Rules are kept in
// a versioned envelope so future migrations can run on read.
//
// All functions accept an injectable storage area (chrome.storage.sync by
// default) so the pure logic is unit-testable without a browser. No network,
// no telemetry, no preset domain list.

import { getSiteKey } from "../domain/site-boundary";
import type {
  Boundary,
  ExternalBehavior,
  GlobalMode,
  RuleType,
  Scope,
  SiteRule,
} from "../domain/types";

export const RULES_STORAGE_KEY = "splRules";
export const RULES_STORAGE_VERSION = 2;

/** The subset of chrome.storage needed by this module. Self-contained so the
 * type is testable with plain mocks (the @types/chrome overloads are wider). */
export interface StorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

interface StoredEnvelope {
  version: number;
  rules: unknown[];
}

/** Default storage area: chrome.storage.sync in production, undefined in tests. */
function defaultArea(): StorageArea {
  if (typeof chrome === "undefined" || !chrome.storage?.sync) {
    throw new Error("chrome.storage.sync is not available; pass a storage area.");
  }
  return chrome.storage.sync;
}

/**
 * Read and validate all rules from storage. Malformed rules are silently
 * dropped (defense in depth against manual tampering); the call never throws
 * on bad data. Returns an empty array when no envelope exists.
 *
 * Backward compatibility: v1 envelopes (pre-global-mode) are migrated to v2
 * by adding `ruleType: "include"` to every rule that lacks it.
 */
export async function readRules(area?: StorageArea): Promise<SiteRule[]> {
  const storage = area ?? defaultArea();
  const result = await storage.get(RULES_STORAGE_KEY);
  const raw = result[RULES_STORAGE_KEY];
  if (!isEnvelope(raw)) return [];
  const rules = raw.rules.map(decodeRule).filter((r): r is SiteRule => r !== null);
  // If we read a v1 envelope, persist the migrated v2 rules.
  if (raw.version === 1 && rules.length > 0) {
    await storage.set({
      [RULES_STORAGE_KEY]: {
        version: RULES_STORAGE_VERSION,
        rules,
      } satisfies StoredEnvelope,
    });
  }
  return rules;
}

/**
 * Insert or replace a rule (keyed by ruleType + siteKey). Validates the rule
 * and normalizes its relatedDomains before persisting. Throws on an invalid
 * rule. Include and exclude rules for the same siteKey coexist independently.
 */
export async function upsertRule(
  area: StorageArea | undefined,
  rule: SiteRule,
): Promise<void> {
  const storage = area ?? defaultArea();
  validateRule(rule);
  const normalized: SiteRule = {
    ...rule,
    relatedDomains: normalizeRelatedDomainList(rule.relatedDomains),
  };
  const rules = await readRules(storage);
  const index = rules.findIndex(
    (r) =>
      r.siteKey === normalized.siteKey && r.ruleType === normalized.ruleType,
  );
  if (index >= 0) {
    rules[index] = normalized;
  } else {
    rules.push(normalized);
  }
  await storage.set({
    [RULES_STORAGE_KEY]: {
      version: RULES_STORAGE_VERSION,
      rules,
    } satisfies StoredEnvelope,
  });
}

/**
 * Remove a rule by (ruleType, siteKey). No-op when the rule is absent.
 * Include and exclude rules for the same siteKey are removed independently.
 */
export async function removeRule(
  area: StorageArea | undefined,
  siteKey: string,
  ruleType: RuleType,
): Promise<void> {
  const storage = area ?? defaultArea();
  const rules = (await readRules(storage)).filter(
    (r) => !(r.siteKey === siteKey && r.ruleType === ruleType),
  );
  await storage.set({
    [RULES_STORAGE_KEY]: {
      version: RULES_STORAGE_VERSION,
      rules,
    } satisfies StoredEnvelope,
  });
}

/**
 * Find the active rule for a source URL, respecting the global mode.
 *
 * In include-only mode (default): returns the first enabled include rule
 * that matches the URL's hostname via scope. Exclude rules are ignored.
 *
 * In exclude-only mode: returns a synthetic conservative-default rule when
 * the URL is NOT matched by any enabled exclude rule. If the URL IS
 * matched by an enabled exclude rule, returns undefined (not active).
 *
 * Returns `undefined` when the URL is not HTTP(S) or unparseable.
 */
export function findRuleForUrl(
  rules: readonly SiteRule[],
  url: string,
  mode: GlobalMode = "include-only",
): SiteRule | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return undefined;
  }
  const hostname = parsed.hostname;

  if (mode === "exclude-only") {
    // Active on all pages except those matching an enabled exclude rule.
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (rule.ruleType !== "exclude") continue;
      if (matchesScope(rule, hostname)) return undefined; // excluded
    }
    // Not excluded — return a synthetic conservative-default rule.
    return EXCLUDE_ONLY_DEFAULT_RULE;
  }

  // include-only mode: find first enabled include rule matching the URL.
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.ruleType !== "include") continue;
    if (matchesScope(rule, hostname)) return rule;
  }
  return undefined;
}

/**
 * Synthetic conservative-default rule used in exclude-only mode when a page
 * is not excluded. This provides the same-property policy (same eTLD+1
 * converts, others preserve) as the default for any include rule, without
 * requiring the user to configure each site individually.
 */
const EXCLUDE_ONLY_DEFAULT_RULE: SiteRule = {
  siteKey: "*",
  ruleType: "include",
  scope: "site",
  boundary: "site",
  externalBehavior: "preserve",
  enabled: true,
  relatedDomains: [],
};

/**
 * Normalize a single user-entered related-domain value to a site key.
 * Accepts a bare hostname, a subdomain, or a full URL. Returns `null` for
 * empty input, bare public suffixes, or anything that does not resolve to a
 * registrable domain. Uses the same tldts allowPrivateDomains path as the
 * policy layer so the comparison is consistent.
 */
export function normalizeRelatedDomain(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  let hostname: string;
  // If the input looks like a URL (has a scheme), parse it; otherwise treat it
  // as a bare host. Prepend a scheme only when needed so URL parsing works.
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      hostname = new URL(trimmed).hostname;
    } catch {
      return null;
    }
  } else {
    // Bare host: prepend a dummy scheme to extract the hostname via URL.
    try {
      hostname = new URL(`http://${trimmed}`).hostname;
    } catch {
      return null;
    }
  }
  if (hostname.length === 0) return null;
  return getSiteKey(hostname);
}

// --- internal helpers ---

function isEnvelope(value: unknown): value is StoredEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (v.version === 1 || v.version === RULES_STORAGE_VERSION) && Array.isArray(v.rules);
}

function decodeRule(value: unknown): SiteRule | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.siteKey !== "string" || v.siteKey.length === 0) return null;
  // Backward compat: v1 rules lack ruleType; default to "include".
  const ruleType = isRuleType(v.ruleType) ? v.ruleType : "include" as const;
  if (!isScope(v.scope)) return null;
  if (!isBoundary(v.boundary)) return null;
  if (!isExternalBehavior(v.externalBehavior)) return null;
  if (typeof v.enabled !== "boolean") return null;
  if (!Array.isArray(v.relatedDomains)) return null;
  if (!v.relatedDomains.every((d) => typeof d === "string")) return null;
  return {
    siteKey: v.siteKey,
    ruleType,
    scope: v.scope,
    boundary: v.boundary,
    externalBehavior: v.externalBehavior,
    enabled: v.enabled,
    relatedDomains: v.relatedDomains,
  };
}

function validateRule(rule: SiteRule): void {
  if (typeof rule.siteKey !== "string" || rule.siteKey.length === 0) {
    throw new Error("Invalid rule: siteKey must be a non-empty string.");
  }
  if (!isRuleType(rule.ruleType)) throw new Error("Invalid rule: ruleType.");
  if (!isScope(rule.scope)) throw new Error("Invalid rule: scope.");
  if (!isBoundary(rule.boundary)) throw new Error("Invalid rule: boundary.");
  if (!isExternalBehavior(rule.externalBehavior)) {
    throw new Error("Invalid rule: externalBehavior.");
  }
  if (typeof rule.enabled !== "boolean") {
    throw new Error("Invalid rule: enabled must be boolean.");
  }
  if (!Array.isArray(rule.relatedDomains)) {
    throw new Error("Invalid rule: relatedDomains must be an array.");
  }
}

function normalizeRelatedDomainList(entries: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const normalized = normalizeRelatedDomain(entry);
    if (normalized === null) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function matchesScope(rule: SiteRule, hostname: string): boolean {
  if (rule.scope === "host") {
    return hostname === rule.siteKey;
  }
  // site scope: registrable-domain equality.
  const key = getSiteKey(hostname);
  return key === rule.siteKey;
}

function isRuleType(value: unknown): value is RuleType {
  return value === "include" || value === "exclude";
}

function isScope(value: unknown): value is Scope {
  return value === "site" || value === "host";
}

function isBoundary(value: unknown): value is Boundary {
  return value === "site" || value === "host";
}

function isExternalBehavior(value: unknown): value is ExternalBehavior {
  return value === "preserve" || value === "convert-all";
}
