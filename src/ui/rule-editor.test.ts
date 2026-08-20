import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

import { createRuleEditor } from "./rule-editor";
import type { SiteRule } from "../domain/types";
import type { Language } from "./messages";
function siteRule(overrides: Partial<SiteRule> = {}): SiteRule {
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

function setupDom() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
    url: "https://example.com/",
  });
  return { doc: dom.window.document, dom };
}

function win(doc: Document): Window & typeof globalThis {
  const w = doc.defaultView;
  if (!w) throw new Error("no defaultView");
  return w;
}

describe("createRuleEditor — renders localized fields", () => {
  it("shows destination boundary label and options in English", () => {
    const { doc } = setupDom();
    const editor = createRuleEditor(siteRule(), "en" as Language, {} as never, doc);
    expect(editor.textContent).toContain("Destination boundary");
    expect(editor.textContent).toContain("Same property");
    expect(editor.textContent).toContain("Exact same host");
  });

  it("shows destination boundary label and options in Chinese", () => {
    const { doc } = setupDom();
    const editor = createRuleEditor(siteRule(), "zh_CN" as Language, {} as never, doc);
    expect(editor.textContent).toContain("跳转范围");
    expect(editor.textContent).toContain("含子域名");
    expect(editor.textContent).toContain("同一地址");
  });

  it("shows external behavior label and options", () => {
    const { doc } = setupDom();
    const editor = createRuleEditor(siteRule(), "en" as Language, {} as never, doc);
    expect(editor.textContent).toContain("External link behavior");
    expect(editor.textContent).toContain("Preserve");
    expect(editor.textContent).toContain("Convert all");
  });

  it("shows the activation scope read-only with re-include hint", () => {
    const { doc } = setupDom();
    const editor = createRuleEditor(siteRule(), "en" as Language, {} as never, doc);
    const scopeSelect = editor.querySelector(".rule-scope") as HTMLSelectElement;
    expect(scopeSelect.disabled).toBe(true);
    expect(editor.textContent).toContain("re-include");
  });

  it("shows related domains section", () => {
    const { doc } = setupDom();
    const editor = createRuleEditor(siteRule(), "en" as Language, {} as never, doc);
    expect(editor.textContent).toContain("Related domains");
    expect(editor.textContent).toContain("example.org");
  });

  it("shows Save and Cancel buttons (no Close — Cancel is the single non-save action)", () => {
    const { doc } = setupDom();
    const editor = createRuleEditor(siteRule(), "en" as Language, {} as never, doc);
    expect(editor.textContent).toContain("Save");
    expect(editor.textContent).toContain("Cancel");
    // Close button removed — Cancel + Escape are the only non-save actions
    expect(editor.querySelector(".rule-close-btn")).toBeNull();
  });

  it("shows neutral examples, not presets", () => {
    const { doc } = setupDom();
    const editor = createRuleEditor(siteRule(), "en" as Language, {} as never, doc);
    // Examples use example.com/example.org, never prefilling real domains
    expect(editor.textContent).toContain("example.com");
    expect(editor.textContent).toContain("example.org");
  });

  it("applies the shared spl-select class to all selects for consistent styling", () => {
    const { doc } = setupDom();
    const editor = createRuleEditor(siteRule(), "en" as Language, {} as never, doc);
    const selects = editor.querySelectorAll("select");
    expect(selects.length).toBeGreaterThan(0);
    for (const sel of selects) {
      expect(sel.classList.contains("spl-select")).toBe(true);
    }
  });
});

function dispatchChange(doc: Document, el: Element): void {
  const w = win(doc);
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
}

describe("createRuleEditor — draft semantics", () => {
  it("changing boundary updates the draft but not the original rule", () => {
    const { doc } = setupDom();
    const original = siteRule({ boundary: "site" });
    const editor = createRuleEditor(original, "en" as Language, {} as never, doc);
    const boundarySel = editor.querySelector(".rule-boundary") as HTMLSelectElement;
    boundarySel.value = "host";
    dispatchChange(doc, boundarySel);
    // Original rule unchanged until Save
    expect(original.boundary).toBe("site");
  });

  it("Save persists the entire draft once", async () => {
    const { doc } = setupDom();
    const save = vi.fn(async () => {});
    const editor = createRuleEditor(siteRule({ boundary: "site" }), "en" as Language, { save } as never, doc);
    const boundarySel = editor.querySelector(".rule-boundary") as HTMLSelectElement;
    boundarySel.value = "host";
    dispatchChange(doc, boundarySel);
    const saveBtn = editor.querySelector(".rule-save-btn") as HTMLButtonElement;
    await saveBtn.click();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ boundary: "host" }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("Cancel does not persist", async () => {
    const { doc } = setupDom();
    const save = vi.fn(async () => {});
    const cancel = vi.fn();
    const original = siteRule({ boundary: "site" });
    const editor = createRuleEditor(original, "en" as Language, { save, cancel } as never, doc);
    const boundarySel = editor.querySelector(".rule-boundary") as HTMLSelectElement;
    boundarySel.value = "host";
    dispatchChange(doc, boundarySel);
    const cancelBtn = editor.querySelector(".rule-cancel-btn") as HTMLButtonElement;
    cancelBtn.click();
    expect(save).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("does not show a Close button (removed — Cancel is the single non-save action)", () => {
    const { doc } = setupDom();
    const editor = createRuleEditor(siteRule(), "en" as Language, {} as never, doc);
    expect(editor.querySelector(".rule-close-btn")).toBeNull();
  });

  it("shows enabled checkbox reflecting rule state", () => {
    const { doc } = setupDom();
    const editor = createRuleEditor(siteRule({ enabled: true }), "en" as Language, {} as never, doc);
    const enabledCb = editor.querySelector(".rule-enabled") as HTMLInputElement;
    expect(enabledCb.checked).toBe(true);
  });

  it("shows remove button visually separate from Save", () => {
    const { doc } = setupDom();
    const editor = createRuleEditor(siteRule(), "en" as Language, {} as never, doc);
    const removeBtn = editor.querySelector(".rule-remove-btn") as HTMLButtonElement;
    const saveBtn = editor.querySelector(".rule-save-btn") as HTMLButtonElement;
    expect(removeBtn).toBeTruthy();
    expect(saveBtn).toBeTruthy();
    expect(removeBtn).not.toBe(saveBtn);
  });

  it("adding a related domain normalizes and updates draft", () => {
    const { doc } = setupDom();
    const editor = createRuleEditor(siteRule(), "en" as Language, {} as never, doc);
    const input = editor.querySelector(".related-input") as HTMLInputElement;
    const addBtn = editor.querySelector(".related-add-btn") as HTMLButtonElement;
    input.value = "APP.Example.Org";
    addBtn.click();
    const list = editor.querySelector(".related-list") as HTMLUListElement;
    expect(list.textContent).toContain("example.org");
  });
});
