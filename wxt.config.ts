import { defineConfig } from "wxt";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// WXT 0.21 manifest. Background, content-script, popup, and options
// entrypoints are auto-detected from the entrypoints/ directory. This config
// holds manifest-level fields, Vite build options, and hooks.
export default defineConfig({
  manifest: {
    name: "Blanksmith",
    description:
      "Open unwanted same-property target=_blank links in the current tab; preserve new tabs to independent properties.",
    version: "0.1.0",
    permissions: ["storage", "scripting", "activeTab"],
    // No required host permissions. Optional HTTP(S) origins are declared
    // here so chrome.permissions.request({ origins }) can request per-site
    // access at runtime from a popup user gesture. This declaration does NOT
    // grant access — the user must accept the site-specific Chrome prompt.
    // HTTP(S)-only: no <all_urls>, no chrome://, no file://.
    optional_host_permissions: ["http://*/*", "https://*/*"],
    // Extension icons — auto-discovered from public/icons/{size}.png by WXT.
    // Declared explicitly here for clarity and to guard against auto-discovery
    // changes. The SVG source is at design/icons/icon.svg (kept out of public/
    // so it is not shipped in the Store ZIP).
    // Sizes 16/32/48/128 per Chrome MV3 toolbar + extension icon guidance.
    icons: {
      "16": "icons/16.png",
      "32": "icons/32.png",
      "48": "icons/48.png",
      "128": "icons/128.png",
    },
  },
  // Disable Vite's modulepreload hints in built HTML. Chrome MV3 extension
  // pages load ES modules in an isolated world; Vite's modulepreload <link>
  // tags cause a "cross-world extension resource mismatch" warning in
  // chrome://extensions. The ES module imports still work without the
  // preload hint — it is an optimization, not a requirement.
  vite: () => ({
    build: {
      modulePreload: { polyfill: false },
    },
  }),
  // M1: Settings opens as a full page in a normal tab.
  // Also strip any remaining modulepreload <link> tags from built HTML
  // (belt-and-suspenders with the vite config above).
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      if (manifest.options_ui) {
        manifest.options_ui.open_in_tab = true;
      }
    },
    "build:done": (_wxt, _output) => {
      // Strip modulepreload <link> tags from built HTML files.
      const outDir = _wxt.config.outDir;
      for (const name of ["popup.html", "options.html"]) {
        const filePath = resolve(outDir, name);
        try {
          let html = readFileSync(filePath, "utf-8");
          const original = html;
          html = html.replace(
            /<link\s+rel=["']?modulepreload["']?\s+[^>]*>/gi,
            "",
          );
          if (html !== original) {
            writeFileSync(filePath, html);
          }
        } catch {
          // File may not exist in some build targets; skip.
        }
      }
    },
  },
});
