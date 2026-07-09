import assert from "node:assert/strict";

export function assertAbilityState(ability, expected = {}) {
  assert.ok(ability, "expected ability to exist");
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(ability[key], value, `ability.${key}`);
  }
}

export function assertRejected(result, reason) {
  assert.equal(result?.ok, false, "expected rejection");
  assert.equal(result?.reason ?? result?.error, reason);
}

export function assertAllowed(result) {
  assert.equal(result?.ok, true, "expected success");
}

export function findByCode(list, code) {
  return list.find((entry) => entry.code === code);
}

