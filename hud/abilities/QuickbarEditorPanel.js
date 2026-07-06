// HUD Abilities — Phase 4.0b: quickbar editor popover render (PURE).
//
// Companion popover (odyssey-hud-quickbar-editor):
//   [character name] · [available actions library] · [quickbar slots] · [Save][Cancel]
//
// Drag-and-drop wiring lives in the overlay page route handler; this module only
// produces the markup with the data-* hooks it needs. Consumes the already-SAFE
// mapped runtime + the current draft (from quickbarLayoutPolicy). A version
// conflict shows a clear message + Reload, and never silently overwrites.

import { esc, cls, tipAttr } from "../components/hudDom.js";
import { skillIconSvg } from "../components/hudIcons.js";
import { rowOfSlot } from "./quickbarLayoutPolicy.js";
import { abilityTooltipLines } from "./AbilityTooltip.js";

const SEMANTIC_ACCENT = {
  attack: "attack", psi: "psionic", tech: "implant", utility: "neutral", intervention: "intervention",
};
const TYPE_MARK = { attack_technique: "ATK", directed: "DIR", instant: "INS", toggle: "TGL" };

function actionById(runtime, id) {
  if (!id) return null;
  return (runtime.quickActions ?? []).find((a) => a.characterActionId === id) ?? null;
}

// One draggable library card (actions not yet placed).
function libraryCard(action) {
  const accent = SEMANTIC_ACCENT[action.semanticKind] ?? "neutral";
  const disabled = action.state?.available === false;
  const mark = TYPE_MARK[action.type] ?? "";
  const tip = tipAttr(action.name, abilityTooltipLines(action));
  return `<div class="${cls("ohud-qbe-card", `ohud-accent--${accent}`, disabled ? "is-disabled" : "")}" draggable="true" data-qbe-action="${esc(action.characterActionId)}"${tip}>
    <span class="ohud-qbe-card-icon">${skillIconSvg(action.iconKey)}</span>
    <span class="ohud-qbe-card-name">${esc(action.name)}</span>
    ${mark ? `<span class="ohud-qbe-card-type">${esc(mark)}</span>` : ""}
    ${disabled ? `<span class="ohud-qbe-card-off" ${tipAttr("Currently unavailable", [String(action.state.disabledReason ?? "")])}>!</span>` : ""}
  </div>`;
}

// One editor slot (drop target). Occupied slots are draggable (slot-to-slot).
function editorSlot(slot, action) {
  const idx = slot.slotIndex;
  if (slot.empty || slot.characterActionId == null) {
    return `<div class="${cls("ohud-qbe-slot", "is-empty")}" data-qbe-slot="${idx}">
      <span class="ohud-qbe-slot-idx">${idx + 1}</span>
    </div>`;
  }
  if (slot.missing || !action) {
    return `<div class="${cls("ohud-qbe-slot", "is-missing")}" data-qbe-slot="${idx}" ${tipAttr("Missing action", ["No longer available — remove it."])}>
      <span class="ohud-qbe-slot-idx">${idx + 1}</span>
      <span class="ohud-qbe-missing">?</span>
      <button type="button" class="ohud-qbe-remove" data-qbe-remove="${idx}" aria-label="Remove">×</button>
    </div>`;
  }
  const accent = SEMANTIC_ACCENT[action.semanticKind] ?? "neutral";
  const tip = tipAttr(action.name, abilityTooltipLines(action));
  return `<div class="${cls("ohud-qbe-slot", "is-filled", `ohud-accent--${accent}`)}" draggable="true" data-qbe-slot="${idx}" data-qbe-action="${esc(action.characterActionId)}"${tip}>
    <span class="ohud-qbe-slot-idx">${idx + 1}</span>
    <span class="ohud-qbe-slot-icon">${skillIconSvg(action.iconKey)}</span>
    <span class="ohud-qbe-slot-name">${esc(action.name)}</span>
    <button type="button" class="ohud-qbe-remove" data-qbe-remove="${idx}" aria-label="Remove">×</button>
  </div>`;
}

/**
 * Render the quickbar editor.
 * @param {{
 *   runtime: object, draft: object[], library: object[],
 *   characterName?: string, busy?: boolean, dirty?: boolean,
 *   conflict?: boolean, viewerRole?: string
 * }} args
 * @returns {string} HTML
 */
export function renderQuickbarEditor(args = {}) {
  const runtime = args.runtime && typeof args.runtime === "object" ? args.runtime : null;
  const draft = Array.isArray(args.draft) ? args.draft : [];
  const library = Array.isArray(args.library) ? args.library : [];
  const busy = !!args.busy;
  const dirty = !!args.dirty;
  const conflict = !!args.conflict;
  const name = String(args.characterName ?? "Character");

  if (!runtime) {
    return `<div class="ohud-qbe"><div class="ohud-qbe-empty">Loading quickbar…</div></div>`;
  }

  const conflictBar = conflict
    ? `<div class="ohud-qbe-conflict" role="alert">
        Layout changed on the server. Your edits were not saved.
        <button type="button" class="ohud-qbe-reload" data-action="qbe-reload">Reload layout</button>
      </div>`
    : "";

  const libraryHtml = library.length
    ? library.map(libraryCard).join("")
    : `<div class="ohud-qbe-lib-empty">All actions are placed.</div>`;

  // Slots grouped into rows; higher rows on top (grow upward), matching the HUD.
  const rows = new Map();
  for (const slot of draft) {
    const r = rowOfSlot(slot.slotIndex);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(slot);
  }
  const slotsHtml = [...rows.keys()].sort((a, b) => b - a).map((r) => {
    const tiles = rows.get(r)
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((slot) => editorSlot(slot, actionById(runtime, slot.characterActionId)))
      .join("");
    return `<div class="ohud-qbe-slot-row" data-row="${r}">${tiles}</div>`;
  }).join("");

  const saveDisabled = busy || !dirty;

  return `<div class="${cls("ohud-qbe", busy ? "is-busy" : "")}">
    <div class="ohud-qbe-head">
      <span class="ohud-qbe-title">Quickbar — ${esc(name)}</span>
    </div>
    ${conflictBar}
    <div class="ohud-qbe-section-label">Available actions</div>
    <div class="ohud-qbe-library" data-qbe-library>${libraryHtml}</div>
    <div class="ohud-qbe-section-label">Quickbar slots</div>
    <div class="ohud-qbe-slots">${slotsHtml}</div>
    <div class="ohud-qbe-actions">
      <button type="button" class="ohud-qbe-btn is-primary" data-action="qbe-save" ${saveDisabled ? "disabled" : ""}>Save</button>
      <button type="button" class="ohud-qbe-btn" data-action="qbe-cancel" ${busy ? "disabled" : ""}>Cancel</button>
    </div>
  </div>`;
}
