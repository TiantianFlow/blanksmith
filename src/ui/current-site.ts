// Pure UI model for the popup's current-site view.
//
// This module is the testable core of the popup: it maps an active tab URL and
// the current rule set to a human-readable model, computes the optional HTTP(S)
// permission origins to request on Include, and drafts a normalized default
// rule. No Chrome APIs are called here — the popup entrypoint wires chrome.tabs
// and chrome.permissions around these pure functions.
//
// No bundled domain defaults, no remote data, no network. The model reflects
// only what the URL and the user's existing rules say.

import { getSiteKey } from "../domain/site-boundary";
import { findRuleForUrl } from "../storage/site-rules";
import { t, bcp47Tag, type Language } from "./messages";
import { summarizeRule } from "./rule-summary";
import type { GlobalMode, RuleType, Scope, SiteRule } from "../domain/types";

/** The popup's view of the current active tab. */
export interface CurrentSiteModel {
  /** True only for http(s) pages where Include makes sense. */
  isWebPage: boolean;
  /** The active tab hostname, or null for non-web pages. */
  hostname: string | null;
  /** The registrable domain (eTLD+1) or hostname for IP/localhost; null otherwise. */
  registrableDomain: string | null;
  /** Whether an enabled rule already covers this site. */
  hasRule: boolean;
  /** The matching rule, or null. */
  existingRule: SiteRule | null;
  /** Human-readable summary of the active scope and policy. */
  scopeSummary: string;
  /**
   * Whether the activation scope can be chosen (true only for a new inclusion
   * on a web page with no existing rule). Once a rule exists, scope is
   * creation-time-only — changing it would require a different host and
   * matching permission, so the user must exclude and re-include (M3).
   */
  scopeEditable: boolean;
}

/**
 * Derive the current-site model from the active tab URL and the stored rules.
 * Returns a non-web-page model for chrome:, about:, file:, or unparseable URLs.
 */
export function deriveCurrentSiteModel(
  url: string | null | undefined,
  rules: readonly SiteRule[],
  lang: Language = "en",
  mode: GlobalMode = "include-only",
): CurrentSiteModel {
  const empty: CurrentSiteModel = {
    isWebPage: false,
    hostname: null,
    registrableDomain: null,
    hasRule: false,
    existingRule: null,
    scopeSummary: t("notWebPage", lang),
    scopeEditable: false,
  };

  if (url === null || url === undefined) return empty;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return empty;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return empty;
  }

  const hostname = parsed.hostname;
  const registrableDomain = getSiteKey(hostname);
  const existingRule = findRuleForUrl(rules, url, mode) ?? null;

  return {
    isWebPage: true,
    hostname,
    registrableDomain,
    hasRule: existingRule !== null,
    existingRule,
    scopeSummary: summarizeScope(existingRule, hostname, registrableDomain, lang),
    // Scope is creation-time-only: editable only for a new inclusion (no
    // existing rule). Once a rule exists, changing scope would require a
    // different host and matching permission — the user must exclude and
    // re-include from the desired host (M3).
    scopeEditable: existingRule === null,
  };
}

/**
 * Produce the optional HTTP(S) permission origins to request for a given scope.
 * These are the same match patterns the background uses for dynamic content-
 * script registration, restricted to http and https schemes only.
 */
export function originsForScope(
  scope: Scope,
  hostname: string,
  registrableDomain: string,
): string[] {
  if (scope === "host") {
    return [`http://${hostname}/*`, `https://${hostname}/*`];
  }
  // site scope: the registrable domain and all its subdomains.
  return [
    `http://*.${registrableDomain}/*`,
    `https://*.${registrableDomain}/*`,
    `http://${registrableDomain}/*`,
    `https://${registrableDomain}/*`,
  ];
}

/**
 * Draft a normalized default SiteRule from a popup Include or Exclude choice.
 * Defaults: enabled, site scope, site boundary, preserve external exits,
 * empty related domains. For a host scope, both scope and boundary are "host"
 * and the siteKey is the exact hostname.
 */
export function draftRule(hostname: string, scope: Scope, ruleType: RuleType = "include"): SiteRule {
  const siteKey = scope === "host" ? hostname : (getSiteKey(hostname) ?? hostname);
  return {
    siteKey,
    ruleType,
    scope,
    boundary: scope === "host" ? "host" : "site",
    externalBehavior: "preserve",
    enabled: true,
    relatedDomains: [],
  };
}

