import assert from "node:assert/strict";
import { createTestSuite } from "./_tinyTestRunner.mjs";
import { fixtureSet } from "./_fixtures.mjs";
import { findByCode } from "./_assertions.mjs";
import { reconcileCharacterAbilities } from "./_mockAdapters.mjs";

const { test, run } = createTestSuite("Unit — Weapons → Abilities");
const fx = fixtureSet();

test("katana grants plasma edge", () => {
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    weapons: [fx.characterWeapons.katanaEquipped],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.plasmaEdgeWeapon],
  });
  const ability = findByCode(result.abilities, "plasma_edge");
  assert.equal(ability.source_character_weapon_id, fx.characterWeapons.katanaEquipped.id);
  assert.equal(ability.data.generated_from, "weapon");
  assert.equal(ability.data.requires_selected_source, true);
});

test("two katanas create two source abilities", () => {
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    weapons: [fx.characterWeapons.katanaEquipped, fx.characterWeapons.katanaSpare],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.plasmaEdgeWeapon],
  });
  const matches = result.abilities.filter((ability) => ability.code === "plasma_edge");
  assert.equal(matches.length, 2);
  assert.notEqual(matches[0].source_character_weapon_id, matches[1].source_character_weapon_id);
});

test("removed weapon hides ability", () => {
  const first = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    weapons: [fx.characterWeapons.katanaEquipped],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.plasmaEdgeWeapon],
  });
  const second = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    weapons: [],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.plasmaEdgeWeapon],
    existingCharacterAbilities: first.abilities,
  });
  assert.equal(findByCode(second.abilities, "plasma_edge").data.source_removed_reason, "missing_weapon");
});

test("weapon ability stays visible for owned source instance", () => {
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    weapons: [fx.characterWeapons.katanaHolstered],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.plasmaEdgeWeapon],
  });
  assert.equal(result.abilities.length, 1);
});

test("reloadable weapon attack keeps per-instance charges", () => {
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    weapons: [fx.characterWeapons.pistolLoaded],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.laserShotWeapon],
  });
  const ability = findByCode(result.abilities, "laser_shot");
  assert.equal(ability.source_character_weapon_id, fx.characterWeapons.pistolLoaded.id);
  assert.equal(ability.current_charges, 1);
  assert.equal(ability.max_charges, 1);
  assert.equal(ability.data.reload_item_code, "small_energy_cell");
});

await run();
