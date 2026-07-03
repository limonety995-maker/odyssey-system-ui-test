// Combat HUD — Basic Weapon Attack v1 preconditions (PURE).
//
// No OBR, no DOM, no Supabase, no combat math. This is the ONLY place that
// decides whether the Action button may fire perform_attack right now, and
// WHY not when it can't. The HUD never guesses a reason not confirmed by a
// real precondition (e.g. it never says "No ammo" — that is the server's
// call; see basicAttackPayload.js / sceneSelectionController.js "execute").

export const BASIC_ATTACK_BLOCK_REASON = Object.freeze({
  noCharacter: "No character loaded.",
  inFlight: "Attack is resolving.",
  noWeapon: "No active weapon.",
  noTarget: "Select a target.",
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
 *   weaponId?: (string|null),
 *   targetTokenId?: (string|null),
 *   targetCharacterId?: (string|null),
 *   bodyZoneId?: (string|null),
 *   resolvedBodyPartId?: (string|null),
 *   inFlight?: boolean,
 * }} ctx
 * @returns {{ uiAllowed: boolean, uiBlockReason: (string|null) }}
 */
export function evaluateBasicAttack(ctx = {}) {
  const {
    sourceCharacterId = null,
    weaponId = null,
    targetTokenId = null,
    targetCharacterId = null,
    bodyZoneId = null,
    resolvedBodyPartId = null,
    inFlight = false,
  } = ctx;

  if (!sourceCharacterId) return blocked(BASIC_ATTACK_BLOCK_REASON.noCharacter);
  if (inFlight) return blocked(BASIC_ATTACK_BLOCK_REASON.inFlight);
  if (!weaponId) return blocked(BASIC_ATTACK_BLOCK_REASON.noWeapon);
  if (!targetTokenId && !targetCharacterId) return blocked(BASIC_ATTACK_BLOCK_REASON.noTarget);
  if (!targetCharacterId) return blocked(BASIC_ATTACK_BLOCK_REASON.targetNotLinked);
  if (String(targetCharacterId) === String(sourceCharacterId)) return blocked(BASIC_ATTACK_BLOCK_REASON.selfTarget);
  if (!bodyZoneId) return blocked(BASIC_ATTACK_BLOCK_REASON.noZone);
  if (!resolvedBodyPartId) return blocked(BASIC_ATTACK_BLOCK_REASON.zoneUnresolved);
  return ALLOWED;
}

/**
 * A compact signature of "what this attack request was FOR" (source, weapon,
 * target). Used to detect that source/weapon/target changed while a
 * perform_attack call was in flight, so a stale response is never applied to
 * a since-changed HUD state.
 */
export function buildAttackRequestSignature(ctx = {}) {
  return `${ctx.sourceCharacterId ?? ""}|${ctx.weaponId ?? ""}|${ctx.targetCharacterId ?? ""}`;
}

/** True when `currentCtx` no longer matches the context an in-flight request
 *  was built for. */
export function isAttackResultStale(requestCtx, currentCtx) {
  return buildAttackRequestSignature(requestCtx) !== buildAttackRequestSignature(currentCtx);
}
