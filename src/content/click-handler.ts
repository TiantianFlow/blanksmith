// Isolated-world content-script click handler.
//
// This is the only place the extension touches the DOM. It registers a single
// capture-phase click listener on `document` (event delegation, so dynamically
// inserted anchors are handled without re-installation). On each click it:
//
//   1. Ignores non-primary or modified clicks (Ctrl/Cmd/Shift/Alt/middle).
//   2. Walks event.composedPath() to find the nearest a[href] or area[href],
//      piercing open shadow DOM.
//   3. Computes the effective target (element target wins; otherwise the first
//      <base target> in the document) — WITHOUT writing any attribute.
//   4. Gathers the resolved href, rel, and download facts.
//   5. Calls the pure decideLink() with the active rule.
//   6. On "convert": preventDefault() + location.assign(resolvedHref).
//      On "preserve": does nothing (the browser's default new-tab behavior runs).
//
// The handler NEVER adds, removes, or mutates a target attribute. This is the
// structural guarantee for acceptance criterion 9. The getRule callback is the
// only external dependency and is read-only; the content script never sends a
// mutation message (UPSERT_RULE/REMOVE_RULE are UI-only — see background sender
// validation).

import { decideLink } from "../domain/link-policy";
import type { SiteRule } from "../domain/types";

/** A read-only rule provider. Returns the active rule for the current page or null. */
export type GetRule = () => SiteRule | null;

/**
 * Install a capture-phase click handler on the given document.
 *
 * @param doc The document to listen on.
 * @param location The location to call assign() on when converting; hostname is
 *   read to supply the policy layer's source hostname.
 * @param getRule A read-only callback returning the active SiteRule or null.
 * @returns A teardown function that removes the listener.
 */
export function installClickHandler(
  doc: Document,
  location: Pick<Location, "assign" | "hostname">,
  getRule: GetRule,
): () => void {
  function onClick(event: MouseEvent): void {
    // Only an unmodified primary click is eligible.
    if (!isUnmodifiedPrimaryClick(event)) return;

    const anchor = findAnchorInPath(event);
    if (anchor === null) return;

    const href = anchor.href;
    if (!href) return; // anchor with no resolvable href — let the browser handle it.

    const effectiveTarget = computeEffectiveTarget(anchor, doc);
    const rel = anchor.getAttribute("rel");
    const isDownload = anchor.hasAttribute("download");

    const decision = decideLink({
      sourceHostname: location.hostname,
      targetUrl: href,
      effectiveTarget,
      rel,
      isDownload,
      isUnmodifiedPrimaryClick: true, // already checked above
      rule: getRule(),
    });

    if (decision.action === "convert") {
      event.preventDefault();
      location.assign(href);
    }
    // On "preserve" the handler is a no-op; the browser opens the new tab.
  }

  doc.addEventListener("click", onClick, true); // capture phase

  return function teardown(): void {
    doc.removeEventListener("click", onClick, true);
  };
}

/** True for button 0 with no Ctrl/Cmd/Shift/Alt modifier. */
function isUnmodifiedPrimaryClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Walk the composed event path to find the nearest a[href] or area[href].
 * composedPath() pierces open shadow DOM; for closed shadow roots it falls
 * back to retargeting (the host element), which is the best an isolated script
 * can do without main-world access.
 */
function findAnchorInPath(
  event: MouseEvent,
): HTMLAnchorElement | HTMLAreaElement | null {
  const path = event.composedPath();
  for (const node of path) {
    if (isAnchorOrArea(node)) {
      const el = node as HTMLAnchorElement | HTMLAreaElement;
      if (el.hasAttribute("href")) return el;
    }
  }
  return null;
}

function isAnchorOrArea(node: EventTarget): boolean {
  return (
    typeof (node as Element).tagName === "string" &&
    ((node as Element).tagName === "A" || (node as Element).tagName === "AREA")
  );
}

/**
 * Compute the effective target keyword without writing any attribute.
 * An element's own target wins; otherwise the first <base target> in the
 * document applies. Returns "" if neither is present (browser default).
 */
function computeEffectiveTarget(el: Element, doc: Document): string {
  const ownTarget = el.getAttribute("target");
  if (ownTarget !== null) return ownTarget;

  const base = doc.querySelector("base[target]");
  if (base !== null) {
    return base.getAttribute("target") ?? "";
  }
  return "";
}
