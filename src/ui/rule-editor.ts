// Reusable rule editor with draft semantics.
//
// Creates a DOM element containing localized form controls for editing a
// SiteRule's destination boundary, external behavior, related domains,
// and enabled state. The activation scope is read-only (creation-time-only).
//
// Draft semantics: the supplied rule is cloned on construction. Cancel
// never persists. Save persists the entire draft once via the save callback.
// The remove button is visually separate from Save.
//
// Explanations and neutral examples (using example.com/example.org) appear
// beside the relevant controls. Examples are explanatory only — they never
// prefill or create a rule.
//
// Pure over an injectable Document (for jsdom testing). No Chrome APIs.

import { t, type Language } from "./messages";
import { normalizeRelatedDomain } from "../storage/site-rules";
import type {
  Boundary,
  ExternalBehavior,
  SiteRule,
} from "../domain/types";

export interface EditorCallbacks {
  save: (rule: SiteRule) => Promise<void>;
  remove: (siteKey: string) => Promise<void>;
  cancel: () => void;
}

/**
 * Create a rule editor element.
 *
 * @param rule The rule to edit (cloned internally; never mutated).
 * @param lang The display language.
 * @param callbacks { save, remove } — called on user action.
 * @param doc The document to create elements in (defaults to global document).
 * @returns An HTMLElement containing the full editor.
 */
