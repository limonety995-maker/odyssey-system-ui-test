// HUD Abilities — Phase 4.1A.2: reusable ability detail card body (PURE).
//
// Extracted from QuickbarEditorPanel.js's renderDescriptionPanel (Phase
// 4.0c) — the SAME markup/CSS classes (.ohud-qbe-desc*), so no second
// parallel detail-card implementation exists. Both the Quickbar Editor's own
// description panel and the new Skills-quickbar hover/click detail card
// (hud/abilities/quickbarDetailCardController.js) call this one function;
// neither can ever show data the other wouldn't, since both read the exact
// same abilityTooltipModel(action).
//
// "armed" is passed in separately rather than folded into abilityTooltipModel
// — it's client-ephemeral UI intent (armedTechniqueMemory), never a
// server-truth field the shared model is allowed to know about.

import { abilityTooltipModel } from "./AbilityTooltip.js";
import { skillIconSvg } from "../components/hudIcons.js";
import { esc, cls } from "../components/hudDom.js";

const SEMANTIC_ACCENT = { attack: "attack", psi: "psionic", tech: "implant", utility: "neutral", intervention: "intervention" };
const SEMANTIC_LABEL = { attack: "Attack", psi: "Psi", tech: "Tech", utility: "Utility", intervention: "Defense" };
const SOURCE_LABEL = { perk: "Perk", psi: "Psi", implant: "Implant", item: "Item", technique: "Technique" };

/** Human-readable category label, e.g. "ATTACK / TECHNIQUE" — built from the
 *  same semanticKind/sourceType the tooltip already trusts, never invented. */
export function categoryLabel(action) {
  const sem = SEMANTIC_LABEL[action.semanticKind] ?? "Action";
  const src = SOURCE_LABEL[action.sourceType] ?? null;
  if (!src || src.toLowerCase() === sem.toLowerCase()) return sem.toUpperCase();
  return `${sem.toUpperCase()} / ${src.toUpperCase()}`;
}

/**
 * Render one ability's detail card body. Never shows raw effect JSON,
 * internal ids, or private data — only what abilityTooltipModel already
 * whitelists.
 * @param {object|null} action mapped quick action, or null (empty state)
 * @param {{ armed?: boolean, emptyText?: string, scrollableBody?: boolean }} [opts]
 *   `scrollableBody` (used only by the standalone Ability Detail companion
 *   popover, never by the Quickbar Editor's own description panel): wraps
 *   description+cost/cooldown/target pills in their own scrollable region
 *   while the header AND the status/armed line stay pinned outside it — so
 *   even if the card's estimated height (abilityDetailPlacement.js) genuinely
 *   undershoots a very long description, the player never loses sight of
 *   WHY an ability can't be used, only has to scroll to read the rest of the
 *   description.
 * @returns {string} HTML
 */
export function renderAbilityDetailCard(action, opts = {}) {
  if (!action) {
    return `<div class="ohud-qbe-desc"><div class="ohud-qbe-desc-placeholder">${esc(opts.emptyText ?? "No action selected.")}</div></div>`;
  }

  const accent = SEMANTIC_ACCENT[action.semanticKind] ?? "neutral";
  const model = abilityTooltipModel(action);
  const descLine = model.lines.find((l) => l.label === "Description");
  const statusLine = model.lines.find((l) => l.label === "Unavailable" || l.label === "Status");
  const pillLines = model.lines.filter((l) => l !== descLine && l !== statusLine);

  const pillsHtml = pillLines
    .map((l) => `<span class="ohud-qbe-desc-pill"><span class="ohud-qbe-desc-pill-label">${esc(l.label)}</span>${esc(l.value)}</span>`)
    .join("");
  // "Active" (a toggle currently on) is the only informational (is-active)
  // status value; any other text — an Unavailable reason or the mapped
  // executionReason — is a warning, regardless of which label it carries.
  const statusHtml = statusLine
    ? `<div class="${cls("ohud-qbe-desc-status", statusLine.value === "Active" ? "is-active" : "is-warning")}">${esc(statusLine.label)}: ${esc(statusLine.value)}</div>`
    : "";
  const armedHtml = opts.armed
    ? `<div class="ohud-qbe-desc-status is-active">Prepared for next attack</div>`
    : "";

  const headHtml = `<div class="ohud-qbe-desc-head">
      <span class="ohud-qbe-desc-icon">${skillIconSvg(action.iconKey)}</span>
      <div class="ohud-qbe-desc-head-text">
        <span class="ohud-qbe-desc-name">${esc(action.name)}</span>
        <span class="ohud-qbe-desc-type">${esc(categoryLabel(action))}</span>
      </div>
    </div>`;
  const bodyInnerHtml = `${descLine ? `<div class="ohud-qbe-desc-text">${esc(descLine.value)}</div>` : ""}
    <div class="ohud-qbe-desc-pills">${pillsHtml}</div>`;

  if (opts.scrollableBody) {
    return `<div class="${cls("ohud-qbe-desc", "ohud-qbe-desc--card", `ohud-accent--${accent}`)}">
      ${headHtml}
      <div class="ohud-qbe-desc-body">${bodyInnerHtml}</div>
      ${armedHtml}
      ${statusHtml}
    </div>`;
  }

  return `<div class="${cls("ohud-qbe-desc", `ohud-accent--${accent}`)}">
    ${headHtml}
    ${bodyInnerHtml}
    ${armedHtml}
    ${statusHtml}
  </div>`;
}
