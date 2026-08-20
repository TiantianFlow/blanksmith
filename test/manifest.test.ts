import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

// Acceptance invariant: the built manifest must have exactly the minimal
// permissions, no static content_scripts, and no required host_permissions.
// This guards against accidental scope creep and verifies the extension loads
// cleanly as an unpacked MV3 extension (acceptance criterion 1 and 11).
// Also verifies the built HTML has no modulepreload links that trigger
// Chrome's "cross-world extension resource mismatch" warning.

const manifestPath = resolve(".output/chrome-mv3/manifest.json");
const popupHtmlPath = resolve(".output/chrome-mv3/popup.html");
const optionsHtmlPath = resolve(".output/chrome-mv3/options.html");

function readManifest(): Record<string, unknown> {
  const raw = readFileSync(manifestPath, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function readHtml(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("built manifest invariants (acceptance criteria 1, 11)", () => {
  const manifest = readManifest();

  it("is Manifest V3", () => {
    expect(manifest["manifest_version"]).toBe(3);
  });

  it("has exactly the minimal required permissions", () => {
    expect(manifest["permissions"]).toEqual([
      "storage",
      "scripting",
      "activeTab",
    ]);
  });

  it("has no tabs permission", () => {
    const perms = manifest["permissions"] as string[];
    expect(perms).not.toContain("tabs");
  });

  it("has no webNavigation permission", () => {
    const perms = manifest["permissions"] as string[];
    expect(perms).not.toContain("webNavigation");
  });

  it("has no required host_permissions", () => {
    expect(manifest["host_permissions"]).toBeUndefined();
  });

  it("declares optional HTTP(S) host permissions for runtime per-site requests", () => {
    // chrome.permissions.request({ origins }) requires origins to be pre-declared
    // in optional_host_permissions (MV3). Without this declaration, Chrome rejects
    // every per-site permission request before a user prompt — the root cause of
    // the bilibili.com "Permission denied" bug.
    expect(manifest["optional_host_permissions"]).toBeDefined();
    const optional = manifest["optional_host_permissions"] as string[];
    expect(optional.length).toBeGreaterThan(0);
    // Every declared optional origin must be HTTP(S)-only (no <all_urls>, no
    // chrome://, no file://, no *://).
    for (const o of optional) {
      expect(o.startsWith("http://") || o.startsWith("https://")).toBe(true);
    }
  });

  it("does not declare <all_urls> in optional_host_permissions", () => {
    const optional = manifest["optional_host_permissions"] as string[] | undefined;
    if (optional) {
      expect(optional).not.toContain("<all_urls>");
    }
  });

  it("has no static content_scripts entry (runtime registration only)", () => {
    expect(manifest["content_scripts"]).toBeUndefined();
  });

  it("has a background service worker", () => {
    expect(manifest["background"]).toBeDefined();
    const bg = manifest["background"] as Record<string, unknown>;
    expect(bg["service_worker"]).toBe("background.js");
  });

  it("has an action with a default popup", () => {
    expect(manifest["action"]).toBeDefined();
    const action = manifest["action"] as Record<string, unknown>;
    expect(action["default_popup"]).toBe("popup.html");
  });

  it("has the correct product name in the manifest", () => {
    expect(manifest["name"]).toBe("Blanksmith");
  });

  it("has extension icons at 16, 32, 48, and 128 pixels", () => {
    const icons = manifest["icons"] as Record<string, string> | undefined;
    expect(icons).toBeDefined();
    expect(icons!["16"]).toBeDefined();
    expect(icons!["32"]).toBeDefined();
    expect(icons!["48"]).toBeDefined();
    expect(icons!["128"]).toBeDefined();
  });

  it("has a toolbar action default_icon with 16, 32, 48, and 128", () => {
    const action = manifest["action"] as Record<string, unknown>;
    const defaultIcon = action["default_icon"] as Record<string, string> | undefined;
    expect(defaultIcon).toBeDefined();
    expect(defaultIcon!["16"]).toBeDefined();
    expect(defaultIcon!["32"]).toBeDefined();
    expect(defaultIcon!["48"]).toBeDefined();
    expect(defaultIcon!["128"]).toBeDefined();
  });

  it("opens options in a full tab", () => {
    const optionsUi = manifest["options_ui"] as Record<string, unknown>;
    expect(optionsUi["open_in_tab"]).toBe(true);
    expect(optionsUi["page"]).toBe("options.html");
  });

  it("does not use default_locale (custom language toggle, not Chrome native i18n)", () => {
    expect(manifest["default_locale"]).toBeUndefined();
  });
});

describe("built HTML has no modulepreload links (cross-world mismatch fix)", () => {
  it("popup.html has no modulepreload link tags", () => {
    const html = readHtml(popupHtmlPath);
    expect(html).not.toMatch(/rel=["']?modulepreload["']?/i);
  });

  it("options.html has no modulepreload link tags", () => {
    const html = readHtml(optionsHtmlPath);
    expect(html).not.toMatch(/rel=["']?modulepreload["']?/i);
  });
});

describe("built HTML fallback titles are English (sensible first paint)", () => {
  it("popup.html title is English, not Chinese", () => {
    const html = readHtml(popupHtmlPath);
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    expect(titleMatch).toBeTruthy();
    expect(titleMatch![1]).toBe("Blanksmith");
  });

  it("options.html title is English, not Chinese", () => {
    const html = readHtml(optionsHtmlPath);
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    expect(titleMatch).toBeTruthy();
    expect(titleMatch![1]).toBe("Blanksmith — Settings");
  });

  it("popup.html h1 is English, not Chinese", () => {
    const html = readHtml(popupHtmlPath);
    const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
    expect(h1Match).toBeTruthy();
    expect(h1Match![1]).toBe("Blanksmith");
  });

  it("options.html h1 is English, not Chinese", () => {
    const html = readHtml(optionsHtmlPath);
    const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
    expect(h1Match).toBeTruthy();
    expect(h1Match![1]).toBe("Blanksmith — Settings");
  });
});

describe("dialog centering — CSS does not break native dialog margin auto", () => {
  it("built options CSS restores margin auto on dialog", () => {
    const cssDir = resolve(".output/chrome-mv3/assets");
    const cssFiles = readdirSync(cssDir).filter((f: string) => f.endsWith(".css"));
    const allCss = cssFiles.map((f: string) => readFileSync(resolve(cssDir, f), "utf-8")).join("\n");
    // The universal * { margin: 0 } reset strips native dialog centering.
    // The dialog must have an explicit margin: auto to restore centering.
    expect(allCss).toMatch(/dialog[^{]*\{[^}]*margin:\s*auto/i);
  });
});

describe("extension icons — PNG files exist in built output", () => {
  const outDir = resolve(".output/chrome-mv3");
  const sizes = [16, 32, 48, 128];

  for (const size of sizes) {
    it(`icons/${size}.png exists, is a PNG, and is ${size}×${size}`, () => {
      const iconPath = resolve(outDir, "icons", `${size}.png`);
      expect(existsSync(iconPath)).toBe(true);
      const stat = statSync(iconPath);
      expect(stat.size).toBeGreaterThan(100); // not an empty/placeholder file
      // Check PNG magic bytes
      const buf = readFileSync(iconPath);
      expect(buf[0]).toBe(0x89);
      expect(buf[1]).toBe(0x50); // 'P'
      expect(buf[2]).toBe(0x4e); // 'N'
      expect(buf[3]).toBe(0x47); // 'G'
      // Parse IHDR chunk: width = bytes 16-19, height = bytes 20-23 (big-endian).
      // PNG layout: 8-byte signature, then IHDR chunk: 4-byte length, 4-byte "IHDR",
      // 4-byte width, 4-byte height, ...
      const width = (buf[16]! << 24) | (buf[17]! << 16) | (buf[18]! << 8) | buf[19]!;
      const height = (buf[20]! << 24) | (buf[21]! << 16) | (buf[22]! << 8) | buf[23]!;
      expect(width).toBe(size);
      expect(height).toBe(size);
    });
  }
});
