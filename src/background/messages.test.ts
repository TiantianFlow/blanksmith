import { describe, expect, it, vi } from "vitest";

import { createMessageHandler, extractRulesResponse, guardMutationResponse, type BackgroundResponse, type Sender } from "./messages";
import { SyncCoordinator } from "./sync-coordinator";
import type { SiteRule } from "../domain/types";

function createStorageArea() {
  const store = new Map<string, unknown>();
  return {
    area: {
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
    },
    store,
  };
}

function scriptingStub() {
  return {
    registerContentScripts: vi.fn(async (_scripts: chrome.scripting.RegisteredContentScript[]) => {}),
    unregisterContentScripts: vi.fn(async (_params: { ids: string[] }) => {}),
    getRegisteredContentScripts: vi.fn(async (_params?: { ids: string[] }) => [] as chrome.scripting.RegisteredContentScript[]),
  };
}

function sampleRule(): SiteRule {
  return {
    siteKey: "example.com",
    ruleType: "include",
    scope: "site",
    boundary: "site",
    externalBehavior: "preserve",
    enabled: true,
    relatedDomains: [],
  };
}

const extensionSender: Sender = { url: "chrome-extension://abc123/popup.html" };
const contentScriptSender: Sender = { url: "https://news.example.com/page" };
const noSender = undefined;

describe("message handler sender validation (M3)", () => {
  it("allows UPSERT_RULE from an extension UI sender", async () => {
    const { area } = createStorageArea();
    const handle = createMessageHandler({ storage: area, scripting: scriptingStub() });
    const res = await handle({ type: "UPSERT_RULE", rule: sampleRule() }, extensionSender);
    expect(res).toEqual({ rules: [sampleRule()] });
  });

  it("allows REMOVE_RULE from an extension UI sender", async () => {
    const { area } = createStorageArea();
    const handle = createMessageHandler({ storage: area, scripting: scriptingStub() });
    await handle({ type: "UPSERT_RULE", rule: sampleRule() }, extensionSender);
    const res = await handle({ type: "REMOVE_RULE", siteKey: "example.com", ruleType: "include" }, extensionSender);
    expect(res).toEqual({ rules: [] });
  });

  it("allows mutation when sender is undefined (trusted direct call)", async () => {
    const { area } = createStorageArea();
    const handle = createMessageHandler({ storage: area, scripting: scriptingStub() });
    const res = await handle({ type: "UPSERT_RULE", rule: sampleRule() }, noSender);
    expect(res).toEqual({ rules: [sampleRule()] });
  });

  it("rejects UPSERT_RULE from a content-script (page) sender", async () => {
    const { area } = createStorageArea();
    const handle = createMessageHandler({ storage: area, scripting: scriptingStub() });
    await expect(
      handle({ type: "UPSERT_RULE", rule: sampleRule() }, contentScriptSender),
    ).rejects.toThrow(/Unauthorized/);
  });

  it("rejects REMOVE_RULE from a content-script (page) sender", async () => {
    const { area } = createStorageArea();
    const handle = createMessageHandler({ storage: area, scripting: scriptingStub() });
    // Seed a rule from a trusted sender first.
    await handle({ type: "UPSERT_RULE", rule: sampleRule() }, extensionSender);
    // A content script must not be able to remove it.
    await expect(
      handle({ type: "REMOVE_RULE", siteKey: "example.com", ruleType: "include" }, contentScriptSender),
    ).rejects.toThrow(/Unauthorized/);
  });

  it("allows GET_RULES from a content-script sender (read-only)", async () => {
    const { area } = createStorageArea();
    const handle = createMessageHandler({ storage: area, scripting: scriptingStub() });
    await handle({ type: "UPSERT_RULE", rule: sampleRule() }, extensionSender);
    const res = await handle({ type: "GET_RULES" }, contentScriptSender);
    expect(res).toEqual({ rules: [sampleRule()] });
  });

  it("allows FIND_RULE_FOR_TAB from a content-script sender (read-only)", async () => {
    const { area } = createStorageArea();
    const handle = createMessageHandler({ storage: area, scripting: scriptingStub() });
    await handle({ type: "UPSERT_RULE", rule: sampleRule() }, extensionSender);
    const res = await handle(
      { type: "FIND_RULE_FOR_TAB", url: "https://news.example.com/page", mode: "include-only" },
      contentScriptSender,
    );
    expect(res).toEqual({ rule: sampleRule() });
  });

  it("rejects mutation from a sender with no url", async () => {
    const { area } = createStorageArea();
    const handle = createMessageHandler({ storage: area, scripting: scriptingStub() });
    await expect(
      handle({ type: "UPSERT_RULE", rule: sampleRule() }, {}),
    ).rejects.toThrow(/Unauthorized/);
  });
});

describe("extractRulesResponse — guard against error responses", () => {
  it("returns rules from a successful response", () => {
    const rule = sampleRule();
    const res = extractRulesResponse({ rules: [rule] });
    expect(res).toEqual([rule]);
  });

  it("throws a clear error when the response has an error property", () => {
    const errorResponse = { error: "TypeError: a is not iterable" };
    expect(() => extractRulesResponse(errorResponse)).toThrow(/background error/);
  });

  it("preserves the original background error message in the thrown error", () => {
    const errorResponse = { error: "Something went wrong in reconciliation" };
    expect(() => extractRulesResponse(errorResponse)).toThrow(
      /Something went wrong in reconciliation/,
    );
  });

  it("throws when the response has neither rules nor error (malformed)", () => {
    expect(() => extractRulesResponse({})).toThrow(/background error/);
  });
});

