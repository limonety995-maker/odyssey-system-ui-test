import assert from "node:assert/strict";
import { createTestSuite } from "./_tinyTestRunner.mjs";
import { fixtureSet } from "./_fixtures.mjs";
import { buildRuntimeBundleMock, reconcileCharacterAbilities } from "./_mockAdapters.mjs";

const { test, run } = createTestSuite("Unit — Runtime Bundle Contract");
const fx = fixtureSet();

function readyBundle() {
  const abilities = reconcileCharacterAbilities({
    character: fx.characters.testAttacker,
    skills: [{ id: "skill-row", skill_def_id: fx.skillDefs.ethericCoating.id, level: 1 }],
    weapons: [fx.characterWeapons.katanaEquipped],
    abilityDefs: Object.values(fx.abilities),
    abilityGrants: [fx.abilityGrants.plasmaEdgeWeapon],
  }).abilities;

  return buildRuntimeBundleMock({
    character: fx.characters.testAttacker,
    skills: [{ id: "skill-row", code: "etheric_coating", level: 1 }],
    abilities,
    weapons: [fx.characterWeapons.katanaEquipped],
    equipment: [
      {
        id: "eq-torso-vest",
        equipment_model_id: "model-torso-vest",
        code: "torso_vest",
        name: "Torso Vest",
        item_type: "armor",
        is_equipped: false,
        default_body_part_code: "torso",
        can_equip: true,
        can_equip_to_body_part: true,
        flags: { allowed_body_part_codes: ["torso"] },
        tags: ["armor", "torso"],
        effect_data: {},
        model: {
          id: "model-torso-vest",
          code: "torso_vest",
          name: "Torso Vest",
          item_type: "armor",
          default_body_part_code: "torso",
          can_equip: true,
          can_equip_to_body_part: true,
          flags: { allowed_body_part_codes: ["torso"] },
          tags: ["armor", "torso"],
          effect_data: {},
        },
        effective_flags: { allowed_body_part_codes: ["torso"] },
      },
    ],
    combat: { id: "enc-1", round: 1, is_current_turn: true, move_current: 10, move_max: 10 },
    bodyParts: fx.bodyParts.healthy,
  });
}

test("bundle contains character summary", () => {
  const bundle = readyBundle();
  assert.equal(bundle.snapshot.entity.summary.id, fx.characters.testAttacker.id);
  assert.equal(bundle.snapshot.entity.summary.name, fx.characters.testAttacker.name);
});

test("bundle contains skills", () => {
  const bundle = readyBundle();
  assert.equal(bundle.snapshot.skills.length, 1);
});

test("bundle contains abilities", () => {
  const bundle = readyBundle();
  assert.ok(bundle.snapshot.abilities.length >= 1);
});

test("bundle contains weapons", () => {
  const bundle = readyBundle();
  assert.equal(bundle.snapshot.weapons.length, 1);
});

test("bundle equipment keeps installation slot metadata", () => {
  const bundle = readyBundle();
  const [item] = bundle.snapshot.equipment;
  assert.equal(item.default_body_part_code, "torso");
  assert.deepEqual(item.flags?.allowed_body_part_codes, ["torso"]);
  assert.equal(item.can_equip, true);
  assert.equal(item.can_equip_to_body_part, true);
  assert.equal(item.model?.default_body_part_code, "torso");
});

test("bundle contains combat state", () => {
  const bundle = readyBundle();
  assert.equal(bundle.snapshot.combat.encounter_id, "enc-1");
  assert.equal(bundle.snapshot.combat.round, 1);
  assert.equal(bundle.snapshot.combat.move_current, 10);
});

test("hidden abilities are not present in quick actions", () => {
  const bundle = buildRuntimeBundleMock({
    character: fx.characters.testAttacker,
    abilities: [
      { id: "a1", code: "visible", name: "Visible", is_hidden: false, is_enabled: true, activation_type: "manual", ability_kind: "support", target_type: "self", effect_mode: "buff" },
      { id: "a2", code: "hidden", name: "Hidden", is_hidden: true, is_enabled: true, activation_type: "manual", ability_kind: "support", target_type: "self", effect_mode: "buff" },
    ],
  });
  assert.deepEqual(bundle.snapshot.quickActions.map((entry) => entry.code), ["visible"]);
});

await run();
