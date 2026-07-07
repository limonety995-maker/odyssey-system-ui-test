// Combat HUD — Priority Bugfix Pack, Fix #3: Debug Console raw-vs-modified
// roll trace.
//
// Audit finding: hud/combat/attackResolutionTrace.js already preserved BOTH
// the raw/base roll (attack.roll, defense.roll) and the final server-computed
// total (attack.total, defense.total) verbatim — nothing was lost upstream.
// The actual bug was purely presentational: the Debug Console's detail area
// only showed a flat, ungrouped field dump, with no clear "raw vs final" line
// per category and no modifier breakdown. buildRollBreakdown() (added by this
// fix) regroups those SAME existing trace fields into the four required
// categories — it computes no combat math and fabricates nothing.

import assert from "node:assert/strict";
import {
  NOT_RETURNED,
  buildAttackResolutionTrace,
  buildRollBreakdown,
  buildRollResolutionDetails,
} from "../hud/combat/attackResolutionTrace.js";
import { normalizeResult } from "../screens/resolveAttack/resolveAttackService.js";

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.error(`  FAIL ${name}\n      ${err.message}`);
  }
}

console.log("\nDebug Console raw-vs-modified roll breakdown (Bugfix Pack Fix #3)\n");

function fullRaw(overrides = {}) {
  return Object.assign({
    ok: true,
    attack_type: "ranged",
    hit: true,
    attacker_character_id: "11111111-2222-3333-4444-555555555555",
    target_character_id: "66666666-7777-8888-9999-000000000000",
    weapon: { id: "wpn-1", name: "Marauder Rifle", base_accuracy_bonus: 4 },
    fire_mode: { id: "fm-1", code: "semi", accuracy_modifier: 5 },
    ammo: { caliber: "7.62", ammo_type: "standard", bullet_damage: 8, damage_modifier: 0, accuracy_modifier: 2, armor_pierce: 3 },
    range: { distance_m: 12, band: "effective", modifier: -5 },
    attack: { roll: 47, skill_level: 20, skill_bonus: 20, manual_bonus: 4, manual_penalty: 0, total: 71 },
    defense: { roll: 39, skill_level: 10, effective_skill_level: 10, skill_source: "dodge", manual_bonus: 10, manual_penalty: 0, total: 49 },
    damage: {
      damage_attack_total: 89, damage_defense_total: 55, diff: 34, level: "serious",
      armor_value_used: 6, armor_pierce_used: 3, melee_strength_bonus: 0,
    },
    body_part: { id: "bp-1", name: "Torso", armor_value: 6, effective_armor: 3 },
    magazine: { id: "mag-1", bullets_spent: 1, remaining_rounds: 11 },
  }, overrides);
}

function outcomeOf(raw) {
  return { ok: true, raw, normalized: normalizeResult(raw), code: null, error: null };
}

// ── 1-4: the four categories render separately, raw vs final ───────────────

test("1. ATTACK ROLL shows the raw roll and the final modified total on separate lines", () => {
  const trace = buildAttackResolutionTrace(outcomeOf(fullRaw()));
  const b = buildRollBreakdown(trace);
  assert.ok(b["ATTACK ROLL"]);
  assert.equal(b["ATTACK ROLL"].Roll, 47);
  assert.equal(b["ATTACK ROLL"]["With modifiers"], 71);
});

test("2. DEFENSE ROLL shows the raw roll and the final modified total on separate lines", () => {
  const trace = buildAttackResolutionTrace(outcomeOf(fullRaw()));
  const b = buildRollBreakdown(trace);
  assert.ok(b["DEFENSE ROLL"]);
  assert.equal(b["DEFENSE ROLL"].Roll, 39);
  assert.equal(b["DEFENSE ROLL"]["With modifiers"], 49);
});

test("3. DAMAGE ROLL shows the base ammo/weapon damage and the final damage total used", () => {
  const trace = buildAttackResolutionTrace(outcomeOf(fullRaw()));
  const b = buildRollBreakdown(trace);
  assert.ok(b["DAMAGE ROLL"]);
  assert.equal(b["DAMAGE ROLL"].Roll, 8);
  assert.equal(b["DAMAGE ROLL"]["With modifiers"], 89);
});

