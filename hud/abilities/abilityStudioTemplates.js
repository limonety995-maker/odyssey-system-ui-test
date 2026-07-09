// Ability Studio — Phase 4.1C.0: template registry (PURE).
//
// Ability Studio is deliberately NOT a free-form JSON editor (task spec, "Big
// rule"). Each template locks the target_type/effect_mode combination that
// the HUD's own classifier (abilityStudioClassification.js, mirroring
// supabase/104_ability_timeout_hotfix.sql) requires for that execution class
// — so a draft that validates against its template is GUARANTEED to classify
// the way the template promises. There is no 5th "unsupported" template:
// Ability Studio simply never offers the one target_type/effect_mode
// combination (target_type='body_part' without effect_mode='attack') that
// the HUD cannot execute today (see audit §5) — an author who genuinely
// needs that combination is told so explicitly, not handed a template that
// silently produces a dead quickbar entry.

import { classifyAbilityForStudio, HUD_CLASSIFICATION } from "./abilityStudioClassification.js";

export const ABILITY_STUDIO_TEMPLATES = Object.freeze({
  armedAttackTechnique: "armed_attack_technique",
  directAbilityAttack: "direct_ability_attack",
  instantSelfAbility: "instant_self_ability",
  directedTargetAbility: "directed_target_ability",
});

export const TEMPLATE_LABELS = Object.freeze({
  [ABILITY_STUDIO_TEMPLATES.armedAttackTechnique]: "ARMED attack technique",
  [ABILITY_STUDIO_TEMPLATES.directAbilityAttack]: "Direct ability attack",
  [ABILITY_STUDIO_TEMPLATES.instantSelfAbility]: "Instant / self ability",
  [ABILITY_STUDIO_TEMPLATES.directedTargetAbility]: "Directed target ability",
});

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/;

