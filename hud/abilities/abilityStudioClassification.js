// Ability Studio — Phase 4.1C.0: catalog-side classification preview (PURE).
//
// The HUD's own runtime classification (odyssey_get_character_quick_actions_runtime,
// latest body in supabase/104_ability_timeout_hotfix.sql) only exists once an
// ability is character-owned. Ability Studio needs to preview the SAME
// classification for a catalog definition (or an unsaved draft) that has no
// character yet — this module synthesizes the identical `type`/
// `targeting.requiresBodyZone`/`state.executionReason` shape the server
// produces, from the SAME fields (ability_kind, effect_mode, target_type,
// resource_mode/resource_pool_code, and the active level's
// attack_damage_bonus/attack_armor_pierce/ignore_armor), then hands the
// result to the EXACT SAME classifiers Skills Block already uses
// (isDirectAttackAbility/isInstantSelfAbility/isDirectedTargetAbility) — no
// re-derivation, no name-based logic, see docs/PHASE_4_1C_0_ABILITY_STUDIO_AUDIT.md §5/§9.

import {
  isDirectAttackAbility,
  isInstantSelfAbility,
  isDirectedTargetAbility,
} from "./abilityAvailabilityPolicy.js";

export const HUD_CLASSIFICATION = Object.freeze({
  armedAttackTechnique: "ARMED attack technique",
  directAbilityAttack: "Direct ability attack",
  instantSelfAbility: "Instant / self ability",
  directedTargetAbility: "Directed target ability",
  unsupported: "Unsupported",
});

function pickActiveLevel(levels) {
  if (!Array.isArray(levels) || levels.length === 0) return null;
  return [...levels].sort((a, b) => Number(a?.ability_level ?? 0) - Number(b?.ability_level ?? 0))[0] ?? null;
}

function synthesizeQuickActionShape(ability, levels) {
  const a = ability && typeof ability === "object" ? ability : {};
  const level = pickActiveLevel(levels) ?? {};
  const isAttack = a.effect_mode === "attack" || a.ability_kind === "attack";
  const targetType = a.target_type ?? "none";
  const type = isAttack
    ? "attack_technique"
    : targetType === "character" || targetType === "body_part"
      ? "directed"
      : "instant";
  const unsupportedEffect =
    Number(level.attack_damage_bonus ?? 0) !== 0
    || Number(level.attack_armor_pierce ?? 0) !== 0
    || Boolean(level.ignore_armor);

  return {
    type,
    targeting: {
      mode: targetType,
      requiresBodyZone: targetType === "body_part",
    },
    state: {
      executionAvailable: !unsupportedEffect,
      executionReason: unsupportedEffect ? "ACTION_EFFECT_NOT_IMPLEMENTED" : null,
    },
    costs: {
      main: a.resource_mode === "pool" ? 1 : 0,
      move: 0,
      psi: a.resource_pool_code === "psi" ? Number(level.resource_cost ?? 0) : 0,
      charges: a.resource_mode === "item" ? null : 0,
    },
    cooldown: {
      max: Number(level.cooldown_rounds ?? 0),
      unit: "turn",
    },
  };
}

/**
 * @param {object} ability ability_defs-shaped row (from creator_get_ability's `.ability` or a draft)
 * @param {Array} levels ability_level_defs-shaped rows (from creator_get_ability's `.levels`)
 * @returns classification preview matching the task spec's example shape
 */
export function classifyAbilityForStudio(ability, levels = []) {
  const action = synthesizeQuickActionShape(ability, levels);

  let classification = HUD_CLASSIFICATION.unsupported;
  let executionPath = "none";
  let unsupportedReason = null;

  if (action.type === "attack_technique" && action.state.executionReason !== "ACTION_EFFECT_NOT_IMPLEMENTED") {
    classification = HUD_CLASSIFICATION.armedAttackTechnique;
    executionPath = "perform_attack (armed_action_ids)";
  } else if (isDirectAttackAbility(action)) {
    classification = HUD_CLASSIFICATION.directAbilityAttack;
    executionPath = 'perform_attack (mode: "skill")';
  } else if (isInstantSelfAbility(action)) {
    classification = HUD_CLASSIFICATION.instantSelfAbility;
    executionPath = 'combat_execute_action (kind: "ability")';
  } else if (isDirectedTargetAbility(action)) {
    classification = HUD_CLASSIFICATION.directedTargetAbility;
    executionPath = 'combat_execute_action (kind: "ability") + intent.target_character_id';
  } else {
    unsupportedReason =
      action.type === "directed" && action.targeting.requiresBodyZone
        ? "target_type='body_part' without an attack effect_mode has no execution path in Skills Block today (see audit §5)."
        : "Effect type is not supported by the current server runtime.";
  }

  const canExecuteFromSkillsBlock = classification !== HUD_CLASSIFICATION.unsupported;

  return {
    classification,
    executionPath,
    requiresSelectedTarget: action.type === "attack_technique" || action.type === "directed",
    requiresBodyZone: action.targeting.requiresBodyZone,
    usesWeaponAmmo: false,
    costs: action.costs,
    cooldown: action.cooldown,
    effectSupport: canExecuteFromSkillsBlock ? "supported" : "unsupported",
    unsupportedReason,
    canExecuteFromSkillsBlock,
    // Assignment is always possible for a valid ability definition regardless
    // of HUD classification — an "Unsupported" ability can still be assigned
    // to a character (e.g. to author it ahead of a later phase), it just
    // won't show an execute button in Skills Block yet.
    canAssignToCharacter: true,
  };
}
