import assert from "node:assert/strict";
import { createTestSuite } from "./_tinyTestRunner.mjs";
import { fixtureSet } from "./_fixtures.mjs";
import { assertRejected } from "./_assertions.mjs";
import { resolveAttackMock, startEncounterMock } from "./_mockAdapters.mjs";

const { test, run } = createTestSuite("Unit — Attack Resolution");
const fx = fixtureSet();

function session() {
  return startEncounterMock([
    { character_id: fx.characters.testAttacker.id, initiative: 18, move_max: 10 },
    { character_id: fx.characters.testTarget.id, initiative: 12, move_max: 10 },
  ]);
}

const activeAbility = { id: "ability-basic", is_hidden: false, is_enabled: true };

test("cannot attack outside own turn", () => {
  const result = resolveAttackMock({
    session: session(),
    attackerId: fx.characters.testTarget.id,
    targetId: fx.characters.testAttacker.id,
    ability: activeAbility,
  });
  assertRejected(result, "not_current_turn");
});

test("cannot attack without target", () => {
  const result = resolveAttackMock({
    session: session(),
    attackerId: fx.characters.testAttacker.id,
    targetId: "",
    ability: activeAbility,
  });
  assertRejected(result, "no_target");
});

test("cannot attack with hidden or disabled ability", () => {
  const result = resolveAttackMock({
    session: session(),
    attackerId: fx.characters.testAttacker.id,
    targetId: fx.characters.testTarget.id,
    ability: { id: "ability-bad", is_hidden: true, is_enabled: false },
  });
  assertRejected(result, "ability_disabled");
});

test("basic weapon attack creates attack event", () => {
  const result = resolveAttackMock({
    session: session(),
    attackerId: fx.characters.testAttacker.id,
    targetId: fx.characters.testTarget.id,
    ability: activeAbility,
    weapon: fx.characterWeapons.pistolLoaded,
    roll: 62,
  });
  assert.equal(result.ok, true);
  assert.equal(result.event.attacker, fx.characters.testAttacker.id);
  assert.equal(result.event.weapon, fx.characterWeapons.pistolLoaded.id);
});

test("critical success is handled separately", () => {
  const result = resolveAttackMock({
    session: session(),
    attackerId: fx.characters.testAttacker.id,
    targetId: fx.characters.testTarget.id,
    ability: activeAbility,
    roll: 95,
  });
  assert.equal(result.event.result, "critical_success");
});

test("critical failure is handled separately", () => {
  const result = resolveAttackMock({
    session: session(),
    attackerId: fx.characters.testAttacker.id,
    targetId: fx.characters.testTarget.id,
    ability: activeAbility,
    roll: 5,
  });
  assert.equal(result.event.result, "critical_failure");
});

await run();

