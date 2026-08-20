// Settings entrypoint: compact rule list with native dialog editor.
//
// Each enabled site is a compact read-only summary row with Edit and Remove.
// Edit opens a native <dialog> containing the reusable rule editor.
// Disabled (paused) rules appear in a separate recoverable section.
// The explanation section is a <details> disclosure.
// All edits persist through the existing UPSERT_RULE / REMOVE_RULE messages.

import type {
  BackgroundRequest,
  BackgroundResponse,
} from "../../src/background/messages";
import { extractRulesResponse, guardMutationResponse } from "../../src/background/messages";
import { t, bcp47Tag, type Language } from "../../src/ui/messages";
import { readPrefs, writePrefs } from "../../src/ui/prefs";
import { summarizeRule, summarizeRuleBadges } from "../../src/ui/rule-summary";
import { createRuleEditor, type EditorCallbacks } from "../../src/ui/rule-editor";
import type { GlobalMode, SiteRule } from "../../src/domain/types";

// --- DOM ---
const rulesList = document.getElementById("rules-list")!;
const pausedSection = document.getElementById("paused-section")!;
const pausedList = document.getElementById("paused-list")!;
const excludedSection = document.getElementById("excluded-section")!;
const excludedList = document.getElementById("excluded-list")!;
const noRulesEl = document.getElementById("no-rules")!;
const noExcludedRulesEl = document.getElementById("no-excluded-rules")!;
const errorEl = document.getElementById("settings-error") as HTMLParagraphElement;
const langSelect = document.getElementById("lang-select") as HTMLSelectElement;
const modeSelect = document.getElementById("mode-select") as HTMLSelectElement;
const dialog = document.getElementById("rule-dialog") as HTMLDialogElement;
const dialogContent = document.getElementById("dialog-content")!;

// --- State ---
let currentLang: Language = "en";
let currentMode: GlobalMode = "include-only";
let lastFocusedButton: HTMLButtonElement | null = null;

// --- Helpers ---

function showSettingsError(text: string): void {
  errorEl.textContent = text;
  errorEl.hidden = false;
}

function clearSettingsError(): void {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

async function sendMessage(request: BackgroundRequest): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(request) as Promise<BackgroundResponse>;
}

async function loadRules(): Promise<SiteRule[]> {
  const res = await sendMessage({ type: "GET_RULES" });
  return extractRulesResponse(res);
}

function applyLanguage(lang: Language): void {
  currentLang = lang;
  document.documentElement.lang = bcp47Tag(lang);
  document.title = t("settingsTitle", lang);
  document.getElementById("settings-title")!.textContent = t("settingsTitle", lang);
  document.getElementById("lang-label")!.textContent = t("languageLabel", lang);
  document.getElementById("explanation-lead")!.textContent = t("explanationSummary", lang);
  document.getElementById("exp-p1")!.innerHTML = t("explanationP1", lang);
  document.getElementById("exp-p2")!.innerHTML = t("explanationP2", lang);
  document.getElementById("exp-p3")!.textContent = t("explanationP3", lang);
  document.getElementById("enabled-sites-heading")!.textContent = t("enabledSites", lang);
  document.getElementById("paused-sites-heading")!.textContent = t("pausedSitesHeading", lang);
  document.getElementById("excluded-sites-heading")!.textContent = t("excludedSitesHeading", lang);
  document.getElementById("mode-label")!.textContent = t("modeLabel", lang);
  (document.getElementById("mode-include-opt") as HTMLOptionElement).textContent = t("modeIncludeOnly", lang);
  (document.getElementById("mode-exclude-opt") as HTMLOptionElement).textContent = t("modeExcludeOnly", lang);
  noRulesEl.textContent = t("noRules", lang);
  noExcludedRulesEl.textContent = t("noExcludedRules", lang);
}

// --- Rule list rendering ---

function renderRules(rules: SiteRule[]): void {
  const enabled = rules.filter((r) => r.enabled && r.ruleType === "include");
  const paused = rules.filter((r) => !r.enabled && r.ruleType === "include");
  const excluded = rules.filter((r) => r.ruleType === "exclude");

  rulesList.innerHTML = "";
  pausedList.innerHTML = "";
  excludedList.innerHTML = "";

  const hasInclude = enabled.length > 0 || paused.length > 0;
  const hasExclude = excluded.length > 0;

  if (!hasInclude && !hasExclude) {
    noRulesEl.hidden = false;
    noExcludedRulesEl.hidden = true;
    pausedSection.hidden = true;
    excludedSection.hidden = true;
    return;
  }

  noRulesEl.hidden = hasInclude;
  noExcludedRulesEl.hidden = hasExclude;
  pausedSection.hidden = paused.length === 0;
  excludedSection.hidden = !hasExclude;

  for (const rule of enabled) {
    rulesList.appendChild(createSummaryRow(rule));
  }

  for (const rule of paused) {
    pausedList.appendChild(createSummaryRow(rule));
  }

  for (const rule of excluded) {
    excludedList.appendChild(createSummaryRow(rule));
  }
}

