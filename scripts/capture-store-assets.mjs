// Capture Chrome Web Store artwork for Blanksmith from the REAL built MV3 UI.
//
// Approach (modeled on ai-limits):
//   1. `pnpm build` produces .output/chrome-mv3/ (real popup/options HTML,
//      CSS, JS, icons).
//   2. A tiny static server serves the build directory over HTTP.
//   3. Playwright (system Chrome, headless) navigates to popup.html or
//      options.html. A controlled chrome.* fixture adapter — seeded with
//      SYNTHETIC fixture state — is injected via addInitScript BEFORE the
//      page scripts run, so the production built UI renders against fixture
//      rules/prefs/active-tab. No mocked UI or production DOM is substituted;
//      no real profile, browsing data, or credentials are used.
//   4. The real rendered DOM is asserted (expected state + button visibility),
//      a branded presentation backdrop is applied, and a screenshot is taken
//      at the exact CWS dimensions.
//   5. The 440x280 promo tile and 1280x640 social preview are composed from
//      the product icon + typography (brand graphics, not UI screenshots).
//
// Run: pnpm assets:store
// Env: BLANKSMITH_CHROME_PATH (defaults to system Chrome on macOS).

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";
import { PNG } from "pngjs";

import {
  CAPTURE_FIXED_CLOCK,
  CAPTURE_TIMEZONE,
  buildCaptureMatrix,
  sha256,
} from "./store-assets-contract.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const buildDir = path.join(repositoryRoot, ".output", "chrome-mv3");
const storeDir = path.join(repositoryRoot, "store-assets");
const defaultChromePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromePath = process.env.BLANKSMITH_CHROME_PATH || defaultChromePath;

// --- Static file server for the built extension --------------------------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function startStaticServer(root) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const reqPath = decodeURIComponent(
          new URL(req.url, "http://localhost").pathname,
        );
        // Prevent path escape.
        const resolved = path.resolve(root, "." + reqPath);
        const rel = path.relative(root, resolved);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        const buffer = await readFile(resolved);
        res.writeHead(200, {
          "Content-Type": MIME[path.extname(resolved)] ?? "application/octet-stream",
        });
        res.end(buffer);
      } catch (error) {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

// --- Controlled chrome.* fixture adapter (injected before page scripts) --

/**
 * Installed via page.addInitScript with the fixture payload as its argument.
 * Seeds chrome.storage.sync with the fixture envelopes and answers
 * runtime/tabs/permissions/scripting calls the popup/options make at render
 * time. This is a controlled fixture adapter for the chrome.* surface — the
 * production built UI HTML/CSS/JS runs unmodified; only the chrome API
 * environment is seeded with synthetic state. No real profile, browsing data,
 * or credentials are used.
 */
function installChromeFixtureAdapter(payload) {
  const storage = new Map(Object.entries(payload.storage || {}));
  const changeListeners = new Set();
  const fireChanges = (changes, areaName) => {
    for (const fn of changeListeners) {
      try {
        fn(changes, areaName);
      } catch {
        /* listener errors are ignored, mirroring chrome behavior */
      }
    }
  };

  const sync = {
    get: async (keys) => {
      const keyList =
        keys == null
          ? [...storage.keys()]
          : Array.isArray(keys)
            ? keys
            : [keys];
      const out = {};
      for (const k of keyList) {
        if (storage.has(k)) out[k] = storage.get(k);
      }
      return out;
    },
    set: async (items) => {
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: storage.get(k), newValue: v };
        storage.set(k, v);
      }
      fireChanges(changes, "sync");
    },
    remove: async (keys) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      const changes = {};
      for (const k of keyList) {
        if (storage.has(k)) {
          changes[k] = { oldValue: storage.get(k), newValue: undefined };
          storage.delete(k);
        }
      }
      fireChanges(changes, "sync");
    },
  };
  sync.onChanged = {
    addListener: (fn) => changeListeners.add(fn),
    removeListener: (fn) => changeListeners.delete(fn),
    hasListener: (fn) => changeListeners.has(fn),
    hasListeners: () => changeListeners.size > 0,
  };

  const currentRules = () => {
    const env = storage.get("splRules");
    return env && Array.isArray(env.rules) ? env.rules : [];
  };
  const setRules = (rules) => storage.set("splRules", { version: 2, rules });
  const upsertRule = (rule) => {
    const rules = currentRules();
    const idx = rules.findIndex(
      (r) => r.siteKey === rule.siteKey && r.ruleType === rule.ruleType,
    );
    if (idx >= 0) rules[idx] = rule;
    else rules.push(rule);
    setRules(rules);
    return currentRules();
  };
  const removeRule = (siteKey, ruleType) => {
    setRules(
      currentRules().filter(
        (r) => !(r.siteKey === siteKey && r.ruleType === ruleType),
      ),
    );
    return currentRules();
  };

  const runtime = {
    id: "blanksmithcapture",
    getURL: (p) => new URL(p, location.origin + "/").href,
    sendMessage: async (req) => {
      if (req.type === "GET_RULES") return { rules: currentRules() };
      if (req.type === "UPSERT_RULE") return { rules: upsertRule(req.rule) };
      if (req.type === "REMOVE_RULE")
        return { rules: removeRule(req.siteKey, req.ruleType) };
      if (req.type === "FIND_RULE_FOR_TAB") return { rule: null };
      return {};
    },
    openOptionsPage: () => {},
    onMessage: { addListener: () => {}, removeListener: () => {} },
  };
  Object.defineProperty(runtime, "lastError", {
    get: () => undefined,
    configurable: true,
  });

  const tabs = {
    query: async (q) => {
      if (q && q.active === true && q.currentWindow === true) {
        return [
          {
            id: 1,
            index: 0,
            pendingUrl: null,
            url: payload.tabUrl,
            title: "Example",
            windowId: 1,
            active: true,
            highlighted: true,
          },
        ];
      }
      return [];
    },
  };

  const permissions = {
    request: async () => true,
    contains: async () => true,
    remove: async () => true,
    onAdded: { addListener: () => {} },
    onRemoved: { addListener: () => {} },
  };

  const scripting = {
    executeScript: async () => [],
    registerContentScripts: async () => {},
    unregisterContentScripts: async () => {},
    getRegisteredContentScripts: async () => [],
  };

  const i18n = {
    getMessage: (k) => k,
    getUILanguage: () => "en",
  };

  window.chrome = {
    storage: { sync, local: sync, onChanged: sync.onChanged },
    runtime,
    tabs,
    permissions,
    scripting,
    i18n,
  };
}

