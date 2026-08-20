// Dynamic content-script registration reconciliation.
//
// The background service worker calls `reconcileRegistrations` after any rule
// or permission change. It ensures chrome.scripting dynamic content scripts
// match the set of enabled rules and the current global mode.
//
// In include-only mode (default): register one script per enabled include
// rule, matching its scope. Exclude rules are ignored for registration.
//
// In exclude-only mode: register a single global script matching all
// HTTP(S) origins, with excludeMatches built from enabled exclude rules.
// This requires the user to have granted broad optional host permission.
//
// This module is pure over an injectable chrome.scripting surface so it is
// unit-testable without a browser. The background entrypoint wires real APIs.

import type { GlobalMode, SiteRule } from "../domain/types";

/** The subset of chrome.scripting needed by this module. */
export interface ScriptingApi {
  registerContentScripts(
    scripts: chrome.scripting.RegisteredContentScript[],
  ): Promise<void>;
  unregisterContentScripts(params: { ids: string[] }): Promise<void>;
  getRegisteredContentScripts(params?: {
    ids: string[];
  }): Promise<chrome.scripting.RegisteredContentScript[]>;
}

/** Optional permissions check for exclude-only mode. */
export interface PermissionsApi {
  contains(origins: string[]): Promise<boolean>;
}

/**
 * The content-script file registered for every opted-in source site. This path
 * matches the WXT build output for entrypoints/content.ts (registration:
 * "runtime"), which emits content-scripts/content.js.
 */
const CONTENT_SCRIPT_FILE = "content-scripts/content.js";

/** Prefix that namespaces our dynamic registrations. */
const SCRIPT_ID_PREFIX = "spl:";

/** Script id for the global (exclude-only mode) registration. */
const GLOBAL_SCRIPT_ID = "spl:__global__";

/** Stable, prefixed script id derived from a rule's siteKey. */
export function ruleToScriptId(siteKey: string): string {
  return `${SCRIPT_ID_PREFIX}${siteKey}`;
}

/**
 * Reconcile dynamic content-script registrations against the enabled rules
 * and the current global mode.
 *
 * In include-only mode: register one script per enabled include rule.
 * In exclude-only mode: register a single global script with excludeMatches.
 */
export async function reconcileRegistrations(
  rules: readonly SiteRule[],
  scripting: ScriptingApi,
  mode: GlobalMode = "include-only",
  permissions?: PermissionsApi,
): Promise<void> {
  const enabledIncludeRules = rules.filter(
    (r) => r.enabled && r.ruleType === "include",
  );
  const enabledExcludeRules = rules.filter(
    (r) => r.enabled && r.ruleType === "exclude",
  );

  // Discover all currently-registered scripts with our prefix.
  const allExisting = await scripting.getRegisteredContentScripts();
  const ourExistingIds = allExisting
    .filter((s) => s.id.startsWith(SCRIPT_ID_PREFIX))
    .map((s) => s.id);

  // Remove all existing scripts (stale + replace).
  if (ourExistingIds.length > 0) {
    await scripting.unregisterContentScripts({ ids: ourExistingIds });
  }

  if (mode === "exclude-only") {
    // Check broad permission before registering the global script.
    // If the user revoked permission via chrome://extensions or prefs synced
    // from another device without broad permission, skip registration
    // gracefully rather than failing silently on every reconciliation.
    if (permissions) {
      const hasBroad = await permissions.contains(["http://*/*", "https://*/*"]);
      if (!hasBroad) {
        // Broad permission missing — skip global registration.
        // The popup will surface the issue when the user tries to use the mode.
        return;
      }
    }
    // Register a single global script with excludeMatches from exclude rules.
    const excludeMatches = enabledExcludeRules.flatMap((rule) =>
      rule.scope === "host"
        ? hostScopeMatches(rule.siteKey)
        : siteScopeMatches(rule.siteKey),
    );
    const script: chrome.scripting.RegisteredContentScript = {
      id: GLOBAL_SCRIPT_ID,
      matches: ["http://*/*", "https://*/*"],
      ...(excludeMatches.length > 0 ? { excludeMatches } : {}),
      js: [CONTENT_SCRIPT_FILE],
      runAt: "document_start",
      allFrames: false,
    };
    await scripting.registerContentScripts([script]);
  } else {
    // include-only mode: register one script per enabled include rule.
    const toRegister = enabledIncludeRules.map((rule) =>
      ruleToContentScript(rule),
    );
    if (toRegister.length > 0) {
      await scripting.registerContentScripts(toRegister);
    }
  }
}

/**
 * Build a dynamic content-script registration for an include rule.
 * Match patterns are HTTP(S)-only and scoped to the rule's siteKey.
 */
function ruleToContentScript(
  rule: SiteRule,
): chrome.scripting.RegisteredContentScript {
  const id = ruleToScriptId(rule.siteKey);
  const matches =
    rule.scope === "host"
      ? hostScopeMatches(rule.siteKey)
      : siteScopeMatches(rule.siteKey);
  return {
    id,
    matches,
    js: [CONTENT_SCRIPT_FILE],
    runAt: "document_start",
    allFrames: false,
  };
}

/** HTTP(S)-only match patterns for one exact hostname. */
function hostScopeMatches(hostname: string): string[] {
  return [`http://${hostname}/*`, `https://${hostname}/*`];
}

/** HTTP(S)-only match patterns for a registrable domain and all subdomains. */
function siteScopeMatches(registrableDomain: string): string[] {
  return [
    `http://*.${registrableDomain}/*`,
    `https://*.${registrableDomain}/*`,
    `http://${registrableDomain}/*`,
    `https://${registrableDomain}/*`,
  ];
}