describe("serialized reconciliation via shared coordinator", () => {
  it("does not overlap when handler mutation sync and coordinator event sync share one queue", async () => {
    // This test exercises BOTH the message handler's mutation-triggered sync
    // AND a separate event-triggered enqueue through the SAME coordinator
    // instance. With the old two-queue design (handler internal + entrypoint
    // internal), these would overlap. With a single injected coordinator,
    // maxOverlap must be 1.

    const scripting = scriptingStub();
    let activeReconciliations = 0;
    let maxOverlap = 0;
    let gateResolve: () => void;
    const gate = new Promise<void>((resolve) => {
      gateResolve = resolve;
    });

    scripting.getRegisteredContentScripts.mockImplementation(async () => {
      activeReconciliations++;
      maxOverlap = Math.max(maxOverlap, activeReconciliations);
      await gate; // hold inside reconciliation
      activeReconciliations--;
      return [] as chrome.scripting.RegisteredContentScript[];
    });

    const { area } = createStorageArea();
    const coordinator = new SyncCoordinator(area, scripting);
    const handle = createMessageHandler({ storage: area, scripting, coordinator });

    // 1. Start a mutation (handler awaits the coordinator's sync).
    const mutationPromise = handle(
      { type: "UPSERT_RULE", rule: sampleRule() },
      extensionSender,
    );

    // 2. Yield so the mutation's upsertRule completes and the sync enters
    //    getRegisteredContentScripts (blocks on gate).
    await new Promise((r) => setTimeout(r, 10));

    // 3. Enqueue an event-triggered sync through the SAME coordinator.
    //    This simulates storage.onChanged firing after upsertRule wrote.
    const eventSync = coordinator.enqueue(false);

    // 4. Yield to give the event sync a chance to start.
    await new Promise((r) => setTimeout(r, 10));

    // 5. Release the gate — mutation sync completes, then event sync runs.
    gateResolve!();
    await mutationPromise.catch(() => undefined);
    await eventSync.catch(() => undefined);

    // 6. Assert no overlap.
    expect(maxOverlap).toBe(1);
  });

  it("recovers after a queued reconciliation failure (next sync still runs)", async () => {
    const scripting = scriptingStub();
    let shouldFail = true;
    scripting.getRegisteredContentScripts.mockImplementation(async () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("Chrome scripting API unavailable");
      }
      return [] as chrome.scripting.RegisteredContentScript[];
    });

    const { area } = createStorageArea();
    const coordinator = new SyncCoordinator(area, scripting);
    const handle = createMessageHandler({ storage: area, scripting, coordinator });

    // First mutation triggers a sync that fails during reconciliation.
    await expect(
      handle({ type: "UPSERT_RULE", rule: sampleRule() }, extensionSender),
    ).rejects.toThrow(/Chrome scripting API unavailable/);

    // Second mutation triggers a sync that should succeed.
    const res = await handle(
      { type: "UPSERT_RULE", rule: { ...sampleRule(), boundary: "host" } },
      extensionSender,
    );
    expect(res).toEqual({ rules: [{ ...sampleRule(), boundary: "host" }] });
  });
});

describe("BackgroundResponse type includes BackgroundErrorResponse", () => {
  it("accepts an error response as a valid BackgroundResponse", () => {
    // The background's onMessage catch handler sends { error: "..." }.
    // BackgroundResponse must include this shape so TypeScript lets UI
    // consumers narrow on it. Without it in the union, the type is a lie.
    const errorRes: BackgroundResponse = { error: "something failed" };
    expect(errorRes).toHaveProperty("error");
  });

  it("accepts a rules response as a valid BackgroundResponse", () => {
    const okRes: BackgroundResponse = { rules: [sampleRule()] };
    expect(okRes).toHaveProperty("rules");
  });
});

describe("guardMutationResponse — surface background errors from persist", () => {
  it("returns void on a successful UPSERT/REMOVE response", () => {
    // A successful mutation response has { rules: [...] }. The caller
    // (options persist) does not need the rules array — it just needs
    // to know the mutation succeeded.
    expect(() => guardMutationResponse({ rules: [sampleRule()] })).not.toThrow();
  });

  it("throws on an error response so persist surfaces it to the user", () => {
    // If the background sends { error: "..." }, persist must not silently
    // treat it as success. guardMutationResponse throws so the caller
    // can catch and show the error.
    expect(() => guardMutationResponse({ error: "reconciliation failed" })).toThrow(
      /background error: reconciliation failed/,
    );
  });

  it("throws on a malformed response (neither rules nor error)", () => {
    expect(() => guardMutationResponse({})).toThrow(/background error/);
  });

  it("throws on undefined (no response from background)", () => {
    expect(() => guardMutationResponse(undefined)).toThrow(/background error/);
  });
});
