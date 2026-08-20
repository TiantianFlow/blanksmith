// Background message contracts for Blanksmith.
//
// These are the request/response shapes exchanged between the popup/Settings
// UI (Task 5) and the background service worker. The background owns rule
// storage, permission lifecycle, and registration reconciliation. No content
// scripts or UI live here.
//
// Every request is a discriminated union on `type`. The handler factory maps
// each type to an operation over the storage + scripting surfaces. Keeping the
// contracts in one module lets the popup and Settings import the same types
// without a circular dependency on the background entrypoint.

import type { GlobalMode, RuleType, SiteRule } from "../domain/types";

// --- Request messages ---

export interface GetRulesRequest {
  type: "GET_RULES";
}

export interface GetRulesResponse {
  rules: SiteRule[];
}

export interface UpsertRuleRequest {
  type: "UPSERT_RULE";
  rule: SiteRule;
}

export interface UpsertRuleResponse {
  rules: SiteRule[];
}

export interface RemoveRuleRequest {
  type: "REMOVE_RULE";
  siteKey: string;
  ruleType: RuleType;
}

export interface RemoveRuleResponse {
  rules: SiteRule[];
}

export interface FindRuleForTabRequest {
  type: "FIND_RULE_FOR_TAB";
  url: string;
  mode: GlobalMode;
}

export interface FindRuleForTabResponse {
  rule: SiteRule | null;
}

export type BackgroundRequest =
  | GetRulesRequest
  | UpsertRuleRequest
  | RemoveRuleRequest
  | FindRuleForTabRequest;

export type BackgroundResponse =
  | GetRulesResponse
  | UpsertRuleResponse
  | RemoveRuleResponse
  | FindRuleForTabResponse
  | BackgroundErrorResponse;

/**
 * Error response sent by the background's onMessage catch handler when the
 * message handler throws (e.g. during reconciliation). UI consumers must
 * check for this shape before accessing `rules` or `rule`.
 */
export interface BackgroundErrorResponse {
  error: string;
}

// --- Handler factory ---
//
// The handler is pure over injectable storage + scripting surfaces so it can
// be unit-tested without a browser. The background entrypoint wires the real
// chrome APIs.
//
// Sender validation (M3): mutation messages (UPSERT_RULE, REMOVE_RULE) are
// accepted only from extension popup/options senders. A page-context content
// script may send only read-only messages (GET_RULES, FIND_RULE_FOR_TAB). This
// prevents a compromised page from escalating source-site settings once a
// content script is injected.

import { findRuleForUrl, readRules, removeRule, upsertRule } from "../storage/site-rules";
import { reconcileRegistrations, type ScriptingApi } from "./registration";
import { SyncCoordinator } from "./sync-coordinator";

export interface BackgroundDeps {
  storage: import("../storage/site-rules").StorageArea;
  scripting: ScriptingApi;
  /** Shared serialized reconciliation coordinator. If omitted, the handler
   * creates an internal one — but callers that also enqueue event-triggered
   * syncs (storage.onChanged, permissions.onAdded) must inject the same
   * instance to prevent concurrent reconciliation races. */
  coordinator?: SyncCoordinator;
  permissions?: {
    contains(origins: string[]): Promise<boolean>;
    request(origins: string[]): Promise<boolean>;
    remove(origins: string[]): Promise<boolean>;
  };
}

/**
 * Subset of chrome.runtime.MessageSender used for sender authorization.
 *
 * - `url`: the URL of the frame that sent the message. For content scripts
 *   injected into a page, this is the page URL (e.g. `https://news.example.com`).
 *   For extension pages (popup/options), this is a `chrome-extension://` URL.
 * - `origin`: the origin of the sender. For extension pages this is the
 *   extension's origin (`chrome-extension://<extension-id>`).
 */
export interface Sender {
  url?: string | undefined;
  origin?: string | undefined;
}

/** Message types that mutate stored rules; restricted to UI senders. */
const MUTATION_TYPES = new Set(["UPSERT_RULE", "REMOVE_RULE"]);

/**
 * Determine whether a sender is authorized to mutate rules.
 *
 * Trust boundary: only extension pages (popup/options) may send
 * UPSERT_RULE/REMOVE_RULE. A content script runs in the page's context, so its
 * `sender.url` is the page URL — it must NOT be able to mutate rules (M3).
 *
 * Authorization is granted when:
 * - `sender` is `undefined` (a trusted direct call from within the background,
 *   used by tests and internal logic — no remote/page origin is involved); or
 * - `sender.url` starts with `chrome-extension://` (an extension UI page); or
 * - `sender.origin` starts with `chrome-extension://` (the extension's own
 *   origin, which Chrome sets for extension-page senders).
 *
 * Any http(s) page-context sender is rejected. This cannot be bypassed by a
 * page fabricating a `chrome-extension://` url because Chrome populates the
 * sender object from the actual frame origin, not from message content.
 */
