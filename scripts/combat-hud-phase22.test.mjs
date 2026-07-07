// Combat HUD — Phase 2.2 / 2.2.3 verification (modular layout + Combat Control).
//
// Pure: no DOM, no OBR, no framework. Run with:
//   node scripts/combat-hud-phase22.test.mjs

import assert from "node:assert/strict";

import {
  HUD_LAYOUT_REFERENCE_VIEWPORT,
  DEFAULT_HUD_LAYOUT_V2,
  HUD_MODULE_IDS,
  HUD_MODULE_POPOVER_IDS,
  LEGACY_HUD_POPOVER_IDS,
  LAYOUT_STORAGE_KEY,
  LAYOUT_MARGIN,
  computeLayoutScale,
  defaultModuleRect,
  moduleSize,
  normalizedToPixels,
  pixelsToNormalized,
  clampRect,
  resolveModuleRect,
  rectsOverlap,
  snapToGrid,
  splitSkillRows,
  defaultLayoutState,
  resetLayoutState,
  validateLayoutState,
  normalizeLayoutState,
  readStoredLayout,
  writeStoredLayout,
  commitDraft,
  cancelDraft,
  setModulePlacement,
} from "../hud/overlay/hudLayout.js";
import { createMockCombatHudAdapter } from "../hud/adapters/mockCombatHudAdapter.js";
import { createCombatHudStore } from "../hud/core/combatHudStore.js";
import { renderCombatControlBlock } from "../hud/components/CombatControlBlock.js";

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    console.error(`  ✗ ${name}\n      ${error.message}`);
  }
}

function fakeStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    _map: map,
  };
}

function buildState(scenarioId = "A") {
  const adapter = createMockCombatHudAdapter({ scenarioId });
  const store = createCombatHudStore({ adapter });
  store.initialize();
  return store.getState();
}

const { width: RW, height: RH } = HUD_LAYOUT_REFERENCE_VIEWPORT; // 1920×1080

console.log("\nCombat HUD — Phase 2.2 / 2.2.3 verification\n");

test("1. exact default rects at 1920×1080 (incl. Combat Control)", () => {
  assert.equal(computeLayoutScale(RW, RH), 1);
  for (const id of HUD_MODULE_IDS) {
    const def = DEFAULT_HUD_LAYOUT_V2[id];
    const rect = defaultModuleRect(id, RW, RH);
    assert.equal(rect.left, def.left, `${id}.left`);
    assert.equal(rect.width, def.width, `${id}.width`);
    assert.equal(rect.height, def.height, `${id}.height`);
    assert.equal(rect.top, RH - def.bottom - def.height, `${id}.top (bottom ${def.bottom})`);
    assert.equal(rect.zIndex, def.zIndex, `${id}.z`);
  }
  assert.deepEqual(defaultModuleRect("player", RW, RH), { left: 16, top: 814, width: 250, height: 250, zIndex: 30 });
  // Combat Control: left 1263, bottom 16 → top 899, 330×165, z20
  assert.deepEqual(defaultModuleRect("combatControl", RW, RH), { left: 1263, top: 899, width: 330, height: 165, zIndex: 20 });
  // Log unchanged
  assert.deepEqual(defaultModuleRect("log", RW, RH), { left: 1656, top: 814, width: 250, height: 250, zIndex: 20 });
});

test("2. default layout scales proportionally below AND above reference (Priority UI Fix — Universal Responsive HUD Scaling: uncapped, no artificial minimum)", () => {
  const scale = computeLayoutScale(1600, 900);
  assert.ok(Math.abs(scale - (900 / 1080)) < 1e-9);
  const cc = defaultModuleRect("combatControl", 1600, 900);
  assert.equal(cc.width, Math.round(330 * scale));
  assert.equal(cc.height, Math.round(165 * scale));
  // Reversed from the earlier Phase 2.2 "never upscales" rule — see
  // scripts/hud-responsive-layout.test.mjs for the full 8-viewport suite.
  const upScale = computeLayoutScale(2560, 1440);
  assert.ok(upScale > 1, "a viewport larger than 1920×1080 now upscales the whole HUD");
  assert.ok(Math.abs(upScale - (1440 / 1080)) < 1e-9);
});

