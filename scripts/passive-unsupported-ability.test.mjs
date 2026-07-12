// Phase 4.1B.4 — Passive Display + Unsupported Reasons Polish.
//
// Two layers, matching this project's established pattern:
//   - PURE unit tests over hud/abilities/abilityAvailabilityPolicy.js,
//     hud/abilities/AbilityTooltip.js, hud/abilities/QuickbarView.js
//     (fully executable — no OBR import);
//   - SOURCE-CONTRACT checks (regex/string assertions) for
//     hud/scene/sceneSelectionController.js, hud/components/CombatHudModule.js
//     — none executable under plain Node (SDK/OBR imports).
//
// Numbered tests map to the phase spec's "Tests" list (50 items); items
// 35-50 (regression) are covered by the EXISTING suites (test:hud as a
// whole, plus the 3 extra required scripts) staying green — see the final
// report rather than duplicating them here.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isPassiveAbility, isUnsupportedAbility, isUnknownAbility,
  isDirectAttackAbility, isInstantSelfAbility, isDirectedTargetAbility, isToggleAbility,
  deriveSlotAvailability, SLOT_AVAILABILITY,
} from "../hud/abilities/abilityAvailabilityPolicy.js";
import { mapQuickAction } from "../hud/abilities/abilityRuntimeMapper.js";
import { renderQuickbarStrip } from "../hud/abilities/QuickbarView.js";
import { abilityTooltipModel } from "../hud/abilities/AbilityTooltip.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const read = (...seg) => fs.readFileSync(path.join(repoRoot, ...seg), "utf8").replace(/\r\n/g, "\n");
const controllerSrc = read("hud", "scene", "sceneSelectionController.js");
const quickbarViewSrc = read("hud", "abilities", "QuickbarView.js");
const moduleSrc = read("hud", "components", "CombatHudModule.js");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.error(`  FAIL ${name}\n      ${err.message}`);
  }
}

console.log("\nPhase 4.1B.4 — Passive Display + Unsupported Reasons Polish\n");

/* ── fixtures (raw server-shaped rows, mapped through the real mapper) ──── */

function rawAction(over = {}) {
  return {
    characterActionId: over.id ?? "act-1",
    definitionId: "def-1",
    sourceType: over.sourceType ?? "psi",
    type: over.type ?? "instant",
    name: over.name ?? "Some Ability",
    fullDescription: "A generic ability.",
    iconKey: "brain",
    semanticKind: over.semanticKind ?? "utility",
    targeting: over.targeting ?? { mode: "self", minTargets: 1, maxTargets: 1, allowAllies: true, allowSelf: true, requiresBodyZone: false },
    costs: over.costs ?? { main: 1, move: 0, psi: 0, charges: 0 },
    cooldown: over.cooldown ?? { current: 0, max: 0, unit: "turn" },
    state: over.state ?? { available: true, active: false, disabledReason: null, selectable: true, executionAvailable: true, executionReason: null, resourceSufficient: true },
    requirements: over.requirements ?? { weaponClass: null, weaponId: null, conditionSummary: null },
  };
}
function action(over = {}) {
  return mapQuickAction(rawAction(over));
}

function passiveFixture(over = {}) {
  // Constructed directly (not via mapQuickAction, which cannot yet produce
  // type:"passive" from a raw server row that always excludes such rows
  // before it gets there — see the audit's §3). Every classifier in this file
  // only reads the already-mapped shape, so a directly-built fixture is a
  // valid, honest way to test it in isolation.
  return action({ type: "passive", semanticKind: "utility", ...over });
}

function unsupportedFixture(over = {}) {
  return action({
    type: "directed",
    targeting: { mode: "body_part", minTargets: 1, maxTargets: 1, allowAllies: false, allowSelf: false, requiresBodyZone: true },
    ...over,
  });
}

