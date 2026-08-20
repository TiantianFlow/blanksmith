// WXT content-script entrypoint (isolated world).
//
// Installs the capture-phase click handler with a read-only rule provider.
// The content script NEVER sends a mutation message (UPSERT_RULE/REMOVE_RULE
// are UI-only — see background sender validation). It reads the active rule
// directly from chrome.storage.sync and refreshes on storage changes.
//
// This file is the WXT entrypoint that compiles to content-scripts/content.js,
// which the background's dynamic registration references.

import { installClickHandler } from "../src/content/click-handler";
import { findRuleForUrl, readRules, RULES_STORAGE_KEY } from "../src/storage/site-rules";
import { readPrefs, PREFS_STORAGE_KEY } from "../src/ui/prefs";
import type { GlobalMode } from "../src/domain/types";

export default defineContentScript({
  registration: "runtime",
  main() {
    let cachedRule: ReturnType<typeof findRuleForUrl> = undefined;
    let cachedMode: GlobalMode = "include-only";

    async function refreshRule(): Promise<void> {
      try {
        const [rules, prefs] = await Promise.all([
          readRules(chrome.storage.sync),
          readPrefs(chrome.storage.sync),
        ]);
        cachedMode = prefs.mode;
        cachedRule = findRuleForUrl(rules, location.href, cachedMode);
      } catch {
        cachedRule = undefined;
      }
    }

    void refreshRule();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync" && (RULES_STORAGE_KEY in changes || PREFS_STORAGE_KEY in changes)) {
        void refreshRule();
      }
    });

    installClickHandler(document, location, () => cachedRule ?? null);
  },
});
