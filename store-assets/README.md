# Chrome Web Store artwork

These assets are captured from the **production built Blanksmith extension UI**
rendered with a **controlled chrome.\* fixture adapter** seeded by synthetic
fixture state. No mocked UI or production DOM is substituted; no real profile,
browsing data, or credentials are used; no AI-generated images. A reproducible
capture pipeline (`scripts/capture-store-assets.mjs`) serves the built
`.output/chrome-mv3/` over a local static server, drives headless Chrome via
Playwright, injects the fixture adapter via `addInitScript` before the page
scripts run, asserts the real DOM rendered the expected state, and screenshots
at the exact Chrome Web Store dimensions.

## Capture and verify

```sh
pnpm assets:store          # build + capture all screenshots + promo tile
pnpm verify:store-assets   # verify inventory, dimensions, PNG chunk hygiene
```

The capture writes a `capture-manifest.json` with a SHA-256 and exact
dimensions for every asset. The verifier confirms all required PNGs are
present at their exact sizes and contain only `IHDR`/`IDAT`/`IEND` chunks (no
metadata chunks that could hide data). The contract logic and its unit tests
live in `scripts/store-assets-contract.mjs` and
`scripts/store-assets-contract.test.js`.

The automated pipeline uses headless Chrome with fixture data and never
touches a real profile. Do not include personal browsing data, profile
data, credentials, unrelated extensions, or live-data screenshots.

## Inventory and upload order

### English Chrome Web Store assets

