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
