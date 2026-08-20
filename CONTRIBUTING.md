# Contributing to Blanksmith

Thanks for helping improve Blanksmith.

## Development setup

Use Node 18+ and the pnpm version pinned in `package.json`. From the
repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build        # builds .output/chrome-mv3/
pnpm dev          # WXT dev mode
```

Then load `.output/chrome-mv3/` as an unpacked extension in
`chrome://extensions/` (Developer mode on).

Do not commit `.env` files, credentials, real browsing data, profile data,
site rules from a real Chrome profile, or extension IDs. Tests and store-asset
captures must use synthetic fixture data only.

## What to keep in mind when changing behavior

- **Keep permissions minimal.** The manifest has only `storage`,
  `scripting`, `activeTab` plus optional HTTP(S) host permissions. Do not add
  `tabs`, `webNavigation`, `<all_urls>` as a required permission, remote code,
  or analytics without an explicit review.
- **No extension-initiated network requests.** Do not add `fetch`,
  `XMLHttpRequest`, `WebSocket`, telemetry, or a backend. A conversion uses
  `location.assign()`, which leaves ordinary destination navigation to Chrome.
- **Never write `target`.** The click handler computes the effective target
  without mutating any attribute; a conversion is `preventDefault()` +
  `location.assign()` only.
- **Sender validation.** Mutation messages must remain accepted only from
  extension UI senders, never from content/page contexts.
- **No bundled site presets.** Rules begin empty. Do not ship a default
  domain list.
- Add or update behavior-based tests before changing runtime behavior.
- Update `PRIVACY.md`, `STORE_LISTING.md`, and `SECURITY.md` when data
  access, permissions, retention, or activation behavior changes.

## Architecture at a glance

```
entrypoints/   WXT entrypoints (build targets)
  background.ts        service worker: message handler + registration reconciliation
  content.ts           isolated content script (runtime-registered, not in manifest)
  popup/               toolbar popup: one-click include/exclude
  options/             settings page: compact rule list + native dialog editor
src/
  domain/              pure, browser-free policy layer (fully unit-tested)
  storage/             versioned chrome.storage.sync rule persistence
  background/          background logic (pure, injectable APIs)
  content/             content-script logic (pure, jsdom-tested)
  ui/                  pure UI model (fully unit-tested)
test/                  manifest invariant tests + setup
```

`scope` (site/host) controls which source pages get the content script.
`boundary` (site/host) controls whether a destination link converts. Scope is
set at inclusion time; boundary is editable in Settings.

## Store artwork

Store screenshots are captured from the **production built extension UI**
rendered with a controlled chrome.* fixture adapter seeded by synthetic
fixture state. No mocked UI or production DOM is substituted; no real
profile, browsing data, or credentials are used; no AI-generated images.
The capture pipeline lives in `scripts/`:

```bash
pnpm assets:store          # capture screenshots + promo + social preview
pnpm verify:store-assets   # verify dimensions, inventory, and PNG chunk hygiene
```

See [`store-assets/README.md`](store-assets/README.md) for the asset inventory,
upload order, and capture procedures.

## Verification before a pull request

```bash
pnpm install --frozen-lockfile
pnpm test:run         # wxt build + vitest (unit + manifest invariant tests)
pnpm typecheck        # tsc --noEmit
pnpm build            # WXT production build
pnpm verify:store-assets
```

The pull request should explain the user-visible change, any privacy or
permission impact, and test evidence.

Use [GitHub Issues](https://github.com/TiantianFlow/blanksmith/issues) for
contributor questions. Never post secrets or personal browsing data.
