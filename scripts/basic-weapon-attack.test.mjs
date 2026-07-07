// Combat HUD — Basic Weapon Attack v1 tests.
//
// Covers: preconditions (basicAttackPolicy), payload equivalence with the
// canonical Resolve Attack path (basicAttackPayload → resolveAttackService),
// double-submit / stale-result protection, ok:false vs exception handling,
// target body-zone resolution (targetBodyZones — privacy: shield/psi/etc are
// discarded), and the live ui.basicAttack / ?debug=1 wiring.

import assert from "node:assert/strict";
import {
  evaluateBasicAttack,
  BASIC_ATTACK_BLOCK_REASON,
  buildAttackRequestSignature,
  isAttackResultStale,
} from "../hud/combat/basicAttackPolicy.js";
import { buildBasicAttackCtx, resolveAttack, normalizeResult } from "../hud/combat/basicAttackPayload.js";
import { buildAttackPayload as canonicalBuildAttackPayload } from "../screens/resolveAttack/resolveAttackService.js";
import { mapTargetBodyZones, resolveBodyPartId } from "../hud/targeting/targetBodyZones.js";
import { applyResolvedTarget, createInitialTargetState, buildTargetingBroadcast, clearTarget } from "../hud/targeting/targetSelectionState.js";
import { buildBroadcastPayload, SELECTION_STATUS } from "../hud/scene/selectionState.js";

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

async function asyncTest(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.error(`  FAIL ${name}\n      ${err.message}`);
  }
}

console.log("\nBasic Weapon Attack v1\n");

function fullCtx(overrides = {}) {
  return {
    sourceCharacterId: "char-src",
    weaponId: "wpn-1",
    targetTokenId: "tok-target",
    targetCharacterId: "char-target",
    bodyZoneId: "TORSO",
    resolvedBodyPartId: "bp-uuid-torso",
    inFlight: false,
    ...overrides,
  };
}

// ── 1-4, 8: preconditions ───────────────────────────────────────────────────

test("1. no target at all blocks the attack (RPC never reached)", () => {
  const result = evaluateBasicAttack(fullCtx({ targetTokenId: null, targetCharacterId: null }));
  assert.equal(result.uiAllowed, false);
  assert.equal(result.uiBlockReason, BASIC_ATTACK_BLOCK_REASON.noTarget);
});

test("2. target token without a linked character blocks the attack", () => {
  const result = evaluateBasicAttack(fullCtx({ targetCharacterId: null }));
  assert.equal(result.uiAllowed, false);
  assert.equal(result.uiBlockReason, BASIC_ATTACK_BLOCK_REASON.targetNotLinked);
});

test("3. source attacking itself is blocked", () => {
  const result = evaluateBasicAttack(fullCtx({ targetCharacterId: "char-src" }));
  assert.equal(result.uiAllowed, false);
  assert.equal(result.uiBlockReason, BASIC_ATTACK_BLOCK_REASON.selfTarget);
});

test("4. no active weapon blocks the attack", () => {
  const result = evaluateBasicAttack(fullCtx({ weaponId: null }));
  assert.equal(result.uiAllowed, false);
  assert.equal(result.uiBlockReason, BASIC_ATTACK_BLOCK_REASON.noWeapon);
});

test("8. an in-flight attack blocks a second submit", () => {
  const result = evaluateBasicAttack(fullCtx({ inFlight: true }));
  assert.equal(result.uiAllowed, false);
  assert.equal(result.uiBlockReason, BASIC_ATTACK_BLOCK_REASON.inFlight);
});

test("no body zone selected blocks the attack (distinct from zone-unresolved)", () => {
  const result = evaluateBasicAttack(fullCtx({ bodyZoneId: null }));
  assert.equal(result.uiAllowed, false);
  assert.equal(result.uiBlockReason, BASIC_ATTACK_BLOCK_REASON.noZone);
});

test("a selected zone that hasn't resolved to a real body-part id blocks the attack (never a fabricated 'No ammo')", () => {
  const result = evaluateBasicAttack(fullCtx({ resolvedBodyPartId: null }));
  assert.equal(result.uiAllowed, false);
  assert.equal(result.uiBlockReason, BASIC_ATTACK_BLOCK_REASON.zoneUnresolved);
  assert.ok(!/ammo/i.test(result.uiBlockReason));
});

test("all preconditions satisfied → allowed", () => {
  const result = evaluateBasicAttack(fullCtx());
  assert.deepEqual(result, { uiAllowed: true, uiBlockReason: null });
});

