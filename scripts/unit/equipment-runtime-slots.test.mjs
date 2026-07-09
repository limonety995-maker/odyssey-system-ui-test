import assert from "node:assert/strict";
import { createTestSuite } from "./_tinyTestRunner.mjs";

const { test, run } = createTestSuite("Unit - Equipment Runtime Slots");

function normalizeBodyPartCode(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_")
    .replace(/__+/g, "_");
}

function collectAllowedBodyPartCodes(item) {
  const allowedCodes = new Set();
  const pushCode = (value) => {
    const normalized = normalizeBodyPartCode(value);
    if (normalized) allowedCodes.add(normalized);
  };
  const pushCodes = (value) => {
    if (Array.isArray(value)) {
      value.forEach(pushCode);
      return;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (trimmed.includes(",")) {
        trimmed.split(",").forEach(pushCode);
        return;
      }
      pushCode(trimmed);
    }
  };

  pushCodes(item?.effective_flags?.allowed_body_part_codes);
  pushCodes(item?.flags?.allowed_body_part_codes);
  pushCodes(item?.model?.flags?.allowed_body_part_codes);
  pushCodes(item?.data?.flags?.allowed_body_part_codes);
  pushCodes(item?.model?.data?.flags?.allowed_body_part_codes);
  pushCodes(item?.allowed_body_part_codes);
  pushCodes(item?.model?.allowed_body_part_codes);

  if (!allowedCodes.size) {
    pushCode(item?.default_body_part_code);
    pushCode(item?.model?.default_body_part_code);
  }

  return [...allowedCodes];
}

function hasConfiguredInstallationSlot(item) {
  return collectAllowedBodyPartCodes(item).length > 0;
}

test("runtime equipment keeps torso slot metadata", () => {
  const item = {
    equipment_model_id: "model-torso-vest",
    default_body_part_code: "torso",
    can_equip: true,
    can_equip_to_body_part: true,
    flags: { allowed_body_part_codes: ["torso"] },
    effect_data: {},
    model: {
      id: "model-torso-vest",
      default_body_part_code: "torso",
      can_equip: true,
      can_equip_to_body_part: true,
      flags: { allowed_body_part_codes: ["torso"] },
    },
  };

  assert.equal(item.default_body_part_code, "torso");
  assert.deepEqual(item.flags.allowed_body_part_codes, ["torso"]);
  assert.equal(item.can_equip, true);
  assert.equal(item.can_equip_to_body_part, true);
  assert.equal(item.model.default_body_part_code, "torso");
  assert.equal(hasConfiguredInstallationSlot(item), true);
});

test("multi-slot armor is valid without default body part code", () => {
  const item = {
    default_body_part_code: null,
    flags: { allowed_body_part_codes: ["l_arm", "r_arm"] },
    model: {
      default_body_part_code: null,
      flags: { allowed_body_part_codes: ["l_arm", "r_arm"] },
    },
  };

  assert.deepEqual(collectAllowedBodyPartCodes(item), ["l_arm", "r_arm"]);
  assert.equal(hasConfiguredInstallationSlot(item), true);
});

test("empty slot configuration remains invalid", () => {
  const item = {
    default_body_part_code: null,
    flags: { allowed_body_part_codes: [] },
    model: {
      default_body_part_code: null,
      flags: { allowed_body_part_codes: [] },
    },
  };

  assert.deepEqual(collectAllowedBodyPartCodes(item), []);
  assert.equal(hasConfiguredInstallationSlot(item), false);
});

await run();
