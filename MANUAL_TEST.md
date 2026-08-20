# Manual Test Plan — Blanksmith

Step-by-step verification using Chrome's unpacked-extension developer mode.
Run these after `pnpm build` and loading `.output/chrome-mv3/` in `chrome://extensions/`.

## Setup

1. Build the extension: `pnpm build`
2. Open `chrome://extensions/`, enable **Developer mode**
3. **Load unpacked** → select `.output/chrome-mv3/`
4. Pin the toolbar icon for access

## Test 1 — Fresh install has no enabled sites

1. Open the popup on any page.
2. **Expected:** The popup shows "Not enabled on …" with an **Include this site** button. No **Exclude** button is visible.
3. Open Settings (click the "Settings →" link). **Expected:** "No sites enabled yet."

## Test 2 — Popup include/exclude changes the active site

1. Navigate to `https://news.example.com/` (or any real HTTP(S) site you control).
2. Click the toolbar popup → **Include this site**.
3. Chrome shows a permission prompt for `https://*.example.com/*` (site scope) or `https://news.example.com/*` (host scope). **Accept it.**
4. **Expected:** Popup shows the site as enabled with a scope summary. The **Exclude this site** button is now visible.
5. Click **Exclude this site**.
6. **Expected:** Popup reverts to "Not enabled." Settings shows no rules.

## Test 3 — Same-property conversion (criterion 3)

1. Include `https://news.example.com/` with default **site and subdomains** scope.
2. On that page, create or find a link: `<a href="https://app.example.com/" target="_blank">App</a>`.
3. Ordinary left-click the link.
4. **Expected:** The current tab navigates to `https://app.example.com/` — no new tab opens.

## Test 4 — Cross-property preservation (criterion 4)

1. On the enabled `news.example.com` page, click a link: `<a href="https://other.example/" target="_blank">Other</a>`.
2. **Expected:** A new tab opens to `https://other.example/`. The current tab stays on `news.example.com`.

## Test 5 — rel=external, download, mailto, modified-click preservation (criterion 5)

1. On the enabled page, test each of these links (all with `target="_blank"`):
   - `<a href="https://app.example.com/" rel="external">External</a>` → **new tab** (not converted)
   - `<a href="https://app.example.com/file.zip" download>Download</a>` → **new tab** (not converted)
   - `<a href="mailto:hi@example.com">Mail</a>` → **new tab / mailto handler** (not converted)
   - Ctrl+Click (or Cmd+Click on Mac) on a same-property `_blank` link → **new tab** (modifier pass-through)
   - Middle-click on a same-property `_blank` link → **new tab** (middle-click pass-through)
   - Shift+Click → **new tab**
   - Alt+Click → **new tab**

## Test 6 — Strict-host boundary (criterion 7)

1. Include a site with **exact host only** scope (e.g. from `app.example.com`).
2. In Settings, set **Destination boundary** to "Exact same host."
3. On `app.example.com`, click `<a href="https://news.example.com/" target="_blank">News</a>`.
4. **Expected:** New tab (sibling subdomain preserved, not converted).
5. Click `<a href="https://app.example.com/page2" target="_blank">Page 2</a>`.
6. **Expected:** Same-tab navigation (same host converts).

## Test 7 — Related-domain behavior (criterion 6)

1. In Settings for the `example.com` rule, add `example.org` as a related domain.
2. On `news.example.com`, click `<a href="https://app.example.org/" target="_blank">Org</a>`.
3. **Expected:** Same-tab navigation (related domain converts).
4. Remove `example.org` from related domains in Settings.
5. Click the same link again.
6. **Expected:** New tab (removing related domain restores preservation).

## Test 8 — All-targets mode (criterion 8)

1. In Settings for the `example.com` rule, set **External link behavior** to "Convert all _blank (advanced)."
2. On `news.example.com`, click `<a href="https://unrelated.example/" target="_blank">Unrelated</a>`.
3. **Expected:** Same-tab navigation (all-targets converts cross-site `_blank` on the enabled source site).
4. Navigate to a different, non-enabled site (e.g. `https://other-site.com/`).
5. Click a `_blank` link there.
6. **Expected:** New tab (all-targets only applies on the enabled source site).

## Test 9 — Anchor without _blank is untouched (criterion 9)

1. On the enabled page, click `<a href="https://app.example.com/">No target</a>` (no `target` attribute).
2. **Expected:** The link behaves normally (same-tab navigation for a plain link — this is the browser default, not extension conversion). The extension does not add `target="_blank"`.

## Test 10 — Dynamic links and base[target] (criterion 10)

1. On the enabled page, open DevTools console and run:
   ```js
   const a = document.createElement('a');
   a.href = 'https://app.example.com/dynamic';
   a.target = '_blank';
   a.textContent = 'Dynamic';
   document.body.appendChild(a);
   ```
