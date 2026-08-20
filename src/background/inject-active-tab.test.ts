import { describe, expect, it, vi } from "vitest";

import { injectContentScriptIntoTab, type ExecuteScriptInjection } from "./inject-active-tab";

describe("injectContentScriptIntoTab — immediate activation seam", () => {
  it("calls executeScript with the content script file and the correct tab target", async () => {
    const executeScript = vi.fn(async (_injection: ExecuteScriptInjection) => []);
    await injectContentScriptIntoTab(42, executeScript);

    expect(executeScript).toHaveBeenCalledTimes(1);
    const call = executeScript.mock.calls[0]![0]!;
    expect(call.files).toEqual(["content-scripts/content.js"]);
    expect(call.target).toEqual({ tabId: 42, allFrames: false });
    expect(call.world).toBe("ISOLATED");
    expect(call.injectImmediately).toBe(true);
  });

  it("propagates an executeScript error so the popup can show it", async () => {
    const executeScript = vi.fn(async (_injection: ExecuteScriptInjection) => {
      throw new Error("Cannot inject into tab");
    });
    await expect(injectContentScriptIntoTab(99, executeScript)).rejects.toThrow(
      /Cannot inject into tab/,
    );
  });

  it("does not call executeScript for an invalid tab id", async () => {
    const executeScript = vi.fn(async (_injection: ExecuteScriptInjection) => []);
    await expect(injectContentScriptIntoTab(-1, executeScript)).rejects.toThrow(
      /invalid tab id/,
    );
    expect(executeScript).not.toHaveBeenCalled();
  });
});
