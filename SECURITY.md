# Security Policy

## Supported version

Security fixes are made against the current source and the latest `0.1.x`
release. Older development builds may not receive separate fixes.

## Report a vulnerability

Never include personal browsing data, site rules from a real profile,
credentials, or account-identifying screenshots in a public report.

Use [GitHub Issues](https://github.com/TiantianFlow/blanksmith/issues) for
ordinary, non-sensitive security concerns. If GitHub private vulnerability
reporting is available in the repository's **Security** tab, use it for
sensitive reports. If that feature is unavailable, open a minimal issue
requesting a private contact route without disclosing the vulnerability or
sensitive details.

Include the affected version, browser version, expected behavior, actual
behavior, and a minimal reproduction that contains no real browsing data.

## Security boundary

Blanksmith runs entirely inside the user's Chrome profile. It has no
developer-operated backend, no analytics, no crash reporting, and no
telemetry. The extension makes no extension-initiated network calls —
no `fetch`, `XMLHttpRequest`, `WebSocket`, telemetry, or backend
requests. Converting a clicked link uses `location.assign()`, which
results in an ordinary browser navigation to the destination URL;
that navigation is handled by the browser itself, not initiated by
extension code.

### What the extension can access

- **Content script (enabled sites only):** on pages where the user has
  opted in, a capture-phase click listener reads the clicked element's
  `href`, `target`, `rel`, and `download` attributes, the first
  `<base target>` (to compute the effective target), and the page hostname
  (`location.hostname`). These reads are ephemeral — used in memory for the
  instant convert/preserve decision, then discarded. The script runs in an
  isolated world, never injects code into the page's main JavaScript world,
  and never reads page text, form data, rendered content, browser storage,
  or cookies.
- **Popup (active tab, user gesture):** reads the active tab's URL via
  `activeTab` to show the current site's include/exclude status. Not stored
  or transmitted.
- **`chrome.storage.sync`:** stores only user-created site rules and
  preferences (language, activation mode). No usage metrics, click logs,
  browsing history, page content, cookies, API keys, or credentials.

### Permissions

- **Required:** `storage`, `scripting`, `activeTab`.
- **Optional host permissions:** `http://*/*` and `https://*/*`, declared
  optional so the extension requests per-site or all-sites access at runtime
  from a user gesture. No host access is granted at install; the user must
  approve the Chrome prompt. The manifest does not request `tabs`,
  `webNavigation`, `<all_urls>` as a required host permission, remote code,
  or analytics.

### Mutation trust

Mutation messages (`UPSERT_RULE`, `REMOVE_RULE`) are accepted only from
extension UI senders (`chrome-extension://` origin). Content scripts may send
read-only messages only. This prevents a page-context script from escalating
site settings.

## Local storage is not encrypted

This local boundary is not OS-keychain encryption. Anyone with access to the
unlocked Chrome profile, extension DevTools, or local profile files may be
able to inspect stored site rules. Site rules are not sensitive (they are the
user's own include/exclude choices), but users should be aware that
`chrome.storage.sync` data is visible in extension DevTools and profile files.
No credentials or secrets are ever stored.
