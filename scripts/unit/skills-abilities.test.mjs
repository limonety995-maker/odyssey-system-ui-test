import assert from "node:assert/strict";
import { createTestSuite } from "./_tinyTestRunner.mjs";
import { fixtureSet } from "./_fixtures.mjs";
import { findByCode } from "./_assertions.mjs";
import { reconcileCharacterAbilities } from "./_mockAdapters.mjs";

const { test, run } = createTestSuite("Unit — Skills → Abilities");
const fx = fixtureSet();

test("buying level 1 skill creates linked ability", () => {
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    skills: [{ id: "skill-row", skill_def_id: fx.skillDefs.ethericCoating.id, level: 1 }],
    abilityDefs: Object.values(fx.abilities),
  });
  assert.equal(findByCode(result.abilities, "etheric_coating").learned_level, 1);
});

test("increasing skill level updates learned_level", () => {
  const first = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    skills: [{ id: "skill-row", skill_def_id: fx.skillDefs.ethericCoating.id, level: 1 }],
    abilityDefs: Object.values(fx.abilities),
  });
  const second = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    skills: [{ id: "skill-row", skill_def_id: fx.skillDefs.ethericCoating.id, level: 2 }],
    abilityDefs: Object.values(fx.abilities),
    existingCharacterAbilities: first.abilities,
  });
  assert.equal(findByCode(second.abilities, "etheric_coating").learned_level, 2);
});

test("skill without linked ability does not create ability", () => {
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    skills: [{ id: "skill-row", skill_def_id: "skill-no-ability", level: 1 }],
    abilityDefs: Object.values(fx.abilities),
  });
  assert.equal(result.abilities.length, 0);
});

await run();