test("3. custom normalized placement → pixels", () => {
  const px = normalizedToPixels("gun", { mode: "custom", x: 0.5, y: 0.5 }, RW, RH);
  const { width, height } = moduleSize("gun", RW, RH);
  const availW = RW - width - 2 * LAYOUT_MARGIN;
  const availH = RH - height - 2 * LAYOUT_MARGIN;
  assert.equal(px.left, Math.round(LAYOUT_MARGIN + 0.5 * availW));
  assert.equal(px.top, Math.round(LAYOUT_MARGIN + 0.5 * availH));
});

test("4. pixels → normalized round-trips (Combat Control)", () => {
  const start = { mode: "custom", x: 0.37, y: 0.62 };
  const px = normalizedToPixels("combatControl", start, RW, RH);
  const back = pixelsToNormalized("combatControl", px.left, px.top, RW, RH);
  assert.ok(Math.abs(back.x - start.x) < 0.01, `x ${back.x}~${start.x}`);
  assert.ok(Math.abs(back.y - start.y) < 0.01, `y ${back.y}~${start.y}`);
});

test("5. clamp keeps every module fully inside the viewport", () => {
  for (const id of HUD_MODULE_IDS) {
    const far = normalizedToPixels(id, { mode: "custom", x: 5, y: 5 }, RW, RH);
    const clamped = clampRect(far, RW, RH);
    assert.ok(clamped.left >= 0 && clamped.left + clamped.width <= RW, `${id} x`);
    assert.ok(clamped.top >= 0 && clamped.top + clamped.height <= RH, `${id} y`);
  }
});

test("6. intentional Player/Gun overlap is preserved", () => {
  const player = resolveModuleRect("player", { mode: "default" }, RW, RH);
  const gun = resolveModuleRect("gun", { mode: "default" }, RW, RH);
  assert.ok(rectsOverlap(player, gun), "player and gun must overlap");
  assert.ok(DEFAULT_HUD_LAYOUT_V2.player.zIndex > DEFAULT_HUD_LAYOUT_V2.gun.zIndex, "player above gun");
});

test("7. module set: 5 modules — Combat Control in, target/modifiers/action out", () => {
  assert.equal(HUD_MODULE_IDS.length, 5);
  assert.deepEqual([...HUD_MODULE_IDS], ["player", "gun", "skills", "combatControl", "log"]);
  assert.ok(HUD_MODULE_IDS.includes("combatControl"), "combatControl present");
  for (const gone of ["target", "modifiers", "action"]) {
    assert.ok(!HUD_MODULE_IDS.includes(gone), `${gone} removed from normal modules`);
    assert.equal(DEFAULT_HUD_LAYOUT_V2[gone], undefined, `${gone} rect removed`);
    assert.equal(HUD_MODULE_POPOVER_IDS[gone], undefined, `${gone} popover id removed`);
  }
  assert.equal(HUD_MODULE_POPOVER_IDS.combatControl, "odyssey-hud-combat-control");
  // retired popover ids tracked for cleanup
  for (const id of ["odyssey-hud-target", "odyssey-hud-modifiers", "odyssey-hud-action"]) {
    assert.ok(LEGACY_HUD_POPOVER_IDS.includes(id), `${id} marked legacy`);
  }
});

test("8. reset returns the exact default layout (5 modules)", () => {
  const reset = resetLayoutState();
  assert.deepEqual(reset, defaultLayoutState());
  assert.equal(reset.version, 2);
  assert.deepEqual(Object.keys(reset.modules).sort(), [...HUD_MODULE_IDS].sort());
  for (const id of HUD_MODULE_IDS) assert.equal(reset.modules[id].mode, "default");
});

test("9. invalid v2 localStorage payload falls back to default", () => {
  assert.equal(validateLayoutState({ version: 1, modules: {} }), null);
  assert.equal(validateLayoutState("nope"), null);
  assert.deepEqual(readStoredLayout(fakeStorage({ [LAYOUT_STORAGE_KEY]: "{bad json" })), defaultLayoutState());
  assert.deepEqual(readStoredLayout(fakeStorage({})), defaultLayoutState());
  assert.deepEqual(readStoredLayout(fakeStorage({ "odyssey.hud.placement.v1": '{"mode":"custom","x":0.5,"y":0.5}' })), defaultLayoutState());
});

test("10. save/cancel draft logic", () => {
  const base = defaultLayoutState();
  let draft = base;
  draft = setModulePlacement(draft, "combatControl", { mode: "custom", x: 0.8, y: 0.2 });
  assert.deepEqual(cancelDraft(base).modules.combatControl, { mode: "default", x: 0, y: 0 });
  const saved = commitDraft(draft);
  assert.deepEqual(saved.modules.combatControl, { mode: "custom", x: 0.8, y: 0.2 });
  assert.equal(saved.modules.player.mode, "default");
  const store = fakeStorage();
  writeStoredLayout(store, saved);
  assert.deepEqual(readStoredLayout(store), saved);
});

