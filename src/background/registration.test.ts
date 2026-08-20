import { describe, expect, it, vi } from "vitest";

import type { SiteRule } from "../domain/types";
import { reconcileRegistrations, ruleToScriptId } from "./registration";

// A fake chrome.scripting surface that records calls and tracks registered scripts.
function createScriptingApi() {
  const registered = new Map<
    string,
    chrome.scripting.RegisteredContentScript
  >();
  return {
    api: {
      registerContentScripts: vi.fn(async (scripts: chrome.scripting.RegisteredContentScript[]) => {
        for (const s of scripts) registered.set(s.id, s);
      }),
      unregisterContentScripts: vi.fn(async (params: { ids: string[] }) => {
        for (const id of params.ids) registered.delete(id);
      }),
      getRegisteredContentScripts: vi.fn(async (params?: { ids: string[] }) => {
        // Match Chrome's real behavior: no argument returns ALL registered
        // scripts. { ids: [...] } returns only scripts with matching ids.
        // { ids: [] } returns [] (empty list matches nothing).
        if (params === undefined) {
          return [...registered.values()];
        }
        const out: chrome.scripting.RegisteredContentScript[] = [];
        for (const id of params.ids) {
          const script = registered.get(id);
          if (script) out.push(script);
        }
        return out;
      }),
    },
    registered,
  };
}

function makeRule(overrides: Partial<SiteRule> = {}): SiteRule {
  return {
    siteKey: "example.com",
    ruleType: "include",
    scope: "site",
    boundary: "site",
    externalBehavior: "preserve",
    enabled: true,
    relatedDomains: [],
    ...overrides,
  };
}

describe("ruleToScriptId", () => {
  it("produces a stable, prefixed id from a siteKey", () => {
    expect(ruleToScriptId("example.com")).toBe("spl:example.com");
  });

  it("is deterministic for the same siteKey", () => {
    expect(ruleToScriptId("example.com")).toBe(ruleToScriptId("example.com"));
  });
});

describe("reconcileRegistrations — empty state", () => {
  it("registers nothing and removes nothing when there are no enabled rules and no existing scripts", async () => {
    const { api, registered } = createScriptingApi();
    await reconcileRegistrations([], api);
    expect(api.registerContentScripts).not.toHaveBeenCalled();
    expect(api.unregisterContentScripts).not.toHaveBeenCalled();
    expect(registered.size).toBe(0);
  });

  it("unregisters stale scripts when there are no enabled rules", async () => {
    const { api, registered } = createScriptingApi();
    registered.set("spl:old.com", {
      id: "spl:old.com",
      matches: ["*://old.com/*"],
      js: ["content-script.js"],
    });
    await reconcileRegistrations([], api);
    expect(api.unregisterContentScripts).toHaveBeenCalledWith({ ids: ["spl:old.com"] });
    expect(registered.size).toBe(0);
  });
});

describe("reconcileRegistrations — register an enabled rule", () => {
  it("registers a content script for a site-scope rule with HTTP(S)-only matches", async () => {
    const { api, registered } = createScriptingApi();
    const rule = makeRule({ siteKey: "example.com", scope: "site" });
    await reconcileRegistrations([rule], api);
    expect(api.registerContentScripts).toHaveBeenCalledTimes(1);
    const script = api.registerContentScripts.mock.calls[0]![0]![0]!;
    expect(script.id).toBe("spl:example.com");
    // HTTP(S)-only match patterns for the whole registrable domain.
    expect(script.matches).toEqual([
      "http://*.example.com/*",
      "https://*.example.com/*",
      "http://example.com/*",
      "https://example.com/*",
    ]);
    expect(registered.has("spl:example.com")).toBe(true);
  });

  it("registers a content script for a host-scope rule matching one hostname", async () => {
    const { api, registered } = createScriptingApi();
    const rule = makeRule({ siteKey: "app.example.com", scope: "host" });
    await reconcileRegistrations([rule], api);
    const script = api.registerContentScripts.mock.calls[0]![0]![0]!;
    expect(script.id).toBe("spl:app.example.com");
    expect(script.matches).toEqual([
      "http://app.example.com/*",
      "https://app.example.com/*",
    ]);
    expect(registered.has("spl:app.example.com")).toBe(true);
  });
});

describe("reconcileRegistrations — replace a changed registration", () => {
  it("unregisters then re-registers when a rule's script already exists", async () => {
    const { api, registered } = createScriptingApi();
    // Pre-existing registration for the same id.
    registered.set("spl:example.com", {
      id: "spl:example.com",
      matches: ["*://example.com/*"],
      js: ["old.js"],
    });
    const rule = makeRule({ siteKey: "example.com", scope: "site" });
    await reconcileRegistrations([rule], api);
    // The stale entry must be removed first.
    expect(api.unregisterContentScripts).toHaveBeenCalledWith({ ids: ["spl:example.com"] });
    // Then the fresh one registered.
    expect(api.registerContentScripts).toHaveBeenCalledTimes(1);
    expect(registered.get("spl:example.com")?.js).toEqual(["content-scripts/content.js"]);
  });
});