// ── 5, 6, 7: payload equivalence with canonical Resolve Attack ─────────────

test("5. ranged attack payload matches the canonical Resolve Attack payload for the same inputs", () => {
  const inputs = {
    sourceCharacterId: "char-src",
    weaponId: "wpn-ranged-1",
    targetCharacterId: "char-target",
    bodyPartId: "bp-uuid-torso",
    distance: 12.5,
  };
  const hudPayload = canonicalBuildAttackPayload(buildBasicAttackCtx(inputs));
  const oldScreenPayload = canonicalBuildAttackPayload({
    attackerCharacterId: inputs.sourceCharacterId,
    targetCharacterId: inputs.targetCharacterId,
    targetBodyPartId: inputs.bodyPartId,
    distanceM: inputs.distance,
    weaponId: inputs.weaponId,
    modifiers: [],
  });
  assert.deepEqual(hudPayload, oldScreenPayload);
  assert.deepEqual(hudPayload, {
    attacker_character_id: "char-src",
    target_character_id: "char-target",
    target_body_part_id: "bp-uuid-torso",
    distance_m: 12.5,
    attack_context: { manual_attack_bonus: 0, manual_attack_penalty: 0 },
    weapon_id: "wpn-ranged-1",
  });
});

test("6. melee attack payload requires no magazine/ammo field at all", () => {
  const payload = canonicalBuildAttackPayload(buildBasicAttackCtx({
    sourceCharacterId: "char-src",
    weaponId: "wpn-melee-katana",
    targetCharacterId: "char-target",
    bodyPartId: "bp-uuid-torso",
    distance: 0,
  }));
  assert.ok(!("magazine_id" in payload) && !("character_magazine_id" in payload) && !("ammo" in payload));
  assert.equal(payload.weapon_id, "wpn-melee-katana");
});

test("7. fire mode is never included in the attack payload (server derives it from persisted profile state)", () => {
  const payload = canonicalBuildAttackPayload(buildBasicAttackCtx({
    sourceCharacterId: "char-src",
    weaponId: "wpn-1",
    targetCharacterId: "char-target",
    bodyPartId: "bp-uuid-torso",
    distance: 3,
  }));
  assert.ok(!("fire_mode_code" in payload));
  assert.ok(!("fire_mode_id" in payload));
  assert.ok(!("selected_fire_mode_id" in payload));
});

// ── 9: stale in-flight result must not apply ────────────────────────────────

test("9a. request signature differs after weapon changes mid-flight → stale", () => {
  const requestCtx = { sourceCharacterId: "c1", weaponId: "w1", targetCharacterId: "t1" };
  const currentCtxSameWeapon = { sourceCharacterId: "c1", weaponId: "w1", targetCharacterId: "t1" };
  const currentCtxDifferentWeapon = { sourceCharacterId: "c1", weaponId: "w2", targetCharacterId: "t1" };
  assert.equal(isAttackResultStale(requestCtx, currentCtxSameWeapon), false);
  assert.equal(isAttackResultStale(requestCtx, currentCtxDifferentWeapon), true);
});

test("9b. request signature differs after target or source changes mid-flight → stale", () => {
  const requestCtx = { sourceCharacterId: "c1", weaponId: "w1", targetCharacterId: "t1" };
  assert.equal(isAttackResultStale(requestCtx, { ...requestCtx, targetCharacterId: "t2" }), true);
  assert.equal(isAttackResultStale(requestCtx, { ...requestCtx, sourceCharacterId: "c2" }), true);
  assert.equal(buildAttackRequestSignature(requestCtx), "c1|w1|t1");
});

// ── 10, 11: ok:false / exception must never read as success ────────────────

await asyncTest("10. a { ok:false } server response is never treated as success", async () => {
  const outcome = await resolveAttack(
    buildBasicAttackCtx({ sourceCharacterId: "c1", weaponId: "w1", targetCharacterId: "t1", bodyPartId: "bp1" }),
    { performAttack: async () => ({ ok: false, error: "NO_MAGAZINE", message: "Weapon requires a loaded magazine." }) },
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, "NO_MAGAZINE");
});

await asyncTest("11. a thrown/rejected RPC call is never treated as success", async () => {
  const outcome = await resolveAttack(
    buildBasicAttackCtx({ sourceCharacterId: "c1", weaponId: "w1", targetCharacterId: "t1", bodyPartId: "bp1" }),
    { performAttack: async () => { throw new Error("network down"); } },
  );
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /network down/);
});