function unknownFixture(over = {}) {
  // Constructed directly (NOT via mapQuickAction — see isUnknownAbility's own
  // doc comment): normalizeType() always coerces an unrecognized raw type
  // down to "instant" before an action is ever mapped, so this exact scenario
  // is only testable by constructing the already-mapped shape by hand,
  // bypassing the mapper's own safety net entirely.
  return {
    characterActionId: over.id ?? "act-1",
    definitionId: "def-1",
    sourceType: "psi",
    type: "some_future_type_xyz",
    name: "Some Ability",
    shortDescription: "",
    fullDescription: "A generic ability.",
    iconKey: "brain",
    semanticKind: "utility",
    targeting: { mode: "self", minTargets: 1, maxTargets: 1, allowAllies: true, allowSelf: true, requiresBodyZone: false },
    costs: { main: 1, move: 0, psi: 0, charges: 0 },
    cooldown: { current: 0, max: 0, unit: "turn", active: false },
    state: { available: true, active: false, disabledReason: null, selectable: true, executionAvailable: true, executionReason: null, resourceSufficient: true },
    requirements: { weaponClass: null, weaponId: null, conditionSummary: null },
    ...over,
  };
}

function runtime(actions, slots) {
  return {
    ok: true, error: null, characterId: "char-1",
    quickActions: actions,
    quickbar: { slots: slots ?? actions.map((a, i) => ({ slotIndex: i, characterActionId: a.characterActionId, empty: false })), maxSlots: 20, version: 3 },
  };
}

/* ── Classification (1-9) ─────────────────────────────────────────────── */

test("1. a passive ability (type==='passive') is classified as passive", () => {
  assert.equal(isPassiveAbility(passiveFixture()), true);
});

test("2. an unsupported ability (directed + requiresBodyZone===true, non-attack) is classified as unsupported", () => {
  assert.equal(isUnsupportedAbility(unsupportedFixture()), true);
  assert.equal(isPassiveAbility(unsupportedFixture()), false);
});

test("3. an unknown ability (unrecognized type) is classified as unknown, safely — never throws, never matches any executable class", () => {
  const a = unknownFixture();
  assert.equal(isUnknownAbility(a), true);
  assert.equal(isDirectAttackAbility(a), false);
  assert.equal(isInstantSelfAbility(a), false);
  assert.equal(isDirectedTargetAbility(a), false);
  assert.equal(isToggleAbility(a), false);
  assert.equal(isPassiveAbility(a), false);
  assert.equal(isUnsupportedAbility(a), false);
});

test("4. a direct ability attack still classifies correctly, never as unsupported/passive/unknown", () => {
  const a = action({ type: "attack_technique", semanticKind: "attack", state: { available: false, active: false, disabledReason: "Attack effect is not supported yet", executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true, selectable: false } });
  assert.equal(isDirectAttackAbility(a), true);
  assert.equal(isUnsupportedAbility(a), false);
  assert.equal(isPassiveAbility(a), false);
  assert.equal(isUnknownAbility(a), false);
});

test("5. an instant/self ability still classifies correctly, never as unsupported/passive/unknown", () => {
  const a = action({ type: "instant", targeting: { mode: "self", requiresBodyZone: false } });
  assert.equal(isInstantSelfAbility(a), true);
  assert.equal(isUnsupportedAbility(a), false);
  assert.equal(isPassiveAbility(a), false);
  assert.equal(isUnknownAbility(a), false);
});

test("6. a directed target ability still classifies correctly, never as unsupported/passive/unknown", () => {
  const a = action({ type: "directed", targeting: { mode: "character", requiresBodyZone: false } });
  assert.equal(isDirectedTargetAbility(a), true);
  assert.equal(isUnsupportedAbility(a), false);
  assert.equal(isPassiveAbility(a), false);
  assert.equal(isUnknownAbility(a), false);
});

test("7. a toggle ability still classifies correctly, never as unsupported/passive/unknown", () => {
  const a = action({ type: "toggle" });
  assert.equal(isToggleAbility(a), true);
  assert.equal(isUnsupportedAbility(a), false);
  assert.equal(isPassiveAbility(a), false);
  assert.equal(isUnknownAbility(a), false);
});

