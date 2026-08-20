# Blanksmith

**Open same-site `target="_blank"` links in the current tab. Keep new tabs for everywhere else.**

A lightweight Chrome extension that stops websites from spawning new tabs for links that stay on the same site — while protecting the new tabs you actually want (links to a different site, downloads, `rel="external"`, and modified/middle clicks).

No extension-initiated network requests. No telemetry. No bundled site presets. You opt in each site yourself.

---

## Why

You click a link inside an article. The site opens it in a new tab — even though it's the same website. Ten clicks later, your tab bar is a mess of duplicates. Blanksmith converts those same-site `target="_blank"` clicks into a same-tab navigation, so the new tab never opens. When the link actually leaves for a different site, the new tab opens as normal.

The extension **never writes or mutates a `target` attribute**. It intercepts the click and navigates the current tab only when the policy says "convert." Everything else is left untouched.

## The 10-second tour

| You click… | What happens |
|---|---|
| A same-site `_blank` link on an **included** site | Opens in the current tab ✅ |
| A link to a **different** site | New tab, as normal ✅ |
| A `rel="external"` link | New tab, as normal ✅ |
| A download link | New tab, as normal ✅ |
| A `Cmd`/`Ctrl`/`Shift`/middle-click | New tab, as normal ✅ |
| Any link on a site you **didn't** include | Untouched — Blanksmith does nothing |

---

## Install

### From source (developer / unpacked)

**Prerequisites:** Node.js 18+ and pnpm 10+.

```sh
pnpm install        # installs deps + generates WXT types
pnpm build          # builds .output/chrome-mv3/
```

Then in Chrome:

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3/` directory
5. Pin the toolbar icon for easy access

### From the Chrome Web Store

> _Not published yet. Once listed, the Store link will appear here._

---

## How to use

### 1. Include a site

Visit a site where you want same-site `_blank` links to open in the current tab. Click the Blanksmith toolbar icon → **Include this site**. Approve the Chrome permission prompt for that site's origin. Done — same-site `_blank` links now open in the current tab.

### 2. Two modes

| Mode | What it does |
|---|---|
| **Included sites only** (default) | Active only on sites you explicitly include. Chrome asks for permission per site. |
| **All sites except excluded** | Active on every HTTP(S) page except sites you exclude. Chrome asks for broad permission once. |

Switch modes from the popup or Settings. Both are your choice — Blanksmith starts in include-only mode with an empty rule list.

### 3. Fine-tune in Settings

Open Settings (the link in the popup footer, or `chrome://extensions/` → Details → Extension options). For each rule you can edit:

- **Activation scope** — the whole registrable domain (`site`) or one hostname (`host`).
- **Destination boundary** — convert within the same registrable domain (`site`) or only the exact same hostname (`host`).
- **External behavior** — `preserve` (keep the new-tab safeguard for off-site links, the default) or `convert-all` (open *all* `_blank` links in the current tab, advanced).
- **Related domains** — assert that another registrable domain belongs to the same property, so links to it also convert.

### 4. Language

The popup and Settings support **English** and **Simplified Chinese** (product name 原地打开). Toggle from the language selector. Defaults to English.

---

## Honest limits

Blanksmith is deliberately small and honest about what it can and can't do:

- **Cannot prove common ownership.** The default test is equality of registrable domain (eTLD+1), calculated locally with a bundled Public Suffix List parser. Two different registrable domains are treated as different properties unless you explicitly add one as "related." The extension does not query corporate-ownership databases.
- **Private-suffix hosts** (e.g. `github.io`, `blogspot.com`) are handled per-account: `user.github.io` and `other.github.io` are different properties by default. Use same-host-only boundary for multi-tenant hosts.
- **Only anchors and area elements** with `target="_blank"` (or a `base[target="_blank"]` default) are handled. `window.open`, forms, frames, and closed shadow roots are out of scope for v1.
- **No bundled site presets.** Rules begin empty. You opt in each site yourself.
- **No network calls, telemetry, remote code, or analytics.** All data is local (`chrome.storage.sync`).

---

## Privacy & permissions

Blanksmith has no developer-operated backend, no analytics, no crash reporting, and makes **no extension-initiated network calls** — no `fetch`, `XMLHttpRequest`, `WebSocket`, telemetry, or backend. Converting a clicked link uses `location.assign()`, which results in an ordinary browser navigation handled by the browser itself.

### What it can access

- **Content script (enabled sites only):** on pages where you've opted in, a capture-phase click listener reads the clicked element's `href`, `target`, `rel`, and `download` attributes, the first `<base target>`, and the page hostname. These reads are ephemeral — used in memory for the instant convert/preserve decision, then discarded. The script runs in an isolated world, never injects into the page's main JavaScript world, and never reads page text, form data, cookies, or browser storage.
- **Popup (active tab, user gesture):** reads the active tab's URL via `activeTab` to show the current site's status. Not stored or transmitted.
- **`chrome.storage.sync`:** stores only your site rules and preferences (language, mode). No usage metrics, click logs, browsing history, page content, cookies, or credentials.

