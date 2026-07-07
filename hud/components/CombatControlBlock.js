// Combat HUD — Combat Control composite (Phase 2.2.3, reworked Phase 4.0f).
//
// One module, three zones:
//   ┌─────────────┬───────────────┐
//   │  Target     │  AUTO · N     │   ← top: two columns
//   │             │  ARMED · N    │
//   ├─────────────┴───────────────┤
//   │   ATTACK      │  END TURN   │   ← bottom: one full-width action bar
//   └───────────────┴─────────────┘
// Outer 330×165 (hudLayout.js DEFAULT_HUD_LAYOUT_V2.combatControl) — untouched.
//
// Modifiers now split into two honest, read-only sections instead of one flat
// chip wall:
//   AUTO  — passive + narrative groups (armor/weapon/implant/passive ability/
//           status/GM effect): applied automatically whenever the server
//           decides its conditions hold. Never toggleable here. Still an
//           honest empty stub as of Phase 4.1A — no canonical "current passive
//           modifier list" producer exists yet (see the audit doc).
//   ARMED — attack technique(s) armed from the Skills Block for the NEXT
//           attack (Phase 4.1A). Each chip has its own × (disarm); arming/
//           validation/consumption all live server-side (perform_attack,
//           migration 100) and in armedTechniqueMemory.js — this block only
//           renders whatever ephemeral state + already-mapped quickActions
//           say is currently armed.
// Both sections carry data-modifier-section/data-modifier-state hooks for the
// future Attack Setup popover; no such popover exists yet.
//
// The bottom action bar reuses the EXACT SAME data-action values and the EXACT
// SAME disabled-reason selectors as before (selectCanAct/selectDisabledReason/
// ui.basicAttack/canEndTurn) — only the markup/CSS changed. MAIN/MOVE economy
// pips are gone from here (Player Block already shows them); END TURN is now
// always rendered as the second half of the bar (previously entirely absent
// outside an active turn) so the bar is always two equal buttons, matching an
// honest disabled reason when it can't be used yet — the underlying gate
// (canEndTurn) is unchanged.

import { renderTargetBlock } from "./TargetBlock.js";
import { modChip, armedChip } from "./ModifierBlock.js";
import {
  selectModifierGroups,
  selectSelectedSkill,
  selectActionLabel,
  selectCanAct,
  selectDisabledReason,
  selectCurrentActionCost,
} from "../core/combatHudSelectors.js";
import { canEndTurn } from "../session/combatSessionPolicy.js";
import { esc, tipAttr, cls } from "./hudDom.js";

/** Compact chips shown per modifier section before a "+N more" overflow. */
const MAX_SECTION_CHIPS = 2;

function titleCase(word) {
  if (!word) return "";
  return word.charAt(0) + word.slice(1).toLowerCase();
}

/** One AUTO/ARMED mini-section: header + up to MAX_SECTION_CHIPS chips (or an
 *  honest empty line) + a `+N more` overflow. Never invents a modifier that
 *  isn't in `mods`. */
function modifierSection({ key, title, mods, emptyText, chipRenderer = modChip }) {
  const list = Array.isArray(mods) ? mods : [];
  const shown = list.slice(0, MAX_SECTION_CHIPS);
  const hidden = list.slice(MAX_SECTION_CHIPS);
  const state = list.length ? "active" : "empty";

  let body;
  if (!list.length) {
    body = `<div class="ohud-cc-modsec-empty">${esc(emptyText)}</div>`;
  } else {
    const chips = shown.map(chipRenderer).join("");
    const overflow = hidden.length
      ? `<span class="ohud-mod ohud-mod--more"${tipAttr(`${hidden.length} more`, hidden.map((m) => m.name))}>+${hidden.length}</span>`
      : "";
    body = `<div class="ohud-cc-modsec-chips">${chips}${overflow}</div>`;
  }

  return `<div class="ohud-cc-modsec" data-modifier-section="${key}" data-modifier-state="${state}">
    <div class="ohud-cc-modsec-head">${esc(title)} · ${list.length}</div>
    ${body}
  </div>`;
}