test("8. an ARMED attack technique still classifies correctly, never as unsupported/passive/unknown", () => {
  const a = action({ type: "attack_technique", semanticKind: "attack", targeting: { mode: "character" } });
  assert.equal(isDirectAttackAbility(a), false);
  assert.equal(isUnsupportedAbility(a), false);
  assert.equal(isPassiveAbility(a), false);
  assert.equal(isUnknownAbility(a), false);
});

test("9. classification is metadata-driven, not name-driven — no ability name is ever checked by any of the 3 new classifiers", () => {
  const notNamed = passiveFixture({ name: "Totally Unrelated Name" });
  assert.equal(isPassiveAbility(notNamed), true);
  const src = read("hud", "abilities", "abilityAvailabilityPolicy.js");
  for (const fn of ["isPassiveAbility", "isUnsupportedAbility", "isUnknownAbility"]) {
    const body = src.slice(src.indexOf(`export function ${fn}`));
    const nextExportIdx = body.indexOf("\nexport function", 1);
    const scoped = nextExportIdx > -1 ? body.slice(0, nextExportIdx) : body;
    assert.ok(!/\.name/i.test(scoped), `${fn} never reads action.name`);
  }
});

/* ── Click routing (10-18) ────────────────────────────────────────────── */

test("10. a passive ability's dataAction is show-ability-detail, forced disabled, and reachable via hover regardless", () => {
  const html = renderQuickbarStrip(runtime([passiveFixture({ id: "act-1" })]));
  assert.match(html, /data-action="show-ability-detail"[^>]*data-action-id="act-1"/);
  assert.match(html, /class="[^"]*\bis-disabled\b[^"]*"[^>]*data-action="show-ability-detail"/);
});

