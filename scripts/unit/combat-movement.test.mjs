import assert from "node:assert/strict";
import { createTestSuite } from "./_tinyTestRunner.mjs";
import { fixtureSet } from "./_fixtures.mjs";
import { assertRejected } from "./_assertions.mjs";
import { evaluateCombatMovement, startEncounterMock } from "./_mockAdapters.mjs";

const { test, run } = createTestSuite("Unit — Combat Movement");
const fx = fixtureSet();

function session() {
  return startEncounterMock([
    { character_id: fx.characters.testAttacker.id, initiative: 18, move_max: 10 },
    { character_id: fx.characters.testTarget.id, initiative: 12, move_max: 10 },
  ]);
}

test("current turn movement is allowed within budget", () => {
  const result = evaluateCombatMovement({
    session: session(),
    characterId: fx.characters.testAttacker.id,
    start: { x: 0, y: 0 },
    destination: { x: 2, y: 0 },
    distance: 2,
  });
  assert.equal(result.ok, true);
  assert.equal(result.session.participants[0].move_current, 8);
});

test("cannot move outside own turn", () => {
  const result = evaluateCombatMovement({
    session: session(),
    characterId: fx.characters.testTarget.id,
    start: { x: 0, y: 0 },
    destination: { x: 1, y: 0 },
    distance: 1,
  });
  assertRejected(result, "not_current_turn");
});

test("cannot move past budget", () => {
  const result = evaluateCombatMovement({
    session: session(),
    characterId: fx.characters.testAttacker.id,
    start: { x: 0, y: 0 },
    destination: { x: 11, y: 0 },
    distance: 11,
  });
  assertRejected(result, "insufficient_move");
});

await run();

