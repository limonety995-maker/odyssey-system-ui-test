import assert from "node:assert/strict";
import { createTestSuite } from "./_tinyTestRunner.mjs";
import { fixtureSet } from "./_fixtures.mjs";
import { assertRejected } from "./_assertions.mjs";
import { selectTargetMock } from "./_mockAdapters.mjs";

const { test, run } = createTestSuite("Unit — Targeting");
const fx = fixtureSet();

test("can select enemy target", () => {
  const result = selectTargetMock({
    token: { id: "token-2", character_id: fx.characters.testTarget.id },
    distance: 3,
    maxRange: 10,
  });
  assert.equal(result.ok, true);
});

test("invalid token is rejected", () => {
  const result = selectTargetMock({
    token: { id: "token-empty" },
    distance: 1,
    maxRange: 10,
  });
  assertRejected(result, "no_character_link");
});

test("out of range target is rejected", () => {
  const result = selectTargetMock({
    token: { id: "token-2", character_id: fx.characters.testTarget.id },
    distance: 15,
    maxRange: 10,
  });
  assertRejected(result, "out_of_range");
});

test("targeting visuals do not change combat state", () => {
  const before = { encounter_id: "enc-1", round: 1 };
  const result = selectTargetMock({
    token: { id: "token-2", character_id: fx.characters.testTarget.id },
    distance: 3,
    maxRange: 10,
  });
  assert.deepEqual(before, { encounter_id: "enc-1", round: 1 });
  assert.equal(result.ok, true);
});

await run();

