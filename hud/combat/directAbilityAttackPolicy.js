// Combat HUD — Direct Ability Attack (Phase 4.1B.0) preconditions (PURE).
//
// Sibling of basicAttackPolicy.js, deliberately NOT merged with it: a direct
// ability attack has no weapon at all (see hud/combat/directAbilityAttackPayload
// usage in basicAttackPayload.js's buildDirectAbilityAttackCtx) — reusing the
// weapon-attack policy's noWeapon check would be dishonest (there is no weapon
// slot to blame). No OBR, no DOM, no Supabase, no combat math — the server
// remains the sole authority for cooldown/PSI/turn/MAIN; this only decides
// whether the client may even ATTEMPT the RPC call.

export const DIRECT_ABILITY_ATTACK_BLOCK_REASON = Object.freeze({
  noCharacter: "No character loaded.",
  noAbility: "No ability selected.",
  inFlight: "Ability attack is resolving.",
  // Phase 4.1B.0 spec §D, verbatim required wording.
  noTarget: "Select a target first.",
  targetNotLinked: "Target has no linked character.",
  selfTarget: "Cannot target yourself.",
  noZone: "Select a body zone.",
  zoneUnresolved: "Target body zone data unavailable.",
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
 *   bodyZoneId?: (string|null),
 *   resolvedBodyPartId?: (string|null),
 *   inFlight?: boolean,
 * }} ctx
 * @returns {{ uiAllowed: boolean, uiBlockReason: (string|null) }}
 */
export function evaluateDirectAbilityAttack(ctx = {}) {
  const {
    sourceCharacterId = null,
    abilityId = null,
    targetTokenId = null,
    targetCharacterId = null,
    bodyZoneId = null,
    resolvedBodyPartId = null,
    inFlight = false,
  } = ctx;

  if (!sourceCharacterId) return blocked(DIRECT_ABILITY_ATTACK_BLOCK_REASON.noCharacter);
  if (!abilityId) return blocked(DIRECT_ABILITY_ATTACK_BLOCK_REASON.noAbility);
  if (inFlight) return blocked(DIRECT_ABILITY_ATTACK_BLOCK_REASON.inFlight);
  if (!targetTokenId && !targetCharacterId) return blocked(DIRECT_ABILITY_ATTACK_BLOCK_REASON.noTarget);
  if (!targetCharacterId) return blocked(DIRECT_ABILITY_ATTACK_BLOCK_REASON.targetNotLinked);
  if (String(targetCharacterId) === String(sourceCharacterId)) return blocked(DIRECT_ABILITY_ATTACK_BLOCK_REASON.selfTarget);
  // Existing default body-zone policy (targetSelectionState.js's
  // getDefaultZoneId) already auto-selects a zone (TORSO) the moment a target
  // is picked — these two checks mirror basicAttackPolicy.js's identical
  // checks, they do not invent a new policy.
  if (!bodyZoneId) return blocked(DIRECT_ABILITY_ATTACK_BLOCK_REASON.noZone);
  if (!resolvedBodyPartId) return blocked(DIRECT_ABILITY_ATTACK_BLOCK_REASON.zoneUnresolved);
  return ALLOWED;
}

/**
 * A compact signature of "what this ability attack request was FOR" (source,
 * ability, target). Used to detect that source/ability/target changed while
 * a perform_attack call was in flight, so a stale response is never applied
 * to a since-changed HUD state.
 */
export function buildDirectAbilityAttackRequestSignature(ctx = {}) {
  return `${ctx.sourceCharacterId ?? ""}|${ctx.abilityId ?? ""}|${ctx.targetCharacterId ?? ""}`;
}

/** True when `currentCtx` no longer matches the context an in-flight request
 *  was built for. */
export function isDirectAbilityAttackResultStale(requestCtx, currentCtx) {
  return buildDirectAbilityAttackRequestSignature(requestCtx) !== buildDirectAbilityAttackRequestSignature(currentCtx);
}
