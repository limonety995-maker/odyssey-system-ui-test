// Combat HUD — authoritative attack-resolution trace normalizer (PURE).
//
// THE single normalization point for perform_attack's roll breakdown. Both
// consumers read the SAME trace so there can never be two different
// interpretations of one server result:
//   - the Debug Console's `attack / roll-resolution` event (full trace), and
//   - the game-facing Combat Log entry (compact one-line summary).
//
// Hard rules (mirrors the server-authoritative policy of
// resolveAttackService.js / combatResultLogPolicy.js):
//   - every value is copied VERBATIM from the server response — this module
//     performs NO dice math, NO totals arithmetic, NO hit/severity logic;
//   - a field the server did not return is marked with the NOT_RETURNED
//     sentinel — never substituted with 0/unknown/a computed value;
//   - only whitelisted, game-visible fields are copied. The raw response's
//     target_state / attacker_state / post_attack_perks / pending_checks /
//     body_part wound state / diagnostics are deliberately NOT copied — the
//     trace carries the attack's own inputs and effects, not the target's
//     private state, inventory, armory, skills, PSI, or auth data.

/** Sentinel shown for any breakdown field absent from the server response. */
export const NOT_RETURNED = "Not returned by server";

/** Verbatim copy: null/undefined (absent or SQL null) → NOT_RETURNED. */
function pick(value) {
  return value === undefined || value === null ? NOT_RETURNED : value;
}

function section(obj) {
  return obj && typeof obj === "object" ? obj : {};
}

/** True when `v` is a real, server-returned finite number (not the sentinel). */
export function isReturnedNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Normalize a resolveAttack() outcome (`{ ok, raw, normalized, code, error }`)
 * into the shared attack-resolution trace. Prefers the FULL raw server
 * response; falls back to the flat normalizeResult() summary for the few
 * fields it carries when raw is unavailable. Never throws.
 */
export function buildAttackResolutionTrace(outcome) {
  const o = outcome && typeof outcome === "object" ? outcome : {};
  const raw = section(o.raw);
  const n = section(o.normalized);
  const attack = section(raw.attack);
  const defense = section(raw.defense);
  const damage = section(raw.damage);
  const bodyPart = section(raw.body_part);
  const magazine = section(raw.magazine);
  const ammo = section(raw.ammo);
  const range = section(raw.range);
  const weapon = section(raw.weapon);
  const fireMode = section(raw.fire_mode);

  const ok = o.ok === true;

  const trace = {
    ok,
    context: {
      sourceCharacterId: pick(raw.attacker_character_id),
      targetCharacterId: pick(raw.target_character_id),
      weapon: pick(weapon.name ?? weapon.id),
      targetZone: pick(bodyPart.name ?? n.targetBodyPartName),
      attackType: pick(raw.attack_type ?? n.attackType),
      distanceM: pick(range.distance_m),
      rangeBand: pick(range.band),
      rangeModifier: pick(range.modifier),
      fireMode: pick(fireMode.code),
    },
    accuracy: {
      attackRoll: pick(attack.roll ?? n.attackRoll),
      attackSkillLevel: pick(attack.skill_level),
      attackSkillBonus: pick(attack.skill_bonus),
      attackManualBonus: pick(attack.manual_bonus),
      attackManualPenalty: pick(attack.manual_penalty),
      weaponAccuracyBonus: pick(weapon.base_accuracy_bonus),
      fireModeAccuracyModifier: pick(fireMode.accuracy_modifier),
      ammoAccuracyModifier: pick(ammo.accuracy_modifier),
      attackTotal: pick(attack.total ?? n.attackTotal),
      defenseRoll: pick(defense.roll),
      defenseSkillLevel: pick(defense.skill_level),
      defenseEffectiveSkillLevel: pick(defense.effective_skill_level),
      defenseSkillSource: pick(defense.skill_source),
      defenseManualBonus: pick(defense.manual_bonus),
      defenseManualPenalty: pick(defense.manual_penalty),
      defenseTotal: pick(defense.total ?? n.defenseTotal),
      hit: typeof raw.hit === "boolean" ? raw.hit : (typeof n.hit === "boolean" ? n.hit : NOT_RETURNED),
      auto: pick(raw.auto ?? n.auto), // 'crit' | 'fail' | null → NOT_RETURNED
    },
    damage: {
      attackTotalUsed: pick(damage.damage_attack_total),
      defenseTotalUsed: pick(damage.damage_defense_total),
      damageDiff: pick(damage.diff ?? n.damageDiff),
      damageLevel: pick(damage.level ?? n.damageLevel),
      bulletDamage: pick(ammo.bullet_damage),
      ammoDamageModifier: pick(ammo.damage_modifier),
      meleeStrengthBonus: pick(damage.melee_strength_bonus),
      armorValueUsed: pick(damage.armor_value_used),
      armorPierceUsed: pick(damage.armor_pierce_used),
      effectiveArmor: pick(bodyPart.effective_armor ?? n.effectiveArmor),
      bodyMinorDelta: pick(damage.body_minor_delta ?? damage.minor_delta),
      bodySeriousDelta: pick(damage.body_serious_delta ?? damage.serious_delta),
      bodyCriticalDelta: pick(damage.body_critical_delta ?? n.bodyCriticalDelta),
      armorMinorAbsorbed: pick(damage.armor_minor_absorbed),
      armorSeriousAbsorbed: pick(damage.armor_serious_absorbed),
      armorCriticalAbsorbed: pick(damage.armor_critical_absorbed ?? damage.armor_critical_delta),
    },
    ammo: {
      // The server decrements the magazine internally but returns only
      // spent/remaining — the pre-attack count is NOT in the response, and we
      // never derive it client-side (spent+remaining would be client math).
      before: NOT_RETURNED,
      spent: pick(magazine.bullets_spent ?? n.ammoSpent),
      remaining: pick(magazine.remaining_rounds ?? n.ammoRemaining),
      caliber: pick(ammo.caliber),
      ammoType: pick(ammo.ammo_type),
    },
    // Phase 4.1A: MODIFIERS breakdown. AUTO stays honestly empty — no
    // canonical "current passive modifier list" producer exists yet (see
    // docs/PHASE_4_1A_ATTACK_TECHNIQUES_AUDIT.md §6); ARMED is copied verbatim
    // from perform_attack's own armed_actions array (migration 100) — never
    // recomputed, never a fabricated bonus value.
    modifiers: {
      auto: [],
      armed: Array.isArray(raw.armed_actions)
        ? raw.armed_actions.map((a) => ({
            characterActionId: pick(a?.characterActionId),
            name: pick(a?.name),
            stackGroup: pick(a?.stackGroup),
            validated: typeof a?.validated === "boolean" ? a.validated : NOT_RETURNED,
            applied: typeof a?.applied === "boolean" ? a.applied : NOT_RETURNED,
            costsConsumed: a?.costsConsumed ?? null,
            cooldownBefore: pick(a?.cooldownBefore),
            cooldownAfter: pick(a?.cooldownAfter),
            reason: a?.reason ?? null,
          }))
        : [],
    },
  };
  trace.summary = buildTraceSummary(trace, o);
  return trace;
}

