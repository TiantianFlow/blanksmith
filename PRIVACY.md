# Privacy Policy

Last updated: August 19, 2026

Blanksmith is a locally running Chrome extension. This policy describes
version 0.1.0.

## Data Blanksmith accesses

Blanksmith accesses the following data locally and ephemerally to route
clicked `target="_blank"` links. None of it is stored, transmitted,
or sold:

- **Website content (limited, local-only):** the content script reads
  the clicked element's `href`, `target`, `rel`, and `download`
  attributes plus the current page hostname (`location.hostname`) to make
  a convert/preserve routing decision. These reads are ephemeral — used
  in memory for the instant click decision, then discarded. The extension
  does not read page text, form data, rendered content, browser storage,
  or cookies, and never injects code into the page's main JavaScript
  world.
- **Web history (limited, local-only):** the popup reads the active
  tab's URL via `activeTab` on user gesture to display the current site's
  include/exclude status. The content script reads `location.hostname`
  and the clicked link's resolved `href` to determine whether the
  destination is same-property. These URL reads are ephemeral — never
  stored, logged, transmitted, assembled into a browsing-history list, or
  sold. The extension does not query, record, or transmit Chrome
  browsing history.

The extension stores only the following user-created configuration
in `chrome.storage.sync`:

- **Site rules**: per-site include/exclude status, activation scope,
  destination boundary, external link behavior, and related domains.
  These are user choices and begin empty on install.
- **Preferences**: language (English or Simplified Chinese) and global
  activation mode (included-sites-only or all-sites-except-excluded).

No usage metrics, click logs, browsing history, page content, cookies,
API keys, or session credentials are stored or transmitted.

## What the content script reads

The content script installs a capture-phase click listener on pages
where the extension is active. On an unmodified primary click, it reads
the clicked element's `href`, `target`, `rel`, and `download` attributes,
the first `<base target>` (if present, to compute the effective target),
and the current page hostname (`location.hostname`) to decide whether to
convert the click to a same-tab navigation. These reads are ephemeral —
processed in memory to route the click, then discarded. The extension does
not read page text, form data, rendered content, browser storage, or
cookies. It never injects code into the page's main JavaScript world. No
clicked-link URLs, attributes, or hostnames are stored or transmitted.

## Permissions

### Required permissions

- `storage`: saves site rules and preferences in `chrome.storage.sync`.
  Rules sync across Chrome profiles signed in to the same account.
- `scripting`: dynamically registers the content script on enabled
  sites. The script installs a click listener; it does not modify page
  content or execute arbitrary page-context code.
- `activeTab`: lets the popup read the active tab's URL to display
  the current site's include/exclude status. The URL is read only
  in the popup context on user gesture; it is not stored or
  transmitted.

### Optional host permissions

- `http://*/*` and `https://*/*`: declared as optional so the
  extension can request per-site or all-sites access at runtime. In
  include-only mode, Chrome prompts for the specific site's origin
  only. In exclude-only mode, Chrome prompts for all websites. No host
  access is required at installation or granted until the user
  approves the Chrome prompt.

The manifest does not request `tabs`, `webNavigation`,
`<all_urls>` as a required host permission, remote code, or analytics.

## Data transfer, sale, and sharing

Blanksmith has no developer-operated backend, advertising SDK,
analytics, crash reporting, or telemetry. The extension makes no
extension-initiated network calls — no `fetch`, `XMLHttpRequest`,
`WebSocket`, telemetry, or backend requests. Converting a clicked
link uses `location.assign()`, which results in an ordinary browser
navigation to the destination URL; that navigation is handled by the
browser itself, not initiated by extension code. Data is not sold and
is not shared with the developer, advertisers, data brokers, or
unrelated third parties.

All configuration data remains in the local Chrome profile until the
user removes a rule, uninstalls the extension, or clears extension
storage.

## Limited use

Blanksmith complies with the Chrome Web Store User Data Policy,
including the Limited Use requirements.

Blanksmith uses accessed data only to determine whether a clicked
`target="_blank"` link should open in the current tab. It does not
use or transfer that data for advertising, profiling outside the
extension's single purpose, creditworthiness, lending, or other
unrelated purposes. Because Blanksmith has no developer-operated
backend, the developer cannot read locally stored extension data.

## Security

The extension does not access sensitive accounts, credentials, or
payment data. Optional host permissions let the extension's content
script run on enabled sites, but the script only reads clicked-element
attributes and never modifies page content or injects main-world code.

Anyone with access to your unlocked Chrome profile may be able to
access extension configuration data. Site rules are not sensitive, but
users should be aware that `chrome.storage.sync` data is visible in
extension DevTools and profile files.

## Contact

Use GitHub Issues in the extension repository for privacy questions or
requests. Never include personal data in an issue.
