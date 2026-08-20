// Popup entrypoint: one-click include/exclude for the current site.
//
// Uses activeTab to read the active tab URL, derives a CurrentSiteModel, and
// offers Include (request optional HTTP(S) origins from the click, then send
// UPSERT_RULE through the background) or Exclude (send REMOVE_RULE). The popup
// never persists a rule when permission is denied. It links to Settings.

import {
  deriveCurrentSiteModel,
  draftRule,
  findMatchingExcludes,
  isExcluded,
  originsForScope,
  permissionRequestResult,
} from "../../src/ui/current-site";
import { summarizeRule } from "../../src/ui/rule-summary";
import { t, bcp47Tag, type Language } from "../../src/ui/messages";
import { readPrefs, writePrefs } from "../../src/ui/prefs";
import type {
  BackgroundRequest,
  BackgroundResponse,
} from "../../src/background/messages";
import { extractRulesResponse } from "../../src/background/messages";
import { injectContentScriptIntoTab } from "../../src/background/inject-active-tab";
import type { GlobalMode, Scope, SiteRule } from "../../src/domain/types";

// --- DOM elements ---
const scopeSummary = document.getElementById("scope-summary")!;
const includeBtn = document.getElementById("include-btn") as HTMLButtonElement;
const excludeBtn = document.getElementById("exclude-btn") as HTMLButtonElement;
const scopeSection = document.getElementById("scope-section")!;
const scopeSelect = document.getElementById("scope-select") as HTMLSelectElement;
const messageEl = document.getElementById("message") as HTMLParagraphElement;
const settingsLink = document.getElementById("settings-link") as HTMLAnchorElement;
const langSelect = document.getElementById("lang-select") as HTMLSelectElement;
const modeSelect = document.getElementById("mode-select") as HTMLSelectElement;
const modeLabel = document.getElementById("mode-label")!;
const modeIncludeOpt = document.getElementById("mode-include-opt")!;
const modeExcludeOpt = document.getElementById("mode-exclude-opt")!;
const modeDesc = document.getElementById("mode-desc")!;
const extName = document.getElementById("ext-name")!;
const scopeLabel = document.getElementById("scope-label")!;
const scopeSiteOpt = document.getElementById("scope-site-opt")!;
const scopeHostOpt = document.getElementById("scope-host-opt")!;

// --- State ---
let currentLang: Language = "en";
let currentMode: GlobalMode = "include-only";
let currentModel = deriveCurrentSiteModel(null, [], currentLang, currentMode);
let pendingScope: Scope = "site";
let activeTabId: number | null = null;

// --- Helpers ---

function showMessage(text: string, kind: "info" | "error" | "success" = "info"): void {
  messageEl.textContent = text;
  messageEl.className = `message ${kind === "info" ? "" : kind}`;
  messageEl.hidden = false;
}

function clearMessage(): void {
  messageEl.hidden = true;
  messageEl.textContent = "";
}

async function sendMessage(request: BackgroundRequest): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(request) as Promise<BackgroundResponse>;
}

function applyLanguage(lang: Language): void {
  currentLang = lang;
  document.documentElement.lang = bcp47Tag(lang);
  document.title = t("extName", lang);
  extName.textContent = t("extName", lang);
  scopeLabel.textContent = t("activationScope", lang);
  scopeSiteOpt.textContent = t("scopeSite", lang);
  scopeHostOpt.textContent = t("scopeHost", lang);
  includeBtn.textContent = t("includeBtn", lang);
  excludeBtn.textContent = t("excludeBtn", lang);
  settingsLink.textContent = t("settingsLink", lang);
  modeLabel.textContent = t("modeLabel", lang);
  modeIncludeOpt.textContent = t("modeIncludeOnly", lang);
  modeExcludeOpt.textContent = t("modeExcludeOnly", lang);
  modeDesc.textContent =
    currentMode === "exclude-only"
      ? t("modeExcludeOnlyDesc", lang)
      : t("modeIncludeOnlyDesc", lang);
  // Re-render the model with the new language.
  scopeSummary.textContent = currentModel.scopeSummary;
  // Re-localize the summary by re-running summarizeScope on the existing rule
  // without re-running findRuleForUrl (which would need the full rules list
  // and the correct mode — both already reflected in currentModel).
  if (currentModel.isWebPage && currentModel.existingRule) {
    currentModel = {
      ...currentModel,
      scopeSummary: summarizeRule(currentModel.existingRule, lang),
    };
    render(currentModel);
  }
}

// --- Render ---