test("a genuine success is reported ok:true", async () => {
  const outcome = await resolveAttack(
    buildBasicAttackCtx({ sourceCharacterId: "c1", weaponId: "w1", targetCharacterId: "t1", bodyPartId: "bp1" }),
    { performAttack: async () => ({ ok: true, hit: true, damage: { level: "serious" } }) },
  );
  assert.equal(outcome.ok, true);
  assert.equal(outcome.normalized.hit, true);
});

// ── 15: normalizeResult never carries target-private data ─────────────────

test("15. normalizeResult's shape never includes target inventory/armory/skills/PSI", () => {
  const raw = {
    ok: true, hit: true,
    damage: { level: "minor" },
    target_state: { is_alive: true, is_conscious: true },
    // A hypothetical (and wrong) backend response that leaked target private
    // data — normalizeResult must not surface it even if present on raw.
    target_inventory: ["rifle", "medkit"],
    target_skills: ["marksmanship"],
    target_psi: 40,
  };
  const normalized = normalizeResult(raw);
  const keys = Object.keys(normalized);
  assert.ok(!keys.some((k) => /inventory|skill|psi|armory/i.test(k)));
  assert.equal(normalized.targetAlive, true);
});

// ── target body-zone resolution (privacy-scoped) ────────────────────────────

test("mapTargetBodyZones resolves zoneId/bodyPartId pairs and discards shield/psi/combat_flags", () => {
  const bundle = {
    sections: {
      combat: {
        shield_current: 10, shield_max: 10, psi_current: 40, psi_max: 40,
        combat_flags: { main_action_spent: true },
        status_summary: "Wounded",
        body_parts: [
          { id: "bp-torso", zone_id: "torso", disabled: false, destroyed: false },
          { id: "bp-head", zone_id: "head", disabled: false, destroyed: false },
          // Bugfix pack: a genuinely destroyed part (critical has reached its
          // real threshold) — a bare `disabled` flag alone is no longer
          // trusted (see hud/targeting/bodyConditionPolicy.js audit note).
          { id: "bp-larm", zone_id: "left_arm", critical: 2, max_critical: 2, disabled: true, destroyed: true },
        ],
      },
    },
  };
  const zones = mapTargetBodyZones(bundle);
  assert.deepEqual(zones, [
    { zoneId: "TORSO", bodyPartId: "bp-torso", canBeTargeted: true, state: "healthy", colorToken: "--odyssey-hud-zone-healthy", label: "Healthy", zoneState: "healthy" },
    { zoneId: "HEAD", bodyPartId: "bp-head", canBeTargeted: true, state: "healthy", colorToken: "--odyssey-hud-zone-healthy", label: "Healthy", zoneState: "healthy" },
    { zoneId: "LEFT_ARM", bodyPartId: "bp-larm", canBeTargeted: false, state: "disabled", colorToken: "--odyssey-hud-zone-disabled", label: "Disabled", zoneState: "disabled" },
  ]);
  // Only zoneId/bodyPartId/canBeTargeted/state/colorToken/label/zoneState keys
  // ever appear — nothing shield/psi/combat_flags/status_summary-shaped.
  for (const z of zones) {
    assert.deepEqual(
      Object.keys(z).sort(),
      ["bodyPartId", "canBeTargeted", "colorToken", "label", "state", "zoneId", "zoneState"],
    );
  }
});

test("resolveBodyPartId looks up the currently selected zone only", () => {
  const zones = [
    { zoneId: "TORSO", bodyPartId: "bp-torso", canBeTargeted: true },
    { zoneId: "HEAD", bodyPartId: "bp-head", canBeTargeted: true },
  ];
  assert.equal(resolveBodyPartId(zones, "HEAD"), "bp-head");
  assert.equal(resolveBodyPartId(zones, "RIGHT_LEG"), null);
  assert.equal(resolveBodyPartId([], "TORSO"), null);
});

test("a resolved target's zone selection carries resolvedBodyPartId through applyResolvedTarget + buildTargetingBroadcast", () => {
  const candidate = {
    tokenId: "tok-1",
    characterId: "char-target",
    displayName: "Raider",
    bodyZones: [
      { zoneId: "TORSO", bodyPartId: "bp-torso", canBeTargeted: true },
      { zoneId: "HEAD", bodyPartId: "bp-head", canBeTargeted: true },
    ],
  };
  const state = applyResolvedTarget(createInitialTargetState(), candidate);
  const broadcast = buildTargetingBroadcast(state);
  // Default zone is TORSO.
  assert.equal(broadcast.target.selectedZoneId, "TORSO");
  assert.equal(broadcast.target.resolvedBodyPartId, "bp-torso");
  // The raw bodyZones list itself is never shipped over the wire.
  assert.equal(broadcast.target.bodyZones, undefined);
});

