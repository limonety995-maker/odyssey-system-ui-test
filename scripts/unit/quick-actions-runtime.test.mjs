import assert from "node:assert/strict";
import { createTestSuite } from "./_tinyTestRunner.mjs";
import { fixtureSet } from "./_fixtures.mjs";
import { buildQuickActionsRuntime, reconcileCharacterAbilities } from "./_mockAdapters.mjs";

const { test, run } = createTestSuite("Unit — Quick Actions Runtime");
const fx = fixtureSet();

test("visible manual abilities appear in quick actions", () => {
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    skills: [{ id: "skill-row", skill_def_id: fx.skillDefs.ethericCoating.id, level: 1 }],
    weapons: [fx.characterWeapons.katanaEquipped],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.plasmaEdgeWeapon],
  });
  const runtime = buildQuickActionsRuntime({ abilities: result.abilities, encounter: fx.encounters.activeEncounter });
  assert.ok(runtime.quickActions.some((entry) => entry.code === "etheric_coating"));
  assert.ok(runtime.quickActions.some((entry) => entry.code === "plasma_edge"));
});

test("weapon-granted ability stays visible but disabled when another weapon is selected", () => {
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    weapons: [fx.characterWeapons.katanaEquipped, fx.characterWeapons.pistolLoaded],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.laserShotWeapon],
  });
  const runtime = buildQuickActionsRuntime({
    abilities: result.abilities,
    encounter: fx.encounters.activeEncounter,
    selectedWeaponId: fx.characterWeapons.katanaEquipped.id,
  });
  const action = runtime.quickActions.find((entry) => entry.code === "laser_shot");
  assert.ok(action);
  assert.equal(action.sourceType, "weapon");
  assert.equal(action.state.available, false);
  assert.match(action.state.disabledReason, /Select/i);
});

test("implant-granted ability stays visible but disabled while not installed", () => {
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    items: [fx.items.prototypeEyeLoose],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.neuralOverloadImplant],
  });
  const runtime = buildQuickActionsRuntime({ abilities: result.abilities });
  const action = runtime.quickActions.find((entry) => entry.code === "neural_overload");
  assert.ok(action);
  assert.equal(action.sourceType, "implant");
  assert.equal(action.state.available, false);
  assert.match(action.state.disabledReason, /Install/i);
});

test("hidden and disabled abilities are excluded", () => {
  const runtime = buildQuickActionsRuntime({
    abilities: [
      { id: "a1", code: "visible", name: "Visible", is_hidden: false, is_enabled: true, activation_type: "manual", ability_kind: "support", target_type: "self", effect_mode: "buff" },
      { id: "a2", code: "hidden", name: "Hidden", is_hidden: true, is_enabled: true, activation_type: "manual", ability_kind: "support", target_type: "self", effect_mode: "buff" },
      { id: "a3", code: "disabled", name: "Disabled", is_hidden: false, is_enabled: false, activation_type: "manual", ability_kind: "support", target_type: "self", effect_mode: "buff" },
    ],
  });
  assert.deepEqual(runtime.quickActions.map((entry) => entry.code), ["visible"]);
});

test("passive abilities are excluded from quick actions", () => {
  const runtime = buildQuickActionsRuntime({
    abilities: [
      { id: "a1", code: "passive_focus", name: "Passive Focus", is_hidden: false, is_enabled: true, activation_type: "passive", ability_kind: "passive", target_type: "self", effect_mode: "buff" },
    ],
  });
  assert.equal(runtime.quickActions.length, 0);
});

await run();