function createSummaryRow(rule: SiteRule): HTMLElement {
  const row = document.createElement("div");
  row.className = "rule-summary-row";

  const siteKey = document.createElement("span");
  siteKey.className = "rule-site-key";
  siteKey.textContent = rule.siteKey;
  row.appendChild(siteKey);

  const summary = document.createElement("span");
  summary.className = "rule-summary-text muted";
  summary.textContent = summarizeRule(rule, currentLang);
  row.appendChild(summary);

  // Badges/chips for convert-all and related domains
  const badges = summarizeRuleBadges(rule, currentLang);
  for (const badgeText of badges) {
    const badge = document.createElement("span");
    const isAdvanced = badgeText === t("advancedBadge", currentLang);
    badge.className = isAdvanced ? "rule-badge badge-advanced" : "rule-badge badge-related";
    badge.textContent = badgeText;
    row.appendChild(badge);
  }

  const actions = document.createElement("div");
  actions.className = "rule-summary-actions";

  const editBtn = document.createElement("button");
  editBtn.className = "rule-edit-btn";
  editBtn.textContent = t("editBtn", currentLang);
  editBtn.addEventListener("click", () => {
    openDialog(rule, editBtn);
  });
  actions.appendChild(editBtn);

  const removeBtn = document.createElement("button");
  removeBtn.className = "rule-remove-btn danger-btn";
  removeBtn.textContent = t("removeRuleBtn", currentLang);
  removeBtn.addEventListener("click", async () => {
    try {
      const res = await sendMessage({ type: "REMOVE_RULE", siteKey: rule.siteKey, ruleType: rule.ruleType });
      guardMutationResponse(res);
      clearSettingsError();
      const rules = await loadRules();
      renderRules(rules);
    } catch (e) {
      showSettingsError(String(e));
    }
  });
  actions.appendChild(removeBtn);

  row.appendChild(actions);
  return row;
}

// --- Dialog lifecycle ---

function openDialog(rule: SiteRule, editBtn: HTMLButtonElement): void {
  lastFocusedButton = editBtn;
  dialogContent.innerHTML = "";

  const title = document.createElement("h2");
  title.className = "dialog-title";
  title.id = "dialog-title-text";
  title.textContent = t("dialogTitle", currentLang, rule.siteKey);
  dialogContent.appendChild(title);

  const callbacks: EditorCallbacks = {
    save: async (draft: SiteRule) => {
      try {
        const res = await sendMessage({ type: "UPSERT_RULE", rule: draft });
        guardMutationResponse(res);
        clearSettingsError();
        closeDialog();
        const rules = await loadRules();
        renderRules(rules);
      } catch (e) {
        // Error keeps the dialog/draft intact.
        showSettingsError(String(e));
        showErrorInDialog(String(e));
      }
    },
    remove: async (siteKey: string) => {
      try {
        const res = await sendMessage({ type: "REMOVE_RULE", siteKey, ruleType: rule.ruleType });
        guardMutationResponse(res);
        clearSettingsError();
        closeDialog();
        const rules = await loadRules();
        renderRules(rules);
      } catch (e) {
        showSettingsError(String(e));
        showErrorInDialog(String(e));
      }
    },
    cancel: () => {
      closeDialog();
    },
  };

  const editor = createRuleEditor(rule, currentLang, callbacks);
  dialogContent.appendChild(editor);

  dialog.showModal();
  // Focus the first interactive control.
  const firstSelect = editor.querySelector("select:not([disabled])") as HTMLSelectElement | null;
  if (firstSelect) firstSelect.focus();
}

function closeDialog(): void {
  // Clear content BEFORE dialog.close() so the native close event
  // listener sees empty content and skips duplicate cleanup.
  dialogContent.innerHTML = "";
  dialog.close();
  // Restore focus to the Edit button that opened the dialog.
  if (lastFocusedButton) {
    lastFocusedButton.focus();
    lastFocusedButton = null;
  }
}

function showErrorInDialog(text: string): void {
  let errEl = dialogContent.querySelector(".dialog-error") as HTMLParagraphElement | null;
  if (!errEl) {
    errEl = document.createElement("p");
    errEl.className = "dialog-error message error";
    errEl.setAttribute("role", "alert");
    errEl.setAttribute("aria-live", "assertive");
    dialogContent.insertBefore(errEl, dialogContent.firstChild);
  }
  errEl.textContent = text;
}

// Escape closes the dialog natively. The close event fires for both
// programmatic close (from closeDialog) and native Escape. closeDialog
// already handles cleanup and focus restoration; this listener only acts
// when the dialog was closed by Escape (dialogContent still has content,
// meaning closeDialog was not called).
dialog.addEventListener("close", () => {
  if (dialogContent.innerHTML !== "") {
    // Escape path: clean up and restore focus.
    dialogContent.innerHTML = "";
    if (lastFocusedButton) {
      lastFocusedButton.focus();
      lastFocusedButton = null;
    }
  }
});

// --- Init ---

langSelect.addEventListener("change", async () => {
  const lang = langSelect.value as Language;
  applyLanguage(lang);
  try {
    const rules = await loadRules();
    renderRules(rules);
  } catch (e) {
    showSettingsError(t("failedToLoad", currentLang) + String(e));
  }
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
    let granted = false;
    try {
      granted = await chrome.permissions.request({
        origins: ["http://*/*", "https://*/*"],
      });
    } catch {
      granted = false;
    }
    if (!granted) {
      showSettingsError(t("broadPermissionDenied", currentLang));
      modeSelect.value = currentMode;
      return;
    }
  }
  currentMode = newMode;
  try {
    const prefs = await readPrefs();
    await writePrefs(undefined, { ...prefs, mode: newMode });
    const rules = await loadRules();
    renderRules(rules);
  } catch (e) {
    showSettingsError(String(e));
  }
});

(async () => {
  try {
    const prefs = await readPrefs();
    currentLang = prefs.language;
    currentMode = prefs.mode;
    langSelect.value = currentLang;
    modeSelect.value = currentMode;
    applyLanguage(currentLang);
    const rules = await loadRules();
    renderRules(rules);
  } catch (e) {
    showSettingsError(t("failedToLoad", currentLang) + String(e));
  }
})();
