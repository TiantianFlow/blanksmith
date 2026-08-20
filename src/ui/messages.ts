// Language-neutral string table for popup and Settings UI.
//
// Supports English (en) and Simplified Chinese (zh_CN) via a user-selectable
// toggle. Does NOT use Chrome's native _locales/ system (which auto-selects
// based on browser locale). The user chooses the language; the preference is
// stored in chrome.storage.sync and read at popup/options init.
//
// Pure, browser-free, unit-testable. No chrome.i18n dependency.

export type Language = "en" | "zh_CN";

const en = {
  extName: "Blanksmith",
  loading: "Loading…",
  includeBtn: "Include this site",
  excludeBtn: "Exclude this site",
  activationScope: "Activation scope:",
  scopeSite: "Site and subdomains",
  scopeHost: "Exact host only",
  settingsLink: "Settings →",
  languageLabel: "Language",

  // Popup status messages
  includedActivated: "Site included. Same-property _blank links will open in this tab.",
  includedReload: "Site included. Reload this page to activate same-property link conversion.",
  excluded: "Site excluded. Links will open normally again.",
  errorPrefix: "Error: ",
  permissionDenied: "Permission denied. The site was not included.",
  permissionFailed: "Permission request failed: ",

  // Scope summary — no rule
  notEnabledOn: "Not enabled on {0}. Click Include to convert same-property _blank links here.",
  notWebPage: "Not a web page.",
  thisSite: "this site",

  // Scope summary — with rule
  allSubdomainsOf: "All subdomains of {0}",
  onlyHost: "Only {0}",
  sameRegistrableDomain: "same registrable domain",
  exactSameHost: "exact same host",
  convertAllBlank: "convert all _blank (advanced)",
  preserveExits: "preserve exits (default)",
  convertsLabel: "converts",

  // Settings
  settingsTitle: "Blanksmith — Settings",
  explanationP1: 'This extension opens same-property <code>target="_blank"</code> links in the current tab, while preserving new tabs to independent web properties.',
  explanationP2: '<strong>It cannot prove common ownership.</strong> The default test is equality of registrable domain (eTLD+1), calculated locally with a bundled Public Suffix List parser. Two different registrable domains are treated as different properties unless you explicitly add one as related.',
  explanationP3: "When uncertain, the extension preserves the new tab: an extra closable tab is less damaging than replacing a page with unsaved work.",
  enabledSites: "Enabled sites",
  noRules: "No sites enabled yet. Use the toolbar popup on a site to include it.",
  scopeSetAtInclusion: "Activation scope (set at inclusion)",
  scopeHint: "Activation scope is fixed when you include a site from the popup. To change it, exclude this site and re-include from the desired host (e.g., include from <code>app.example.com</code> for host-only scope).",
  destinationBoundary: "Destination boundary",
  boundarySite: "Same property (registrable domain)",
  boundaryHost: "Exact same host",
  externalBehavior: "External link behavior",
  preserveLabel: "Preserve exits (default)",
  convertAllLabel: "Convert all _blank (advanced)",
  relatedDomains: "Related domains",
  relatedHint: 'Add a registrable domain that belongs to the same product. The extension cannot infer this — you must assert it. Example: <code>example.org</code> for a site on <code>example.com</code>.',
  addBtn: "Add",
  removeBtn: "Remove",
  enabledLabel: "Enabled",
  removeRuleBtn: "Remove rule",
  failedToLoad: "Failed to load rules: ",
  backgroundError: "background error: ",
  backgroundErrorMalformed: "background error: malformed response (no rules or error property).",
  backgroundErrorNoResponse: "background error: no response from background.",

  // Rule list and editor
  pausedIndicator: "Paused",
  relatedCountLabel: "{0} related",
  editBtn: "Edit",
  saveBtn: "Save",
  cancelBtn: "Cancel",
  dialogTitle: "Edit rule for {0}",
  advancedBadge: "Advanced",
  explanationSummary: "How it works",
  boundaryExampleSite: 'e.g. <code>news.example.com</code> → <code>app.example.com</code> opens in the same tab (same registrable domain)',
  boundaryExampleHost: 'e.g. <code>app.example.com</code> → <code>news.example.com</code> opens a new tab (different address)',
  preserveExample: 'e.g. <code>app.example.com</code> → <code>other.example</code> opens a new tab (different domain)',
  convertAllExample: "All <code>_blank</code> links open in the current tab, including cross-domain. <code>rel=external</code>, downloads, and modifier clicks still open new tabs. Use with caution.",
  relatedExample: 'e.g. add <code>example.org</code> so <code>app.example.org</code> links also open in the same tab',
  pausedSitesHeading: "Paused sites",

  // Global mode
  modeLabel: "Mode",
  modeIncludeOnly: "Included sites only",
  modeExcludeOnly: "All sites except excluded",
  modeIncludeOnlyDesc: "Activate only on sites you explicitly include.",
  modeExcludeOnlyDesc: "Activate on all sites except those you exclude. Requires broad permission.",
  excludedSitesHeading: "Excluded sites",
  noExcludedRules: "No excluded sites. Use the popup to exclude a site.",
  excludeOnlyActiveSummary: "Active on all sites except excluded ones",
  siteStillExcluded: "Site still excluded. Remove overlapping exclusion rules in Settings.",
  broadPermissionDenied: "Permission denied. Global mode was not activated.",
} as const;

