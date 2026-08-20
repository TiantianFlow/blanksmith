# Chrome Web Store listing draft

This document describes Blanksmith version 0.1.0. It is submission copy
and a review checklist, not a claim that the Chrome Web Store has approved
the extension.

## Store configuration

- Category: Productivity
- Primary language: English
- Mature content: No
- Distribution: Public, all regions
- Pricing: Free
- Privacy policy: link to PRIVACY.md in the repository
- Support: link to repository issues
- Remote hosted code: No

## Artwork inventory

The extension icon (16/32/48/128 PNG) and all Store artwork (screenshots
+ promo tile) are produced. Per the official Chrome Web Store image
guidelines (https://developer.chrome.com/docs/webstore/images), the Store
**requires** all of the following at submission:

- 128×128 store icon — **required**. Use `public/icons/128.png` (ready).
- 440×280 small promo tile — **required**. Produced by `pnpm assets:store`.
- At least 1 screenshot at 1280×800 or 640×400 — **required**, up to 5.
  Produced by `pnpm assets:store` (4 EN + 4 zh_CN).
The Store **optionally** accepts:

- 1400×560 marquee promo tile — **optional**. Appears in featured
  marquee spots on the Web Store homepage if provided. Not yet produced.

Screenshots and promo tiles must be produced from the actual popup and
Settings UI with synthetic representative fixture data. Do not submit mockups
or AI-generated images. See [`store-assets/README.md`](store-assets/README.md)
for exact filenames, upload order, capture views and fixture states, and
the reproducible automated capture pipeline.

## Single purpose

Blanksmith opens unwanted same-property `target="_blank"` links in the
current tab instead of a new tab, while preserving new tabs when the
destination leaves for an independent web property. The user explicitly
opts in each site; there are no bundled site presets.

## Short description

Open same-property target=_blank links in the current tab; preserve new tabs to independent sites.

## Detailed description

Blanksmith converts unwanted `target="_blank"` link clicks into same-tab
navigations on sites you explicitly enable. When you click an ordinary
unmodified left-click on an `<a target="_blank">` link whose destination
shares the same registrable domain (eTLD+1), Blanksmith intercepts the
click, prevents the new tab, and navigates the current tab to the
destination. Links to a different registrable domain, links marked
`rel="external"`, downloads, non-HTTP(S) URLs, and modified or
middle-clicks are left untouched — the browser opens the new tab as usual.

The extension **never adds or mutates a `target` attribute**. It only
intercepts the click event and navigates the current tab when the policy
says "convert."

### How the boundary works

The default same-property test is equality of registrable domain
(eTLD+1), calculated locally with a bundled Public Suffix List parser.
Two different registrable domains are treated as different properties
unless you explicitly add one as "related" in Settings. The extension
cannot prove common ownership and does not query corporate-ownership
databases.

Private-suffix hosts (e.g. `github.io`, `blogspot.com`) are handled
per-account: `user.github.io` and `other.github.io` are different
properties by default. Use same-host-only boundary for multi-tenant or
sensitive sites.

### Two activation modes

- **Included sites only** (default): the extension activates only on
  sites you explicitly include via the popup. No site is enabled until
  you click Include.
- **All sites except excluded**: the extension activates on all HTTP(S)
  pages except those you explicitly exclude. This mode requests optional
  permission for all websites; no host access is granted until you
  approve the Chrome prompt.

### What is untouched

- `rel="external"` links always open a new tab
- Download links always open a new tab
- `mailto:`, `tel:`, and other non-HTTP(S) links are untouched
- Ctrl/Cmd-click, Shift-click, Alt-click, and middle-click always open a new tab
- Anchors without `target="_blank"` are never modified
- `window.open`, forms, frames, and closed shadow roots are out of scope

### Per-site configuration

In Settings, each enabled site has a rule you can edit:

- **Activation scope** (set at inclusion): site and subdomains, or exact host only
- **Destination boundary**: same property (registrable domain), or exact same host
- **External link behavior**: preserve exits (default), or convert all
  `_blank` (advanced)
- **Related domains**: add registrable domains that belong to the same
  product
- **Enabled/paused**: toggle without deleting; paused rules remain visible

### Language

The popup and Settings page support English and Simplified Chinese;
the Chinese product name is 原地打开. The language toggle is
user-controlled, not browser-locale auto-detected. The UI defaults to
English; switch language in the popup or Settings at any time.

## Permission justifications

### Required permissions

- `storage`: saves your site rules (include/exclude lists, boundary,
  external behavior, related domains) and language preference in
  `chrome.storage.sync`. Rules sync across your Chrome profiles. No
  usage data, browsing history, or credentials are stored.
- `scripting`: registers the content script dynamically on sites you
  include (or globally in exclude-only mode). The content script
  installs a capture-phase click listener; it never injects into the
  page's main JavaScript world.
- `activeTab`: lets the popup read the active tab's URL so it can
  show the current site's include/exclude status. No `tabs` permission
  is requested.

### Optional host permissions

- `http://*/*` and `https://*/*`: declared as optional so the
  extension can request per-site or all-sites access at runtime from a
  popup user gesture. In include-only mode, Chrome prompts for the
  specific site's origin. In exclude-only mode, Chrome prompts for all
  websites. None is required at installation; none is granted until you
  approve the Chrome prompt.

The manifest does not request `tabs`, `webNavigation`,
`<all_urls>` as a required host permission, remote code, or analytics.

## Data-disclosure answers

- **Authentication information:** No. The extension does not access
  or store passwords, cookies, API keys, or browser-session credentials.
- **Website content:** Yes — limited, local-only. The content script
  reads the clicked element's `href`, `target`, `rel`, and `download`
  attributes, the first `<base target>` (if present, to compute the
  effective target), plus the current page hostname
  (`location.hostname`) to make a convert/preserve routing decision.
  These attribute values and the hostname are processed ephemerally in
  memory to route the click and are never stored, logged, transmitted,
  or sold. The extension does not read page text, form data, rendered
  content, browser storage, or cookies, and never injects code into the
  page's main JavaScript world.
- **Account identifiers and personally identifiable information:** No.
- **Financial and payment information:** No.
- **Web history:** Yes — limited, local-only. The popup reads the
  active tab's URL via `activeTab` (on user gesture) to display the
  current site's include/exclude status. The content script reads
  `location.hostname` and the clicked link's resolved `href` to
  determine whether the destination is same-property. These URL reads are
  ephemeral — used only for the instant routing decision, never stored,
  transmitted, assembled into a browsing-history list, or sold. The
  extension does not query, record, or transmit Chrome browsing history.
- **User activity:** No clicks, keystrokes, pointer movement, scrolling,
  or general browsing activity is monitored.
- **Health information, personal communications, and location:** No.
- **Sale or unrelated sharing:** No. Data is not sold and is not sent
  to the developer, advertisers, data brokers, or unrelated third parties.
- **Analytics, advertising, telemetry, or remote backend:** None. The
  extension makes no extension-initiated network calls (no `fetch`,
  `XMLHttpRequest`, `WebSocket`, telemetry, or backend). Converting a
  clicked link uses `location.assign()`, which results in an ordinary
  browser navigation handled by the browser itself.
- **Retention and controls:** Site rules and language/mode preferences
  are stored in `chrome.storage.sync` and persist until you remove a
  rule, uninstall the extension, or clear extension storage. Uninstall
  removes all local data. No ephemeral routing data (URLs, attributes,
  hostnames) is retained — only the user-created rules and preferences.
- **Use limitation:** Data is used only to determine whether a
  clicked `target="_blank"` link should open in the current tab. It is
  not used for advertising, credit decisions, or purposes unrelated to
  the single purpose.

The full policy is in [PRIVACY.md](PRIVACY.md).

## Reviewer prerequisites

- A current Chrome release (the manifest declares no `minimum_chrome_version`).
- The validated `blanksmith-chrome-mv3.zip` upload artifact (produced by
  `scripts/create-store-zip.sh` after `pnpm build`).
- A test site with `target="_blank"` links pointing to both same-eTLD+1
  and different-eTLD+1 destinations.
- No provider accounts, credentials, or network access are required.
  The extension makes no extension-initiated network calls (no `fetch`,
  `XMLHttpRequest`, `WebSocket`, telemetry, or backend). Converting a
  link uses `location.assign()`, an ordinary browser navigation.

## Manual test flow

1. Install the submitted build, or extract the ZIP and load its root
   as an unpacked extension. Pin Blanksmith if desired.
2. Navigate to a web page. Open the popup. Confirm it shows "Not enabled"
   with an Include button.
3. Click **Include this site**. Approve the Chrome permission prompt
   for that site's origin. Confirm the popup shows the site as enabled.
4. On the enabled page, click an unmodified `_blank` link to a
   same-eTLD+1 destination. Confirm the current tab navigates — no new tab.
5. Click a `_blank` link to a different registrable domain. Confirm a
   new tab opens — the current tab stays.
6. Test `rel="external"`, download, `mailto:`, Ctrl-click, and
   middle-click on same-property `_blank` links. Confirm all open new tabs.
7. Open Settings. Edit the rule's destination boundary to "Exact same host."
   Confirm sibling-subdomain `_blank` links now open new tabs.
8. Add a related domain in Settings. Confirm cross-domain links to that
   related domain now open in the current tab. Remove it and confirm
   they open new tabs again.
9. Switch to "All sites except excluded" mode in the popup or Settings.
   Approve the broad permission prompt. Confirm the extension is now
   active on all sites. Exclude one site and confirm it is no longer
   active there.
10. Switch back to "Included sites only." Confirm previously included
    sites remain active; excluded rules remain visible in Settings.

## Localized copy (zh_CN)

### Store name

原地打开

### Short description

在同站点内将 target=_blank 链接在当前标签页打开；跨站链接仍打开新标签页。

### Detailed description

原地打开 在您明确启用的网站上，将同属性 `target="_blank"` 链接的普通左键点击转换为当前标签页导航。当您点击一个指向相同可注册域名（eTLD+1）的 `<a target="_blank">` 链接时，原地打开拦截该点击、阻止新标签页、并在当前标签页中导航到目标地址。指向不同可注册域名的链接、标记 `rel="external"` 的链接、下载、非 HTTP(S) URL 以及修饰键或中键点击不受影响——浏览器照常打开新标签页。

该扩展**永远不会添加或修改 `target` 属性**。它只拦截点击事件，并在策略指示"转换"时导航当前标签页。

#### 边界工作原理

默认的同属性测试是可注册域名（eTLD+1）的相等性，由本地内置的公共后缀列表解析器计算。两个不同的可注册域名被视为不同属性，除非您在设置中明确添加为"关联域名"。扩展无法证明共同所有权，也不会查询企业所有权数据库。

私有后缀主机（如 `github.io`、`blogspot.com`）按账户处理：`user.github.io` 和 `other.github.io` 默认为不同属性。对于多租户或敏感站点，请使用"仅同主机"边界。

#### 两种激活模式

- **仅已纳入站点**（默认）：扩展仅在您通过弹窗明确纳入的站点上激活。在您点击纳入之前，没有任何站点被启用。
- **除已排除外的所有站点**：扩展在除您明确排除的站点外的所有 HTTP(S) 页面上激活。此模式会请求所有网站的可选权限；在您批准 Chrome 提示之前不会授予任何主机访问权限。

#### 不受影响的内容

- 标记 `rel="external"` 的链接始终打开新标签页
- 下载链接始终打开新标签页
- `mailto:`、`tel:` 及其他非 HTTP(S) 链接不受影响
- Ctrl/Cmd 点击、Shift 点击、Alt 点击和中键点击始终打开新标签页
- 没有 `target="_blank"` 的锚点永远不会被修改
- `window.open`、表单、框架和闭合阴影根不在范围内

#### 逐站点配置

在设置中，每个启用的站点都有一个可编辑的规则：

- **生效范围**（纳入时设置）：站点及子域名，或仅精确主机
- **跳转范围**：同属性（可注册域名），或仅同一地址
- **外部链接行为**：保留退出（默认），或拦截所有 `_blank`（高级）
- **关联域名**：添加属于同一产品的可注册域名
- **启用/暂停**：切换而不删除；暂停的规则仍可见