2. Click the dynamically added link.
3. **Expected:** Same-tab navigation (dynamic links use the same decision guards).
4. Add `<base target="_blank">` to the page `<head>` (via DevTools), then click a bare anchor (no own `target`) to `https://app.example.com/`.
5. **Expected:** Same-tab navigation (`base[target]` effective target is `_blank`, so the guards apply).

## Test 11 — Permission denial / revoke behavior

### Denial
1. Navigate to a new site (e.g. `https://new-site.com/`).
2. Open popup → **Include this site**.
3. **Dismiss** the Chrome permission prompt (click "Block" or close it).
4. **Expected:** Popup shows "Permission denied. The site was not included." No rule is persisted. Settings shows no rule for this site.

### Revoke
1. Include a site successfully (accept the permission prompt).
2. Go to `chrome://extensions/` → click "Details" on the extension → scroll to "Site access" → remove the granted origin.
3. Return to the previously enabled site.
4. Open the popup.
5. **Expected:** The background's `permissions.onRemoved` listener reconciles registrations. The site's content-script registration is removed. Links open normally (new tabs preserved). The rule may still appear in Settings — remove it there if desired.

## Test 12 — Scope-change guidance

1. Include `https://news.example.com/` with "Site and subdomains" scope.
2. Open Settings. Click **Edit** on the `example.com` row. In the dialog, the **Activation scope** dropdown is **disabled** (read-only) with a hint: "To change it, exclude this site and re-include from the desired host."
3. **Expected:** You cannot change scope in the dialog. Destination boundary, external behavior, related domains, enabled checkbox, and removal remain editable.
4. To switch to host-only scope: click **Exclude** in the popup, then navigate to `https://news.example.com/` and include with "Exact host only" scope.

## Test 13 — Non-web-page state

1. Navigate to `chrome://extensions/` or `chrome://settings/`.
2. Open the popup.
3. **Expected:** Popup shows "Not a web page." The Include button is disabled. No Exclude button.

## Test 14 — Options page opens in a full tab

1. Open the popup on any page.
2. Click "Settings →".
3. **Expected:** The Settings page opens in a normal browser tab (not embedded in `chrome://extensions/`).

## Test 15 — Compact rule list and dialog editor

1. Include two sites (e.g. `example.com` and `other.org`).
2. Open Settings. **Expected:** Each site is a compact one-line row showing the site key, a read-only summary (e.g. "All subdomains of example.com · converts same registrable domain · preserve exits (default)"), and Edit and Remove buttons. No inline form controls are visible.
3. Click **Edit** on `example.com`. **Expected:** A native dialog opens with a title ("Edit rule for example.com"), the full editor (activation scope read-only, destination boundary, external behavior, related domains, enabled checkbox, Save/Cancel/Remove), and focus on the first editable control.
4. Change **Destination boundary** to "Exact same host." Click **Save**. **Expected:** Dialog closes, focus returns to the Edit button, and the summary row updates to show "exact same host."
5. Click **Edit** again, change something, then click **Cancel** (or press Escape). **Expected:** Dialog closes without persisting. The summary row is unchanged.
6. Click **Remove** on a row. **Expected:** The rule is removed and the row disappears.

## Test 16 — Chinese product name and language parity

1. Switch the language to 中文 in the Settings language bar.
2. **Expected:** The product name shows "原地打开" (not "同站原地打开"). The Settings title is "原地打开 — 设置".
3. Each rule summary row shows localized text (e.g. "example.com 及其子域名 · 转为当前页打开 · 同站域名（含子域名）· 保留新标签页（默认）").
4. Click **编辑** (Edit). **Expected:** The dialog shows all labels in Chinese, including neutral examples with `example.com`/`example.org`.
5. Switch back to English. **Expected:** All labels and summaries revert to English.

## Test 17 — Paused rules remain visible

1. Include a site, then open Settings → Edit → uncheck **Enabled** → Save.
2. **Expected:** The site moves to a "Paused sites" section below the enabled list. It is still visible with Edit and Remove buttons.
3. Click **Edit** on the paused rule, re-check **Enabled**, Save. **Expected:** The rule returns to the enabled list.

## Test 18 — Configuration examples in the editor

1. Open the editor for a rule.
2. **Expected:** Beside **Destination boundary**, a neutral example explains the behavior (e.g. "news.example.com → app.example.com opens in the same tab (same registrable domain)" or "app.example.com → news.example.com opens a new tab (different address)").
3. Beside **External link behavior**, an example explains preserve vs. convert-all.
4. Beside **Related domains**, an example shows adding `example.org` for `example.com`.
5. **Expected:** Examples use only `example.com`/`example.org` — never real domains, never prefilled, never creating a rule.
