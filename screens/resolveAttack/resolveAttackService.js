// Resolve Attack service — pure-ish logic, decoupled from the DOM.
//
// Architecture rule: the database is authoritative. This module only:
//   - validates UI input
//   - builds the perform_attack(jsonb) payload (weapon OR ability)
//   - calls the injected performAttack RPC wrapper
//   - normalizes the raw backend result into a render-friendly shape
// It NEVER computes combat math, applies damage, spends ammo/energy, or mutates body parts.

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

// User-friendly messages for known backend error codes (Stage 5A coverage).
export const ERROR_MESSAGES = Object.freeze({
  // characters / targets
  CHARACTER_NOT_FOUND: "Attacker character was not found.",
  TARGET_NOT_FOUND: "Target character was not found.",
  INVALID_TARGET: "Invalid target for this attack.",
  // body parts
  BODY_PART_NOT_FOUND: "Target body part was not found or cannot be targeted.",
  TARGET_BODY_PART_NOT_FOUND: "Target body part was not found.",
  BODY_PART_DESTROYED: "That body part is already destroyed — choose another.",
  // weapon model / profile
  WEAPON_NOT_FOUND: "Weapon was not found for the attacker.",
  INVALID_WEAPON_MODEL: "Weapon model linked to the weapon was not found.",
  INVALID_PROFILE: "Selected weapon profile is invalid.",
  PROFILE_NOT_FOUND: "Weapon profile was not found.",
  NO_ACTIVE_PROFILE: "Weapon has no active profile.",
  // fire mode
  INVALID_FIRE_MODE: "Fire mode is missing or not allowed for this weapon.",
  FIRE_MODE_NOT_ALLOWED: "This fire mode is not allowed for the weapon.",
  FIRE_MODE_NOT_ALLOWED_FOR_ACTIVE_PROFILE:
    "This fire mode is not allowed for the active profile.",
  // magazine / ammo
  NO_MAGAZINE: "Weapon requires a loaded magazine.",
  INVALID_MAGAZINE: "Loaded magazine is invalid or incompatible.",
  MAGAZINE_EMPTY: "The loaded magazine is empty.",
  NO_AMMO: "Not enough ammunition to fire.",
  MAGAZINE_HAS_DIFFERENT_AMMO_TYPE: "Magazine ammo type does not match.",
  CALIBER_MISMATCH: "Magazine caliber does not match the weapon.",
  // features
  WEAPON_FEATURE_NOT_AVAILABLE: "That weapon feature is not available right now.",
  MISSING_RELOAD_ITEM: "Missing the item required to reload this feature.",
  // abilities / resources
  ABILITY_NOT_FOUND: "Ability was not found or is disabled.",
  INVALID_ABILITY: "Invalid ability for this action.",
  INVALID_ATTACK_TYPE: "This ability cannot be used as an attack.",
  ABILITY_ON_COOLDOWN: "Ability is on cooldown.",
  NO_ENERGY: "Not enough energy for this ability.",
  NOT_ENOUGH_RESOURCE: "Not enough resource to use this ability.",
  RESOURCE_POOL_NOT_FOUND: "Resource pool was not found.",
  // ammo stock / magazine loading
  AMMO_STOCK_NOT_FOUND: "Ammo stock was not found.",
  OWNER_MISMATCH: "Magazine and ammo stock belong to different characters.",
  MAGAZINE_FULL: "Magazine is already full.",
  NOT_ENOUGH_AMMO_STOCK: "Not enough ammo in stock.",
  NOT_ENOUGH_MAGAZINE_ROUNDS: "Magazine does not contain that many rounds.",
  INVALID_QUANTITY: "Invalid quantity.",
  MAGAZINE_INCOMPATIBLE: "Magazine is not compatible with this weapon profile.",
  // consumable items / healing (use_character_item)
  ITEM_NOT_FOUND: "Item was not found.",
  ITEM_NOT_AVAILABLE: "Item is not available (none left).",
  ITEM_OWNERSHIP_MISMATCH: "Item belongs to another character.",
  ITEM_ACTION_NOT_SUPPORTED: "This item cannot be used this way.",
  BODY_PART_TARGET_MISMATCH: "Body part does not belong to that character.",
  NO_HEALABLE_DAMAGE: "Nothing to heal on that body part.",
  // GM tools
  CHARACTER_ID_REQUIRED: "A character must be selected.",
  // equipment / armor
  BODY_PART_NOT_ALLOWED: "This item can't be equipped to that body part.",
  EQUIPMENT_ITEM_NOT_FOUND: "Equipment item was not found.",
  ALREADY_EQUIPPED: "This item is already equipped.",
  SLOT_OCCUPIED: "That body part already has equipment in this slot.",
});

export function describeError(code, fallback) {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return fallback || "The attack could not be performed.";
}

// Situational modifiers -> server manual bonus/penalty.
// Auto modifiers (distance, aim) are excluded: distance is sent as distance_m and
// recomputed server-side; aim difficulty comes from the chosen body part.
export function splitManualModifiers(modifiers = []) {
  let bonus = 0;
  let penalty = 0;
  for (const m of modifiers) {
    if (!m || m.auto || m.on === false) continue;
    const value = Number(m.value) || 0;
    if (value > 0) bonus += value;
    else if (value < 0) penalty += -value;
  }
  return { manual_attack_bonus: bonus, manual_attack_penalty: penalty };
}

