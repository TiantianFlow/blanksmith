// Store-asset contract for Blanksmith.
//
// Defines the deterministic capture matrix (real built UI driven by synthetic
// fixture state), the required asset dimensions, and PNG chunk hygiene
// validators. Modeled on the ai-limits store-assets contract.
//
// Screenshots are captured from the ACTUAL built MV3 popup/options UI loaded
// over a local static server, with a controlled chrome.* fixture adapter
// seeded by the fixture data below. No mocked UI or production DOM is
// substituted; no real browsing/profile data or credentials are used.

import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import { PNG } from "pngjs";

// --- Fixed clock / locale (determinism) ----------------------------------

export const CAPTURE_FIXED_CLOCK = "2026-08-19T12:00:00.000Z";
export const CAPTURE_LOCALES = ["en", "zh_CN"];
export const CAPTURE_TIMEZONE = "America/Toronto";

// --- Fixture site rules (synthetic, test-only) ----------------------------

/**
 * Build the fixture SiteRule set for a given view. All rules are synthetic
 * test-only data — never real browsing data. Rules follow the v2 storage
 * envelope shape consumed by src/storage/site-rules.ts.
 */
export function buildFixtureRules(view) {
  if (view === "enabled") {
    // One site-scope include rule on example.com — the active tab matches it.
    return [
      {
        siteKey: "example.com",
        ruleType: "include",
        scope: "site",
        boundary: "site",
        externalBehavior: "preserve",
        enabled: true,
        relatedDomains: [],
      },
    ];
  }
  if (view === "settings") {
    // A compact rule list: two enabled includes + one exclude, so the Settings
    // page shows both the Enabled and Excluded sections with summary rows.
    return [
      {
        siteKey: "example.com",
        ruleType: "include",
        scope: "site",
        boundary: "site",
        externalBehavior: "preserve",
        enabled: true,
        relatedDomains: [],
      },
      {
        siteKey: "news.example.com",
        ruleType: "include",
        scope: "host",
        boundary: "host",
        externalBehavior: "preserve",
        enabled: true,
        relatedDomains: [],
      },
      {
        siteKey: "test.example.com",
        ruleType: "exclude",
        scope: "site",
        boundary: "site",
        externalBehavior: "preserve",
        enabled: true,
        relatedDomains: [],
      },
    ];
  }
  if (view === "global-mode") {
    // exclude-only mode: one exclude rule so excluded sites exist, but the
    // active tab (example.com) is NOT excluded → page is active.
    return [
      {
        siteKey: "blocked.example.com",
        ruleType: "exclude",
        scope: "site",
        boundary: "site",
        externalBehavior: "preserve",
        enabled: true,
        relatedDomains: [],
      },
    ];
  }
  // "include" view: empty rules — site not yet enabled.
  return [];
}

/**
 * The active-tab URL the chrome.tabs.query mock returns for popup captures.
 * The Settings (options) page does not use the active tab.
 */
export function fixtureTabUrl(view) {
  return "https://example.com/";
}

/**
 * Build the fixture prefs envelope for a capture (language + mode).
 */
export function buildFixturePrefs(view, locale) {
  return {
    version: 2,
    language: locale,
    mode: view === "global-mode" ? "exclude-only" : "include-only",
  };
}

/**
 * Build the fixture storage map (splRules + splPrefs envelopes) the chrome
 * mock seeds chrome.storage.sync with before the UI scripts run.
 */
export function buildFixtureStorage(view, locale) {
  return {
    splRules: { version: 2, rules: buildFixtureRules(view) },
    splPrefs: buildFixturePrefs(view, locale),
  };
}

// --- Capture matrix -------------------------------------------------------

const POPUP_VIEWS = ["include", "enabled", "global-mode"];
const OPTIONS_VIEWS = ["settings"];

/**
 * The full capture matrix. Each capture describes the view, the entrypoint
 * (popup or options HTML), the locale, the fixture storage, the active-tab
 * URL (popup only), the target relative path under store-assets/, and the
 * exact viewport.
 */