function render(model: typeof currentModel): void {
  currentModel = model;
  scopeSummary.textContent = model.scopeSummary;

  if (!model.isWebPage) {
    includeBtn.disabled = true;
    includeBtn.hidden = false;
    excludeBtn.hidden = true;
    scopeSection.hidden = true;
    return;
  }

  if (model.hasRule && model.existingRule) {
    includeBtn.hidden = true;
    excludeBtn.hidden = false;
    excludeBtn.disabled = false;
    scopeSection.hidden = true; // scope is fixed once included; edit in Settings
  } else {
    includeBtn.hidden = false;
    includeBtn.disabled = false;
    excludeBtn.hidden = true;
    scopeSection.hidden = false;
  }
}

// --- Actions ---

async function onInclude(): Promise<void> {
  if (!currentModel.isWebPage || !currentModel.hostname || !currentModel.registrableDomain) {
    return;
  }
  clearMessage();
  const scope = pendingScope;

  if (currentMode === "exclude-only") {
    // In exclude-only mode, a page can be covered by multiple overlapping
    // exclude rules (e.g., a host-scope "news.example.com" AND a site-scope
    // "example.com"). "Include this site" must remove ALL matching enabled
    // exclude rules, not just the first, or the page stays excluded while
    // the popup falsely reports success.
    //
    // After removal, we must determine active vs excluded EXPLICITLY by
    // checking for any remaining matching exclude rule in the persisted rules.
    // We cannot use updatedModel.hasRule because in exclude-only mode
    // findRuleForUrl returns the synthetic EXCLUDE_ONLY_DEFAULT_RULE
    // (siteKey "*") for ACTIVE pages — hasRule is true for both the
    // synthetic active rule and a real exclude rule, so hasRule alone is
    // ambiguous.
    try {
      const res = await sendMessage({ type: "GET_RULES" });
      const rules = extractRulesResponse(res);
      const hostname = currentModel.hostname;
      const registrableDomain = currentModel.registrableDomain;
      const matchingExcludes = findMatchingExcludes(rules, hostname, registrableDomain);
      // Remove every matching exclude rule.
      for (const excludeRule of matchingExcludes) {
        await sendMessage({
          type: "REMOVE_RULE",
          siteKey: excludeRule.siteKey,
          ruleType: "exclude",
        });
      }
      // Re-fetch rules and check EXPLICITLY whether any enabled exclude
      // rule still matches this hostname.
      const finalRes = await sendMessage({ type: "GET_RULES" });
      const finalRules = extractRulesResponse(finalRes);
      const stillExcluded = isExcluded(finalRules, hostname, registrableDomain);
      const updatedModel = deriveCurrentSiteModel(
        hostname ? `https://${hostname}/` : null,
        finalRules,
        currentLang,
        currentMode,
      );
      render(updatedModel);
      if (stillExcluded) {
        // An overlapping exclude rule was not removed or another exclude
        // rule covers this site. Report honestly.
        showMessage(t("siteStillExcluded", currentLang), "error");
      } else {
        // Inject content script for immediate activation (only if active).
        // Show success/reload AFTER injection attempt, matching include-only.
        if (activeTabId !== null) {
          try {
            await injectContentScriptIntoTab(activeTabId, chrome.scripting.executeScript);
            showMessage(t("includedActivated", currentLang), "success");
          } catch {
            showMessage(t("includedReload", currentLang), "success");
          }
        } else {
          showMessage(t("includedReload", currentLang), "success");
        }
      }
    } catch (err) {
      showMessage(t("errorPrefix", currentLang) + String(err), "error");
    }
    return;
  }

  // include-only mode: request per-site origin permission, create include rule.
  const origins = originsForScope(scope, currentModel.hostname, currentModel.registrableDomain);

  let granted: boolean | undefined;
  let lastError: string | undefined;
  try {
    granted = await chrome.permissions.request({ origins });
    lastError = chrome.runtime.lastError?.message ?? undefined;
  } catch (err) {
    granted = undefined;
    lastError = String(err);
  }

  const permResult = permissionRequestResult(granted, lastError, currentLang);

  if (permResult.kind !== "granted") {
    showMessage(permResult.message, "error");
    return;
  }

  const rule = draftRule(currentModel.hostname, scope, "include");
  try {
    const res = await sendMessage({ type: "UPSERT_RULE", rule });
    const rules = extractRulesResponse(res);
    const updatedModel = deriveCurrentSiteModel(
      currentModel.hostname ? `https://${currentModel.hostname}/` : null,
      rules,
      currentLang,
      currentMode,
    );
    render(updatedModel);

    if (activeTabId !== null) {
      try {
        await injectContentScriptIntoTab(activeTabId, chrome.scripting.executeScript);
        showMessage(t("includedActivated", currentLang), "success");
      } catch {
        showMessage(t("includedReload", currentLang), "success");
      }
    } else {
      showMessage(t("includedReload", currentLang), "success");
    }
  } catch (err) {
    showMessage(t("errorPrefix", currentLang) + String(err), "error");
  }
}

