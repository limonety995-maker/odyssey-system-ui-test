// HUD Abilities — Phase 4.0b/4.0e, HUD refine 4.0i: quickbar strip render for
// the Skills module (PURE).
//
// Renders the persisted quickbar as slot tiles: slots 0-9 (1-10) fill the TOP
// row, slots 10-19 (11-20) fill the row BELOW it — matching the Quickbar
// Editor's fixed row order (Phase 4.0c). Each occupied tile shows icon / short
// name / type marker / cooldown / ACTIVE / disabled. There is no separate EDIT
// control (Phase 4.0i): an empty slot IS the editor trigger — clicking one
// dispatches the exact same open-quickbar-editor action the old EDIT button
// used, so there is only ever one editor-opening code path.
//
// This is the ONLY place the Skills module learns about abilities, and it only
// consumes the already-mapped, already-SAFE runtime (hud/abilities/*). Clicking
// a FILLED tile requests a detail tooltip — it NEVER executes or changes
// Target/Action, and never opens the editor.

import { esc, cls, tipAttr } from "../components/hudDom.js";
import { skillIconSvg, ICON_LOCK } from "../components/hudIcons.js";
import { rowOfSlot, FIRST_ROW_SIZE } from "./quickbarLayoutPolicy.js";
import { abilityTooltipLines } from "./AbilityTooltip.js";
import { deriveSlotAvailability, SLOT_AVAILABILITY } from "./abilityAvailabilityPolicy.js";

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

// Phase 4.1A.2: one small marker per canonical availability category —
// mutually exclusive (deriveSlotAvailability returns exactly one), so at
// most one of these ever renders. "active" (toggle ON) is orthogonal and
// rendered alongside separately, unchanged from before.
function stateMarkerHtml(availability, action) {
  switch (availability) {
    case SLOT_AVAILABILITY.armed:
      return `<span class="ohud-qb-state ohud-qb-state--armed">ARMED</span>`;
    case SLOT_AVAILABILITY.cooldown:
      return `<span class="ohud-qb-cd">${Number(action.cooldown?.current) || 0}</span>`;
    case SLOT_AVAILABILITY.insufficientResource: {
      const costs = action.costs ?? {};
      const label = Number(costs.psi) > 0 ? `PSI ${costs.psi}` : Number(costs.charges) > 0 ? `CHG ${costs.charges}` : "LOW";
      return `<span class="ohud-qb-state ohud-qb-state--resource">${esc(label)}</span>`;
    }
    case SLOT_AVAILABILITY.unsupported:
    case SLOT_AVAILABILITY.unavailable:
      return `<span class="ohud-qb-state ohud-qb-state--lock" aria-hidden="true">${ICON_LOCK}</span>`;
    default:
      return "";
  }
}

function occupiedTile(slot, action, armedActionId) {
  if (!action) {
    // A slot whose action vanished from the library — visible + flagged.
    return `<button type="button" class="${cls("ohud-qb-slot", "is-missing")}" data-action="show-ability-detail" data-slot-index="${slot.slotIndex}" ${tipAttr("Missing action", ["This action is no longer available.", "Open EDIT to remove it."])}>
      <span class="ohud-qb-missing">?</span>
    </button>`;
  }
  const accent = SEMANTIC_ACCENT[action.semanticKind] ?? "neutral";
  // Server-truth: available now factors in cooldown/resource sufficiency/
  // effect support (migration 101), so this dimming class is honestly correct
  // for every non-ready state, not just the old is_enabled/skip-turn/alive set.
  const disabled = action.state?.available === false;
  const active = action.state?.active === true;
  const mark = TYPE_MARK[action.type] ?? "";

  // Phase 4.1A: an attack_technique slot arms/disarms itself instead of just
  // showing a detail toast — directed/instant/toggle are completely untouched
  // (still show-ability-detail, never execute). Arming is allowed even while
  // the technique looks disabled IF it's already the armed one (so the player
  // can always disarm a technique that became invalid after arming — see
  // CombatHudModule.js's toggle-armed-technique guard).
  const isTechnique = action.type === "attack_technique";
  const armed = isTechnique && armedActionId != null && armedActionId === action.characterActionId;
  // Phase 4.1A.2: canonical category driving the state marker below — armed
  // takes visual priority (see abilityAvailabilityPolicy.js's doc comment)
  // even when the underlying ability also looks disabled.
  const availability = deriveSlotAvailability(action, armed);
  const dataAction = isTechnique ? "toggle-armed-technique" : "show-ability-detail";
  const tip = tipAttr(action.name, [
    ...abilityTooltipLines(action),
    isTechnique ? (armed ? "Prepared for next attack" : "Click to arm for your next attack") : "",
  ]);

  // The state marker and the (orthogonal) active/ON marker share one
  // top-right badge group — wrapped together (rather than each absolutely
  // positioned on its own) so neither ever renders on top of the other.
  const stateMarker = stateMarkerHtml(availability, action);
  const activeMarker = active ? `<span class="ohud-qb-active">ON</span>` : "";
  const badges = stateMarker || activeMarker
    ? `<span class="ohud-qb-badges">${stateMarker}${activeMarker}</span>`
    : "";
  return `<button type="button" class="${cls("ohud-qb-slot", `ohud-accent--${accent}`, disabled ? "is-disabled" : "", active ? "is-active" : "", armed ? "is-armed" : "")}" data-action="${dataAction}" data-action-id="${esc(action.characterActionId)}" data-slot-index="${slot.slotIndex}" data-slot-state="${availability}"${tip}>
    <span class="ohud-qb-icon">${skillIconSvg(action.iconKey)}</span>
    <span class="ohud-qb-name">${esc(action.name)}</span>
    ${mark ? `<span class="ohud-qb-type">${esc(mark)}</span>` : ""}
    ${badges}
  </button>`;
}

