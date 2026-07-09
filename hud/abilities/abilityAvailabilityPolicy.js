// HUD Abilities — Phase 4.1A.2: canonical slot availability categorization (PURE).
//
// ONE shared derivation, used by QuickbarView (slot visual state),
// CombatControlBlock (ARMED panel — must never disagree with the slot) and
// AbilityDetailCard (Status line). Every input is either server-truth
// (mapQuickAction's `state`/`cooldown` blocks — never re-derived or guessed)
// or the client's own ephemeral "is this the armed one" fact — the ONLY
// concept this module is allowed to know that the server doesn't already say.
//
// Priority order (first match wins): armed > unsupported > cooldown >
// insufficient resource > unavailable (any other server disabledReason) >
// ready. "armed" wins even over a state that would otherwise block arming,
// because a technique CAN become invalid after being armed (server state
// changed elsewhere) and the player must still be able to see + disarm it —
// see armedTechniqueMemory.js's own doc comment on this exact scenario.

export const SLOT_AVAILABILITY = Object.freeze({
  ready: "ready",
  armed: "armed",
  cooldown: "cooldown",
  insufficientResource: "insufficient_resource",
  unsupported: "unsupported",
  unavailable: "unavailable",
});

/**
 * @param {object} action mapped quick action (abilityRuntimeMapper.mapQuickAction shape)
 * @param {boolean} [isArmed] whether THIS action is the character's currently armed technique
 * @returns {string} one of SLOT_AVAILABILITY's values
 */
export function deriveSlotAvailability(action, isArmed = false) {
  const a = action && typeof action === "object" ? action : {};
  const state = a.state ?? {};
  const cooldown = a.cooldown ?? {};

  if (isArmed) return SLOT_AVAILABILITY.armed;
  if (state.executionAvailable === false) return SLOT_AVAILABILITY.unsupported;
  if (Number(cooldown.current) > 0) return SLOT_AVAILABILITY.cooldown;
  // resourceSufficient is a structural boolean (migration 101) — never a
  // parse of disabledReason's human text.
  if (state.available === false && state.resourceSufficient === false) return SLOT_AVAILABILITY.insufficientResource;
  if (state.available === false) return SLOT_AVAILABILITY.unavailable;
  return SLOT_AVAILABILITY.ready;
}

// Phase 4.1B.0 — Direct Ability Attack.
//
// A quick action is eligible for DIRECT execution (immediate, server-
// authoritative single-target ability attack — see
// hud/scene/sceneSelectionController.js's "execute-direct-ability" handler)
// when it is an attack_technique whose own executionReason is EXACTLY
// migration 100/101's ACTION_EFFECT_NOT_IMPLEMENTED — the same, already-
// existing, purely metadata-driven signal the audit found (
// docs/PHASE_4_1B_0_DIRECT_ABILITY_ATTACK_AUDIT.md §17): this reason means
// "this ability has a damage/armor effect that cannot be ARMED onto a
// weapon attack" — which is exactly the set of techniques this phase's own
// separate resolver (odyssey_perform_ability_attack via perform_attack's
// mode:"skill" branch) already supports natively. No name-based check, no
// new server field — the client only ever reads action.type/action.state,
// exactly like deriveSlotAvailability above.
export function isDirectAttackAbility(action) {
  const a = action && typeof action === "object" ? action : {};
  return a.type === "attack_technique" && a.state?.executionReason === "ACTION_EFFECT_NOT_IMPLEMENTED";
}

/**
 * Availability for a direct-attack-eligible action (isDirectAttackAbility()
 * already true for it) — deliberately does NOT read
 * state.available/state.executionAvailable, since both are computed
 * server-side folding in the SAME "unsupported for arming" flag that makes
 * this ability direct-attack-eligible in the first place (migration 101);
 * treating that as "unavailable" here would incorrectly lock out every
 * direct-attack-eligible ability, including Etheric Strike, permanently.
 * cooldown/resourceSufficient are computed independently of that flag
 * (confirmed against the migration's SQL) and are exactly what this
 * function derives readiness from instead. A genuinely different blocking
 * reason (character disabled/dead/skip-turn) still surfaces as `unavailable`
 * — detected by `available === false` paired with an executionReason OTHER
 * than the unsupported-effect one, since that combination can only mean some
 * other, higher-priority server-side reason applied (see
 * 101_quickbar_execution_availability.sql's disabledReason CASE priority
 * order: is_enabled → skip-turn → dead → unsupported-effect → cooldown →
 * resource).
 * @param {object} action mapped quick action, already confirmed isDirectAttackAbility()
 * @returns {string} one of SLOT_AVAILABILITY's values (never "armed"/"unsupported")
 */
export function deriveDirectAttackAvailability(action) {
  const a = action && typeof action === "object" ? action : {};
  const state = a.state ?? {};
  const cooldown = a.cooldown ?? {};

  if (state.available === false && state.executionReason !== "ACTION_EFFECT_NOT_IMPLEMENTED") {
    return SLOT_AVAILABILITY.unavailable;
  }
  if (Number(cooldown.current) > 0) return SLOT_AVAILABILITY.cooldown;
  if (state.resourceSufficient === false) return SLOT_AVAILABILITY.insufficientResource;
  return SLOT_AVAILABILITY.ready;
}