export function createEmptyDraft(template) {
  return {
    template,
    id: null,
    code: "",
    name: "",
    description: "",
    iconKey: "bolt",
    abilityKind: "utility",
    sourceType: "custom",
    targetType:
      template === ABILITY_STUDIO_TEMPLATES.instantSelfAbility ? "self"
      : template === ABILITY_STUDIO_TEMPLATES.directedTargetAbility ? "character"
      : "character",
    resourceMode: "pool",
    resourcePoolCode: "psionic_energy",
    resourceCost: 0,
    cooldownRounds: 0,
    attackAccuracyBonus: 0,
    attackDamageBonus: 0,
    attackArmorPierce: 0,
    ignoreArmor: false,
    durationRounds: null,
    rangeMode: "none",
    rangeMaxDistanceM: null,
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function pushError(errors, field, message) {
  errors.push({ field, message });
}

/**
 * @param {object} draft see createEmptyDraft() shape
 * @returns {{ ok: boolean, errors: Array<{field:string,message:string}> }}
 */
export function validateAbilityDraft(draft) {
  const errors = [];
  const d = draft && typeof draft === "object" ? draft : {};

  const code = String(d.code ?? "").trim().toLowerCase();
  if (!code) {
    pushError(errors, "code", "Code is required.");
  } else if (!CODE_PATTERN.test(code)) {
    pushError(errors, "code", "Code must be lowercase snake_case starting with a letter.");
  }

  if (!String(d.name ?? "").trim()) {
    pushError(errors, "name", "Name is required.");
  }

  if (!Object.values(ABILITY_STUDIO_TEMPLATES).includes(d.template)) {
    pushError(errors, "template", "Unknown template.");
    return { ok: false, errors };
  }

  const cooldown = numberOrNull(d.cooldownRounds);
  if (cooldown !== null && (Number.isNaN(cooldown) || cooldown < 0)) {
    pushError(errors, "cooldownRounds", "Cooldown must be a non-negative number.");
  }

  const resourceCost = numberOrNull(d.resourceCost);
  if (resourceCost !== null && (Number.isNaN(resourceCost) || resourceCost < 0)) {
    pushError(errors, "resourceCost", "Cost must be a non-negative number.");
  }

  if (d.rangeMode === "limited") {
    const maxDistance = numberOrNull(d.rangeMaxDistanceM);
    if (maxDistance === null || Number.isNaN(maxDistance) || maxDistance < 1) {
      pushError(errors, "rangeMaxDistanceM", "Provide a positive max distance when range is limited.");
    }
  }

  const hasAttackEffect =
    Number(d.attackDamageBonus ?? 0) !== 0
    || Number(d.attackArmorPierce ?? 0) !== 0
    || Boolean(d.ignoreArmor);

  switch (d.template) {
    case ABILITY_STUDIO_TEMPLATES.armedAttackTechnique: {
      if (!["character", "body_part"].includes(d.targetType)) {
        pushError(errors, "targetType", "ARMED attack techniques must target a character or a body part.");
      }
      if (hasAttackEffect) {
        pushError(
          errors,
          "attackDamageBonus",
          "An ARMED technique must not set a damage/armor-pierce/ignore-armor effect — use the Direct Ability Attack template instead.",
        );
      }
      break;
    }
    case ABILITY_STUDIO_TEMPLATES.directAbilityAttack: {
      if (!["character", "body_part"].includes(d.targetType)) {
        pushError(errors, "targetType", "Direct ability attacks must target a character or a body part.");
      }
      if (!hasAttackEffect) {
        pushError(
          errors,
          "attackDamageBonus",
          "A direct ability attack needs a damage, armor-pierce, or ignore-armor effect — otherwise use the ARMED template.",
        );
      }
      break;
    }
    case ABILITY_STUDIO_TEMPLATES.instantSelfAbility: {
      if (["character", "body_part"].includes(d.targetType)) {
        pushError(errors, "targetType", "Instant/self abilities must not target a character or body part.");
      }
      break;
    }
    case ABILITY_STUDIO_TEMPLATES.directedTargetAbility: {
      if (d.targetType !== "character") {
        pushError(errors, "targetType", "Directed target abilities must target a character (no body zone).");
      }
      break;
    }
    default:
      break;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Defensive: confirm the draft would actually classify the way the chosen
  // template promises before allowing a save (see module doc comment).
  const expectedLabel = TEMPLATE_LABELS[d.template];
  const preview = classifyAbilityForStudio(
    {
      ability_kind: d.abilityKind,
      effect_mode:
        d.template === ABILITY_STUDIO_TEMPLATES.armedAttackTechnique
        || d.template === ABILITY_STUDIO_TEMPLATES.directAbilityAttack
          ? "attack"
          : "apply_effect",
      target_type: d.targetType,
      resource_mode: d.resourceMode,
      resource_pool_code: d.resourcePoolCode,
    },
    [
      {
        ability_level: 1,
        resource_cost: resourceCost ?? 0,
        cooldown_rounds: cooldown ?? 0,
        attack_damage_bonus: d.attackDamageBonus ?? 0,
        attack_armor_pierce: d.attackArmorPierce ?? 0,
        ignore_armor: Boolean(d.ignoreArmor),
      },
    ],
  );

  if (preview.classification !== expectedLabel) {
    pushError(
      errors,
      "template",
      `Internal consistency check failed: this draft would classify as "${preview.classification}", not "${expectedLabel}".`,
    );
    return { ok: false, errors };
  }

  return { ok: true, errors: [] };
}

/**
 * Builds the exact payload creator_upsert_ability expects.
 * @param {object} draft see createEmptyDraft() shape (must already be valid())
 */
export function buildAbilityPayloadFromDraft(draft) {
  const d = draft && typeof draft === "object" ? draft : {};
  const isAttackTemplate =
    d.template === ABILITY_STUDIO_TEMPLATES.armedAttackTechnique
    || d.template === ABILITY_STUDIO_TEMPLATES.directAbilityAttack;

  const payload = {
    code: String(d.code ?? "").trim().toLowerCase(),
    name: String(d.name ?? "").trim(),
    ability_kind: d.abilityKind || "custom",
    source_type: d.sourceType || "custom",
    activation_type: "manual",
    target_type: d.targetType,
    effect_mode: isAttackTemplate ? "attack" : "apply_effect",
    attack_type: isAttackTemplate ? (d.attackType || "ranged") : null,
    description: String(d.description ?? ""),
    data: {
      icon_key: d.iconKey || "bolt",
      range: {
        mode: d.rangeMode || "none",
        max_distance_m: d.rangeMode === "limited" ? Number(d.rangeMaxDistanceM ?? 0) : null,
      },
    },
    resource_mode: d.resourceMode || "none",
    resource_pool_code: d.resourceMode === "pool" ? (d.resourcePoolCode || null) : null,
    resource_item_code: d.resourceMode === "item" ? (d.resourceItemCode || null) : null,
    tags: [`studio_template:${d.template}`],
    sort_order: 0,
    levels: [
      {
        ability_level: 1,
        resource_cost: Number(d.resourceCost ?? 0),
        cooldown_rounds: Number(d.cooldownRounds ?? 0),
        attack_accuracy_bonus: isAttackTemplate ? Number(d.attackAccuracyBonus ?? 0) : 0,
        attack_damage_bonus: isAttackTemplate ? Number(d.attackDamageBonus ?? 0) : 0,
        attack_armor_pierce: isAttackTemplate ? Number(d.attackArmorPierce ?? 0) : 0,
        ignore_armor: isAttackTemplate ? Boolean(d.ignoreArmor) : false,
        duration_rounds: d.durationRounds === null || d.durationRounds === "" ? null : Number(d.durationRounds),
      },
    ],
  };

  if (d.id) {
    payload.id = d.id;
  }

  return payload;
}

export { HUD_CLASSIFICATION };
