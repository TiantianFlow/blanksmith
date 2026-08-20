// Shared, localized rule summary for the popup and Settings list.
//
// Produces a compact one-line description of a SiteRule that both the popup's
// scope summary and the Settings list rows can use. The summary exposes
// activation scope, destination boundary, external behavior, related-domain
// count when non-zero, and a paused indicator for disabled rules.
//
// Pure, browser-free, unit-testable.

import { t, type Language } from "./messages";
import type { SiteRule } from "../domain/types";

/**
 * Produce a compact, localized one-line summary of a rule.
 *
 * Format: `[paused] scopeLabel · converts boundaryLabel · externalLabel [+ N related]`
 */
export function summarizeRule(rule: SiteRule, lang: Language): string {
  const parts: string[] = [];

  if (!rule.enabled) {
    parts.push(t("pausedIndicator", lang));
  }

  const scopeLabel =
    rule.scope === "site"
      ? t("allSubdomainsOf", lang, rule.siteKey)
      : t("onlyHost", lang, rule.siteKey);
  parts.push(scopeLabel);

  const boundaryLabel =
    rule.boundary === "site"
      ? t("sameRegistrableDomain", lang)
      : t("exactSameHost", lang);
  parts.push(`${t("convertsLabel", lang)} ${boundaryLabel}`);

  const externalLabel =
    rule.externalBehavior === "convert-all"
      ? t("convertAllBlank", lang)
      : t("preserveExits", lang);
  parts.push(externalLabel);

  if (rule.relatedDomains.length > 0) {
    parts.push(t("relatedCountLabel", lang, String(rule.relatedDomains.length)));
  }

  return parts.join(" · ");
}

/**
 * Produce visible badge labels for a compact rule row.
 * Returns an array of short strings for chips/badges that
 * visually flag convert-all (advanced) and non-zero related domains.
 * Returns an empty array for a plain preserve rule with no related domains.
 */
export function summarizeRuleBadges(rule: SiteRule, lang: Language): string[] {
  const badges: string[] = [];

  if (rule.externalBehavior === "convert-all") {
    badges.push(t("advancedBadge", lang));
  }

  if (rule.relatedDomains.length > 0) {
    badges.push(t("relatedCountLabel", lang, String(rule.relatedDomains.length)));
  }

  return badges;
}