/**
 * The outcome of a chrome.permissions.request({ origins }) call, classified for
 * the popup's user-facing message.
 *
 * - `granted`: the API resolved to true and no error occurred — proceed to
 *   persist the rule.
 * - `denied`: the API resolved to false and no error occurred — the user saw
 *   a Chrome prompt and clicked "Block." This is a normal user choice; the
 *   popup should say "Permission denied" and let the user retry.
 * - `request-failed`: the API threw, or resolved to false while
 *   `runtime.lastError` was set — Chrome rejected the request before any
 *   user prompt (e.g. origins not declared in `optional_host_permissions`).
 *   This is an implementation/config error; the popup should say the request
 *   failed, not that the user denied it.
 */
export type PermissionRequestKind = "granted" | "denied" | "request-failed";

export interface PermissionRequestResult {
  kind: PermissionRequestKind;
  message: string;
}

/**
 * Classify the result of a chrome.permissions.request call.
 *
 * @param granted The boolean the API resolved to, or `undefined` if it threw.
 * @param lastError The value of `chrome.runtime.lastError` after the call, or
 *   `undefined` if not set. When Chrome rejects a request pre-prompt (e.g.
 *   origins not declared), it may resolve to `false` AND set `lastError`.
 * @returns A `{ kind, message }` the popup uses to show the right message.
 */
export function permissionRequestResult(
  granted: boolean | undefined,
  lastError: string | undefined,
  lang: Language = "en",
): PermissionRequestResult {
  if (granted === true && lastError === undefined) {
    return { kind: "granted", message: "" };
  }
  if (lastError !== undefined) {
    return {
      kind: "request-failed",
      message: t("permissionFailed", lang) + lastError,
    };
  }
  if (granted === true) {
    return { kind: "granted", message: "" };
  }
  return {
    kind: "denied",
    message: t("permissionDenied", lang),
  };
}

/** Human-readable scope + policy summary for the popup. */
function summarizeScope(
  rule: SiteRule | null,
  hostname: string | null,
  registrableDomain: string | null,
  lang: Language = "en",
): string {
  if (rule === null) {
    const label = registrableDomain ?? hostname ?? t("thisSite", lang);
    return t("notEnabledOn", lang, label);
  }
  // The synthetic EXCLUDE_ONLY_DEFAULT_RULE (siteKey "*") is an internal
  // signal that the page is active in exclude-only mode, not a real
  // configured rule. Show a dedicated global-active summary instead of
  // routing it through summarizeRule (which would render "All subdomains
  // of *" — nonsensical and falsely implying a configured rule).
  if (rule.siteKey === "*") {
    return t("excludeOnlyActiveSummary", lang);
  }
  return summarizeRule(rule, lang);
}

/**
 * Find all enabled exclude rules that match a hostname by scope.
 * Host scope: exact hostname equality. Site scope: registrable-domain
 * equality. Used by both isExcluded and the popup's removal loop to
 * avoid predicate drift (reviewer N2).
 */
export function findMatchingExcludes(
  rules: readonly SiteRule[],
  hostname: string,
  registrableDomain: string | null,
): SiteRule[] {
  return rules.filter(
    (r) =>
      r.ruleType === "exclude" &&
      r.enabled &&
      (r.scope === "host"
        ? r.siteKey === hostname
        : r.siteKey === registrableDomain),
  );
}

/**
 * Determine whether a page is explicitly excluded by an enabled exclude
 * rule in exclude-only mode. This is the explicit active/excluded
 * check that the popup's onInclude uses after removing matching
 * exclude rules — it cannot rely on deriveCurrentSiteModel.hasRule
 * because the synthetic EXCLUDE_ONLY_DEFAULT_RULE (siteKey "*")
 * makes hasRule true for ACTIVE pages too.
 *
 * Returns true if any enabled exclude rule matches the hostname
 * (by host or site scope). Returns false otherwise (page is active).
 */
export function isExcluded(
  rules: readonly SiteRule[],
  hostname: string,
  registrableDomain: string | null,
): boolean {
  return findMatchingExcludes(rules, hostname, registrableDomain).length > 0;
}
