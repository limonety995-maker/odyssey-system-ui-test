// Combat HUD — Battle Log entry classification/formatting (PURE, Phase 4.2).
//
// Shared layer between hud/log/combatResultLogPolicy.js (builds the raw
// entries) and hud/components/BattleLogBlock.js (renders them). Every number
// here is read straight from hud/combat/attackResolutionTrace.js's already-
// verbatim, already-server-authoritative trace — this module performs NO
// dice math and NO totals arithmetic of its own; it only classifies
// (status/severity) and formats (compact text / formula strings) values the
// server already returned. A field the server didn't return contributes
// nothing to a formula and never becomes a fabricated 0.

import { isReturnedNumber } from "../combat/attackResolutionTrace.js";

export const LOG_STATUS = Object.freeze({
  success: "success",
  failure: "failure",
  critSuccess: "crit_success",
  critFailure: "crit_failure",
});

export const LOG_SEVERITY = Object.freeze({
  minor: "minor",
  serious: "serious",
  critical: "critical",
});

const STATUS_LABEL = Object.freeze({
  [LOG_STATUS.success]: "SUCCESS",
  [LOG_STATUS.failure]: "FAILURE",
  [LOG_STATUS.critSuccess]: "CRIT SUCCESS",
  [LOG_STATUS.critFailure]: "CRIT FAILURE",
});

const SEVERITY_LABEL = Object.freeze({
  [LOG_SEVERITY.minor]: "MINOR",
  [LOG_SEVERITY.serious]: "SERIOUS",
  [LOG_SEVERITY.critical]: "CRITICAL",
});

export function statusLabel(status) {
  return STATUS_LABEL[status] ?? null;
}

export function severityLabel(severity) {
  return SEVERITY_LABEL[severity] ?? null;
}

/**
 * Roll-quality status from the trace's own `hit`/`auto` fields — the same
 * signals the server already returns for every attack (`auto` is
 * `'crit'|'fail'|null`, from perform_attack). No client-side re-derivation of
 * hit/miss — `hit` and `auto` are copied verbatim by attackResolutionTrace.js.
 * @param {object} trace from buildAttackResolutionTrace()
 * @returns {(string|null)} one of LOG_STATUS's values, or null (trace not ok,
 *   or the server returned neither hit nor auto — nothing honest to classify)
 */
export function classifyAttackStatus(trace) {
  const t = trace && typeof trace === "object" ? trace : {};
  if (!t.ok) return null;
  const acc = t.accuracy ?? {};
  if (acc.auto === "fail") return LOG_STATUS.critFailure;
  if (acc.auto === "crit" && acc.hit === true) return LOG_STATUS.critSuccess;
  if (acc.hit === true) return LOG_STATUS.success;
  if (acc.hit === false) return LOG_STATUS.failure;
  return null;
}

/**
 * Damage severity from the trace's own `damageLevel` (server field
 * `damage.level`) — real values in this schema are 'no_damage'|'minor'|
 * 'serious'|'critical' (confirmed in supabase/17_combat_resolution_schema.sql).
 * There is no 'devastating' level anywhere in this codebase — never invented.
 * @param {object} trace
 * @returns {(string|null)} one of LOG_SEVERITY's values, or null (no damage,
 *   or the server didn't return a level — never guessed)
 */
export function classifySeverity(trace) {
  const t = trace && typeof trace === "object" ? trace : {};
  const level = t.damage?.damageLevel;
  if (level === LOG_SEVERITY.minor || level === LOG_SEVERITY.serious || level === LOG_SEVERITY.critical) {
    return level;
  }
  return null;
}

function turnPrefix(turnLabel) {
  return turnLabel ? `[${turnLabel}] ` : "";
}

/**
 * The single compact visible line for an attack-shaped entry (weapon attack
 * or direct ability attack — both share the exact same trace shape).
 * @param {{
 *   actorName:(string|null), actionLabel?:string, targetName:(string|null),
 *   bodyZoneLabel:(string|null), turnLabel:(string|null), trace:object,
 * }} input
 */
