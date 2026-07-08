// Combat HUD — Directed Target Ability Execution (Phase 4.1B.2)
// preconditions (PURE). No OBR, no DOM, no Supabase, no combat math.
//
// Sibling of instantAbilityPolicy.js, deliberately NOT merged with it: this
// ability class REQUIRES a selected target character (never a body zone).
// Sibling of directAbilityAttackPolicy.js too, but deliberately does NOT
// check for self-targeting the way that attack-oriented policy does — this
// phase's spec is explicit: "do not blindly block self-target unless
// metadata/server contract says self-target is invalid" and "do not invent
// faction/team logic client-side." The server (add_character_effect etc.)
// already validates target existence honestly; this policy only checks
// that a target is SELECTED and LINKED to a real character, then lets the
// server accept or reject it.
//
// combat_execute_action REQUIRES an active combat encounter (no free-play
// fallback) — same constraint audited for instant/self abilities in Phase
// 4.1B.1, unchanged here since both classes go through the same RPC.

export const DIRECTED_ABILITY_BLOCK_REASON = Object.freeze({
  noCharacter: "No character loaded.",
  noAbility: "No ability selected.",
  inFlight: "Ability is resolving.",
  // Phase 4.1B.2 spec, verbatim required wording — SAME text Phase 4.1B.0's
  // direct-ability-attack uses, since the missing-target situation reads
  // identically to the player regardless of which ability class it is.
  noTarget: "Select a target first.",
  targetNotLinked: "Target has no linked character.",
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
 *   targetTokenId?: (string|null),
 *   targetCharacterId?: (string|null),
 *   inFlight?: boolean,
 *   sessionExists?: boolean,
 * }} ctx
 * @returns {{ uiAllowed: boolean, uiBlockReason: (string|null) }}
 */
export function evaluateDirectedAbilityExecution(ctx = {}) {
  const {
    sourceCharacterId = null,
    abilityId = null,
    targetTokenId = null,
    targetCharacterId = null,
    inFlight = false,
    sessionExists = false,
  } = ctx;

  if (!sourceCharacterId) return blocked(DIRECTED_ABILITY_BLOCK_REASON.noCharacter);
  if (!abilityId) return blocked(DIRECTED_ABILITY_BLOCK_REASON.noAbility);
  if (inFlight) return blocked(DIRECTED_ABILITY_BLOCK_REASON.inFlight);
  if (!targetTokenId && !targetCharacterId) return blocked(DIRECTED_ABILITY_BLOCK_REASON.noTarget);
  if (!targetCharacterId) return blocked(DIRECTED_ABILITY_BLOCK_REASON.targetNotLinked);
  // Deliberately NO self-target check — see file header. NO body-zone check
  // exists here at all (this ability class has no such concept).
  if (!sessionExists) return blocked(DIRECTED_ABILITY_BLOCK_REASON.noActiveEncounter);
  return ALLOWED;
}

/**
 * A compact signature of "what this directed-ability request was FOR"
 * (source, ability, target). Used to detect that source/ability/target
 * changed while a combat_execute_action call was in flight, so a stale
 * response is never applied to a since-changed HUD state.
 */
export function buildDirectedAbilityRequestSignature(ctx = {}) {
  return `${ctx.sourceCharacterId ?? ""}|${ctx.abilityId ?? ""}|${ctx.targetCharacterId ?? ""}`;
}

/** True when `currentCtx` no longer matches the context an in-flight
 *  request was built for. */
export function isDirectedAbilityResultStale(requestCtx, currentCtx) {
  return buildDirectedAbilityRequestSignature(requestCtx) !== buildDirectedAbilityRequestSignature(currentCtx);
}