### Permissions

- **Required:** `storage`, `scripting`, `activeTab`.
- **Optional host permissions:** `http://*/*` and `https://*/*`, declared optional so Chrome asks at runtime. No host access at install; you approve the prompt. No `tabs`, `webNavigation`, `<all_urls>` as a required permission, remote code, or analytics.

Full details: [`PRIVACY.md`](PRIVACY.md) and [`SECURITY.md`](SECURITY.md).

---

## Configuration

All configuration lives in `chrome.storage.sync` and begins empty on install:

- **Site rules** — per-site include/exclude status, activation scope, destination boundary, external link behavior, and related domains.
- **Preferences** — language (English or Simplified Chinese) and global activation mode.

Rules sync across Chrome profiles signed in to the same account. There is no config file and no bundled preset list — the extension is intentionally blank until you opt in.

---

## Build, test, typecheck

```sh
pnpm test:run       # builds the extension then runs all unit tests (self-contained)
pnpm typecheck      # tsc --noEmit
pnpm build          # WXT production build to .output/chrome-mv3/
pnpm verify         # test + typecheck + build + store-asset verification
```

`pnpm test:run` chains `wxt build` before `vitest run` so the manifest
invariant tests have a built artifact to verify. It works from a clean
checkout after `pnpm install`.

See [`MANUAL_TEST.md`](MANUAL_TEST.md) for step-by-step Chrome unpacked-extension
verification.

---

## Store artwork

Store screenshots are captured from the **production built extension UI**
rendered with a controlled chrome.* fixture adapter seeded by synthetic
fixture state. No mocked UI or production DOM is substituted; no real
profile, browsing data, or credentials are used; no AI-generated images.
English and Simplified Chinese screenshots are produced for every
popup/options state, plus a 440×280 brand promo tile and a 1280×640 GitHub
social preview composed from the product icon and typography.

```sh
pnpm assets:store          # capture all screenshots + promo + social preview
pnpm verify:store-assets   # verify dimensions, inventory, PNG chunk hygiene
```

See [`store-assets/README.md`](store-assets/README.md) for the asset inventory,
upload order, and the deterministic capture pipeline.

---

## Architecture

```
entrypoints/              WXT entrypoints (build targets)
  background.ts           service worker: message handler, registration reconciliation
  content.ts              isolated content script (runtime-registered, not in manifest)
  popup/                  toolbar popup: one-click include/exclude
  options/                settings page: compact rule list + native dialog editor

src/
  domain/                 pure, browser-free policy layer (fully unit-tested)
    types.ts              SiteRule, Scope, Boundary, ExternalBehavior
    site-boundary.ts      getSiteKey (tldts allowPrivateDomains), classifyDestination
    link-policy.ts        decideLink: guard chain + boundary delegation
  storage/                versioned chrome.storage.sync rule persistence
  background/             background logic (pure, injectable APIs)
  content/                content-script logic (pure, jsdom-tested)
  ui/                     pure UI model (fully unit-tested)

test/                     built-manifest invariant tests + setup
scripts/                  store-asset capture pipeline + ZIP script
store-assets/             Chrome Web Store artwork (generated) + manifest
```

### Key design decisions

- **Minimal permissions.** Only `storage`, `scripting`, `activeTab`. No `tabs`, `webNavigation`, or required host permissions. Optional HTTP(S) host permissions are declared so the extension can request per-site (or all-sites) access at runtime from a popup user gesture — the declaration does **not** grant access.
- **Runtime content-script registration.** The content script is built but not in the manifest's `content_scripts`. The background dynamically registers it only for granted, enabled rules. A fresh install has zero registrations.
- **Sender validation.** Mutation messages (`UPSERT_RULE`, `REMOVE_RULE`) are accepted only from extension UI senders. Content scripts may send read-only messages only. This prevents a page-context script from escalating settings.
- **Scope vs boundary.** `scope` (site/host) controls which source pages get the content script. `boundary` (site/host) controls whether destination links convert. Scope is set at inclusion time; boundary is editable in Settings.
- **Never writes `target`.** The click handler computes the effective target without writing any attribute. A conversion calls `preventDefault()` + `location.assign()` only.

---

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the
development setup, the constraints to preserve (minimal permissions, no network
calls, never write `target`, sender validation, no presets), and the
verification steps before a pull request.

Use [GitHub Issues](https://github.com/TiantianFlow/blanksmith/issues) for
bug reports and feature requests. Never include personal browsing data or
credentials in an issue.

---

## License

[MIT](LICENSE) — Copyright (c) 2026 TiantianFlow.

---

## Project status

A local MVP. The extension is fully functional and tested; Chrome Web Store
publication is the next step. Not signed. Not pushed to any remote yet.