const zh_CN: Record<MessageKey, string> = {
  extName: "原地打开",
  loading: "加载中…",
  includeBtn: "启用此站点",
  excludeBtn: "停用此站点",
  activationScope: "生效范围：",
  scopeSite: "整站及子域名",
  scopeHost: "仅当前域名",
  settingsLink: "设置 →",
  languageLabel: "语言",

  includedActivated: "已启用。同站 _blank 链接将在当前标签页打开。",
  includedReload: "已启用。刷新此页面以激活同站链接拦截。",
  excluded: "已停用。链接将恢复正常打开方式。",
  errorPrefix: "错误：",
  permissionDenied: "权限被拒绝。未启用此站点。",
  permissionFailed: "权限请求失败：",

  notEnabledOn: "未在 {0} 上启用。点击「启用此站点」将同站 _blank 链接转为当前页打开。",
  notWebPage: "非网页。",
  thisSite: "本站",

  allSubdomainsOf: "{0} 及其子域名",
  onlyHost: "仅 {0}",
  sameRegistrableDomain: "同站域名（含子域名）",
  exactSameHost: "仅当前地址",
  convertAllBlank: "拦截所有 _blank（高级）",
  preserveExits: "保留新标签页（默认）",
  convertsLabel: "转为当前页打开",

  settingsTitle: "原地打开 — 设置",
  explanationP1: '此扩展将同站 <code>target="_blank"</code> 链接在当前标签页中打开，指向不同网站的链接仍会打开新标签页。',
  explanationP2: '<strong>扩展无法判断两个域名是否属于同一网站。</strong> 默认规则是比较域名（eTLD+1），由本地内置的公共后缀列表解析。两个不同的域名视为不同网站，除非您手动添加为关联域名。',
  explanationP3: "遇到不确定的情况时，扩展会保留新标签页：多开一个可关闭的标签页，总比替换掉含未保存内容的页面要好。",
  enabledSites: "已启用站点",
  noRules: "暂无已启用站点。请在网站上点击工具栏图标来启用。",
  scopeSetAtInclusion: "生效范围（启用时确定）",
  scopeHint: "生效范围在启用站点时确定，无法更改。如需更改，请先停用，再从目标域名重新启用（例如从 <code>app.example.com</code> 启用可选择仅当前域名）。",
  destinationBoundary: "跳转范围",
  boundarySite: "同站域名（含子域名）",
  boundaryHost: "仅同一地址",
  externalBehavior: "外部链接行为",
  preserveLabel: "保留新标签页（默认）",
  convertAllLabel: "拦截所有 _blank（高级）",
  relatedDomains: "关联域名",
  relatedHint: '添加一个属于同一网站的域名。扩展无法自动推断——需要您手动添加。例如：为 <code>example.com</code> 上的站点添加 <code>example.org</code>。',
  addBtn: "添加",
  removeBtn: "移除",
  enabledLabel: "已启用",
  removeRuleBtn: "移除规则",
  failedToLoad: "加载规则失败：",
  backgroundError: "后台错误：",
  backgroundErrorMalformed: "后台错误：响应格式错误（无 rules 或 error 属性）。",
  backgroundErrorNoResponse: "后台错误：后台无响应。",

  // Rule list and editor
  pausedIndicator: "已暂停",
  relatedCountLabel: "{0} 个关联域名",
  editBtn: "编辑",
  saveBtn: "保存",
  cancelBtn: "取消",
  dialogTitle: "编辑 {0} 的规则",
  advancedBadge: "高级",
  explanationSummary: "工作原理",
  boundaryExampleSite: '例如：<code>news.example.com</code> → <code>app.example.com</code> 在当前标签页打开（同站域名，含子域名）',
  boundaryExampleHost: '例如：<code>app.example.com</code> → <code>news.example.com</code> 打开新标签页（不同地址）',
  preserveExample: '例如：<code>app.example.com</code> → <code>other.example</code> 打开新标签页（不同域名）',
  convertAllExample: "所有 <code>_blank</code> 链接都在当前标签页打开，包括跨域链接。<code>rel=external</code>、下载和修饰键点击仍会打开新标签页。请谨慎使用。",
  relatedExample: '例如：添加 <code>example.org</code>，则 <code>app.example.org</code> 的链接也在当前标签页打开',
  pausedSitesHeading: "已暂停站点",

  // Global mode
  modeLabel: "模式",
  modeIncludeOnly: "仅已纳入站点",
  modeExcludeOnly: "除已排除外的所有站点",
  modeIncludeOnlyDesc: "仅在您明确纳入的站点上激活。",
  modeExcludeOnlyDesc: "在除已排除站点外的所有站点上激活。需要广泛权限。",
  excludedSitesHeading: "已排除站点",
  noExcludedRules: "暂无已排除站点。请使用弹窗排除站点。",
  excludeOnlyActiveSummary: "全局激活 — 同站链接在此打开",
  siteStillExcluded: "站点仍被排除。请在设置中移除重叠的排除规则。",
  broadPermissionDenied: "权限被拒绝。全局模式未激活。",
};

