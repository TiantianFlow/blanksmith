// Domain types for the same-property-links policy layer.
//
// These are the pure, browser-free contracts consumed by Task 3 (rule storage)
// and Task 4 (content-script click handler). No Chrome APIs are referenced here
// so the whole layer is unit-testable under jsdom/Node.

/**
 * Rule type — distinguishes include rules (activate on matching sites)
 * from exclude rules (deactivate on matching sites in exclude-only mode).
 * In include-only mode (default), only include rules affect activation.
 * In exclude-only mode, the content script is active on all HTTP(S)
 * pages except those matching an enabled exclude rule.
 */
export type RuleType = "include" | "exclude";

/**
 * Global activation mode — controls which set of rules determines
 * content-script activation.
 * - `include-only` (default): activate only on sites matching an
 *   enabled include rule (existing behavior).
 * - `exclude-only`: activate on all HTTP(S) pages except those
 *   matching an enabled exclude rule. Requires broad optional host
 *   permission (all HTTP(S) origins).
 */
export type GlobalMode = "include-only" | "exclude-only";

/**
 * Source activation scope — controls which pages the content script is
 * injected on. `site` matches the registrable domain (eTLD+1); `host` matches
 * a single hostname. Distinct from `boundary`, which controls link conversion.
 */
export type Scope = "site" | "host";

/**
 * Destination boundary — controls whether a `_blank` link converts. `site`
 * converts within the same registrable domain (or a declared related domain);
 * `host` requires exact hostname equality. Distinct from `scope`.
 */
export type Boundary = "site" | "host";

/**
 * Effective target behavior for links the boundary classifier would otherwise
 * leave as new tabs. `preserve` keeps the external-link safeguard;
 * `convert-all` is the advanced "open all _blank here" override.
 */
export type ExternalBehavior = "preserve" | "convert-all";

/** Whether a rule is currently enabled for click-time conversion. */
export type Enabled = boolean;

/**
 * A normalized source-site rule, as produced by Task 3's storage layer.
 *
 * - `siteKey` is the registrable domain (eTLD+1) or, for IP/localhost, the
 *   hostname itself. It is the storage/matching key for the rule.
 * - `scope` controls which source pages the content script is injected on
 *   (`site` = the whole registrable domain, `host` = one hostname).
 * - `boundary` controls destination link conversion (`site` = same registrable
 *   domain, `host` = same hostname only).
 * - `relatedDomains` are registrable domains the user asserted belong to the
 *   same product; they are normalized to eTLD+1 form.
 */
export interface SiteRule {
  siteKey: string;
  ruleType: RuleType;
  scope: Scope;
  boundary: Boundary;
  externalBehavior: ExternalBehavior;
  enabled: Enabled;
  relatedDomains: string[];
}

/** Result of classifying a destination relative to a source rule. */
export type Classification = "convert" | "preserve";

/**
 * Input to `classifyDestination`. The source is given as a hostname (the
 * content script supplies `location.hostname`); the target is the resolved
 * absolute href of the clicked anchor/area.
 */
export interface ClassifyDestinationInput {
  sourceHostname: string;
  targetUrl: string;
  rule: SiteRule;
}

/**
 * Click-time guard facts gathered from the DOM event/element by the content
 * script. `decideLink` is pure over these facts; it never touches the DOM.
 */
export interface LinkDecisionInput {
  /** Source page hostname, e.g. `location.hostname`. */
  sourceHostname: string;
  /** Resolved absolute target href (already URL-resolved by the DOM). */
  targetUrl: string;
  /** Effective target keyword, honoring an element target over `base[target]`. */
  effectiveTarget: string;
  /** Raw `rel` attribute value, if any (tokenized inside the policy). */
  rel: string | null;
  /** Whether the anchor/area carries a `download` attribute. */
  isDownload: boolean;
  /** Primary button with no Ctrl/Cmd/Shift/Alt modifier. */
  isUnmodifiedPrimaryClick: boolean;
  /** Normalized source rule, or `null` when the site is not opted in. */
  rule: SiteRule | null;
}

/** Action the content script should take for this click. */
export type LinkAction = "convert" | "preserve";

export interface LinkDecision {
  action: LinkAction;
  /** Human-readable, UI-stable reason for the decision. */
  reason: string;
}
