// Pure click-time link policy. Combines DOM guard facts with the site-boundary
// classifier to produce a single convert/preserve decision plus a reason.
//
// This module never touches the DOM and never writes a target attribute. The
// returned decision carries only `action` and `reason`; the content script
// (Task 4) performs the actual preventDefault()/location.assign() when the
// action is "convert". This is the structural guarantee for acceptance
// criterion 9 — the extension never adds target="_blank".

import { classifyDestination } from "./site-boundary";

import type { LinkDecision, LinkDecisionInput } from "./types";

/** True when the effective target keyword is `_blank` (case-insensitive). */
function isBlankTarget(effectiveTarget: string): boolean {
  return effectiveTarget.trim().toLowerCase() === "_blank";
}

/** True when a whitespace-tokenized rel attribute contains `external`. */
function hasExternalRel(rel: string | null): boolean {
  if (rel === null) return false;
  const tokens = rel.toLowerCase().split(/\s+/);
  return tokens.includes("external");
}

/**
 * Decide what the content script should do for a single click.
 *
 * Guard order (each short-circuits to preserve):
 *   1. site not opted in, or rule disabled;
 *   2. not an unmodified primary click (Ctrl/Cmd/Shift/Alt/middle);
 *   3. effective target is not `_blank`;
 *   4. download attribute present;
 *   5. rel contains `external` (author-declared preserve signal);
 *   6. non-HTTP(S) scheme or unparseable URL (handled inside classifyDestination).
 *
 * If all guards pass, the site-boundary classifier decides convert vs preserve.
 */
export function decideLink(input: LinkDecisionInput): LinkDecision {
  const {
    isUnmodifiedPrimaryClick,
    effectiveTarget,
    isDownload,
    rel,
    rule,
  } = input;

  if (rule === null) {
    return { action: "preserve", reason: "site not enabled" };
  }
  if (!rule.enabled) {
    return { action: "preserve", reason: "site rule disabled" };
  }
  if (!isUnmodifiedPrimaryClick) {
    return { action: "preserve", reason: "modified or non-primary click" };
  }
  if (!isBlankTarget(effectiveTarget)) {
    return { action: "preserve", reason: "target is not _blank" };
  }
  if (isDownload) {
    return { action: "preserve", reason: "download link" };
  }
  if (hasExternalRel(rel)) {
    return { action: "preserve", reason: "rel=external" };
  }

  const classification = classifyDestination({
    sourceHostname: input.sourceHostname,
    targetUrl: input.targetUrl,
    rule,
  });

  if (classification === "convert") {
    return { action: "convert", reason: "same property" };
  }
  return { action: "preserve", reason: "different property" };
}
