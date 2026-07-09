// Combat HUD — Toggle / Stance / Maintained Ability Execution (Phase 4.1B.3)
// preconditions (PURE). No OBR, no DOM, no Supabase, no combat math.
//
// Sibling of instantAbilityPolicy.js, deliberately NOT merged with it: same
// precondition shape today (no target/body-zone concept, combat_execute_action
// requires an active encounter with no free-play fallback — see
// docs/PHASE_4_1B_3_TOGGLE_STANCE_MAINTAINED_AUDIT.md §6), but toggle
// abilities are a genuinely separate execution class (their own server RPC,
// their own ON/OFF state) that may need its own preconditions later (e.g. an
// upkeep check) without disturbing instant/self's.

export const TOGGLE_ABILITY_BLOCK_REASON = Object.freeze({
  noCharacter: "No character loaded.",
  noAbility: "No ability selected.",
  inFlight: "Ability is resolving.",
  noActiveEncounter: "Not in an active encounter.",
});

function blocked(reason) {
  return { uiAllowed: false, uiBlockReason: reason };
}

const ALLOWED = Object.freeze({ uiAllowed: true, uiBlockReason: null });

/**
 * @param {{
 *   sourceCharacterId?: (string|null),
 *   abilityId?: (string|null),
 *   inFlight?: boolean,
 *   sessionExists?: boolean,
 * }} ctx
 * @returns {{ uiAllowed: boolean, uiBlockReason: (string|null) }}
 */
export function evaluateToggleAbilityExecution(ctx = {}) {
  const {
    sourceCharacterId = null,
    abilityId = null,
    inFlight = false,
    sessionExists = false,
  } = ctx;

  if (!sourceCharacterId) return blocked(TOGGLE_ABILITY_BLOCK_REASON.noCharacter);
  if (!abilityId) return blocked(TOGGLE_ABILITY_BLOCK_REASON.noAbility);
  if (inFlight) return blocked(TOGGLE_ABILITY_BLOCK_REASON.inFlight);
  if (!sessionExists) return blocked(TOGGLE_ABILITY_BLOCK_REASON.noActiveEncounter);
  return ALLOWED;
}

/**
 * A compact signature of "what this toggle-ability request was FOR" (source,
 * ability). Used to detect that source/ability changed while a
 * combat_execute_action call was in flight, so a stale response is never
 * applied to a since-changed HUD state.
 */
export function buildToggleAbilityRequestSignature(ctx = {}) {
  return `${ctx.sourceCharacterId ?? ""}|${ctx.abilityId ?? ""}`;
}

/** True when `currentCtx` no longer matches the context an in-flight
 *  request was built for. */
export function isToggleAbilityResultStale(requestCtx, currentCtx) {
  return buildToggleAbilityRequestSignature(requestCtx) !== buildToggleAbilityRequestSignature(currentCtx);
}