// An empty slot doubles as the open-editor trigger (Phase 4.0i) — same
// data-action the old EDIT button used, so CombatHudModule.js needs no new
// command or dispatch case. When editing isn't allowed, it stays an inert,
// non-interactive placeholder (parity with the old canEdit-gated EDIT button).
function emptyTile(slotIndex, canEdit) {
  if (!canEdit) {
    return `<div class="${cls("ohud-qb-slot", "is-empty")}" data-slot-index="${slotIndex}" aria-hidden="true"></div>`;
  }
  return `<button type="button" class="${cls("ohud-qb-slot", "is-empty", "is-editable")}" data-action="open-quickbar-editor" data-slot-index="${slotIndex}" aria-label="Open quickbar editor"${tipAttr("Edit quickbar", ["Assign, reorder or remove actions."])}></button>`;
}

/**
 * Render the quickbar strip body for the Skills module.
 * @param {object} runtime mapped abilities runtime (snapshot.quickbar)
 * @param {{ canEdit?: boolean, armedActionId?: (string|null) }} [opts]
 * @returns {string} HTML for the panel body
 */
export function renderQuickbarStrip(runtime, opts = {}) {
  const rt = runtime && typeof runtime === "object" ? runtime : { quickActions: [], quickbar: { slots: [], maxSlots: FIRST_ROW_SIZE } };
  const slots = Array.isArray(rt.quickbar?.slots) ? rt.quickbar.slots : [];
  const canEdit = opts.canEdit !== false;
  const armedActionId = opts.armedActionId ?? null;

  // Group slots by row; render rows in ASCENDING order so row 0 (slots 1-10)
  // is on TOP and row 1 (slots 11-20) is BELOW it — matching the Quickbar
  // Editor's fixed row order. A second row only appears here at all when the
  // runtime actually has slots in it (rows.get(1) is simply absent otherwise).
  const rows = new Map();
  for (const slot of slots) {
    const r = rowOfSlot(slot.slotIndex);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(slot);
  }
  const rowKeys = [...rows.keys()].sort((a, b) => a - b);

  const rowsHtml = rowKeys.map((r) => {
    const tiles = rows.get(r)
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((slot) => {
        if (slot.empty || slot.characterActionId == null) return emptyTile(slot.slotIndex, canEdit);
        return occupiedTile(slot, actionById(rt, slot.characterActionId), armedActionId);
      })
      .join("");
    return `<div class="ohud-qb-row" data-row="${r}">${tiles}</div>`;
  }).join("");

  // No slots at all (fresh character, no layout saved yet) is itself an
  // "empty" state — it gets the same open-editor trigger as any empty tile,
  // rather than a dead-end message.
  const body = slots.length
    ? `<div class="ohud-qb">${rowsHtml}</div>`
    : canEdit
      ? `<button type="button" class="ohud-qb ohud-qb--empty ohud-qb--empty-clickable" data-action="open-quickbar-editor" aria-label="Open quickbar editor"${tipAttr("Edit quickbar", ["No actions assigned yet — click to add some."])}><div class="ohud-muted-fill">No quickbar actions</div></button>`
      : `<div class="ohud-qb ohud-qb--empty"><div class="ohud-muted-fill">No quickbar actions</div></div>`;

  return `<div class="ohud-qb-wrap">${body}</div>`;
}
