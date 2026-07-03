// Combat HUD — Basic Weapon Attack v1 payload adapter (PURE).
//
// Deliberately does NOT reimplement payload building or result normalization:
// screens/resolveAttack/resolveAttackService.js is already a pure, dependency-
// free module (no DOM/OBR) that IS the canonical perform_attack contract used
// by the old Combat → Resolve Attack screen. Re-using it here — instead of a
// parallel HUD-only implementation — is what GUARANTEES the HUD's payload is
// byte-equivalent to the old screen's for the same inputs, and that server
// result handling (ok:false vs exception vs success) behaves identically.
//
// This module only adapts HUD-shaped inputs (weapon view model, resolved
// target, room context) into the `ctx` shape buildAttackPayload() expects.

import {
  buildAttackPayload,
  resolveAttack,
  normalizeResult,
  describeError,
  ERROR_MESSAGES,
  ValidationError,
} from "../../screens/resolveAttack/resolveAttackService.js";

export { buildAttackPayload, resolveAttack, normalizeResult, describeError, ERROR_MESSAGES, ValidationError };

/**
 * Build the `ctx` object for resolveAttackService.buildAttackPayload() from
 * HUD-shaped inputs. Basic Weapon Attack v1 is weapon-only (no ability/skill
 * mode) and sends NO fire_mode field — perform_attack derives the active fire
 * mode itself from the weapon's server-persisted profile state (verified
 * against the SQL: it reads `selected_fire_mode_id` off
 * odyssey_character_weapon_profile_states, not a payload field).
 *
 * @param {{
 *   sourceCharacterId: string,
 *   weaponId: string,
 *   targetCharacterId: string,
 *   bodyPartId: string,
 *   distance?: (number|null),
 *   roomContext?: { roomId?, campaignId?, sceneId?, encounterId?, actorTokenId?, targetTokenId? },
 * }} input
 */
export function buildBasicAttackCtx(input = {}) {
  const room = input.roomContext ?? {};
  return {
    mode: "weapon",
    attackerCharacterId: input.sourceCharacterId,
    targetCharacterId: input.targetCharacterId,
    targetBodyPartId: input.bodyPartId,
    distanceM: input.distance ?? 0,
    weaponId: input.weaponId,
    // Basic Weapon Attack v1 wires no modifier UI to the payload — see the
    // report's Modifiers section. An empty list matches
    // splitManualModifiers([]) => { manual_attack_bonus: 0, manual_attack_penalty: 0 },
    // i.e. "no manual modifier", never a fabricated bonus/penalty.
    modifiers: [],
    roomId: room.roomId,
    campaignId: room.campaignId,
    sceneId: room.sceneId,
    encounterId: room.encounterId,
    actorTokenId: room.actorTokenId,
    targetTokenId: room.targetTokenId,
  };
}
