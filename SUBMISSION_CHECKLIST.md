# Chrome Web Store submission checklist

Last updated: August 19, 2026

This is a local pre-submission checklist for Blanksmith version 0.1.0.
It tracks what is ready, what is missing, and what must be verified
before uploading to the Chrome Web Store. Do not upload or submit
until every item is checked.

## Build artifact

- [ ] Run `pnpm build` and confirm it succeeds.
- [ ] Run `bash scripts/create-store-zip.sh` to produce
      `blanksmith-chrome-mv3.zip`.
- [ ] Verify `unzip -l blanksmith-chrome-mv3.zip` shows only build
      output (no source, node_modules, .git, or metadata junk).
- [ ] Verify `manifest.json` is at the ZIP root.
- [ ] Record the SHA-256 of the ZIP for submission tracking.

## Manifest verification

- [ ] `permissions` is exactly `["storage","scripting","activeTab"]`.
- [ ] `optional_host_permissions` is `["http://*/*","https://*/*"]`.
- [ ] No `host_permissions` (required hosts).
- [ ] No `content_scripts` (runtime registration only).
- [ ] No `tabs`, `webNavigation`, `<all_urls>`, or `default_locale`.
- [ ] `icons` has 16, 32, 48, 128.
- [ ] `action.default_icon` has 16, 32, 48, 128.
- [ ] `action.default_popup` is `popup.html`.
- [ ] `options_ui.open_in_tab` is `true`.

## Icon verification

- [ ] Eyeball `public/icons/16.png` on a light Chrome toolbar.
- [ ] Eyeball `public/icons/16.png` on a dark Chrome toolbar.
- [ ] Eyeball `public/icons/32.png` (high-DPI 16px) on both.
- [ ] Confirm the icon reads as "blue square + white arrow" at 16px.
- [ ] Confirm no SVG is in the ZIP.

## Store listing copy

- [ ] Review `STORE_LISTING.md` English copy (name, short description,
      detailed description, single purpose, permission justifications,
      data-disclosure answers).
- [ ] Review `STORE_LISTING.md` zh_CN copy (name: 原地打开, short
      description, detailed description).
- [ ] Review `PRIVACY.md` for accuracy against actual permissions and
      data use.
- [ ] Confirm no unverified claims (no "AI-powered", no "guaranteed",
      no corporate-ownership assertions).

## Artwork not yet produced

These are not yet created. Produce from the actual extension UI —
do not use mockups or AI-generated images.

Required by the Chrome Web Store (per
https://developer.chrome.com/docs/webstore/images):
- [ ] 128×128 store icon (use `public/icons/128.png` — ready).
- [ ] 440×280 small promo tile (required at submission).
- [ ] 1280×800 or 640×400 screenshots (at least 1, up to 5).

Optional (enhance the Store listing if provided):
- [ ] 1400×560 marquee promo tile (featured spots on the Web Store
      homepage).

Exact filenames, upload order, capture views and fixture states, and the
reproducible automated capture pipeline are in [`store-assets/README.md`](store-assets/README.md).

## Manual test flow

Run the test flow in `STORE_LISTING.md` § "Manual test flow" (10 steps)
before submission. Also run `MANUAL_TEST.md` (18 tests) which covers
the same behavior in more detail.

## Automated gates

- [ ] `pnpm test:run` passes (currently 313 tests).
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` succeeds.
- [ ] `git diff --check` is clean.
- [ ] No `modulepreload` links in built popup.html or options.html.

## Privacy and permissions review

- [ ] Confirm no network calls in source (grep for fetch,
      XMLHttpRequest, WebSocket, sendBeacon).
- [ ] Confirm no analytics/telemetry/tracking code.
- [ ] Confirm `chrome.storage.sync` stores only site rules and
      preferences (no credentials, history, or page content).
- [ ] Confirm content script never injects into the main world.
- [ ] Confirm sender validation blocks mutation messages from
      content-script senders.

## Distribution

- [ ] Category: Productivity.
- [ ] Primary language: English.
- [ ] Pricing: Free.
- [ ] Regions: All.
- [ ] Privacy policy: provide a **public URL** to PRIVACY.md
      (e.g., the repository blob/raw URL). The Store requires an
      accessible public URL, not a repo-relative path.
- [ ] Support: provide a **public URL** to the repository issues page.
- [ ] Homepage: provide a **public URL** to the repository (if public).
- [ ] Remote hosted code: No.