// --- Presentation backdrops (preview-only, not shipped) ------------------

const POPUP_BACKDROP = `
  html, body { width: 100% !important; min-height: 100vh !important; margin: 0 !important; }
  body {
    background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #3b82f6 100%) !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
  }
  main#popup {
    width: 320px !important; background: #ffffff !important;
    border-radius: 16px !important; padding: 18px !important;
    box-shadow: 0 24px 70px rgba(0,0,0,0.40) !important;
  }
`;

const OPTIONS_BACKDROP = `
  body { background: linear-gradient(180deg, #eff6ff 0%, #ffffff 40%) !important; }
  main#settings {
    background: #ffffff; border: 1px solid #e5e7eb; border-radius: 14px;
    margin-top: 32px; box-shadow: 0 18px 50px rgba(37,99,235,0.12);
  }
`;

// --- Per-view DOM assertions (real rendered state) -----------------------

async function assertPopupState(page, view, locale) {
  // Wait for the init async chain (readPrefs -> tabs.query -> GET_RULES ->
  // render) to finish: the scope summary is populated and no longer shows the
  // localized "Loading" placeholder.
  await page.waitForFunction(() => {
    const el = document.getElementById("scope-summary");
    const text = el && el.textContent ? el.textContent.trim() : "";
    return text.length > 0 && !text.includes("Loading") && !text.includes("…");
  });

  const summary = (await page.locator("#scope-summary").textContent()) ?? "";
  const includeVisible = await page.locator("#include-btn").isVisible();
  const excludeVisible = await page.locator("#exclude-btn").isVisible();

  if (view === "include") {
    if (!includeVisible)
      throw new Error("include capture: Include button not visible.");
    if (!summary.includes("example.com"))
      throw new Error(`include capture: unexpected summary "${summary}".`);
  } else if (view === "enabled") {
    if (!excludeVisible)
      throw new Error("enabled capture: Exclude button not visible.");
    if (!summary.includes("example.com"))
      throw new Error(`enabled capture: unexpected summary "${summary}".`);
  } else if (view === "global-mode") {
    const mode = await page.locator("#mode-select").inputValue();
    if (mode !== "exclude-only")
      throw new Error(`global-mode capture: mode selector is "${mode}".`);
    if (!excludeVisible)
      throw new Error("global-mode capture: Exclude button not visible.");
    if (locale === "en" && !summary.includes("Active on all sites"))
      throw new Error(`global-mode capture: unexpected summary "${summary}".`);
  }
}

async function assertOptionsState(page, _view, _locale) {
  await page.locator(".rule-summary-row").first().waitFor({ state: "visible" });
  const rows = await page.locator(".rule-summary-row").count();
  if (rows < 2)
    throw new Error(`settings capture: expected >=2 rule rows, got ${rows}.`);
}

// --- Brand graphics (promo tile + social preview, not UI screenshots) ----

