// HUD Abilities — Phase 4.0c: quickbar editor popover render (PURE, visual rework).
//
// Companion popover (odyssey-hud-quickbar-editor): a sci-fi window with a
// header (title/subtitle/close), a two-column body (Available Actions library
// on the left, Quickbar Slots grid on the right), and a footer (status +
// Reset/Cancel/Save). Slots 1-10 render on the TOP row, 11-20 on the BOTTOM
// row — a deliberate, fixed departure from the visual reference, which had
// the numbering the other way around.
//
// Drag-and-drop wiring lives in the overlay page route handler; this module
// only produces the markup with the data-* hooks it needs. Consumes the
// already-SAFE mapped runtime + the current draft (from quickbarLayoutPolicy).
// A version conflict shows a clear message + Reload, and never silently
// overwrites. Reset re-syncs the draft to the last-known server layout — same
// safe rebuild path as Reload, just reachable without a conflict first.

import { esc, cls, tipAttr } from "../components/hudDom.js";
import { skillIconSvg } from "../components/hudIcons.js";
import { ICON_GRID } from "../components/hudIcons.js";
import { rowOfSlot } from "./quickbarLayoutPolicy.js";
import { abilityTooltipLines } from "./AbilityTooltip.js";

const SEMANTIC_ACCENT = {
  attack: "attack", psi: "psionic", tech: "implant", utility: "neutral", intervention: "intervention",
};
const TYPE_MARK = { attack_technique: "ATK", directed: "DIR", instant: "INS", toggle: "TGL" };

// Human-readable category label for a library card, e.g. "ATTACK / PSI".
// Built from the same semanticKind/sourceType the tooltip already trusts —
// never invented, just relabelled for display.
const SEMANTIC_LABEL = { attack: "Attack", psi: "Psi", tech: "Tech", utility: "Utility", intervention: "Defense" };
const SOURCE_LABEL = { perk: "Perk", psi: "Psi", implant: "Implant", item: "Item", technique: "Technique" };
function categoryLabel(action) {
  const sem = SEMANTIC_LABEL[action.semanticKind] ?? "Action";
  const src = SOURCE_LABEL[action.sourceType] ?? null;
  if (!src || src.toLowerCase() === sem.toLowerCase()) return sem.toUpperCase();
  return `${sem.toUpperCase()} / ${src.toUpperCase()}`;
}

// Small pill badges summarizing cost/cooldown at a glance (detail lives in
// the tooltip). Only rendered when the server actually reports a nonzero
// value — never a fabricated "0" badge.
function costBadges(action) {
  const badges = [];
  const c = action.costs ?? {};
  if (c.main > 0) badges.push({ text: `MAIN ${c.main}`, kind: "cost" });
  else if (c.move > 0) badges.push({ text: `MOVE ${c.move}`, kind: "cost" });
  else if (c.charges > 0) badges.push({ text: `CHG ${c.charges}`, kind: "cost" });
  if (c.psi > 0) badges.push({ text: `PSI ${c.psi}`, kind: "resource" });
  if (action.cooldown?.max > 0) badges.push({ text: `CD ${action.cooldown.max}`, kind: "cooldown" });
  return badges;
}

function badgeHtml(badge) {
  return `<span class="${cls("ohud-qbe-badge", `ohud-qbe-badge--${badge.kind}`)}">${esc(badge.text)}</span>`;
}

function actionById(runtime, id) {
  if (!id) return null;
  return (runtime.quickActions ?? []).find((a) => a.characterActionId === id) ?? null;
}