function renderModifiers(state) {
  const groups = selectModifierGroups(state);
  const auto = [...(groups.passive ?? []), ...(groups.narrative ?? [])];
  const armed = groups.active ?? [];

  // Phase 3E.0: GM-only COMBAT button toggles the GM Combat Tracker companion
  // popover. Never rendered for a plain player.
  const combatButton = state?.viewer?.role === "gm"
    ? `<button type="button" class="ohud-cc-combat-btn" data-action="toggle-gm-tracker" title="GM Combat Tracker">COMBAT</button>`
    : "";

  return `<section class="ohud-cc-mod" data-block="modifiers">
    <div class="ohud-panel-head"><span class="ohud-panel-label">Modifiers</span>${combatButton}</div>
    ${modifierSection({ key: "auto", title: "AUTO", mods: auto, emptyText: "No automatic effects" })}
    ${modifierSection({ key: "armed", title: "ARMED", mods: armed, emptyText: "None selected", chipRenderer: armedChip })}
  </section>`;
}

/** Mirrors canEndTurn's own branches purely to produce an honest tooltip —
 *  the enable/disable decision itself always comes from canEndTurn(). */
function endTurnDisabledReason(session, viewerRole) {
  if (!session || session.exists !== true || session.status !== "active" || session.currentParticipantId == null) {
    return "No active combat session";
  }
  const isGm = String(viewerRole ?? "").toLowerCase() === "gm";
  if (isGm && session.isSelectedCharacterTurn) return null;
  if (session.isCurrentPlayerTurn === true) return null;
  return "Not your turn";
}

/** Resolve the ATTACK slot's label/action/disabled/tooltip from the SAME
 *  selectors ActionBlock.js already used — no new business logic. */
function resolveAttackSlot(state) {
  if (!selectSelectedSkill(state)) {
    const ba = state?.ui?.basicAttack ?? { inFlight: false, uiAllowed: false, uiBlockReason: "No character loaded." };
    const disabled = ba.inFlight || !ba.uiAllowed;
    const tip = disabled
      ? tipAttr("Action unavailable", [esc(ba.uiBlockReason || (ba.inFlight ? "Attack is resolving." : "Not available"))])
      : tipAttr("Attack", ["Costs: MAIN"]);
    return { label: "Attack", action: "basic-attack", disabled, tip };
  }

  const label = titleCase(selectActionLabel(state));
  const can = selectCanAct(state);
  const reason = selectDisabledReason(state);
  const disabled = !can || Boolean(reason);
  const cost = selectCurrentActionCost(state);
  const displayLabel = reason === "Select a target." ? "Select target" : label;
  const tip = disabled
    ? tipAttr("Action unavailable", [esc(reason || "Not available")])
    : tipAttr(label, [`Costs: ${cost}`, "Resolution arrives in a later phase"]);
  return { label: displayLabel, action: "primary", disabled, tip };
}

/** Two equal-width buttons filling the whole bottom bar — ATTACK (primary,
 *  cyan) and END TURN (secondary, amber) always both present; each disabled
 *  independently using its own pre-existing gate, never hidden. */
function renderActionBar(state) {
  const attack = resolveAttackSlot(state);
  const session = state?.snapshot?.combatSession ?? null;
  const role = state?.viewer?.role;
  const endTurnDisabled = !canEndTurn(session, role);
  const endTurnReason = endTurnDisabled ? endTurnDisabledReason(session, role) : null;
  const endTurnTip = endTurnDisabled
    ? tipAttr("End turn unavailable", [esc(endTurnReason || "Not available")])
    : tipAttr("End turn", ["Unspent MAIN/MOVE are lost"]);

  return `<div class="ohud-cc-actionbar" data-block="action">
    <button type="button" class="${cls("ohud-cc-abtn", "ohud-cc-abtn--attack", attack.disabled ? "is-disabled" : "")}"
      data-action="${attack.action}"${attack.disabled ? ' aria-disabled="true"' : ""}${attack.tip}>${esc(attack.label)}</button>
    <button type="button" class="${cls("ohud-cc-abtn", "ohud-cc-abtn--endturn", endTurnDisabled ? "is-disabled" : "")}"
      data-action="end-turn"${endTurnDisabled ? ' aria-disabled="true"' : ""}${endTurnTip}>END TURN</button>
  </div>`;
}

export function renderCombatControlBlock(state) {
  return `<section class="ohud-panel ohud-panel--cc" data-block="combatControl">
    <div class="ohud-cc">
      <div class="ohud-cc-top">
        <div class="ohud-cc-target">${renderTargetBlock(state)}</div>
        ${renderModifiers(state)}
      </div>
      ${renderActionBar(state)}
    </div>
  </section>`;
}