export function buildCaptureMatrix() {
  const captures = [];

  for (const locale of CAPTURE_LOCALES) {
    for (const view of POPUP_VIEWS) {
      captures.push({
        id: `${view}-${locale}`,
        view,
        locale,
        surface: "popup",
        pagePath: "/popup.html",
        tabUrl: fixtureTabUrl(view),
        fixture: buildFixtureStorage(view, locale),
        relativePath:
          locale === "en"
            ? `chrome-web-store/screenshot-${view}-1280x800.png`
            : `chrome-web-store/zh_CN/screenshot-${view}-1280x800.png`,
        viewport: { width: 1280, height: 800 },
        fixedClock: CAPTURE_FIXED_CLOCK,
        dataSource: "fixture",
      });
    }
    for (const view of OPTIONS_VIEWS) {
      captures.push({
        id: `${view}-${locale}`,
        view,
        locale,
        surface: "options",
        pagePath: "/options.html",
        tabUrl: null,
        fixture: buildFixtureStorage(view, locale),
        relativePath:
          locale === "en"
            ? `chrome-web-store/screenshot-${view}-1280x800.png`
            : `chrome-web-store/zh_CN/screenshot-${view}-1280x800.png`,
        viewport: { width: 1280, height: 800 },
        fixedClock: CAPTURE_FIXED_CLOCK,
        dataSource: "fixture",
      });
    }
  }

  // Brand promo tile — not localized, composed from the product icon + type.
  captures.push({
    id: "promo-en",
    view: "promo",
    locale: "en",
    surface: "promo",
    pagePath: null,
    tabUrl: null,
    fixture: null,
    relativePath: "chrome-web-store/small-promo-440x280.png",
    viewport: { width: 440, height: 280 },
    fixedClock: CAPTURE_FIXED_CLOCK,
    dataSource: "fixture",
  });

  // GitHub social preview — brand graphic at GitHub's required 1280x640.
  captures.push({
    id: "social-en",
    view: "social",
    locale: "en",
    surface: "promo",
    pagePath: null,
    tabUrl: null,
    fixture: null,
    relativePath: "github/social-preview-1280x640.png",
    viewport: { width: 1280, height: 640 },
    fixedClock: CAPTURE_FIXED_CLOCK,
    dataSource: "fixture",
  });

  return captures;
}

// --- Required dimensions --------------------------------------------------

export const REQUIRED_STORE_ASSET_DIMENSIONS = {
  "chrome-web-store/screenshot-include-1280x800.png": [1280, 800],
  "chrome-web-store/screenshot-enabled-1280x800.png": [1280, 800],
  "chrome-web-store/screenshot-settings-1280x800.png": [1280, 800],
  "chrome-web-store/screenshot-global-mode-1280x800.png": [1280, 800],
  "chrome-web-store/small-promo-440x280.png": [440, 280],
  "chrome-web-store/zh_CN/screenshot-include-1280x800.png": [1280, 800],
  "chrome-web-store/zh_CN/screenshot-enabled-1280x800.png": [1280, 800],
  "chrome-web-store/zh_CN/screenshot-settings-1280x800.png": [1280, 800],
  "chrome-web-store/zh_CN/screenshot-global-mode-1280x800.png": [1280, 800],
  "github/social-preview-1280x640.png": [1280, 640],
};

// GitHub social preview must be under 1 MB (GitHub's limit).
const MAX_ASSET_BYTES = {
  "github/social-preview-1280x640.png": 1_000_000,
};

export function validateAssetFileSizes(assets) {
  const errors = [];
  for (const [name, maximumBytes] of Object.entries(MAX_ASSET_BYTES)) {
    const bytes = assets[name];
    if (typeof bytes === "number" && bytes >= maximumBytes) {
      errors.push(`${name} must be smaller than ${maximumBytes} bytes.`);
    }
  }
  return errors;
}

// --- PNG chunk hygiene ----------------------------------------------------

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const ALLOWED_PNG_CHUNKS = new Set(["IHDR", "IDAT", "IEND"]);
const SHA256 = /^[a-f0-9]{64}$/u;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function captureMatchesSha256(buffer, expectedSha256) {
  return sha256(buffer) === expectedSha256;
}

