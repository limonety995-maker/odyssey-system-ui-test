// HUD Abilities — Phase 4.0b: quickbar strip render for the Skills module (PURE).
//
// Renders the persisted quickbar as slot tiles: slots 0-9 fill the bottom row,
// slots 10+ start a second row that grows UPWARD (row 1 sits above row 0). Each
// occupied tile shows icon / short name / type marker / cooldown / ACTIVE /
// disabled; empty slots are calm but visible. An EDIT button opens the editor.
//
// This is the ONLY place the Skills module learns about abilities, and it only
// consumes the already-mapped, already-SAFE runtime (hud/abilities/*). Clicking
// a tile requests a detail tooltip — it NEVER executes or changes Target/Action.

import { esc, cls, tipAttr } from "../components/hudDom.js";
import { skillIconSvg } from "../components/hudIcons.js";
import { rowOfSlot, FIRST_ROW_SIZE } from "./quickbarLayoutPolicy.js";
import { abilityTooltipLines } from "./AbilityTooltip.js";

// semanticKind → HUD accent class (same accent vocabulary as SkillBlock).
const SEMANTIC_ACCENT = {
  attack: "attack",
  psi: "psionic",
  tech: "implant",
  utility: "neutral",
  intervention: "intervention",
};

// Short type marker shown on the tile corner.
const TYPE_MARK = {
  attack_technique: "ATK",
  directed: "DIR",
  instant: "INS",
  toggle: "TGL",
};

function actionById(runtime, id) {
  if (!id) return null;
  return (runtime.quickActions ?? []).find((a) => a.characterActionId === id) ?? null;
}

function occupiedTile(slot, action) {
  if (!action) {
    // A slot whose action vanished from the library — visible + flagged.
    return `<button type="button" class="${cls("ohud-qb-slot", "is-missing")}" data-action="show-ability-detail" data-slot-index="${slot.slotIndex}" ${tipAttr("Missing action", ["This action is no longer available.", "Open EDIT to remove it."])}>
      <span class="ohud-qb-missing">?</span>
    </button>`;
  }
  const accent = SEMANTIC_ACCENT[action.semanticKind] ?? "neutral";
  const disabled = action.state?.available === false;
  const active = action.state?.active === true;
  const cd = Number(action.cooldown?.current) || 0;
  const mark = TYPE_MARK[action.type] ?? "";
  const tip = tipAttr(action.name, abilityTooltipLines(action));

  return `<button type="button" class="${cls("ohud-qb-slot", `ohud-accent--${accent}`, disabled ? "is-disabled" : "", active ? "is-active" : "")}" data-action="show-ability-detail" data-action-id="${esc(action.characterActionId)}" data-slot-index="${slot.slotIndex}"${tip}>
    <span class="ohud-qb-icon">${skillIconSvg(action.iconKey)}</span>
    <span class="ohud-qb-name">${esc(action.name)}</span>
    ${mark ? `<span class="ohud-qb-type">${esc(mark)}</span>` : ""}
    ${cd > 0 ? `<span class="ohud-qb-cd">${cd}</span>` : ""}
    ${active ? `<span class="ohud-qb-active">ON</span>` : ""}
  </button>`;
}

function emptyTile(slotIndex) {
  return `<div class="${cls("ohud-qb-slot", "is-empty")}" data-slot-index="${slotIndex}" aria-hidden="true"></div>`;
}

/**
 * Render the quickbar strip body for the Skills module.
 * @param {object} runtime mapped abilities runtime (snapshot.quickbar)
 * @param {{ canEdit?: boolean }} [opts]
 * @returns {string} HTML for the panel body
 */
export function renderQuickbarStrip(runtime, opts = {}) {
  const rt = runtime && typeof runtime === "object" ? runtime : { quickActions: [], quickbar: { slots: [], maxSlots: FIRST_ROW_SIZE } };
  const slots = Array.isArray(rt.quickbar?.slots) ? rt.quickbar.slots : [];
  const canEdit = opts.canEdit !== false;

  // Group slots by row; render rows in DESCENDING order so higher rows sit on
  // top (second row grows upward). Within a row, ascending slot index.
  const rows = new Map();
  for (const slot of slots) {
    const r = rowOfSlot(slot.slotIndex);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(slot);
  }
  const rowKeys = [...rows.keys()].sort((a, b) => b - a);

  const rowsHtml = rowKeys.map((r) => {
    const tiles = rows.get(r)
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((slot) => {
        if (slot.empty || slot.characterActionId == null) return emptyTile(slot.slotIndex);
        return occupiedTile(slot, actionById(rt, slot.characterActionId));
      })
      .join("");
    return `<div class="ohud-qb-row" data-row="${r}">${tiles}</div>`;
  }).join("");

  const editBtn = canEdit
    ? `<button type="button" class="ohud-qb-edit" data-action="open-quickbar-editor" ${tipAttr("Edit quickbar", ["Assign, reorder or remove actions."])}>EDIT</button>`
    : "";

  const body = slots.length
    ? `<div class="ohud-qb">${rowsHtml}</div>`
    : `<div class="ohud-qb ohud-qb--empty"><div class="ohud-muted-fill">No quickbar actions</div></div>`;

  return `<div class="ohud-qb-wrap">${body}${editBtn}</div>`;
}