Per the official Chrome Web Store image guidelines
(https://developer.chrome.com/docs/webstore/images), the following
are **required** at submission:

1. `chrome-web-store/icon-128x128.png` — store icon, 128×128.
   Use `public/icons/128.png` (already produced).
2. `chrome-web-store/small-promo-440x280.png` — small promo tile,
   440×280. Produced by `pnpm assets:store`.
3. At least 1 screenshot at 1280×800 or 640×400 (up to 5 allowed).
   Produced by `pnpm assets:store`.

#### Planned screenshots (CWS requires ≥1; we plan these 4)

The four screenshots below are our planned submission set. CWS only
requires one screenshot, but producing these four gives a complete
picture of the popup's three states plus the Settings page. All four
fit within the 5-screenshot cap. All are produced by
`pnpm assets:store`.

1. `chrome-web-store/screenshot-include-1280x800.png` — popup on a web
   page before include, showing "Not enabled on {site}" and the
   "Include this site" button, 1280×800. Produced by `pnpm assets:store`.
2. `chrome-web-store/screenshot-enabled-1280x800.png` — popup on an
   enabled site, showing the active scope summary and "Exclude this
   site" button, 1280×800. Produced by `pnpm assets:store`.
3. `chrome-web-store/screenshot-settings-1280x800.png` — Settings page
   showing the compact rule list with summary rows, badges, and Edit
   buttons, 1280×800. Produced by `pnpm assets:store`.
4. `chrome-web-store/screenshot-global-mode-1280x800.png` — popup or
   Settings showing the mode selector set to "All sites except
   excluded" with the global-active summary, 1280×800. Produced by
   `pnpm assets:store`.

Upload the store icon first, then the small promo tile, then the four
screenshots in the listed order.

The following are **optional**:

- `chrome-web-store/marquee-1400x560.png` — marquee promo tile,
  1400×560. Appears in featured spots on the Web Store homepage if
  provided. Not yet produced.
- `github/social-preview-1280x640.png` — GitHub social preview,
  1280×640. Brand graphic composed from the product icon + typography.
  Produced by `pnpm assets:store` and verified by `pnpm verify:store-assets`
  (must be under 1 MB).

### Simplified Chinese store screenshots

Chrome Web Store promotional tiles are not localized (only one
small-promo-440x280.png is uploaded). However, localized screenshots
can be uploaded as additional screenshots in the zh_CN localized
listing. The following are produced by `pnpm assets:store`:

1. `chrome-web-store/zh_CN/screenshot-include-1280x800.png` —
   localized popup before include, 1280×800.
2. `chrome-web-store/zh_CN/screenshot-enabled-1280x800.png` —
   localized popup on an enabled site, 1280×800.
3. `chrome-web-store/zh_CN/screenshot-settings-1280x800.png` —
   localized Settings rule list, 1280×800.
4. `chrome-web-store/zh_CN/screenshot-global-mode-1280x800.png` —
   localized global-mode popup or Settings, 1280×800.

The surrounding UI copy in these Chinese screenshots is Simplified
Chinese (product name 原地打开), and the embedded extension UI is
also in Chinese (the language toggle is user-controlled and defaults
to English; switch to 中文 before capturing). These are not part of
the initial English submission.

## Capture views and fixture states

Each capture is produced automatically by `pnpm assets:store` from the
production built extension UI rendered with a controlled chrome.* fixture
adapter. The fixture adapter seeds `chrome.storage.sync` with synthetic
rules and preferences and provides a synthetic active-tab URL — no real
profile, browsing data, or credentials are used. The capture script asserts
the real DOM rendered the expected state before screenshotting.

### Capture 1: Popup before include (screenshot-include-1280x800)

**Fixture state:** empty rules, include-only mode, active tab on
`https://example.com/`.
**Expected UI:** status "Not enabled on example.com. Click Include to
convert same-property _blank links here." with the "Include this site"
button visible and the Exclude button hidden.

### Capture 2: Popup on an enabled site (screenshot-enabled-1280x800)

**Fixture state:** one site-scope include rule for `example.com`,
include-only mode, active tab on `https://example.com/`.
**Expected UI:** scope summary "All subdomains of example.com · converts
same registrable domain · preserve exits (default)" with the "Exclude this
site" button visible and the Include button hidden.

### Capture 3: Settings rule list (screenshot-settings-1280x800)

**Fixture state:** two enabled include rules (`example.com` site-scope +
`news.example.com` host-scope) + one exclude rule (`test.example.com`),
include-only mode.
**Expected UI:** the Settings (options) page showing ≥2 rule summary rows
with site keys, summaries, badges, and Edit/Remove buttons.

### Capture 4: Global mode (screenshot-global-mode-1280x800)

**Fixture state:** one exclude rule (`blocked.example.com`),
exclude-only mode, active tab on `https://example.com/` (not excluded).
**Expected UI:** mode selector set to "All sites except excluded", scope
summary "Active on all sites except excluded ones", Exclude button visible.

### Small promo tile (small-promo-440x280)

**Composition:** the real product icon (`public/icons/128.png`) + the
"Blanksmith" wordmark + a one-line tagline on a blue gradient background.
This is a brand graphic, not a UI screenshot.

### GitHub social preview (github/social-preview-1280x640)

**Composition:** the same brand layout as the promo tile, proportionally
scaled to GitHub's required 1280×640 social preview size. Must be under
1 MB (GitHub's limit).

### Simplified Chinese captures (zh_CN/)

The same four popup/options views are captured with the fixture prefs
`language: "zh_CN"`, producing localized screenshots with the zh_CN
product name (原地打开) and Chinese UI labels. Produced by the same
`pnpm assets:store` run.

## Regenerate and verify

All artwork is captured automatically by the deterministic pipeline. To
regenerate:

1. `pnpm assets:store` — builds the extension and captures all screenshots
   and the promo tile from the production built UI rendered with the
   controlled fixture adapter.
2. `pnpm verify:store-assets` — verifies inventory, exact dimensions, and
   PNG chunk hygiene (only IHDR/IDAT/IEND; no metadata chunks).

The capture script asserts the real DOM rendered the expected state for each
view (button visibility, scope summary text, mode selector, rule rows). No
screenshot contains personal browsing data, profile data, credentials,
unrelated extensions, or live-data content — the fixture adapter seeds only
synthetic test-only rules and preferences.
