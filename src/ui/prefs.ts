// Versioned language-preference storage over chrome.storage.sync.
//
// Follows the same versioned-envelope pattern as site-rules.ts. Stores
// the user's language choice (en or zh_CN) for the popup and Settings UI.
// No network, no telemetry. The preference is a local user choice.

import { normalizeLanguage, type Language } from "./messages";
import type { GlobalMode } from "../domain/types";
import type { StorageArea } from "../storage/site-rules";

export const PREFS_STORAGE_KEY = "splPrefs";
export const PREFS_STORAGE_VERSION = 2;

export interface Prefs {
  language: Language;
  mode: GlobalMode;
}

interface StoredPrefsEnvelope {
  version: number;
  language: unknown;
  mode: unknown;
}

const DEFAULT_PREFS: Prefs = { language: "en", mode: "include-only" };

/** Normalize a mode value from storage; defaults to include-only. */
function normalizeMode(value: unknown): GlobalMode {
  return value === "exclude-only" ? "exclude-only" : "include-only";
}

/**
 * Read and validate preferences from storage.
 * Returns defaults when no prefs exist or the envelope is malformed.
 * Backward compat: v1 envelopes (language only) are accepted; mode
 * defaults to "include-only".
 */
export async function readPrefs(area?: StorageArea): Promise<Prefs> {
  const storage = area ?? defaultArea();
  const result = await storage.get(PREFS_STORAGE_KEY);
  const raw = result[PREFS_STORAGE_KEY];
  if (!isPrefsEnvelope(raw)) return { ...DEFAULT_PREFS };
  const prefs = {
    language: normalizeLanguage(raw.language),
    mode: normalizeMode(raw.mode),
  };
  // If we read a v1 envelope, persist the migrated v2 prefs.
  if (raw.version === 1) {
    await storage.set({
      [PREFS_STORAGE_KEY]: {
        version: PREFS_STORAGE_VERSION,
        language: prefs.language,
        mode: prefs.mode,
      } satisfies StoredPrefsEnvelope,
    });
  }
  return prefs;
}

/**
 * Write preferences to storage in a versioned envelope.
 */
export async function writePrefs(area: StorageArea | undefined, prefs: Prefs): Promise<void> {
  const storage = area ?? defaultArea();
  await storage.set({
    [PREFS_STORAGE_KEY]: {
      version: PREFS_STORAGE_VERSION,
      language: prefs.language,
      mode: prefs.mode,
    } satisfies StoredPrefsEnvelope,
  });
}

function defaultArea(): StorageArea {
  if (typeof chrome === "undefined" || !chrome.storage?.sync) {
    throw new Error("chrome.storage.sync is not available; pass a storage area.");
  }
  return chrome.storage.sync;
}

function isPrefsEnvelope(value: unknown): value is StoredPrefsEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.version === 1 || v.version === PREFS_STORAGE_VERSION;
}
