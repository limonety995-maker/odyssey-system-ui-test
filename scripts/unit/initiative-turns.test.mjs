import assert from "node:assert/strict";
import { createTestSuite } from "./_tinyTestRunner.mjs";
import { fixtureSet } from "./_fixtures.mjs";
import { endTurnMock, startEncounterMock } from "./_mockAdapters.mjs";

const { test, run } = createTestSuite("Unit — Initiative / Turns");
const fx = fixtureSet();

function start() {
  return startEncounterMock([
    { character_id: fx.characters.testAttacker.id, initiative: 18, move_max: 10 },
    { character_id: fx.characters.testTarget.id, initiative: 12, move_max: 10 },
  ]);
}

test("start combat creates initiative order and current turn", () => {
  const session = start();
  assert.equal(session.participants.length, 2);
  assert.equal(session.participants[0].is_current_turn, true);
  assert.equal(session.round, 1);
});

test("end turn switches active character", () => {
  const session = endTurnMock(start());
  assert.equal(session.participants[1].is_current_turn, true);
});

test("after last participant new round begins", () => {
  const afterFirst = endTurnMock(start());
  const afterSecond = endTurnMock(afterFirst);
  assert.equal(afterSecond.round, 2);
  assert.equal(afterSecond.participants[0].is_current_turn, true);
});

test("movement restores at start of turn", () => {
  const session = start();
  session.participants[1].move_current = 2;
  const next = endTurnMock(session);
  assert.equal(next.participants[1].move_current, 10);
});

await run();

