import assert from "node:assert/strict";
import { createTestSuite } from "./_tinyTestRunner.mjs";
import { fixtureSet } from "./_fixtures.mjs";
import { assertAbilityState, findByCode } from "./_assertions.mjs";
import { reconcileCharacterAbilities } from "./_mockAdapters.mjs";

const { test, run } = createTestSuite("Unit — Abilities Reconcile");
const fx = fixtureSet();

test("skill gives linked ability", () => {
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    skills: [{ id: "char-skill-1", skill_def_id: fx.skillDefs.ethericCoating.id, level: 3 }],
    abilityDefs: Object.values(fx.abilities),
    existingCharacterAbilities: [],
    abilityGrants: [],
  });
  const ability = findByCode(result.abilities, "etheric_coating");
  assertAbilityState(ability, {
    is_enabled: true,
    is_hidden: false,
    source_type: "skill",
    learned_level: 3,
  });
  assert.equal(ability.character_skill_id, "char-skill-1");
});

test("removed skill hides generated ability", () => {
  const existing = [{
    id: "char-ability-1",
    ability_def_id: fx.abilities.ethericCoating.id,
    code: "etheric_coating",
    generated: true,
    source_type: "skill",
    source_key: `skill:${fx.abilities.ethericCoating.id}:${fx.skillDefs.ethericCoating.id}`,
    is_enabled: true,
    is_hidden: false,
    data: {},
  }];
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    skills: [],
    abilityDefs: Object.values(fx.abilities),
    existingCharacterAbilities: existing,
    abilityGrants: [],
  });
  const ability = findByCode(result.abilities, "etheric_coating");
  assertAbilityState(ability, {
    is_enabled: false,
    is_hidden: true,
  });
  assert.equal(ability.data.source_removed_reason, "missing_skill");
});

test("running reconcile twice does not create duplicates", () => {
  const payload = {
    character: fx.characters.testAttacker,
    skills: [{ id: "char-skill-1", skill_def_id: fx.skillDefs.ethericCoating.id, level: 1 }],
    abilityDefs: Object.values(fx.abilities),
    existingCharacterAbilities: [],
    abilityGrants: [],
  };
  const first = reconcileCharacterAbilities(payload);
  const second = reconcileCharacterAbilities({ ...payload, existingCharacterAbilities: first.abilities });
  const matches = second.abilities.filter((ability) => ability.code === "etheric_coating");
  assert.equal(matches.length, 1);
});

test("orphan ability is hidden", () => {
  const existing = [{
    id: "char-ability-2",
    ability_def_id: fx.abilities.ethericStrike.id,
    code: "etheric_strike",
    generated: true,
    source_type: "skill",
    source_key: `skill:${fx.abilities.ethericStrike.id}:${fx.skillDefs.ethericStrike.id}`,
    is_enabled: true,
    is_hidden: false,
    data: {},
  }];
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    skills: [],
    abilityDefs: Object.values(fx.abilities),
    existingCharacterAbilities: existing,
    abilityGrants: [],
  });
  const ability = findByCode(result.abilities, "etheric_strike");
  assert.equal(ability.is_hidden, true);
  assert.equal(ability.data.source_removed, true);
});

test("manual ability is untouched by reconcile", () => {
  const existing = [{
    id: "manual-ability",
    ability_def_id: fx.abilities.ethericStrike.id,
    code: "etheric_strike",
    generated: false,
    is_enabled: true,
    is_hidden: false,
    data: { custom: true },
  }];
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    skills: [],
    abilityDefs: Object.values(fx.abilities),
    existingCharacterAbilities: existing,
    abilityGrants: [],
  });
  const ability = findByCode(result.abilities, "etheric_strike");
  assert.equal(ability.generated, false);
  assert.equal(ability.is_hidden, false);
  assert.equal(ability.data.custom, true);
});

await run();

