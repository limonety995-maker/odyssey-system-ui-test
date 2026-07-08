// Combat HUD — Instant / Self Ability Execution (Phase 4.1B.1) preconditions
// (PURE). No OBR, no DOM, no Supabase, no combat math.
//
// Sibling of directAbilityAttackPolicy.js, deliberately NOT merged with it:
// an instant/self ability has no target/body-zone concept at all — reusing
// the direct-attack policy's target checks would be dishonest (there is
// nothing to target). See docs/PHASE_4_1B_1_INSTANT_SELF_ABILITIES_AUDIT.md
// §5/6/7 for why: combat_execute_action/use_ability resolves the target to
// the acting character itself whenever none is supplied.
//
// combat_execute_action REQUIRES an active combat encounter (no free-play
// fallback, unlike perform_attack) — confirmed by reading the RPC's own
// body (ENCOUNTER_NOT_ACTIVE is the first possible rejection). This policy
// therefore blocks locally when no active session exists, rather than
// letting a doomed RPC call reach the server.

export const INSTANT_ABILITY_BLOCK_REASON = Object.freeze({
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
export function evaluateInstantAbilityExecution(ctx = {}) {
  const {
    sourceCharacterId = null,
    abilityId = null,
    inFlight = false,
    sessionExists = false,
  } = ctx;

  if (!sourceCharacterId) return blocked(INSTANT_ABILITY_BLOCK_REASON.noCharacter);
  if (!abilityId) return blocked(INSTANT_ABILITY_BLOCK_REASON.noAbility);
  if (inFlight) return blocked(INSTANT_ABILITY_BLOCK_REASON.inFlight);
  if (!sessionExists) return blocked(INSTANT_ABILITY_BLOCK_REASON.noActiveEncounter);
  return ALLOWED;
}

/**
 * A compact signature of "what this instant-ability request was FOR"
 * (source, ability). Used to detect that source/ability changed while a
 * combat_execute_action call was in flight, so a stale response is never
 * applied to a since-changed HUD state.
 */
export function buildInstantAbilityRequestSignature(ctx = {}) {
  return `${ctx.sourceCharacterId ?? ""}|${ctx.abilityId ?? ""}`;
}

/** True when `currentCtx` no longer matches the context an in-flight
 *  request was built for. */
export function isInstantAbilityResultStale(requestCtx, currentCtx) {
  return buildInstantAbilityRequestSignature(requestCtx) !== buildInstantAbilityRequestSignature(currentCtx);
}
