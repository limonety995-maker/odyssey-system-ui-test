// Combat HUD — Action button (Phase 2 · 2.1, read-only preview).
//
// A small primary button whose verb is derived from the drafted action
// (Attack/Throw/Cast/Use/Activate) plus a tiny MAIN/MOVE economy hint. Rendered
// INSIDE the narrow Mod+Action column (see ModifierBlock). In Phase 2 it never
// resolves combat — clicking only surfaces a transient note (handled by the
// layout); when unavailable it renders disabled with a reason tooltip.

import {
  selectActionLabel,
  selectCanAct,
  selectDisabledReason,
  selectCurrentActionCost,
  selectSelectedSkill,
} from "../core/combatHudSelectors.js";
import { esc, tipAttr, cls } from "./hudDom.js";

/** Title-case the ALL-CAPS verb from the selector. */
function titleCase(word) {
  if (!word) return "";
  return word.charAt(0) + word.slice(1).toLowerCase();
}

/** Basic Weapon Attack v1 — no skill/technique drafted (plain "Attack"). The
 *  server (perform_attack) is the sole judge of hit/miss/damage/ammo; this
 *  button only reflects basicAttackPolicy's PRECONDITIONS (source/target/
 *  weapon/zone present) — never a fabricated reason like "No ammo". */
function renderBasicAttackButton(state) {
  const ba = state?.ui?.basicAttack ?? { inFlight: false, uiAllowed: false, uiBlockReason: "No character loaded." };
  const disabled = ba.inFlight || !ba.uiAllowed;
  const tip = disabled
    ? tipAttr("Action unavailable", [esc(ba.uiBlockReason || (ba.inFlight ? "Attack is resolving." : "Not available"))])
    : tipAttr("Attack", ["Costs: MAIN"]);

  return `<div class="ohud-action">
    <span class="ohud-action-econ">
      <span class="ohud-econ-pip is-spend">M</span>
      <span class="ohud-econ-pip">Mv</span>
    </span>
    <button type="button" class="${cls("ohud-action-btn", disabled ? "is-disabled" : "is-ready")}"
      data-action="basic-attack"${disabled ? ' aria-disabled="true"' : ""}${tip}>Attack</button>
  </div>`;
}

export function renderActionButton(state) {
  if (!selectSelectedSkill(state)) return renderBasicAttackButton(state);

  const label = titleCase(selectActionLabel(state));
  const can = selectCanAct(state);
  const reason = selectDisabledReason(state);
  const disabled = !can || Boolean(reason);
  const cost = selectCurrentActionCost(state);
  const displayLabel = reason === "Select a target." ? "Select target" : label;

  const tip = disabled
    ? tipAttr("Action unavailable", [esc(reason || "Not available")])
    : tipAttr(label, [`Costs: ${cost}`, "Resolution arrives in a later phase"]);

  return `<div class="ohud-action">
    <span class="ohud-action-econ">
      <span class="${cls("ohud-econ-pip", cost === "MAIN" ? "is-spend" : "")}">M</span>
      <span class="${cls("ohud-econ-pip", cost === "MOVE" ? "is-spend" : "")}">Mv</span>
    </span>
    <button type="button" class="${cls("ohud-action-btn", disabled ? "is-disabled" : "is-ready")}"
      data-action="primary"${disabled ? ' aria-disabled="true"' : ""}${tip}>${esc(displayLabel)}</button>
  </div>`;
}

/** Phase 2.2 standalone Action module — the button fills the small rect. */
export function renderActionModule(state) {
  return `<section class="ohud-panel ohud-panel--action ohud-panel--bare" data-block="action">
    ${renderActionButton(state)}
  </section>`;
}
