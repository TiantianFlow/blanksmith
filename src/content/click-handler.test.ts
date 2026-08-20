import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

import { installClickHandler } from "./click-handler";
import type { SiteRule } from "../domain/types";

// A standard site-scope rule for example.com: converts same-eTLD+1 links.
function exampleRule(overrides: Partial<SiteRule> = {}): SiteRule {
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

/**
 * Create a jsdom document at the given URL. Returns the document, a
 * location-like object (with a mocked assign), and helpers. The click handler
 * receives this location so we can assert assign() calls.
 */
function setupDom(url: string) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body></body></html>`, {
    url,
  });
  const doc = dom.window.document;
  // Build a location proxy: hostname from jsdom, assign mocked.
  const location = {
    href: url,
    hostname: new URL(url).hostname,
    assign: vi.fn(),
  };
  return { dom, doc, location };
}

/** Get the jsdom window, asserting it exists (it always does in our setup). */
function win(doc: Document): Window & typeof globalThis {
  const w = doc.defaultView;
  if (!w) throw new Error("no defaultView");
  return w;
}

function makeAnchor(
  doc: Document,
  href: string,
  opts: {
    target?: string;
    rel?: string;
    download?: boolean;
  } = {},
): HTMLAnchorElement {
  const a = doc.createElement("a");
  a.href = href;
  a.textContent = "link";
  if (opts.target !== undefined) a.setAttribute("target", opts.target);
  if (opts.rel !== undefined) a.setAttribute("rel", opts.rel);
  if (opts.download) a.setAttribute("download", "");
  doc.body.appendChild(a);
  return a;
}

function click(
  el: Element,
  opts: {
    button?: number;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  } = {},
): void {
  const win = el.ownerDocument.defaultView;
  if (!win) throw new Error("no defaultView for click");
  const event = new win.MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: opts.button ?? 0,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    altKey: opts.altKey ?? false,
  });
  el.dispatchEvent(event);
}

describe("installClickHandler — convert eligible same-property _blank clicks", () => {
  it("prevents default and calls location.assign for a same-property _blank click", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "https://app.example.com/other", { target: "_blank" });
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a);

    expect(preventSpy).toHaveBeenCalled();
    expect(location.assign).toHaveBeenCalledWith("https://app.example.com/other");
    expect(a.getAttribute("target")).toBe("_blank");
    teardown();
  });

  it("does not call location.assign for a cross-property _blank link", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "https://other.example/", { target: "_blank" });
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a);

    expect(preventSpy).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
    teardown();
  });
});

describe("installClickHandler — leave untouched links untouched", () => {
  it("leaves a rel=external _blank link untouched", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "https://app.example.com/x", { target: "_blank", rel: "external" });
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a);

    expect(preventSpy).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
    teardown();
  });

  it("leaves a download _blank link untouched", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "https://app.example.com/file.zip", { target: "_blank", download: true });
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a);

    expect(preventSpy).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
    teardown();
  });

  it("leaves a non-HTTP(S) _blank link untouched (mailto)", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "mailto:user@example.com", { target: "_blank" });
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a);

    expect(preventSpy).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
    teardown();
  });

  it("leaves an anchor without _blank untouched", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "https://app.example.com/x", { target: "_self" });
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a);

    expect(preventSpy).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
    teardown();
  });

  it("leaves a Ctrl-click untouched", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "https://app.example.com/x", { target: "_blank" });
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a, { ctrlKey: true });

    expect(preventSpy).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
    teardown();
  });

  it("leaves a middle-click untouched", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "https://app.example.com/x", { target: "_blank" });
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a, { button: 1 });

    expect(preventSpy).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
    teardown();
  });

  it("leaves a Shift-click untouched", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "https://app.example.com/x", { target: "_blank" });
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a, { shiftKey: true });

    expect(preventSpy).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
    teardown();
  });

  it("leaves an Alt-click untouched", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "https://app.example.com/x", { target: "_blank" });
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a, { altKey: true });

    expect(preventSpy).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
    teardown();
  });

  it("leaves a Cmd-click untouched", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "https://app.example.com/x", { target: "_blank" });
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a, { metaKey: true });

    expect(preventSpy).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
    teardown();
  });
});

describe("installClickHandler — base[target] and dynamic anchors", () => {
  it("converts a bare anchor (no own target) when base[target=_blank] applies", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const base = doc.createElement("base");
    base.setAttribute("target", "_blank");
    doc.head.appendChild(base);

    const a = makeAnchor(doc, "https://app.example.com/other");
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a);

    expect(preventSpy).toHaveBeenCalled();
    expect(location.assign).toHaveBeenCalledWith("https://app.example.com/other");
    expect(a.getAttribute("target")).toBeNull();
    teardown();
  });

  it("does not convert when base[target=_blank] but the anchor overrides with _self", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const base = doc.createElement("base");
    base.setAttribute("target", "_blank");
    doc.head.appendChild(base);

    const a = makeAnchor(doc, "https://app.example.com/other", { target: "_self" });
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a);

    expect(preventSpy).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
    teardown();
  });

  it("converts a dynamically added anchor after install", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "https://app.example.com/dynamic", { target: "_blank" });
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a);

    expect(preventSpy).toHaveBeenCalled();
    expect(location.assign).toHaveBeenCalledWith("https://app.example.com/dynamic");
    teardown();
  });
});

describe("installClickHandler — composed path lookup", () => {
  it("finds the anchor when a nested element is clicked (composed path)", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "https://app.example.com/nested", { target: "_blank" });
    const span = doc.createElement("span");
    span.textContent = "inner";
    a.appendChild(span);
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(span);

    expect(preventSpy).toHaveBeenCalled();
    expect(location.assign).toHaveBeenCalledWith("https://app.example.com/nested");
    teardown();
  });
});

describe("installClickHandler — area[href] elements", () => {
  it("converts an area[href] _blank click (same property)", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const area = doc.createElement("area");
    area.href = "https://app.example.com/region";
    area.setAttribute("target", "_blank");
    // An <area> needs a parent <map> to be valid, but jsdom resolves href
    // regardless. Append it to body so it participates in the document.
    const map = doc.createElement("map");
    map.setAttribute("name", "testmap");
    map.appendChild(area);
    doc.body.appendChild(map);

    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(area);

    expect(preventSpy).toHaveBeenCalled();
    expect(location.assign).toHaveBeenCalledWith("https://app.example.com/region");
    // Never mutates the target attribute.
    expect(area.getAttribute("target")).toBe("_blank");
    teardown();
  });
});

describe("installClickHandler — never mutates target attribute", () => {
  it("does not add, remove, or change target on a converted anchor", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "https://app.example.com/x", { target: "_blank" });
    click(a);
    expect(a.getAttribute("target")).toBe("_blank");
    teardown();
  });

  it("does not add a target to a bare anchor converted via base[target]", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const base = doc.createElement("base");
    base.setAttribute("target", "_blank");
    doc.head.appendChild(base);

    const a = makeAnchor(doc, "https://app.example.com/x");
    click(a);
    expect(a.getAttribute("target")).toBeNull();
    teardown();
  });
});

describe("installClickHandler — no active rule", () => {
  it("leaves _blank clicks untouched when no rule is active", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => null);
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "https://app.example.com/x", { target: "_blank" });
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a);

    expect(preventSpy).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
    teardown();
  });

  it("leaves _blank clicks untouched when the rule is disabled", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule({ enabled: false }));
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "https://app.example.com/x", { target: "_blank" });
    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a);

    expect(preventSpy).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
    teardown();
  });
});

describe("installClickHandler — teardown", () => {
  it("returns a teardown function that removes the listener", () => {
    const { doc, location } = setupDom("https://news.example.com/page");
    const getRule = vi.fn(() => exampleRule());
    const teardown = installClickHandler(doc, location as unknown as Location, getRule);

    const a = makeAnchor(doc, "https://app.example.com/x", { target: "_blank" });
    teardown();

    const preventSpy = vi.spyOn(win(doc).MouseEvent.prototype, "preventDefault");
    click(a);
    expect(preventSpy).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
  });
});