export function readPngChunkTypes(buffer) {
  const bytes = Buffer.from(buffer);
  if (
    bytes.length < PNG_SIGNATURE.length ||
    !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    throw new Error("Invalid PNG signature.");
  }

  const chunkTypes = [];
  let offset = PNG_SIGNATURE.length;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      throw new Error("PNG contains a truncated chunk.");
    }
    const length = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > bytes.length) {
      throw new Error("PNG contains a truncated chunk.");
    }
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/u.test(type)) {
      throw new Error("PNG contains an invalid chunk type.");
    }
    if (!ALLOWED_PNG_CHUNKS.has(type)) {
      throw new Error(`PNG contains forbidden ${type} chunk.`);
    }
    chunkTypes.push(type);
    offset = chunkEnd;
    if (type === "IEND") break;
  }

  if (
    chunkTypes[0] !== "IHDR" ||
    chunkTypes.at(-1) !== "IEND" ||
    offset !== bytes.length
  ) {
    throw new Error("PNG must contain only a complete IHDR/IDAT/IEND stream.");
  }
  return chunkTypes;
}

export function readPngDimensions(buffer) {
  readPngChunkTypes(buffer);
  const png = PNG.sync.read(buffer, { checkCRC: true });
  return { width: png.width, height: png.height };
}

export function validateStorePngInventory(paths) {
  const expected = new Set(Object.keys(REQUIRED_STORE_ASSET_DIMENSIONS));
  const actual = new Set(paths);
  const errors = [];

  for (const name of [...expected].sort()) {
    if (!actual.has(name)) errors.push(`${name} is missing.`);
  }
  for (const name of [...actual].sort()) {
    if (!expected.has(name)) errors.push(`Unexpected store PNG: ${name}.`);
  }
  return errors;
}

export function validateStoreAssetDimensions(assets) {
  const errors = [];
  for (const [name, [requiredWidth, requiredHeight]] of Object.entries(
    REQUIRED_STORE_ASSET_DIMENSIONS,
  )) {
    const dimensions = assets[name];
    if (!dimensions) {
      errors.push(`${name} is missing.`);
      continue;
    }
    if (
      dimensions.width !== requiredWidth ||
      dimensions.height !== requiredHeight
    ) {
      errors.push(`${name} must be ${requiredWidth}x${requiredHeight}.`);
    }
  }
  return errors;
}

/**
 * Resolve a relative capture path inside an evidence directory, rejecting
 * absolute paths and path escapes. Mirrors the ai-limits confinement check.
 */
export function resolveContainedCapturePath(directory, relativePath) {
  if (
    typeof relativePath !== "string" ||
    !relativePath ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Capture path escapes its evidence directory.");
  }
  const resolvedDirectory = path.resolve(directory);
  const resolvedPath = path.resolve(resolvedDirectory, relativePath);
  const relative = path.relative(resolvedDirectory, resolvedPath);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Capture path escapes its evidence directory.");
  }
  return resolvedPath;
}

/**
 * Read an authenticated evidence file, verifying it is a regular file with no
 * symlink in its path and that its SHA-256 matches the expected hash.
 */
export async function readAuthenticatedEvidenceFile(
  directory,
  relativePath,
  expectedSha256,
) {
  const resolvedDirectory = path.resolve(directory);
  const resolvedPath = resolveContainedCapturePath(
    resolvedDirectory,
    relativePath,
  );
  const relative = path.relative(resolvedDirectory, resolvedPath);
  let current = resolvedDirectory;

  try {
    for (const segment of relative.split(path.sep)) {
      current = path.join(current, segment);
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error(
          `Authenticated evidence path contains a symbolic link: ${relativePath}`,
        );
      }
    }
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      throw new Error(`Authenticated evidence file is missing: ${relativePath}`);
    }
    throw error;
  }

  const finalStat = await lstat(resolvedPath);
  if (!finalStat.isFile()) {
    throw new Error(
      `Authenticated evidence path is not a regular file: ${relativePath}`,
    );
  }
  const bytes = await readFile(resolvedPath);
  if (!SHA256.test(expectedSha256 ?? "") || sha256(bytes) !== expectedSha256) {
    throw new Error(
      `Authenticated evidence SHA-256 changed for ${relativePath}.`,
    );
  }
  return bytes;
}