async function onExclude(): Promise<void> {
  if (!currentModel.isWebPage || !currentModel.hostname || !currentModel.registrableDomain) {
    return;
  }
  clearMessage();

  if (currentMode === "exclude-only") {
    // In exclude-only mode, "Exclude this site" means: create an exclude
    // rule so the site becomes inactive. Broad permission is already granted.
    const scope = pendingScope;
    const rule = draftRule(currentModel.hostname, scope, "exclude");
    try {
      const res = await sendMessage({ type: "UPSERT_RULE", rule });
      const rules = extractRulesResponse(res);
      const updatedModel = deriveCurrentSiteModel(
        currentModel.hostname ? `https://${currentModel.hostname}/` : null,
        rules,
        currentLang,
        currentMode,
      );
      render(updatedModel);
      showMessage(t("excluded", currentLang), "success");
    } catch (err) {
      showMessage(t("errorPrefix", currentLang) + String(err), "error");
    }
    return;
  }

  // include-only mode: remove the existing include rule.
  if (!currentModel.existingRule) return;
  const siteKey = currentModel.existingRule.siteKey;
  try {
    const res = await sendMessage({
      type: "REMOVE_RULE",
      siteKey,
      ruleType: currentModel.existingRule.ruleType,
    });
    const rules = extractRulesResponse(res);
    const updatedModel = deriveCurrentSiteModel(
      currentModel.hostname ? `https://${currentModel.hostname}/` : null,
      rules,
      currentLang,
      currentMode,
    );
    render(updatedModel);
    showMessage(t("excluded", currentLang), "success");
  } catch (err) {
    showMessage(t("errorPrefix", currentLang) + String(err), "error");
  }
}

// --- Init ---

scopeSelect.addEventListener("change", () => {
  pendingScope = scopeSelect.value as Scope;
});

includeBtn.addEventListener("click", onInclude);
excludeBtn.addEventListener("click", onExclude);
settingsLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

langSelect.addEventListener("change", async () => {
  const lang = langSelect.value as Language;
  applyLanguage(lang);
  try {
    const prefs = await readPrefs();
    await writePrefs(undefined, { ...prefs, language: lang });
  } catch {
    // Storage write failed; language toggle is cosmetic for this session.
  }
});

modeSelect.addEventListener("change", async () => {
  const newMode = modeSelect.value as GlobalMode;
  if (newMode === "exclude-only") {
    // Request broad HTTP(S) host permission for global mode.
    let granted = false;
    try {
      granted = await chrome.permissions.request({
        origins: ["http://*/*", "https://*/*"],
      });
    } catch {
      granted = false;
    }
    if (!granted) {
      showMessage(t("broadPermissionDenied", currentLang), "error");
      modeSelect.value = currentMode; // revert
      return;
    }
  }
  currentMode = newMode;
  modeDesc.textContent =
    currentMode === "exclude-only"
      ? t("modeExcludeOnlyDesc", currentLang)
      : t("modeIncludeOnlyDesc", currentLang);
  try {
    const prefs = await readPrefs();
    await writePrefs(undefined, { ...prefs, mode: newMode });
    // Re-derive with new mode.
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.pendingUrl ?? tab?.url ?? null;
    const res = await sendMessage({ type: "GET_RULES" });
    const rules = extractRulesResponse(res);
    const model = deriveCurrentSiteModel(url, rules, currentLang, currentMode);
    render(model);
  } catch {
    render(deriveCurrentSiteModel(null, [], currentLang, currentMode));
  }
});

// Load prefs, active tab, and initial state.
(async () => {
  try {
    // Read prefs first and apply language before any DOM rendering to
    // prevent an English flash when the stored preference is zh_CN.
    const prefs = await readPrefs();
    currentLang = prefs.language;
    currentMode = prefs.mode;
    langSelect.value = currentLang;
    modeSelect.value = currentMode;
    applyLanguage(currentLang);
    modeDesc.textContent =
      currentMode === "exclude-only"
        ? t("modeExcludeOnlyDesc", currentLang)
        : t("modeIncludeOnlyDesc", currentLang);
    // Set the loading message in the correct language immediately.
    scopeSummary.textContent = t("loading", currentLang);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id ?? null;
    const url = tab?.pendingUrl ?? tab?.url ?? null;
    const res = await sendMessage({ type: "GET_RULES" });
    const rules = extractRulesResponse(res);
    const model = deriveCurrentSiteModel(url, rules, currentLang, currentMode);
    render(model);
  } catch {
    activeTabId = null;
    render(deriveCurrentSiteModel(null, [], currentLang, currentMode));
  }
})();
