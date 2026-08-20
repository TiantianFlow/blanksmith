import { describe, expect, it, vi } from "vitest";

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
  const stub = {
    registerContentScripts: vi.fn(async (_scripts: chrome.scripting.RegisteredContentScript[]) => {}),
    unregisterContentScripts: vi.fn(async (_params: { ids: string[] }) => {}),
    getRegisteredContentScripts: vi.fn(async (_params?: { ids: string[] }) => [] as chrome.scripting.RegisteredContentScript[]),
  };
  return stub;
}

type MockScripting = ReturnType<typeof scriptingStub>;

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

describe("SyncCoordinator — single shared serialized queue", () => {
  it("does not overlap when a mutation-triggered sync and an event-triggered sync use the same coordinator", async () => {
    // This test enqueues through the SAME coordinator from two callers:
    //   1. A mutation handler that awaits the sync (requireSuccess=true)
    //   2. An event listener that fire-and-forgets the sync (requireSuccess=false)
    //
    // With the current two-queue design (handler owns one, entrypoint owns
    // another), these would overlap. With a single shared coordinator,
    // maxOverlap must be 1.

    const { area } = createStorageArea();
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
      // Hold inside reconciliation until the gate is released, so a
      // concurrent trigger has a window to enter.
      await gate;
      activeReconciliations--;
      return [] as chrome.scripting.RegisteredContentScript[];
    });

    const coordinator = new SyncCoordinator(area, scripting);

    // 1. Start a mutation-triggered sync (awaited, requireSuccess=true).
    //    This enters getRegisteredContentScripts and blocks on the gate.
    const mutationSync = coordinator.enqueue(true);

    // 2. Yield so the mutation sync enters reconciliation.
    await new Promise((r) => setTimeout(r, 5));

    // 3. Enqueue an event-triggered sync (fire-and-forget) through the
    //    SAME coordinator. With the current two-queue design, this would
    //    start a concurrent reconciliation; with a single shared queue, it
    //    waits behind the mutation sync.
    const eventSync = coordinator.enqueue(false);

    // 4. Yield to give the event sync a chance to start.
    await new Promise((r) => setTimeout(r, 5));

    // 5. Release the gate — the mutation sync completes, then the event
    //    sync runs.
    gateResolve!();
    await mutationSync.catch(() => undefined);
    await eventSync.catch(() => undefined);

    // 6. Assert no overlap occurred.
    expect(maxOverlap).toBe(1);
  });

  it("propagates failure to the awaited caller but does not poison the queue", async () => {
    const { area } = createStorageArea();
    const scripting = scriptingStub();

    let shouldFail = true;
    scripting.getRegisteredContentScripts.mockImplementation(async () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("Chrome scripting API unavailable");
      }
      return [] as chrome.scripting.RegisteredContentScript[];
    });

    const coordinator = new SyncCoordinator(area, scripting);

    // First sync fails — the awaited caller sees the error.
    await expect(coordinator.enqueue(true)).rejects.toThrow(
      /Chrome scripting API unavailable/,
    );

    // Second sync (fire-and-forget) still runs — queue recovered.
    await coordinator.enqueue(false);
    expect(shouldFail).toBe(false); // second call succeeded
  });

  it("fire-and-forget sync logs errors but does not throw", async () => {
    const { area } = createStorageArea();
    const scripting = scriptingStub();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    scripting.getRegisteredContentScripts.mockImplementation(async () => {
      throw new Error("event sync failure");
    });

    const coordinator = new SyncCoordinator(area, scripting);

    // Fire-and-forget should not throw.
    const p = coordinator.enqueue(false);
    await p; // should not reject

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[spl]"),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});