// ── 14: clearing a target resets both target and its zone together ────────

test("14. clearTarget resets exactly the target + its zone (the only 'temporary' state Basic Attack success should end)", () => {
  const candidate = { tokenId: "tok-1", characterId: "char-target", bodyZones: [{ zoneId: "TORSO", bodyPartId: "bp-torso", canBeTargeted: true }] };
  const resolved = applyResolvedTarget(createInitialTargetState(), candidate);
  assert.ok(resolved.target);
  const cleared = clearTarget(resolved);
  assert.equal(cleared.target, null);
  assert.equal(cleared.mode, "idle");
  // Source is untouched by clearing the target.
  assert.deepEqual(cleared.source, resolved.source);
});

// ── ui.basicAttack + ?debug=1 wiring through buildBroadcastPayload ─────────

function readyRuntimeBundleState(weaponOverrides = {}) {
  const bundle = {
    character: { id: "char-src", display_name: "Hero", owner_player_id: "p1" },
    state: { is_alive: true, is_conscious: true },
    sections: {
      armory: {
        weapons: [{
          id: "w1", name: "Rifle", model: { caliber: "45" },
          active_profile_id: "profile-1", active_profile: { id: "profile-1" },
          ...weaponOverrides,
        }],
        magazines: [],
      },
    },
  };
  return {
    status: SELECTION_STATUS.ready, selectedItemId: "tok-src", characterId: "char-src",
    viewer: { playerId: "p1", role: "PLAYER" }, access: { canView: true, reason: null },
    runtimeBundle: bundle, view: { name: "Hero" }, error: { code: null, message: null },
  };
}

test("ui.basicAttack reflects preconditions live (no target yet → blocked with 'Select a target.')", () => {
  const payload = buildBroadcastPayload(readyRuntimeBundleState(), {});
  assert.equal(payload.ui.basicAttack.uiAllowed, false);
  assert.equal(payload.ui.basicAttack.uiBlockReason, "Select a target.");
});

test("ui.basicAttack allows once source/weapon/target/zone all resolve", () => {
  const ephemeral = {
    targeting: {
      selectedTargetIds: ["tok-target"],
      selectedTargetCharacterId: "char-target",
      selectedBodyPartId: "TORSO",
      resolvedBodyPartId: "bp-torso",
      distance: 5,
    },
  };
  const payload = buildBroadcastPayload(readyRuntimeBundleState(), ephemeral);
  assert.equal(payload.ui.basicAttack.uiAllowed, true);
  assert.equal(payload.ui.basicAttack.uiBlockReason, null);
});

test("debug.basicAttack is present only when debugEnabled, and never leaks the runtime bundle", () => {
  const ephemeral = {
    debugEnabled: true,
    targeting: {
      selectedTargetIds: ["tok-target"],
      selectedTargetCharacterId: "char-target",
      selectedBodyPartId: "TORSO",
      resolvedBodyPartId: "bp-torso",
      distance: 5,
    },
  };
  const payload = buildBroadcastPayload(readyRuntimeBundleState(), ephemeral);
  assert.ok(payload.debug.basicAttack);
  assert.equal(payload.debug.basicAttack.sourceCharacterId, "char-src");
  assert.equal(payload.debug.basicAttack.targetCharacterId, "char-target");
  assert.equal(payload.debug.basicAttack.weaponId, "w1");
  assert.equal(payload.debug.basicAttack.bodyZone, "TORSO");
  assert.deepEqual(payload.debug.basicAttack.payload, {
    attacker_character_id: "char-src",
    target_character_id: "char-target",
    target_body_part_id: "bp-torso",
    distance_m: 5,
    attack_context: { manual_attack_bonus: 0, manual_attack_penalty: 0 },
    weapon_id: "w1",
  });
  assert.equal(JSON.stringify(payload.debug.basicAttack).includes("armory"), false);

  const withoutDebug = buildBroadcastPayload(readyRuntimeBundleState(), { ...ephemeral, debugEnabled: false });
  assert.equal(withoutDebug.debug.basicAttack, undefined);
});

setTimeout(() => {
  console.log(`\nBasic Weapon Attack v1: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
