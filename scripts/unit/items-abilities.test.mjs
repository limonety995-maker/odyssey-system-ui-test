import assert from "node:assert/strict";
import { createTestSuite } from "./_tinyTestRunner.mjs";
import { fixtureSet } from "./_fixtures.mjs";
import { findByCode } from "./_assertions.mjs";
import { reconcileCharacterAbilities } from "./_mockAdapters.mjs";

const { test, run } = createTestSuite("Unit — Items / Equipment → Abilities");
const fx = fixtureSet();

test("item grants ability", () => {
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    items: [fx.items.medkit],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.firstAidItem],
  });
  assert.equal(findByCode(result.abilities, "first_aid").source_character_item_id, fx.items.medkit.id);
});

test("spent or removed item hides ability", () => {
  const first = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    items: [fx.items.medkit],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.firstAidItem],
  });
  const second = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    items: [],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.firstAidItem],
    existingCharacterAbilities: first.abilities,
  });
  assert.equal(findByCode(second.abilities, "first_aid").data.source_removed_reason, "missing_item");
});

test("equipment-granted ability stays visible while owned", () => {
  const visibleButDisabled = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    items: [fx.items.prototypeEyeLoose],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.neuralOverloadImplant],
  });
  const looseAbility = findByCode(visibleButDisabled.abilities, "neural_overload");
  assert.ok(looseAbility);
  assert.equal(looseAbility.source_equipment_item_id, fx.items.prototypeEyeLoose.id);
  assert.equal(looseAbility.data.generated_from, "implant");
  assert.equal(looseAbility.data.requires_installed, true);

  const installed = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    items: [fx.items.prototypeEyeInstalled],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.neuralOverloadImplant],
  });
  assert.ok(findByCode(installed.abilities, "neural_overload"));
});

await run();
