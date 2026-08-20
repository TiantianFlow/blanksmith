// WXT background service worker entrypoint.
//
// Wires the pure message handler to real chrome APIs: chrome.storage.sync for
// rule persistence, chrome.scripting for dynamic content-script registration,
// and chrome.permissions for the optional-host lifecycle. On install/start and
// on any permission or storage change, registrations are reconciled so the set
// of injected content scripts always matches the enabled, granted rules.
//
// Permissions stay minimal: storage, scripting, activeTab are required; host
// permissions are optional and HTTP(S)-only, requested per-site from a popup
// user gesture (Task 5). No tabs, webNavigation, <all_urls>, or remote code.

import { createMessageHandler, type BackgroundRequest, type BackgroundResponse } from "../src/background/messages";
import { SyncCoordinator } from "../src/background/sync-coordinator";
import { readPrefs, PREFS_STORAGE_KEY } from "../src/ui/prefs";

export default defineBackground(() => {
  const storage = chrome.storage.sync;
  const scripting = {
    registerContentScripts: (scripts: chrome.scripting.RegisteredContentScript[]) =>
      chrome.scripting.registerContentScripts(scripts),
    unregisterContentScripts: (params: { ids: string[] }) =>
      chrome.scripting.unregisterContentScripts(params),
    getRegisteredContentScripts: () =>
      chrome.scripting.getRegisteredContentScripts(),
  };

  const coordinator = new SyncCoordinator(storage, scripting, {
    contains: (origins: string[]) => chrome.permissions.contains({ origins }),
  });

  // Read mode from prefs on startup and whenever prefs change.
  async function syncMode(): Promise<void> {
    try {
      const prefs = await readPrefs(storage);
      coordinator.setMode(prefs.mode);
    } catch {
      // Defaults to include-only if prefs can't be read.
    }
    void coordinator.enqueue(false);
  }

  const handle = createMessageHandler({ storage, scripting, coordinator });

  void syncMode();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync") {
      if ("splRules" in changes) {
        void coordinator.enqueue(false);
      }
      if (PREFS_STORAGE_KEY in changes) {
        void syncMode();
      }
    }
  });

  chrome.permissions.onAdded.addListener(() => void coordinator.enqueue(false));
  chrome.permissions.onRemoved.addListener(() => void coordinator.enqueue(false));

  chrome.runtime.onMessage.addListener((request: BackgroundRequest, sender, sendResponse) => {
    handle(request, sender)
      .then((response: BackgroundResponse) => sendResponse(response))
      .catch((error) => {
        console.error("[spl] background message error:", error);
        sendResponse({ error: String(error) });
      });
    return true;
  });
});