// Phase 4.1B.1 — Instant / Self Ability Execution.
//
// A quick action is eligible for INSTANT/SELF execution (immediate, server-
// authoritative, no external target — see
// hud/scene/sceneSelectionController.js's "execute-instant-ability" handler)
// when it is type "instant" — the server's own type derivation
// (101_quickbar_execution_availability.sql) already only ever produces
// "instant" for a non-attack ability whose target_type is NOT
// "character"/"body_part" (those become "directed" instead; an attack
// becomes "attack_technique"), so type==="instant" alone is a sufficient,
// purely metadata-driven signal — see
// docs/PHASE_4_1B_1_INSTANT_SELF_ABILITIES_AUDIT.md §4. The targeting.mode
// check below is a defensive, currently-always-true belt-and-suspenders
// check (never trust one field alone), not a second independent gate.
//
// Unlike Phase 4.1B.0's direct-attack abilities, an instant/self action's
// state.available/state.executionAvailable are NOT tainted by any
// arm-onto-weapon-attack concern — deriveSlotAvailability (above) is reused
// UNCHANGED for these actions, no separate derivation function is needed.
export function isInstantSelfAbility(action) {
  const a = action && typeof action === "object" ? action : {};
  if (a.type !== "instant") return false;
  const mode = a.targeting?.mode;
  return mode !== "character" && mode !== "body_part";
}

// Phase 4.1B.2 — Directed Target Abilities.
//
// A quick action is eligible for DIRECTED-TARGET execution (immediate,
// server-authoritative, requires a selected target character but NO body
// zone — see hud/scene/sceneSelectionController.js's
// "execute-directed-ability" handler) when it is type "directed" AND its
// own targeting.requiresBodyZone is NOT true.
//
// The server's own type derivation (101_quickbar_execution_availability.sql)
// produces "directed" for BOTH target_type='character' (no zone) and
// target_type='body_part' (needs a zone) whenever the ability isn't an
// attack — the two are AMBIGUOUS from `type` alone. targeting.requiresBodyZone
// (already computed server-side as `target_type = 'body_part'`) is the
// existing field that disambiguates them — see
// docs/PHASE_4_1B_2_DIRECTED_TARGET_ABILITIES_AUDIT.md §2/§4. No new field
// was added. A non-attack body_part-targeted ability (requiresBodyZone:true)
// is deliberately OUT of scope for this phase and falls through to the
// existing show-ability-detail click, same as before this phase.
//
// Unlike direct-attack, this action class's state.available/
// executionAvailable are not tainted by any arm-onto-weapon-attack concern —
// deriveSlotAvailability is reused UNCHANGED, no separate derivation needed.
export function isDirectedTargetAbility(action) {
  const a = action && typeof action === "object" ? action : {};
  return a.type === "directed" && a.targeting?.requiresBodyZone !== true;
}

// Phase 4.1B.3 — Toggle / Stance / Maintained Abilities.
//
// A quick action is toggle-eligible (immediate, server-authoritative
// activation/deactivation — see hud/scene/sceneSelectionController.js's
// "execute-toggle-ability" handler) when the server's own type derivation
// (109_toggle_ability_execution.sql) says `type === "toggle"` — produced only
// for a non-attack ability whose definition has `activation_type = 'toggle'`.
// No name-based check, no client-side inference — the server field alone is
// authoritative, exactly like every other class in this file.
export function isToggleAbility(action) {
  const a = action && typeof action === "object" ? action : {};
  return a.type === "toggle";
}

/**
 * Availability for a toggle-eligible action (isToggleAbility() already true
 * for it) — deliberately NOT deriveSlotAvailability unchanged: an already-
 * ACTIVE toggle must stay clickable (to turn off, which is always free) even
 * while its own activation cooldown is still counting down or its resource
 * pool has since dropped below the activation cost — neither fact should ever
 * block a free deactivation. `state.active` overriding everything else is the
 * one deliberate difference from deriveSlotAvailability; an inactive toggle
 * falls back to the exact same cooldown → insufficient-resource → unavailable
 * → ready priority every other class already uses.
 * @param {object} action mapped quick action, already confirmed isToggleAbility()
 * @returns {string} one of SLOT_AVAILABILITY's values (never "armed"/"unsupported")
 */
export function deriveToggleAvailability(action) {
  const a = action && typeof action === "object" ? action : {};
  const state = a.state ?? {};
  const cooldown = a.cooldown ?? {};

  if (state.active === true) return SLOT_AVAILABILITY.ready;
  if (Number(cooldown.current) > 0) return SLOT_AVAILABILITY.cooldown;
  if (state.resourceSufficient === false) return SLOT_AVAILABILITY.insufficientResource;
  if (state.available === false) return SLOT_AVAILABILITY.unavailable;
  return SLOT_AVAILABILITY.ready;
}