async function captureBrandGraphic(page, view, assetPath, viewport) {
  const iconPath = path.join(repositoryRoot, "public", "icons", "128.png");
  const iconBytes = await readFile(iconPath);
  const iconDataUrl = `data:image/png;base64,${iconBytes.toString("base64")}`;

  // Scale the layout proportionally to the viewport.
  const scale = viewport.width / 440;
  const iconSize = Math.round(120 * scale);
  const iconMargin = Math.round(28 * scale);
  const iconRadius = Math.round(24 * scale);
  const gap = Math.round(22 * scale);
  const nameSize = Math.round(44 * scale);
  const tagSize = Math.round(17 * scale);
  const tagMaxWidth = Math.round(250 * scale);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${viewport.width}px; height: ${viewport.height}px; }
  body {
    width: ${viewport.width}px; height: ${viewport.height}px; overflow: hidden;
    background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #3b82f6 100%);
    display: flex; align-items: center; gap: ${gap}px;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #ffffff;
  }
  .mark {
    width: ${iconSize}px; height: ${iconSize}px; flex: 0 0 ${iconSize}px;
    margin-left: ${iconMargin}px;
    border-radius: ${iconRadius}px; background: #2563eb;
    box-shadow: 0 ${Math.round(14 * scale)}px ${Math.round(36 * scale)}px rgba(0,0,0,0.35);
    display: flex; align-items: center; justify-content: center;
  }
  .mark img { width: ${iconSize}px; height: ${iconSize}px; display: block; }
  .copy { display: flex; flex-direction: column; gap: ${Math.round(8 * scale)}px; }
  .name { font-size: ${nameSize}px; font-weight: 800; letter-spacing: -${Math.round(0.5 * scale)}px; }
  .tag {
    font-size: ${tagSize}px; font-weight: 500; color: #dbeafe;
    max-width: ${tagMaxWidth}px; line-height: 1.35;
  }
</style>
</head>
<body>
  <div class="mark"><img src="${iconDataUrl}" alt="Blanksmith icon" /></div>
  <div class="copy">
    <div class="name">Blanksmith</div>
    <div class="tag">Open same-site _blank links in the current tab. Keep new tabs for everywhere else.</div>
  </div>
</body>
</html>`;

  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  const buffer = await page.screenshot({
    path: assetPath,
    clip: { x: 0, y: 0, width: viewport.width, height: viewport.height },
    animations: "disabled",
  });
  return buffer;
}

// --- Main ----------------------------------------------------------------

let browser;
let server;

try {
  await access(chromePath);
  await access(path.join(buildDir, "popup.html"));
  const captures = buildCaptureMatrix();

  server = await startStaticServer(buildDir);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  browser = await chromium.launch({ executablePath: chromePath, headless: true });

  const manifest = {
    schemaVersion: 1,
    dataSource: "fixture",
    fixedClock: CAPTURE_FIXED_CLOCK,
    generatedBy: "scripts/capture-store-assets.mjs",
    captures: [],
  };

  for (const capture of captures) {
    const assetPath = path.join(storeDir, capture.relativePath);
    await mkdir(path.dirname(assetPath), { recursive: true });

    const context = await browser.newContext({
      viewport: capture.viewport,
      locale: capture.locale === "zh_CN" ? "zh-CN" : "en-US",
      timezoneId: CAPTURE_TIMEZONE,
      colorScheme: "light",
      reducedMotion: "reduce",
      deviceScaleFactor: 1,
    });

    try {
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      if (capture.surface === "promo") {
        const buffer = await captureBrandGraphic(page, capture.view, assetPath, capture.viewport);
        const png = PNG.sync.read(buffer, { checkCRC: true });
        manifest.captures.push({
          id: capture.id,
          view: capture.view,
          locale: capture.locale,
          path: capture.relativePath,
          sha256: sha256(buffer),
          dimensions: { width: png.width, height: png.height },
          dataSource: capture.dataSource,
        });
        if (pageErrors.length > 0)
          throw new Error(`promo page errors: ${pageErrors.join("; ")}`);
        console.log(`captured ${capture.relativePath}`);
        continue;
      }

      // Inject the chrome mock with fixture payload before page scripts run.
      const payload = { storage: capture.fixture, tabUrl: capture.tabUrl };
      await page.addInitScript(installChromeFixtureAdapter, payload);

      await page.goto(`${base}${capture.pagePath}`, { waitUntil: "load" });

      // Wait for fonts + the real UI to render the expected state.
      await page.evaluate(() => document.fonts.ready);
      if (capture.surface === "popup") {
        await assertPopupState(page, capture.view, capture.locale);
        await page.addStyleTag({ content: POPUP_BACKDROP });
      } else {
        await assertOptionsState(page, capture.view, capture.locale);
        await page.addStyleTag({ content: OPTIONS_BACKDROP });
      }

      if (pageErrors.length > 0)
        throw new Error(`${capture.id} page errors: ${pageErrors.join("; ")}`);

      await page.mouse.move(0, 0);
      const buffer = await page.screenshot({
        path: assetPath,
        clip: {
          x: 0,
          y: 0,
          width: capture.viewport.width,
          height: capture.viewport.height,
        },
        animations: "disabled",
        caret: "hide",
      });
      const png = PNG.sync.read(buffer, { checkCRC: true });
      manifest.captures.push({
        id: capture.id,
        view: capture.view,
        locale: capture.locale,
        path: capture.relativePath,
        sha256: sha256(buffer),
        dimensions: { width: png.width, height: png.height },
        dataSource: capture.dataSource,
      });
      console.log(`captured ${capture.relativePath}`);
    } finally {
      await context.close();
    }
  }

  manifest.captures.sort((a, b) => a.path.localeCompare(b.path));
  await writeFile(
    path.join(storeDir, "capture-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(`\nWrote ${manifest.captures.length} assets + capture-manifest.json`);
} finally {
  await browser?.close();
  server?.close();
}