// One draggable library card (actions not yet placed).
function libraryCard(action) {
  const accent = SEMANTIC_ACCENT[action.semanticKind] ?? "neutral";
  const disabled = action.state?.available === false;
  const tip = tipAttr(action.name, abilityTooltipLines(action));
  const badges = costBadges(action).map(badgeHtml).join("");
  return `<div class="${cls("ohud-qbe-card", `ohud-accent--${accent}`, disabled ? "is-disabled" : "")}" draggable="true" data-qbe-action="${esc(action.characterActionId)}"${tip}>
    <span class="ohud-qbe-card-icon">${skillIconSvg(action.iconKey)}</span>
    <span class="ohud-qbe-card-main">
      <span class="ohud-qbe-card-name">${esc(action.name)}</span>
      <span class="ohud-qbe-card-type">${esc(categoryLabel(action))}</span>
    </span>
    <span class="ohud-qbe-card-badges">${badges}</span>
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
  const mark = TYPE_MARK[action.type] ?? "";
  const tip = tipAttr(action.name, abilityTooltipLines(action));
  return `<div class="${cls("ohud-qbe-slot", "is-filled", `ohud-accent--${accent}`)}" draggable="true" data-qbe-slot="${idx}" data-qbe-action="${esc(action.characterActionId)}"${tip}>
    <span class="ohud-qbe-slot-idx">${idx + 1}</span>
    ${mark ? `<span class="ohud-qbe-slot-type">${esc(mark)}</span>` : ""}
    <span class="ohud-qbe-slot-icon">${skillIconSvg(action.iconKey)}</span>
    <span class="ohud-qbe-slot-name">${esc(action.name)}</span>
    <button type="button" class="ohud-qbe-remove" data-qbe-remove="${idx}" aria-label="Remove">×</button>
  </div>`;
}

function footerStatus({ busy, conflict, dirty }) {
  if (busy) return { text: "Saving…", tone: "busy" };
  if (conflict) return { text: "Resolve the conflict to continue", tone: "warning" };
  if (dirty) return { text: "Unsaved changes", tone: "warning" };
  return { text: "All changes saved", tone: "neutral" };
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

  const header = `<div class="ohud-qbe-header">
    <span class="ohud-qbe-header-icon">${ICON_GRID}</span>
    <span class="ohud-qbe-header-text">
      <span class="ohud-qbe-header-title">Quickbar Editor</span>
      <span class="ohud-qbe-header-subtitle">Assign combat abilities to quick slots — ${esc(name)}</span>
    </span>
    <button type="button" class="ohud-qbe-close" data-action="qbe-cancel" aria-label="Close">×</button>
  </div>`;

  if (!runtime) {
    return `<div class="ohud-qbe">${header}<div class="ohud-qbe-empty">Loading quickbar…</div></div>`;
  }

  const conflictBar = conflict
    ? `<div class="ohud-qbe-conflict" role="alert">
        <span>Layout changed on the server. Your edits were not saved.</span>
        <button type="button" class="ohud-qbe-reload" data-action="qbe-reload">Reload layout</button>
      </div>`
    : "";

  const libraryHtml = library.length
    ? library.map(libraryCard).join("")
    : `<div class="ohud-qbe-lib-empty">All actions are placed.</div>`;

  // Slots grouped into rows; the row with the LOWER slot indices (1-10) is the
  // TOP row here — a deliberate, fixed departure from the reference layout.
  const rows = new Map();
  for (const slot of draft) {
    const r = rowOfSlot(slot.slotIndex);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(slot);
  }
  const slotsHtml = [...rows.keys()].sort((a, b) => a - b).map((r) => {
    const tiles = rows.get(r)
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((slot) => editorSlot(slot, actionById(runtime, slot.characterActionId)))
      .join("");
    return `<div class="ohud-qbe-slot-row" data-row="${r}">${tiles}</div>`;
  }).join("");

  const saveDisabled = busy || !dirty;
  const resetDisabled = busy || (!dirty && !conflict);
  const status = footerStatus({ busy, conflict, dirty });

  return `<div class="${cls("ohud-qbe", busy ? "is-busy" : "")}">
    ${header}
    <div class="ohud-qbe-body">
      ${conflictBar}
      <div class="ohud-qbe-cols">
        <div class="ohud-qbe-col ohud-qbe-col--library">
          <div class="ohud-qbe-section-label">Available actions</div>
          <div class="ohud-qbe-library" data-qbe-library>${libraryHtml}</div>
        </div>
        <div class="ohud-qbe-col ohud-qbe-col--slots">
          <div class="ohud-qbe-section-label">Quickbar slots</div>
          <div class="ohud-qbe-hint">Drag an action onto a slot to assign it, or drag between slots to swap.</div>
          <div class="ohud-qbe-slots">${slotsHtml}</div>
        </div>
      </div>
    </div>
    <div class="ohud-qbe-footer">
      <span class="${cls("ohud-qbe-status", `ohud-qbe-status--${status.tone}`)}">${esc(status.text)}</span>
      <div class="ohud-qbe-actions">
        <button type="button" class="ohud-qbe-btn" data-action="qbe-reset" ${resetDisabled ? "disabled" : ""}>Reset</button>
        <button type="button" class="ohud-qbe-btn" data-action="qbe-cancel" ${busy ? "disabled" : ""}>Cancel</button>
        <button type="button" class="ohud-qbe-btn is-primary" data-action="qbe-save" ${saveDisabled ? "disabled" : ""}>Save</button>
      </div>
    </div>
  </div>`;
}
