import assert from "node:assert/strict";
import { createTestSuite } from "./_tinyTestRunner.mjs";
import { fixtureSet } from "./_fixtures.mjs";
import { resolveCharacterAccess } from "./_mockAdapters.mjs";

const { test, run } = createTestSuite("Unit — Access Control");
const fx = fixtureSet();

test("player sees own character", () => {
  const result = resolveCharacterAccess({
    viewer: { id: "player-1", role: "PLAYER" },
    character: fx.characters.testAttacker,
    tokenLink: { character_id: fx.characters.testAttacker.id },
  });
  assert.equal(result.canViewSelectedCharacter, true);
});

test("player cannot control чужого character", () => {
  const result = resolveCharacterAccess({
    viewer: { id: "player-1", role: "PLAYER" },
    character: fx.characters.testTarget,
    tokenLink: { character_id: fx.characters.testTarget.id },
  });
  assert.equal(result.canControl, false);
  assert.equal(result.reason, "notOwner");
});

test("GM can view and control NPC", () => {
  const result = resolveCharacterAccess({
    viewer: { id: "gm-1", role: "GM" },
    character: fx.characters.testGmControlledNpc,
    tokenLink: { character_id: fx.characters.testGmControlledNpc.id },
  });
  assert.equal(result.canViewSelectedCharacter, true);
  assert.equal(result.canControl, true);
});

test("unknown token gives empty state", () => {
  const result = resolveCharacterAccess({
    viewer: { id: "player-1", role: "PLAYER" },
    character: fx.characters.testAttacker,
    tokenLink: null,
  });
  assert.equal(result.status, "empty");
  assert.equal(result.reason, "noCharacterLink");
});

await run();

