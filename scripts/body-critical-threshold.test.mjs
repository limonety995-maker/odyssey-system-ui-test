// Combat HUD — Priority Bugfix Pack, Fix #2: body critical-damage threshold.
//
// Audit finding (see hud/targeting/bodyConditionPolicy.js header comment):
// the server's `disabled` column is set the moment ANY critical wound lands,
// before the real per-part `max_critical` threshold is reached — so it is not
// a trustworthy "destroyed" signal on its own. `destroyed` remains reliable
// (always threshold-gated at the SQL level). These tests lock in the
// corrected canonical rule: destroyed/disabled only when
// currentCriticalDamage >= criticalDamageThreshold.

import assert from "node:assert/strict";
import { evaluateBodyCondition, bodyConditionDetailLines, BODY_CONDITION_STATE } from "../hud/targeting/bodyConditionPolicy.js";
import { mapTargetBodyZones } from "../hud/targeting/targetBodyZones.js";

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

console.log("\nBody critical-damage threshold (Bugfix Pack Fix #2)\n");

function notDestroyed(state) {
  return state !== BODY_CONDITION_STATE.disabled;
}

// ── Required threshold/critical combinations ───────────────────────────────

test("threshold 1, critical 0 -> not destroyed", () => {
  const r = evaluateBodyCondition({ critical: 0, max_critical: 1, disabled: false, destroyed: false });
  assert.ok(notDestroyed(r.state));
});

test("threshold 1, critical 1 -> destroyed", () => {
  const r = evaluateBodyCondition({ critical: 1, max_critical: 1, disabled: true, destroyed: true });
  assert.equal(r.state, BODY_CONDITION_STATE.disabled);
});

test("threshold 2, critical 0 -> not destroyed", () => {
  const r = evaluateBodyCondition({ critical: 0, max_critical: 2 });
  assert.ok(notDestroyed(r.state));
});

test("threshold 2, critical 1 -> NOT destroyed (critical-but-functional) — the reported bug", () => {
  // Server-realistic shape: `disabled` is already true (premature, audited
  // bug) but `destroyed` is correctly still false and critical (1) has not
  // reached max_critical (2).
  const r = evaluateBodyCondition({ critical: 1, max_critical: 2, disabled: true, destroyed: false });
  assert.equal(r.state, BODY_CONDITION_STATE.critical);
  assert.ok(notDestroyed(r.state));
});

test("threshold 2, critical 2 -> destroyed", () => {
  const r = evaluateBodyCondition({ critical: 2, max_critical: 2, disabled: true, destroyed: true });
  assert.equal(r.state, BODY_CONDITION_STATE.disabled);
});

test("threshold 3, critical 2 -> not destroyed", () => {
  const r = evaluateBodyCondition({ critical: 2, max_critical: 3, disabled: true, destroyed: false });
  assert.equal(r.state, BODY_CONDITION_STATE.critical);
});

test("threshold 3, critical 3 -> destroyed", () => {
  const r = evaluateBodyCondition({ critical: 3, max_critical: 3, disabled: true, destroyed: true });
  assert.equal(r.state, BODY_CONDITION_STATE.disabled);
});

// ── Guardrails ──────────────────────────────────────────────────────────────

test("serious damage alone never implies destroyed", () => {
  const r = evaluateBodyCondition({ serious: 5, critical: 0, max_critical: 2 });
  assert.ok(notDestroyed(r.state));
  assert.equal(r.state, BODY_CONDITION_STATE.serious);
});

test("armor condition never overwrites body-part destruction state", () => {
  const healthyBodyBrokenArmor = evaluateBodyCondition({
    critical: 0, max_critical: 2,
    armor_value: 0, armor_critical: 5, armor_max_critical: 5, armor_destroyed: true,
  });
  assert.ok(notDestroyed(healthyBodyBrokenArmor.state));

  const destroyedBodyIntactArmor = evaluateBodyCondition({
    critical: 2, max_critical: 2, destroyed: true,
    armor_value: 10, armor_critical: 0, armor_max_critical: 5, armor_destroyed: false,
  });
  assert.equal(destroyedBodyIntactArmor.state, BODY_CONDITION_STATE.disabled);
});

test("missing threshold data never renders destroyed on its own (no fabricated default)", () => {
  const noThresholdNoDestroyed = evaluateBodyCondition({ critical: 1, disabled: true, destroyed: false });
  assert.ok(notDestroyed(noThresholdNoDestroyed.state), "a bare premature `disabled` flag must not fabricate destruction");

  const zeroThreshold = evaluateBodyCondition({ critical: 1, max_critical: 0, disabled: true, destroyed: false });
  assert.ok(notDestroyed(zeroThreshold.state), "max_critical:0 is treated as missing, never as an already-reached threshold");

  // Missing threshold + a genuinely real, always-gated `destroyed:true` is
  // still honored (the one server signal proven reliable by audit).
  const noThresholdButDestroyed = evaluateBodyCondition({ critical: 1, destroyed: true });
  assert.equal(noThresholdButDestroyed.state, BODY_CONDITION_STATE.disabled);
});

test("silhouette re-derives fresh from each authoritative combat result — no stale caching", () => {
  const before = evaluateBodyCondition({ critical: 1, max_critical: 2 });
  const after = evaluateBodyCondition({ critical: 2, max_critical: 2, destroyed: true, disabled: true });
  assert.equal(before.state, BODY_CONDITION_STATE.critical);
  assert.equal(after.state, BODY_CONDITION_STATE.disabled);
});

test("hover detail lines follow the same threshold rule as the silhouette color", () => {
  const criticalButFunctional = bodyConditionDetailLines({ critical: 1, max_critical: 2, disabled: true, destroyed: false });
  assert.ok(!criticalButFunctional.some((l) => /Disabled|Destroyed/.test(l)));
  assert.ok(criticalButFunctional.some((l) => /Critical damage: 1/.test(l)));

  const actuallyDestroyed = bodyConditionDetailLines({ critical: 2, max_critical: 2, disabled: true, destroyed: true });
  assert.ok(actuallyDestroyed.some((l) => l === "Destroyed"));
});

test("mapTargetBodyZones applies the same corrected rule to a target's silhouette", () => {
  const bundle = {
    combat: {
      body_parts: [
        { id: "bp-1", part_key: "TORSO", critical: 1, max_critical: 2, disabled: true, destroyed: false },
        { id: "bp-2", part_key: "HEAD", critical: 2, max_critical: 2, disabled: true, destroyed: true },
      ],
    },
  };
  const zones = mapTargetBodyZones(bundle);
  const torso = zones.find((z) => z.zoneId === "TORSO");
  const head = zones.find((z) => z.zoneId === "HEAD");
  assert.ok(torso, "torso zone resolved");
  assert.equal(torso.state, BODY_CONDITION_STATE.critical, "critical-but-functional target part is NOT shown as destroyed");
  assert.equal(head.state, BODY_CONDITION_STATE.disabled, "a part that truly reached its threshold IS shown as destroyed");
});

setTimeout(() => {
  console.log(`\nBody critical-damage threshold: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