function requireId(value, message) {
  const id = String(value || "").trim();
  if (!id) throw new ValidationError(message);
  return id;
}

// Build the perform_attack payload. Throws ValidationError on bad input.
export function buildAttackPayload(ctx = {}) {
  const mode = ctx.mode === "skill" ? "skill" : "weapon";
  const payload = {
    attacker_character_id: requireId(ctx.attackerCharacterId, "No attacker selected."),
    target_character_id: requireId(ctx.targetCharacterId, "No target selected."),
    target_body_part_id: requireId(ctx.targetBodyPartId, "No target body part selected."),
    distance_m: Math.max(Number(ctx.distanceM) || 0, 0),
    attack_context: splitManualModifiers(ctx.modifiers),
  };

  if (mode === "skill") {
    payload.character_ability_id = requireId(ctx.abilityId, "No ability selected.");
  } else {
    payload.weapon_id = requireId(ctx.weaponId, "No weapon selected.");
  }

  // Optional OBR context — only included when present (never empty strings).
  for (const [key, value] of Object.entries({
    room_id: ctx.roomId,
    campaign_id: ctx.campaignId,
    scene_id: ctx.sceneId,
    encounter_id: ctx.encounterId,
    actor_token_id: ctx.actorTokenId,
    target_token_id: ctx.targetTokenId,
  })) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) payload[key] = trimmed;
  }

  return payload;
}

/* ----- safe getters for tolerant result rendering ----- */
function firstDefined(...values) {
  for (const v of values) if (v !== undefined && v !== null) return v;
  return null;
}
function asArray(v) {
  return Array.isArray(v) ? v : [];
}

// Normalize the (varied) backend result into a flat, render-friendly summary.
// Every field may be null - the UI shows "-" for nulls. Tolerates weapon and
// ability result shapes, and renamed/missing fields.
export function normalizeResult(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const attack = r.attack && typeof r.attack === "object" ? r.attack : {};
  const defense = r.defense && typeof r.defense === "object" ? r.defense : {};
  const damage = r.damage && typeof r.damage === "object" ? r.damage : {};
  const bodyPart = r.body_part && typeof r.body_part === "object" ? r.body_part : {};
  const magazine = r.magazine && typeof r.magazine === "object" ? r.magazine : {};
  const resource = r.resource && typeof r.resource === "object" ? r.resource : {};
  const targetState = r.target_state && typeof r.target_state === "object" ? r.target_state : {};

  return {
    ok: r.ok !== false,
    hit: typeof r.hit === "boolean" ? r.hit : null,
    auto: firstDefined(r.auto), // 'crit' | 'fail' | null
    attackType: firstDefined(r.attack_type),
    attackRoll: firstDefined(attack.roll, r.attack_roll),
    attackTotal: firstDefined(attack.total, r.attack_total),
    defenseTotal: firstDefined(defense.total, r.defense_total),
    damageLevel: firstDefined(damage.level, r.damage_level),
    damageDiff: firstDefined(damage.diff, r.damage_diff),
    criticalDelta: firstDefined(damage.critical_delta, r.critical_delta),
    bodyCriticalDelta: firstDefined(damage.body_critical_delta, r.body_critical_delta),
    targetBodyPartName: firstDefined(bodyPart.name, r.target_body_part_name),
    bodyPart: Object.keys(bodyPart).length ? bodyPart : null,
    ammoSpent: firstDefined(magazine.bullets_spent, r.bullets_spent),
    ammoRemaining: firstDefined(magazine.remaining_rounds, r.remaining_magazine_rounds),
    energySpent: firstDefined(resource.spent, resource.cost, resource.amount_spent),
    energyRemaining: firstDefined(resource.remaining, resource.current_value),
    feature: firstDefined(r.feature),
    armor: firstDefined(bodyPart.effective_armor, r.effective_armor, r.armor),
    pendingChecks: asArray(firstDefined(r.pending_checks, r.pending_saves, [])),
    targetAlive: typeof targetState.is_alive === "boolean" ? targetState.is_alive : null,
    targetConscious: typeof targetState.is_conscious === "boolean" ? targetState.is_conscious : null,
    combatLogId: firstDefined(r.log_id, r.combat_log_id),
  };
}

// Run the attack. deps: { performAttack(payload) -> Promise<rawResult> }.
// Returns { ok, payload, raw, normalized, error, code }. Network errors are caught.
export async function resolveAttack(ctx, deps) {
  const payload = buildAttackPayload(ctx); // throws ValidationError on bad input

  let raw;
  try {
    raw = await deps.performAttack(payload);
  } catch (error) {
    return {
      ok: false,
      payload,
      raw: error?.details ?? null,
      normalized: null,
      code: error?.code ?? null,
      error: error?.message || "Network or RPC error.",
    };
  }

  if (!raw || raw.ok === false) {
    const code = raw?.error ?? null;
    return {
      ok: false,
      payload,
      raw: raw ?? null,
      normalized: raw ? normalizeResult(raw) : null,
      code,
      error: raw?.message || describeError(code),
    };
  }

  return { ok: true, payload, raw, normalized: normalizeResult(raw), code: null, error: null };
}