/** Compact one-line summary, e.g. "HIT · 81 vs 49 · serious" — built ONLY
 *  from fields the server returned; parts silently drop when absent. */
function buildTraceSummary(trace, outcome) {
  if (!trace.ok) return String(outcome?.error || outcome?.code || "Attack failed.");
  const acc = trace.accuracy;
  const parts = [];
  if (acc.hit === true) parts.push("HIT");
  else if (acc.hit === false) parts.push("MISS");
  if (isReturnedNumber(acc.attackTotal) && isReturnedNumber(acc.defenseTotal)) {
    parts.push(`${acc.attackTotal} vs ${acc.defenseTotal}`);
  }
  if (trace.damage.damageLevel !== NOT_RETURNED && trace.damage.damageLevel !== "none") {
    parts.push(String(trace.damage.damageLevel));
  }
  return parts.length ? parts.join(" · ") : "resolved";
}

/**
 * The compact Combat-Log detail lines for the SAME trace (the Combat Log's
 * short game-facing rendering — full breakdown stays Debug-Console-only).
 * Only server-returned parts are emitted; nothing is substituted.
 */
export function buildCombatLogLines(trace, bodyZoneLabel) {
  const t = trace && typeof trace === "object" ? trace : { accuracy: {}, damage: {}, ammo: {} };
  const acc = section(t.accuracy);
  const dmg = section(t.damage);
  const ammo = section(t.ammo);
  const details = [];
  const appliedTechnique = (t.modifiers?.armed ?? []).find((m) => m.applied === true && m.name !== NOT_RETURNED);
  if (appliedTechnique) details.push(`Used ${appliedTechnique.name}`);
  if (isReturnedNumber(acc.attackTotal) && isReturnedNumber(acc.defenseTotal)) {
    details.push(`Attack: ${acc.attackTotal} vs Defense: ${acc.defenseTotal}`);
  } else if (isReturnedNumber(acc.attackRoll)) {
    details.push(`Attack roll: ${acc.attackRoll}`);
  }
  if (acc.hit === true) details.push("Hit");
  else if (acc.hit === false) details.push("Miss");
  if (bodyZoneLabel) details.push(String(bodyZoneLabel));
  if (dmg.damageLevel !== NOT_RETURNED && dmg.damageLevel != null) details.push(`Damage: ${dmg.damageLevel}`);
  if (isReturnedNumber(ammo.remaining)) details.push(`Ammo left: ${ammo.remaining}`);
  return details;
}

/**
 * Details object for the `attack / roll-resolution` Debug Console event —
 * `summary` first (the Console renders it as the compact row text), then the
 * full nested safe trace for the detail area / Copy event.
 */
export function buildRollResolutionDetails(trace) {
  const t = trace && typeof trace === "object" ? trace : buildAttackResolutionTrace(null);
  return {
    summary: t.summary,
    source: t.context?.sourceCharacterId,
    target: t.context?.targetCharacterId,
    weapon: t.context?.weapon,
    targetZone: t.context?.targetZone,
    attackType: t.context?.attackType,
    distanceM: t.context?.distanceM,
    fireMode: t.context?.fireMode,
    rangeBand: t.context?.rangeBand,
    rangeModifier: t.context?.rangeModifier,
    accuracy: t.accuracy,
    damage: t.damage,
    ammo: t.ammo,
    modifiers: t.modifiers,
  };
}