test("11. collapse/reopen preserves module layout (storage survives)", () => {
  const store = fakeStorage();
  let layout = setModulePlacement(defaultLayoutState(), "log", { mode: "custom", x: 0.1, y: 0.9 });
  layout = setModulePlacement(layout, "combatControl", { mode: "custom", x: 0.4, y: 0.3 });
  writeStoredLayout(store, layout);
  const restored = readStoredLayout(store);
  assert.deepEqual(restored.modules.log, { mode: "custom", x: 0.1, y: 0.9 });
  assert.deepEqual(restored.modules.combatControl, { mode: "custom", x: 0.4, y: 0.3 });
});

test("12. skills: ≤10 in row 1, 11+ wrap to a second row; snap helper", () => {
  const ten = Array.from({ length: 10 }, (_, i) => i);
  assert.equal(splitSkillRows(ten).length, 1);
  assert.equal(splitSkillRows(ten)[0].length, 10);
  const eleven = Array.from({ length: 11 }, (_, i) => i);
  const rows = splitSkillRows(eleven);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, 10);
  assert.equal(rows[1].length, 1);
  assert.equal(snapToGrid(13, 8), 16);
  assert.equal(snapToGrid(3, 8), 0);
});

test("13. migration: old target/modifiers/action placement → combatControl", () => {
  const old = {
    version: 2,
    modules: {
      target: { mode: "custom", x: 0.3, y: 0.7 },
      modifiers: { mode: "custom", x: 0.9, y: 0.1 },
      action: { mode: "custom", x: 0.9, y: 0.9 },
    },
  };
  const migrated = validateLayoutState(old);
  assert.equal(migrated.modules.combatControl.mode, "custom");
  assert.ok(Math.abs(migrated.modules.combatControl.x - 0.3) < 1e-9, "x from target");
  assert.ok(Math.abs(migrated.modules.combatControl.y - 0.7) < 1e-9, "y from target");
  // legacy keys dropped; only the 5 module ids remain
  assert.deepEqual(Object.keys(migrated.modules).sort(), [...HUD_MODULE_IDS].sort());
  // no target → default Combat Control, no crash on partial payload
  const noTarget = validateLayoutState({ version: 2, modules: { modifiers: { mode: "custom", x: 0.5, y: 0.5 } } });
  assert.equal(noTarget.modules.combatControl.mode, "default");
  // through storage; first read migrates, and re-write persists only the 5 ids
  const store = fakeStorage({ [LAYOUT_STORAGE_KEY]: JSON.stringify(old) });
  const read = readStoredLayout(store);
  assert.equal(read.modules.combatControl.mode, "custom");
  writeStoredLayout(store, read);
  const reread = JSON.parse(store.getItem(LAYOUT_STORAGE_KEY));
  assert.deepEqual(Object.keys(reread.modules).sort(), [...HUD_MODULE_IDS].sort());
  assert.equal(reread.modules.target, undefined);
});

test("14. composite render model contains Target + Modifier + Action sections (Phase 4.0f structure)", () => {
  // Reworked in Phase 4.0f (HUD Visual Pass 2 — Combat Control): Modifiers
  // split into AUTO/ARMED sections instead of one flat "Mod" chip wall, and
  // Action is now a full-width two-button bar (no more a nested action panel
  // with MAIN/MOVE econ pips) — see combat-control.test.mjs for the dedicated
  // coverage of that new structure.
  const html = renderCombatControlBlock(buildState("A"));
  assert.ok(html.includes('data-block="combatControl"'), "outer combatControl panel");
  assert.ok(html.includes('data-block="target"'), "target section");
  assert.ok(html.includes('data-block="modifiers"'), "modifier section");
  assert.ok(html.includes('data-block="action"'), "action section");
  assert.ok(html.includes("ohud-cc-modsec-chips") || html.includes("ohud-cc-modsec-empty"), "AUTO/ARMED modifier containers");
  assert.ok(html.includes("ohud-cc-abtn"), "action bar buttons");
  assert.ok(html.includes(">Target<") || html.includes("Target"), "Target label");
  assert.ok(html.includes("Modifiers"), "Modifiers label");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  for (const f of failures) {
    console.error(`FAILED: ${f.name}`);
    console.error(f.error);
  }
  process.exit(1);
}