test("4. DAMAGE DEFENSE shows the raw armor value and the final defense total used in the comparison", () => {
  const trace = buildAttackResolutionTrace(outcomeOf(fullRaw()));
  const b = buildRollBreakdown(trace);
  assert.ok(b["DAMAGE DEFENSE"]);
  assert.equal(b["DAMAGE DEFENSE"].Roll, 6);
  assert.equal(b["DAMAGE DEFENSE"]["With modifiers"], 55);
});

// ── 5-6: positive/negative modifiers rendered with correct sign ────────────

test("5. positive modifiers render with an explicit + sign", () => {
  const trace = buildAttackResolutionTrace(outcomeOf(fullRaw()));
  const b = buildRollBreakdown(trace);
  assert.match(b["ATTACK ROLL"].Modifiers, /Skill \+20/);
  assert.match(b["ATTACK ROLL"].Modifiers, /Weapon \+4/);
});

test("6. negative modifiers (armor pierce, manual penalty) render with an explicit - sign", () => {
  const raw = fullRaw();
  raw.attack.manual_penalty = 8;
  const trace = buildAttackResolutionTrace(outcomeOf(raw));
  const b = buildRollBreakdown(trace);
  assert.match(b["ATTACK ROLL"].Modifiers, /Penalty -8/);
  assert.match(b["DAMAGE DEFENSE"].Modifiers, /Armor pierce -3/);
});

// ── 7: zero-modifier honest match ───────────────────────────────────────────

test("7. a modifier the server genuinely returned as 0 is shown honestly, never hidden and never a fake nonzero", () => {
  const raw = fullRaw();
  raw.damage.melee_strength_bonus = 0;
  const trace = buildAttackResolutionTrace(outcomeOf(raw));
  const b = buildRollBreakdown(trace);
  assert.match(b["DAMAGE ROLL"].Modifiers, /Melee 0/);
});

// ── 8: no fabricated raw ─────────────────────────────────────────────────────

test("8. a category with neither raw nor final returned produces NO breakdown line at all — never a fabricated 0", () => {
  const raw = fullRaw();
  delete raw.defense;
  const trace = buildAttackResolutionTrace(outcomeOf(raw));
  const b = buildRollBreakdown(trace);
  assert.equal(b["DEFENSE ROLL"], undefined);
});

test("8b. a category with a final total but a missing raw roll shows NOT_RETURNED for Roll, never reconstructs it by subtracting modifiers", () => {
  const raw = fullRaw();
  delete raw.attack.roll;
  const trace = buildAttackResolutionTrace({ ok: true, raw });
  const b = buildRollBreakdown(trace);
  assert.equal(b["ATTACK ROLL"].Roll, NOT_RETURNED);
  assert.equal(b["ATTACK ROLL"]["With modifiers"], 71);
});

test("8c. a failed/denied attack produces no breakdown categories at all", () => {
  const trace = buildAttackResolutionTrace({ ok: false, raw: { ok: false, error: "NO_MAGAZINE" }, code: "NO_MAGAZINE" });
  const b = buildRollBreakdown(trace);
  assert.deepEqual(Object.keys(b), []);
});

// ── 9: weapon and ability attacks share the same normalized trace contract ──

test("9. buildRollResolutionDetails carries rollBreakdown only when at least one category has data, alongside the existing full trace", () => {
  const trace = buildAttackResolutionTrace(outcomeOf(fullRaw()));
  const details = buildRollResolutionDetails(trace);
  assert.ok(details.rollBreakdown);
  assert.ok(details.accuracy, "existing full accuracy section is preserved, not replaced");
  assert.ok(details.damage, "existing full damage section is preserved, not replaced");

  const failedTrace = buildAttackResolutionTrace({ ok: false, raw: null, code: "ERR" });
  const failedDetails = buildRollResolutionDetails(failedTrace);
  assert.equal(failedDetails.rollBreakdown, undefined);
});

// ── 10: existing Combat Log / Debug Console tests stay green (smoke check) ──

test("10. buildRollBreakdown never mutates the trace it was given", () => {
  const trace = buildAttackResolutionTrace(outcomeOf(fullRaw()));
  const before = JSON.stringify(trace);
  buildRollBreakdown(trace);
  assert.equal(JSON.stringify(trace), before);
});

setTimeout(() => {
  console.log(`\nDebug Console roll breakdown: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