export function buildAttackCompactText({ actorName, actionLabel = "attacks", targetName, bodyZoneLabel, turnLabel, trace }) {
  const actor = actorName || "Someone";
  const target = targetName ? ` ${targetName}` : "";
  const zone = bodyZoneLabel ? ` / ${bodyZoneLabel}` : "";
  const who = `${turnPrefix(turnLabel)}${actor} ${actionLabel}${target}${zone}`;

  const t = trace && typeof trace === "object" ? trace : {};
  if (!t.ok) return who; // caller appends the real denial message separately

  const status = classifyAttackStatus(t);
  const label = statusLabel(status);
  const badgeParts = [];
  if (label) badgeParts.push(`[${label}]`);

  const acc = t.accuracy ?? {};
  if (isReturnedNumber(acc.attackTotal) && isReturnedNumber(acc.defenseTotal)) {
    badgeParts.push(`Accuracy ${acc.attackTotal}/${acc.defenseTotal}`);
  }

  // Damage is only ever shown when the accuracy check actually hit AND the
  // server returned real damage totals — never fabricated for a miss/failure.
  const dmg = t.damage ?? {};
  const damageRolled = acc.hit === true && isReturnedNumber(dmg.attackTotalUsed) && isReturnedNumber(dmg.defenseTotalUsed);
  if (damageRolled) {
    badgeParts.push(`Damage ${dmg.attackTotalUsed}/${dmg.defenseTotalUsed}`);
  }

  const severity = classifySeverity(t);
  const sevLabel = severityLabel(severity);
  if (sevLabel) badgeParts.push(`[${sevLabel}]`);

  return badgeParts.length ? `${who} — ${badgeParts.join(" · ")}` : who;
}

/** A "97 + 10 + 50 = 157" style formula string from real, returned terms
 *  only — a term the server didn't return contributes nothing (never a
 *  fabricated 0), and the "= total" suffix only appears when the server also
 *  returned the total. Returns null when nothing at all was returned. */
function formatFormula(terms, total) {
  const real = terms.filter(isReturnedNumber);
  if (!real.length && !isReturnedNumber(total)) return null;
  const lhs = real.length ? real.join(" + ") : null;
  if (lhs && isReturnedNumber(total)) return `${lhs} = ${total}`;
  if (lhs) return lhs;
  return String(total);
}

/**
 * The expanded Accuracy/Damage/Result breakdown for an attack-shaped entry —
 * re-labels the SAME fields attackResolutionTrace.js already assembled
 * (no new math). Returns null sections/values honestly when the server
 * didn't return enough to build them (e.g. Damage is null for a miss).
 * @param {object} trace
 */
export function buildAttackBreakdown(trace) {
  const t = trace && typeof trace === "object" ? trace : {};
  const acc = t.accuracy ?? {};
  const dmg = t.damage ?? {};

  const accuracyAttacking = formatFormula(
    [acc.attackRoll, acc.attackSkillBonus, acc.attackManualBonus, acc.weaponAccuracyBonus, acc.fireModeAccuracyModifier, acc.ammoAccuracyModifier],
    acc.attackTotal,
  );
  const accuracyDefending = formatFormula(
    [acc.defenseRoll, acc.defenseManualBonus, acc.defenseManualPenalty],
    acc.defenseTotal,
  );

  const damageRolled = acc.hit === true && (isReturnedNumber(dmg.attackTotalUsed) || isReturnedNumber(dmg.bulletDamage));
  const damageAttacking = damageRolled
    ? formatFormula([acc.attackTotal, dmg.bulletDamage, dmg.ammoDamageModifier, dmg.meleeStrengthBonus], dmg.attackTotalUsed)
    : null;
  const damageDefending = damageRolled
    ? formatFormula([acc.defenseTotal, dmg.armorValueUsed], dmg.defenseTotalUsed)
    : null;

  const resultAttacking = isReturnedNumber(dmg.attackTotalUsed) ? dmg.attackTotalUsed : (isReturnedNumber(acc.attackTotal) ? acc.attackTotal : null);
  const resultDefending = isReturnedNumber(dmg.defenseTotalUsed) ? dmg.defenseTotalUsed : (isReturnedNumber(acc.defenseTotal) ? acc.defenseTotal : null);

  return {
    accuracy: { attacking: accuracyAttacking, defending: accuracyDefending },
    damage: damageRolled ? { attacking: damageAttacking, defending: damageDefending } : null,
    damageNotRolled: !damageRolled,
    result: { attacking: resultAttacking, defending: resultDefending },
  };
}
