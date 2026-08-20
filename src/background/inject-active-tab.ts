// Immediate activation seam: inject the content script into the already-open
// active tab after a successful Include.
//
// Dynamic content-script registration (chrome.scripting.registerContentScripts)
// only affects future navigations — the already-open page has no click handler
// until reload. This seam bridges that gap by calling
// chrome.scripting.executeScript from the popup's direct user gesture, using
// activeTab + the user-granted optional origin (no new permissions needed).
//
// The function is pure over an injectable executeScript surface so it is
// unit-testable without a browser. The popup entrypoint wires the real
// chrome.scripting.executeScript.

/** The subset of chrome.scripting.executeScript needed by this seam.
 *  Typed loosely so it is testable with plain mocks; the real Chrome API
 *  is structurally compatible. */
export interface ExecuteScriptInjection {
  target: { tabId: number; allFrames?: boolean };
  files: string[];
  world?: "ISOLATED" | "MAIN";
  injectImmediately?: boolean;
}

export type ExecuteScriptFn = (
  injection: ExecuteScriptInjection,
) => Promise<unknown[]>;

/** The content-script file path, matching the WXT build output and the
 *  dynamic registration's CONTENT_SCRIPT_FILE. */
const CONTENT_SCRIPT_FILE = "content-scripts/content.js";

/**
 * Inject the content script into the active tab for immediate activation.
 *
 * @param tabId The active tab id (from chrome.tabs.query in the popup).
 * @param executeScript The chrome.scripting.executeScript function.
 * @throws Error if tabId is invalid or executeScript fails.
 */
export async function injectContentScriptIntoTab(
  tabId: number,
  executeScript: ExecuteScriptFn,
): Promise<void> {
  if (tabId < 0) {
    throw new Error("Cannot inject: invalid tab id.");
  }

  await executeScript({
    target: { tabId, allFrames: false },
    files: [CONTENT_SCRIPT_FILE],
    world: "ISOLATED",
    injectImmediately: true,
  });
}