const tables: Record<Language, Record<MessageKey, string>> = { en, zh_CN };

export type MessageKey = keyof typeof en;
export const messageKeys = Object.keys(en) as MessageKey[];

const DEFAULT_LANG: Language = "en";

/**
 * Get a translated string. Supports {0}, {1}, ... placeholders for
 * substitution. Falls back to English for unknown languages.
 * Returns the key itself for unknown keys (defensive).
 */
export function t(
  key: MessageKey,
  lang: Language,
  ...substitutions: string[]
): string {
  const table = tables[lang] ?? tables[DEFAULT_LANG];
  let str = table[key];
  if (str === undefined) {
    str = tables[DEFAULT_LANG][key];
    if (str === undefined) return String(key);
  }
  for (let i = 0; i < substitutions.length; i++) {
    str = str.replace(`{${i}}`, substitutions[i]!);
  }
  return str;
}

/**
 * Validate and normalize a language value from storage.
 * Returns "en" for anything that isn't "en" or "zh_CN".
 */
export function normalizeLanguage(value: unknown): Language {
  return value === "zh_CN" ? "zh_CN" : "en";
}

/**
 * Map a stored Language key to its BCP 47 tag for document.documentElement.lang.
 * Chrome and the HTML spec expect hyphenated tags (e.g. "zh-CN"), not the
 * underscored storage key ("zh_CN").
 */
export function bcp47Tag(lang: Language): string {
  if (lang === "zh_CN") return "zh-CN";
  return "en";
}
