import { describe, expect, it, vi } from "vitest";

import { readPrefs, writePrefs, PREFS_STORAGE_KEY, PREFS_STORAGE_VERSION } from "./prefs";
import type { Language } from "./messages";

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

describe("readPrefs — default and validation", () => {
  it("returns default en when no prefs are stored", async () => {
    const { area } = createStorageArea();
    const prefs = await readPrefs(area);
    expect(prefs.language).toBe("en");
  });

  it("returns stored zh_CN preference", async () => {
    const { area, store } = createStorageArea();
    store.set(PREFS_STORAGE_KEY, { version: 1, language: "zh_CN" });
    const prefs = await readPrefs(area);
    expect(prefs.language).toBe("zh_CN");
    expect(prefs.mode).toBe("include-only");
  });

  it("falls back to en for an invalid language value", async () => {
    const { area, store } = createStorageArea();
    store.set(PREFS_STORAGE_KEY, { version: 1, language: "fr" });
    const prefs = await readPrefs(area);
    expect(prefs.language).toBe("en");
  });

  it("falls back to en for a malformed envelope", async () => {
    const { area, store } = createStorageArea();
    store.set(PREFS_STORAGE_KEY, { version: 1, garbage: true });
    const prefs = await readPrefs(area);
    expect(prefs.language).toBe("en");
  });

  it("falls back to en for a version mismatch", async () => {
    const { area, store } = createStorageArea();
    store.set(PREFS_STORAGE_KEY, { version: 99, language: "zh_CN" });
    const prefs = await readPrefs(area);
    expect(prefs.language).toBe("en");
  });
});

describe("writePrefs — persistence", () => {
  it("writes a versioned envelope with the language", async () => {
    const { area, store } = createStorageArea();
    await writePrefs(area, { language: "zh_CN", mode: "include-only" });
    const raw = store.get(PREFS_STORAGE_KEY) as { version: number; language: Language };
    expect(raw.version).toBe(PREFS_STORAGE_VERSION);
    expect(raw.language).toBe("zh_CN");
  });

  it("round-trips write then read", async () => {
    const { area } = createStorageArea();
    await writePrefs(area, { language: "zh_CN", mode: "include-only" });
    const prefs = await readPrefs(area);
    expect(prefs.language).toBe("zh_CN");
    expect(prefs.mode).toBe("include-only");
  });
});