describe("reconcileRegistrations — remove a disabled rule's registration", () => {
  it("does not register a disabled rule and removes its existing registration", async () => {
    const { api, registered } = createScriptingApi();
    registered.set("spl:example.com", {
      id: "spl:example.com",
      matches: ["*://example.com/*"],
      js: ["content-script.js"],
    });
    const disabled = makeRule({ enabled: false });
    await reconcileRegistrations([disabled], api);
    // Disabled rules are not in the desired set; the stale registration is removed.
    expect(api.unregisterContentScripts).toHaveBeenCalledWith({ ids: ["spl:example.com"] });
    expect(api.registerContentScripts).not.toHaveBeenCalled();
    expect(registered.size).toBe(0);
  });
});

describe("reconcileRegistrations — mixed add/remove/keep", () => {
  it("adds new, removes stale, and replaces changed in one pass", async () => {
    const { api, registered } = createScriptingApi();
    // Stale script that should be removed (no matching enabled rule).
    registered.set("spl:stale.com", {
      id: "spl:stale.com",
      matches: ["*://stale.com/*"],
      js: ["content-script.js"],
    });
    // Existing script for a rule whose registration needs replacement.
    registered.set("spl:example.com", {
      id: "spl:example.com",
      matches: ["*://example.com/*"],
      js: ["old.js"],
    });
    const rules = [
      makeRule({ siteKey: "example.com", scope: "site" }),
      makeRule({ siteKey: "other.org", scope: "site" }),
    ];
    await reconcileRegistrations(rules, api);
    expect(api.unregisterContentScripts).toHaveBeenCalledWith({
      ids: expect.arrayContaining(["spl:stale.com", "spl:example.com"]),
    });
    expect(api.registerContentScripts).toHaveBeenCalledTimes(1);
    const ids = api.registerContentScripts.mock.calls[0]![0]!.map((s) => s.id);
    expect(ids.sort()).toEqual(["spl:example.com", "spl:other.org"]);
    expect(registered.has("spl:stale.com")).toBe(false);
    expect(registered.has("spl:example.com")).toBe(true);
    expect(registered.has("spl:other.org")).toBe(true);
  });
});

describe("reconcileRegistrations — getRegisteredContentScripts filter behavior", () => {
  it("calls getRegisteredContentScripts with no filter to observe existing registrations", async () => {
    // Chrome's getRegisteredContentScripts(filter?) is optional. Passing
    // { ids: [] } means "return scripts with id in this list" — an empty
    // list matches nothing, returning []. Passing no argument returns ALL
    // registered scripts. The reconciliation must call with no filter so
    // it can see existing spl: registrations and avoid duplicate-register.
    const { api } = createScriptingApi();
    const rule = makeRule({ siteKey: "example.com", scope: "site" });
    await reconcileRegistrations([rule], api);
    expect(api.getRegisteredContentScripts).toHaveBeenCalledWith();
  });

  it("observes and replaces an existing spl registration (no duplicate-register)", async () => {
    // Pre-register a script with our prefix, then reconcile with the same
    // rule. The reconciliation must SEE the existing registration (via
    // no-filter query), unregister it, then re-register. If it can't see
    // the existing registration (because it passed { ids: [] }), it would
    // attempt a duplicate registerContentScripts, which Chrome rejects.
    const { api, registered } = createScriptingApi();
    registered.set("spl:example.com", {
      id: "spl:example.com",
      matches: ["https://*.example.com/*"],
      js: ["content-scripts/content.js"],
    });
    const rule = makeRule({ siteKey: "example.com", scope: "site" });
    await reconcileRegistrations([rule], api);
    // The existing registration must have been unregistered.
    expect(api.unregisterContentScripts).toHaveBeenCalledWith({
      ids: ["spl:example.com"],
    });
    // And a fresh one registered (replacement, not duplicate).
    expect(api.registerContentScripts).toHaveBeenCalledTimes(1);
    expect(registered.get("spl:example.com")?.js).toEqual([
      "content-scripts/content.js",
    ]);
  });
});

describe("reconcileRegistrations — coexistence invariant", () => {
  it("include+exclude rules sharing a siteKey produce exactly one script in include-only mode", async () => {
    const { api, registered } = createScriptingApi();
    const include = makeRule({ siteKey: "example.com", ruleType: "include" });
    const exclude = makeRule({ siteKey: "example.com", ruleType: "exclude" });
    await reconcileRegistrations([include, exclude], api, "include-only");
    // Only the include rule gets a script; the exclude rule is ignored.
    expect(api.registerContentScripts).toHaveBeenCalledTimes(1);
    const script = api.registerContentScripts.mock.calls[0]![0]![0]!;
    expect(script.id).toBe("spl:example.com");
    expect(registered.size).toBe(1);
  });

  it("exclude-only mode with include+exclude rules produces one global script with excludeMatches", async () => {
    const { api, registered } = createScriptingApi();
    const include = makeRule({ siteKey: "example.com", ruleType: "include" });
    const exclude = makeRule({ siteKey: "bad.com", ruleType: "exclude" });
    await reconcileRegistrations([include, exclude], api, "exclude-only");
    expect(api.registerContentScripts).toHaveBeenCalledTimes(1);
    const script = api.registerContentScripts.mock.calls[0]![0]![0]!;
    expect(script.id).toBe("spl:__global__");
    expect(script.matches).toEqual(["http://*/*", "https://*/*"]);
    expect(script.excludeMatches).toEqual(expect.arrayContaining([
      "http://*.bad.com/*",
      "https://*.bad.com/*",
    ]));
    expect(registered.size).toBe(1);
  });
});
