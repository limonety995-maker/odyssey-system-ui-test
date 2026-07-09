import assert from "node:assert/strict";
import { createTestSuite } from "./_tinyTestRunner.mjs";
import { fixtureSet } from "./_fixtures.mjs";
import { applyBodyDamageMock, buildRuntimeBundleMock } from "./_mockAdapters.mjs";

const { test, run } = createTestSuite("Unit — Body Damage / Conditions");
const fx = fixtureSet();

test("damage applies to a specific body part", () => {
  const result = applyBodyDamageMock({
    bodyParts: fx.bodyParts.healthy,
    partKey: "r_arm",
    damage: 1,
  });
  const rArm = result.bodyParts.find((entry) => entry.key === "r_arm");
  const torso = result.bodyParts.find((entry) => entry.key === "torso");
  assert.equal(rArm.current_hp, 3);
  assert.equal(torso.current_hp, 5);
});

test("minor wound increments minor counter", () => {
  const result = applyBodyDamageMock({
    bodyParts: fx.bodyParts.healthy,
    partKey: "r_arm",
    damage: 1,
    wound: "minor",
  });
  assert.equal(result.bodyParts.find((entry) => entry.key === "r_arm").minor, 1);
});

test("serious wound increments serious counter", () => {
  const result = applyBodyDamageMock({
    bodyParts: fx.bodyParts.healthy,
    partKey: "r_arm",
    damage: 1,
    wound: "serious",
  });
  assert.equal(result.bodyParts.find((entry) => entry.key === "r_arm").serious, 1);
});

test("body states appear in runtime snapshot", () => {
  const damaged = applyBodyDamageMock({
    bodyParts: fx.bodyParts.healthy,
    partKey: "r_arm",
    damage: 4,
  }).bodyParts;
  const bundle = buildRuntimeBundleMock({
    character: fx.characters.testTarget,
    bodyParts: damaged,
  });
  const part = bundle.snapshot.entity.bodyParts.find((entry) => entry.key === "r_arm");
  assert.equal(part.current_hp, 0);
  assert.ok(part.conditions.includes("disabled"));
});

await run();