function isExtensionSender(sender: Sender | undefined): boolean {
  if (sender === undefined) return true; // trusted direct call (tests/internal)
  if (typeof sender.url === "string" && sender.url.startsWith("chrome-extension://")) {
    return true;
  }
  if (typeof sender.origin === "string" && sender.origin.startsWith("chrome-extension://")) {
    return true;
  }
  return false;
}

/**
 * Create a message handler bound to the given dependencies. Returns a function
 * that maps a BackgroundRequest to a BackgroundResponse, reconciling content-
 * script registrations after any mutation via the shared coordinator.
 *
 * The coordinator serializes all reconciliation triggers (post-mutation,
 * startup, storage.onChanged, permissions.onAdded) through one queue. If the
 * caller does not inject a coordinator, an internal one is created — but
 * event-triggered callers must inject the same instance to prevent races.
 */
export function createMessageHandler(deps: BackgroundDeps) {
  const coordinator = deps.coordinator ?? new SyncCoordinator(deps.storage, deps.scripting);

  return async function handle(
    request: BackgroundRequest,
    sender?: Sender,
  ): Promise<BackgroundResponse> {
    // Reject mutation messages from non-extension senders (content scripts).
    if (MUTATION_TYPES.has(request.type) && !isExtensionSender(sender)) {
      throw new Error(
        `Unauthorized: ${request.type} is restricted to extension UI senders.`,
      );
    }

    switch (request.type) {
      case "GET_RULES": {
        const rules = await readRules(deps.storage);
        return { rules };
      }
      case "UPSERT_RULE": {
        await upsertRule(deps.storage, request.rule);
        // Await the serialized sync so the popup sees the real error if
        // reconciliation fails (e.g. Chrome scripting API error).
        await coordinator.enqueue(true);
        const rules = await readRules(deps.storage);
        return { rules };
      }
      case "REMOVE_RULE": {
        await removeRule(deps.storage, request.siteKey, request.ruleType);
        await coordinator.enqueue(true);
        const rules = await readRules(deps.storage);
        return { rules };
      }
      case "FIND_RULE_FOR_TAB": {
        const rules = await readRules(deps.storage);
        const rule = findRuleForUrl(rules, request.url, request.mode) ?? null;
        return { rule };
      }
    }
  };
}

/**
 * Extract the `rules` array from a background response, throwing a clear error
 * if the response is an error or malformed. UI consumers (popup, options)
 * must call this instead of blindly accessing `.rules` — otherwise an error
 * response (which has no `rules` property) yields `undefined`, which
 * propagates into `findRuleForUrl`'s `for...of` and throws
 * `TypeError: ... is not iterable`.
 *
 * @param res The raw response from `chrome.runtime.sendMessage`.
 * @returns The `rules` array if the response is a successful rules response.
 * @throws Error with the original background error message if the response
 *   has an `error` property, or if the response is malformed.
 */
export function extractRulesResponse(
  res: unknown,
): SiteRule[] {
  if (typeof res === "object" && res !== null && "error" in res) {
    const errorRes = res as { error: unknown };
    throw new Error(
      `background error: ${String(errorRes.error)}`,
    );
  }
  if (
    typeof res === "object" &&
    res !== null &&
    "rules" in res &&
    Array.isArray((res as { rules: unknown }).rules)
  ) {
    return (res as { rules: SiteRule[] }).rules;
  }
  throw new Error(
    "background error: malformed response (no rules or error property).",
  );
}

/**
 * Guard a mutation (UPSERT_RULE / REMOVE_RULE) response, throwing a clear error
 * if the response is an error or malformed. Unlike `extractRulesResponse`,
 * this does not return the rules array — the caller (options `persist`) only
 * needs to know the mutation succeeded, not the resulting rules list.
 *
 * @param res The raw response from `chrome.runtime.sendMessage`.
 * @throws Error with the original background error message if the response
 *   has an `error` property, is malformed, or is undefined.
 */
export function guardMutationResponse(
  res: unknown,
): void {
  if (res === undefined || res === null) {
    throw new Error("background error: no response from background.");
  }
  if (typeof res === "object" && res !== null && "error" in res) {
    const errorRes = res as { error: unknown };
    throw new Error(
      `background error: ${String(errorRes.error)}`,
    );
  }
  if (
    typeof res === "object" &&
    res !== null &&
    "rules" in res &&
    Array.isArray((res as { rules: unknown }).rules)
  ) {
    return; // success — rules array present
  }
  throw new Error(
    "background error: malformed response (no rules or error property).",
  );
}