export function createRuleEditor(
  rule: SiteRule,
  lang: Language,
  callbacks: EditorCallbacks,
  doc: Document = document,
): HTMLElement {
  // Clone the rule as a draft — the original is never mutated before Save.
  const draft: SiteRule = { ...rule, relatedDomains: [...rule.relatedDomains] };

  const container = doc.createElement("div");
  container.className = "rule-editor";

  // --- Activation scope (read-only) ---
  const scopeSection = doc.createElement("div");
  scopeSection.className = "rule-scope-readonly";
  const scopeLabel = doc.createElement("label");
  const scopeLabelText = doc.createElement("span");
  scopeLabelText.textContent = t("scopeSetAtInclusion", lang);
  scopeLabel.appendChild(scopeLabelText);
  const scopeSel = doc.createElement("select");
  scopeSel.className = "rule-scope spl-select";
  scopeSel.disabled = true;
  const scopeSiteOpt = doc.createElement("option");
  scopeSiteOpt.value = "site";
  scopeSiteOpt.textContent = t("scopeSite", lang);
  const scopeHostOpt = doc.createElement("option");
  scopeHostOpt.value = "host";
  scopeHostOpt.textContent = t("scopeHost", lang);
  scopeSel.appendChild(scopeSiteOpt);
  scopeSel.appendChild(scopeHostOpt);
  scopeSel.value = draft.scope;
  scopeLabel.appendChild(scopeSel);
  const scopeHint = doc.createElement("p");
  scopeHint.className = "rule-scope-hint muted";
  scopeHint.innerHTML = t("scopeHint", lang);
  scopeSection.appendChild(scopeLabel);
  scopeSection.appendChild(scopeHint);
  container.appendChild(scopeSection);

  // --- Destination boundary ---
  const boundaryLabel = doc.createElement("label");
  const boundaryLabelText = doc.createElement("span");
  boundaryLabelText.textContent = t("destinationBoundary", lang);
  boundaryLabel.appendChild(boundaryLabelText);
  const boundarySel = doc.createElement("select");
  boundarySel.className = "rule-boundary spl-select";
  const boundarySiteOpt = doc.createElement("option");
  boundarySiteOpt.value = "site";
  boundarySiteOpt.textContent = t("boundarySite", lang);
  const boundaryHostOpt = doc.createElement("option");
  boundaryHostOpt.value = "host";
  boundaryHostOpt.textContent = t("boundaryHost", lang);
  boundarySel.appendChild(boundarySiteOpt);
  boundarySel.appendChild(boundaryHostOpt);
  boundarySel.value = draft.boundary;
  boundaryLabel.appendChild(boundarySel);
  container.appendChild(boundaryLabel);

  // Boundary example
  const boundaryExample = doc.createElement("p");
  boundaryExample.className = "rule-example muted";
  boundaryExample.innerHTML =
    draft.boundary === "site"
      ? t("boundaryExampleSite", lang)
      : t("boundaryExampleHost", lang);
  boundaryLabel.appendChild(boundaryExample);

  boundarySel.addEventListener("change", () => {
    draft.boundary = boundarySel.value as Boundary;
    boundaryExample.innerHTML =
      draft.boundary === "site"
        ? t("boundaryExampleSite", lang)
        : t("boundaryExampleHost", lang);
  });

  // --- External link behavior ---
  const externalLabel = doc.createElement("label");
  const externalLabelText = doc.createElement("span");
  externalLabelText.textContent = t("externalBehavior", lang);
  externalLabel.appendChild(externalLabelText);
  const externalSel = doc.createElement("select");
  externalSel.className = "rule-external spl-select";
  const preserveOpt = doc.createElement("option");
  preserveOpt.value = "preserve";
  preserveOpt.textContent = t("preserveLabel", lang);
  const convertAllOpt = doc.createElement("option");
  convertAllOpt.value = "convert-all";
  convertAllOpt.textContent = t("convertAllLabel", lang);
  externalSel.appendChild(preserveOpt);
  externalSel.appendChild(convertAllOpt);
  externalSel.value = draft.externalBehavior;
  externalLabel.appendChild(externalSel);
  container.appendChild(externalLabel);

  // External behavior example
  const externalExample = doc.createElement("p");
  externalExample.className = "rule-example muted";
  externalExample.innerHTML =
    draft.externalBehavior === "convert-all"
      ? t("convertAllExample", lang)
      : t("preserveExample", lang);
  externalLabel.appendChild(externalExample);

  externalSel.addEventListener("change", () => {
    draft.externalBehavior = externalSel.value as ExternalBehavior;
    externalExample.innerHTML =
      draft.externalBehavior === "convert-all"
        ? t("convertAllExample", lang)
        : t("preserveExample", lang);
  });

  // --- Related domains ---
  const relatedFieldset = doc.createElement("fieldset");
  relatedFieldset.className = "related-fieldset";
  const relatedLegend = doc.createElement("legend");
  relatedLegend.textContent = t("relatedDomains", lang);
  relatedFieldset.appendChild(relatedLegend);
  const relatedHint = doc.createElement("p");
  relatedHint.className = "related-hint muted";
  relatedHint.innerHTML = t("relatedHint", lang);
  relatedFieldset.appendChild(relatedHint);

  const relatedExample = doc.createElement("p");
  relatedExample.className = "rule-example muted";
  relatedExample.innerHTML = t("relatedExample", lang);
  relatedFieldset.appendChild(relatedExample);

  const relatedList = doc.createElement("ul");
  relatedList.className = "related-list";
  relatedFieldset.appendChild(relatedList);

  const relatedAddRow = doc.createElement("div");
  relatedAddRow.className = "related-add-row";
  const relatedInput = doc.createElement("input");
  relatedInput.type = "text";
  relatedInput.className = "related-input";
  relatedInput.placeholder = "example.org";
  const relatedAddBtn = doc.createElement("button");
  relatedAddBtn.className = "related-add-btn";
  relatedAddBtn.textContent = t("addBtn", lang);
  relatedAddRow.appendChild(relatedInput);
  relatedAddRow.appendChild(relatedAddBtn);
  relatedFieldset.appendChild(relatedAddRow);
  container.appendChild(relatedFieldset);

  function renderRelated(): void {
    relatedList.innerHTML = "";
    for (const domain of draft.relatedDomains) {
      const li = doc.createElement("li");
      const span = doc.createElement("span");
      span.textContent = domain;
      const removeBtn = doc.createElement("button");
      removeBtn.textContent = t("removeBtn", lang);
      removeBtn.addEventListener("click", () => {
        draft.relatedDomains = draft.relatedDomains.filter((d) => d !== domain);
        renderRelated();
      });
      li.append(span, removeBtn);
      relatedList.appendChild(li);
    }
  }
  renderRelated();

  relatedAddBtn.addEventListener("click", () => {
    const normalized = normalizeRelatedDomain(relatedInput.value);
    if (normalized === null) {
      relatedInput.value = "";
      return;
    }
    if (!draft.relatedDomains.includes(normalized)) {
      draft.relatedDomains = [...draft.relatedDomains, normalized];
      renderRelated();
    }
    relatedInput.value = "";
  });

  // --- Enabled checkbox ---
  const enabledLabel = doc.createElement("label");
  enabledLabel.className = "rule-enabled-label";
  const enabledCb = doc.createElement("input");
  enabledCb.type = "checkbox";
  enabledCb.className = "rule-enabled";
  enabledCb.checked = draft.enabled;
  const enabledText = doc.createElement("span");
  enabledText.textContent = t("enabledLabel", lang);
  enabledLabel.appendChild(enabledCb);
  enabledLabel.appendChild(enabledText);
  container.appendChild(enabledLabel);

  enabledCb.addEventListener("change", () => {
    draft.enabled = enabledCb.checked;
  });

  // --- Action buttons ---
  const buttonRow = doc.createElement("div");
  buttonRow.className = "rule-button-row";

  const saveBtn = doc.createElement("button");
  saveBtn.className = "rule-save-btn primary-btn";
  saveBtn.textContent = t("saveBtn", lang);
  buttonRow.appendChild(saveBtn);

  const cancelBtn = doc.createElement("button");
  cancelBtn.className = "rule-cancel-btn secondary-btn";
  cancelBtn.textContent = t("cancelBtn", lang);
  buttonRow.appendChild(cancelBtn);

  const removeBtn = doc.createElement("button");
  removeBtn.className = "rule-remove-btn danger-btn";
  removeBtn.textContent = t("removeRuleBtn", lang);
  buttonRow.appendChild(removeBtn);

  container.appendChild(buttonRow);

  // Save: persist the entire draft once.
  saveBtn.addEventListener("click", async () => {
    await callbacks.save(draft);
  });

  // Cancel: do not persist. Call the cancel callback to close the dialog.
  // Escape also closes natively, triggering the same cancel path.
  cancelBtn.addEventListener("click", () => {
    callbacks.cancel();
  });

  // Remove: visually separate from Save.
  removeBtn.addEventListener("click", async () => {
    await callbacks.remove(draft.siteKey);
  });

  return container;
}