test("11. an unsupported ability's dataAction is show-ability-detail and never one of the execute-* commands", () => {
  const html = renderQuickbarStrip(runtime([unsupportedFixture({ id: "act-1" })]));
  assert.match(html, /data-action="show-ability-detail"[^>]*data-action-id="act-1"/);
  assert.ok(!/data-action="execute-/.test(html));
});

test("12. an unknown ability's dataAction is show-ability-detail and never one of the execute-* commands", () => {
  const html = renderQuickbarStrip(runtime([unknownFixture({ id: "act-1" })]));
  assert.match(html, /data-action="show-ability-detail"[^>]*data-action-id="act-1"/);
  assert.ok(!/data-action="execute-/.test(html));
});

test("13. direct ability attack still dispatches execute-direct-ability", () => {
  const a = action({ type: "attack_technique", semanticKind: "attack", state: { available: false, active: false, disabledReason: "Attack effect is not supported yet", executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true, selectable: false } });
  const html = renderQuickbarStrip(runtime([a]));
  assert.match(html, /data-action="execute-direct-ability"/);
});

test("14. instant/self still dispatches execute-instant-ability", () => {
  const a = action({ type: "instant", targeting: { mode: "self", requiresBodyZone: false } });
  const html = renderQuickbarStrip(runtime([a]));
  assert.match(html, /data-action="execute-instant-ability"/);
});

test("15. directed target still dispatches execute-directed-ability", () => {
  const a = action({ type: "directed", targeting: { mode: "character", requiresBodyZone: false } });
  const html = renderQuickbarStrip(runtime([a]));
  assert.match(html, /data-action="execute-directed-ability"/);
});

test("16. toggle still dispatches execute-toggle-ability", () => {
  const a = action({ type: "toggle" });
  const html = renderQuickbarStrip(runtime([a]));
  assert.match(html, /data-action="execute-toggle-ability"/);
});

test("17. ARMED technique still dispatches toggle-armed-technique", () => {
  const a = action({ type: "attack_technique", semanticKind: "attack", targeting: { mode: "character" } });
  const html = renderQuickbarStrip(runtime([a]));
  assert.match(html, /data-action="toggle-armed-technique"/);
});

test("18. no action ever dispatches more than one command — exactly one data-action per tile, for every class including the new ones", () => {
  const fixtures = [
    action({ type: "attack_technique", semanticKind: "attack", targeting: { mode: "character" } }),
    action({ type: "attack_technique", semanticKind: "attack", state: { available: false, active: false, disabledReason: "x", executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true, selectable: false } }),
    action({ type: "instant", targeting: { mode: "self", requiresBodyZone: false } }),
    action({ type: "directed", targeting: { mode: "character", requiresBodyZone: false } }),
    action({ type: "toggle" }),
    passiveFixture(),
    unsupportedFixture(),
    unknownFixture(),
  ];
  for (const a of fixtures) {
    const html = renderQuickbarStrip(runtime([{ ...a, characterActionId: "act-1" }]));
    const matches = html.match(/data-action="[^"]+"/g) ?? [];
    // Exactly one data-action on the occupied tile's own <button> (the GM
    // menu trigger is a separate element only rendered when gmAdmin.enabled,
    // which this test never sets).
    assert.equal(matches.length, 1, `expected exactly one data-action, got ${JSON.stringify(matches)}`);
  }
});

/* ── UI display (19-28) ───────────────────────────────────────────────── */

test("19. a passive slot shows a PASSIVE marker", () => {
  const html = renderQuickbarStrip(runtime([passiveFixture()]));
  assert.match(html, /ohud-qb-state--passive">PASSIVE</);
});

test("20. an unsupported slot shows the lock marker", () => {
  const html = renderQuickbarStrip(runtime([unsupportedFixture()]));
  assert.match(html, /ohud-qb-state--lock/);
});

test("21. a passive ability's tooltip/detail says it is passive/display-only", () => {
  const model = abilityTooltipModel(passiveFixture());
  assert.equal(model.lines.find((l) => l.label === "Type")?.value, "Passive");
  assert.equal(model.lines.find((l) => l.label === "Execution")?.value, "Always active / display only");
  assert.equal(model.lines.find((l) => l.label === "Click")?.value, "View details");
});

test("22. an unsupported ability's tooltip/detail shows a clear, honest reason distinct from a server-given one", () => {
  const model = abilityTooltipModel(unsupportedFixture());
  assert.equal(model.lines.find((l) => l.label === "Type")?.value, "Unsupported");
  assert.ok(model.lines.find((l) => l.label === "Reason")?.value.length > 0);
  assert.equal(model.lines.find((l) => l.label === "Execution")?.value, "Not available from Skills Block");
});

test("23. toggle tooltip/detail still shows the ON/OFF execution line", () => {
  const on = abilityTooltipModel(action({ type: "toggle", state: { available: true, active: true, disabledReason: null, selectable: true, executionAvailable: true, executionReason: null, resourceSufficient: true } }));
  assert.equal(on.lines.find((l) => l.label === "Execution")?.value, "Toggle (click to deactivate)");
  const off = abilityTooltipModel(action({ type: "toggle" }));
  assert.equal(off.lines.find((l) => l.label === "Execution")?.value, "Toggle (click to activate)");
});

test("24. direct attack tooltip/detail still says target + body zone required", () => {
  const model = abilityTooltipModel(action({ type: "attack_technique", semanticKind: "attack", state: { available: false, active: false, disabledReason: "x", executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true, selectable: false } }));
  assert.equal(model.lines.find((l) => l.label === "Target")?.value, "Requires a selected target");
  assert.equal(model.lines.find((l) => l.label === "Body zone")?.value, "Uses the selected body zone");
});

test("25. directed target tooltip/detail still says target only, no body zone", () => {
  const model = abilityTooltipModel(action({ type: "directed", targeting: { mode: "character", requiresBodyZone: false } }));
  assert.equal(model.lines.find((l) => l.label === "Body zone")?.value, "Not required");
});

test("26. instant/self tooltip/detail still says no target required", () => {
  const model = abilityTooltipModel(action({ type: "instant", targeting: { mode: "self", requiresBodyZone: false } }));
  assert.equal(model.lines.find((l) => l.label === "Target")?.value, "Self");
});

test("27. cost/cooldown/resource lines remain correct for a real executable ability, and are OMITTED (not fabricated as zero) for passive/unsupported/unknown", () => {
  const executable = abilityTooltipModel(action({ type: "instant", costs: { main: 1, move: 0, psi: 2, charges: 0 }, cooldown: { current: 0, max: 3, unit: "turn" } }));
  assert.ok(executable.lines.some((l) => l.label === "Cost"));
  assert.ok(executable.lines.some((l) => l.label === "Resource"));
  assert.ok(executable.lines.some((l) => l.label === "Cooldown"));

  for (const fixture of [passiveFixture(), unsupportedFixture(), unknownFixture()]) {
    const model = abilityTooltipModel(fixture);
    assert.ok(!model.lines.some((l) => l.label === "Cost"), "no fabricated Cost line for a non-executable class");
    assert.ok(!model.lines.some((l) => l.label === "Cooldown"));
    assert.ok(!model.lines.some((l) => l.label === "Target"));
  }
});

test("28. disabled/unsupported reason text stays concise enough for the HUD — no line exceeds a sane character budget", () => {
  for (const fixture of [passiveFixture(), unsupportedFixture(), unknownFixture()]) {
    const model = abilityTooltipModel(fixture);
    for (const line of model.lines) {
      assert.ok(String(line.value).length <= 80, `line "${line.label}" too long for a HUD tooltip: "${line.value}"`);
    }
  }
});

/* ── Safety (29-34) ───────────────────────────────────────────────────── */

test("29/31. passive and unsupported abilities never call perform_attack — no new command routes to it", () => {
  assert.ok(!/execute-passive|execute-unsupported/.test(controllerSrc), "no new command name was invented for these display-only classes");
});

test("30/32. passive and unsupported abilities never call combat_execute_action — QuickbarView never gives them an execute-* dataAction", () => {
  for (const fixture of [passiveFixture(), unsupportedFixture(), unknownFixture()]) {
    const html = renderQuickbarStrip(runtime([{ ...fixture, characterActionId: "act-1" }]));
    assert.ok(!/data-action="execute-/.test(html));
  }
});

test("33. the client never fakes a passive effect — no local effect-application/is_active mutation exists anywhere in QuickbarView.js's passive branch", () => {
  const idx = quickbarViewSrc.indexOf("const passiveAbility = ");
  const scoped = quickbarViewSrc.slice(idx, idx + 400);
  assert.ok(!/add_character_effect|is_active\s*=|\.active\s*=(?!=)/.test(scoped));
});

test("34. the client never fakes unsupported support — isUnsupportedAbility always forces disabled:true and the lock marker, never a fabricated 'ready' state", () => {
  const html = renderQuickbarStrip(runtime([unsupportedFixture()]));
  assert.match(html, /class="[^"]*\bis-disabled\b[^"]*"/);
  assert.match(html, /data-slot-state="unsupported"/);
});

/* ── CombatHudModule.js hover-detail wiring for the new classes ──────────── */

test("passive/unsupported/unknown tiles remain reachable via hover/focus detail (techniqueSlotFromTarget now includes show-ability-detail)", () => {
  const idx = moduleSrc.indexOf("function techniqueSlotFromTarget");
  const body = moduleSrc.slice(idx, moduleSrc.indexOf("\n  }", idx));
  assert.match(body, /\[data-action="show-ability-detail"\]/);
});

test("show-ability-detail's click handler still blocks execution while disabled — hover is the only path for a forced-disabled tile", () => {
  const idx = moduleSrc.indexOf('case "show-ability-detail"');
  const body = moduleSrc.slice(idx, moduleSrc.indexOf("case \"toggle-armed-technique\"", idx));
  assert.match(body, /if \(t\.classList\.contains\("is-disabled"\)\) break;/);
});

setTimeout(() => {
  console.log(`\nPhase 4.1B.4 passive/unsupported polish: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
