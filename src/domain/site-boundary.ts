// Pure site-boundary classification. No browser APIs, no side effects.
//
// The registrable domain (eTLD+1) is computed with `tldts` using the FULL
// public-suffix list (allowPrivateDomains: true), so PSL PRIVATE suffixes such
// as `github.io`, `blogspot.com`, and `herokuapp.com` are treated as suffixes,
// not registrable domains. This makes `user.github.io` and `other.github.io`
// distinct properties by default — derived from neutral PSL data, not a preset
// site list. Hosts with no registrable domain — IP addresses and `localhost` —
// fall back to using the hostname itself as the site key, so a same-IP or
// same-localhost rule still converts within itself. Multi-tenant hosts that
// need finer isolation use same-host-only mode (boundary: "host").
//
// Per the design: domain equality is a transparent, conservative proxy for
// "same property," never a proof of one entity. On any uncertainty we preserve.

import { getDomain, parse as parseTldts } from "tldts";

import type { ClassifyDestinationInput, Classification } from "./types";

// Use the full PSL (ICANN + private suffixes) so multi-tenant private-suffix
// hosts classify per-account rather than collapsing to the suffix owner.
const PARSE_OPTIONS = { allowPrivateDomains: true };

/**
 * Determine the site key for a hostname: the registrable domain (eTLD+1) when
 * one exists, the hostname itself for IP addresses / `localhost` / single-label
 * intranet hosts, or `null` for the empty string or a bare public suffix
 * (ICANN TLD like `com`, or a private suffix like `github.io`) that nobody
 * actually browses from.
 */
export function getSiteKey(hostname: string): string | null {
  if (hostname.length === 0) return null;

  const registrable = getDomain(hostname, PARSE_OPTIONS);
  if (registrable !== null) return registrable;

  // No registrable domain. Use the full parse to distinguish IP literals and
  // special hosts (localhost, intranet) from bare public suffixes.
  const parsed = parseTldts(hostname, PARSE_OPTIONS);
  if (parsed.isIp === true) {
    return hostname;
  }
  // A host that is itself a public suffix — whether ICANN (e.g. "com") or
  // private (e.g. "github.io") — is not a usable site key. `localhost` and
  // other non-ICANN/non-private special hosts remain usable as their own key.
  if (
    parsed.publicSuffix === hostname &&
    (parsed.isIcann === true || parsed.isPrivate === true)
  ) {
    return null;
  }
  return hostname;
}

/**
 * Classify a destination URL relative to a source-site rule.
 *
 * Returns `"convert"` when the destination is within the source property
 * (standard mode: same registrable domain, or an explicitly declared related
 * domain; host mode: same hostname; convert-all mode: any HTTP(S) target).
 * Returns `"preserve"` otherwise, including on any parse failure or
 * non-HTTP(S) scheme — uncertainty always favors preserving the new tab.
 */
export function classifyDestination(
  input: ClassifyDestinationInput,
): Classification {
  const { sourceHostname, targetUrl, rule } = input;

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return "preserve";
  }

  // Only HTTP(S) navigations are eligible for conversion. mailto:, tel:,
  // javascript:, data:, etc. always preserve.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "preserve";
  }

  const targetHostname = parsed.hostname;

  // Advanced "open all _blank here" mode converts every otherwise-eligible
  // HTTP(S) target regardless of boundary. The rel=external/download guards
  // are applied upstream in decideLink and still hold.
  if (rule.externalBehavior === "convert-all") {
    return "convert";
  }

  if (rule.boundary === "host") {
    return sourceHostname === targetHostname ? "convert" : "preserve";
  }

  // Standard (site) mode: same registrable domain, or a user-declared related
  // registrable domain. Both sides are normalized through getSiteKey so IP and
  // localhost compare correctly, and a related-domain entry typed as a
  // subdomain still matches by its eTLD+1.
  const sourceKey = getSiteKey(sourceHostname);
  const targetKey = getSiteKey(targetHostname);
  if (sourceKey === null || targetKey === null) {
    return "preserve";
  }
  if (sourceKey === targetKey) {
    return "convert";
  }
  if (rule.relatedDomains.includes(targetKey)) {
    return "convert";
  }
  return "preserve";
}
