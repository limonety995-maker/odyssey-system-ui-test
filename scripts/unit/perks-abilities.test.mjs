import assert from "node:assert/strict";
import { createTestSuite } from "./_tinyTestRunner.mjs";
import { fixtureSet } from "./_fixtures.mjs";
import { findByCode } from "./_assertions.mjs";
import { buildQuickActionsRuntime, reconcileCharacterAbilities } from "./_mockAdapters.mjs";

const { test, run } = createTestSuite("Unit — Perks → Abilities");
const fx = fixtureSet();

test("perk gives active ability", () => {
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    perks: [{ id: "char-perk-1", perk_def_id: fx.perks.battleFocus.id }],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.battleFocusPerk],
  });
  const ability = findByCode(result.abilities, "battle_focus");
  assert.equal(ability.source_type, "perk");
  assert.equal(ability.data.generated_from, "perk");
});

test("removed perk hides ability", () => {
  const existing = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    perks: [{ id: "char-perk-1", perk_def_id: fx.perks.battleFocus.id }],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.battleFocusPerk],
  }).abilities;
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    perks: [],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.battleFocusPerk],
    existingCharacterAbilities: existing,
  });
  assert.equal(findByCode(result.abilities, "battle_focus").data.source_removed_reason, "missing_perk");
});

test("passive perk ability does not appear in quick actions", () => {
  const result = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    perks: [{ id: "char-perk-2", perk_def_id: fx.perks.quickDraw.id }],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.passiveFocusPerk],
  });
  const runtime = buildQuickActionsRuntime({ abilities: result.abilities });
  assert.ok(findByCode(result.abilities, "passive_focus"));
  assert.equal(runtime.quickActions.length, 0);
});

await run();

