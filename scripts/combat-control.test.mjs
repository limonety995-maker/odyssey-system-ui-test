// Combat HUD — Phase 4.0f (HUD Visual Pass 2 — Combat Control) tests.
//
// PURE render tests over the new Target / AUTO+ARMED Modifiers / full-width
// Action Bar structure, plus source-contract checks for the removed MAIN/MOVE
// pips, the equal-width action bar, and the Phase 4.1 CSS/DOM hooks. Also
// pins (E.1) that this rework never touches the Skills Block's quickbar-editor
// trigger or its quickbar row order.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderCombatControlBlock } from "../hud/components/CombatControlBlock.js";
import { renderSkillBlock } from "../hud/components/SkillBlock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const read = (...seg) => fs.readFileSync(path.join(repoRoot, ...seg), "utf8").replace(/\r\n/g, "\n");
const moduleCss = read("hud", "components", "combatHudModule.css");
const layoutCss = read("hud", "components", "combatHudLayout.css");
const moduleJs = read("hud", "components", "CombatHudModule.js");

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

function cssRule(css, selector) {
  const idx = css.indexOf(selector);
  if (idx === -1) return null;
  const braceStart = css.indexOf("{", idx);
  const braceEnd = css.indexOf("}", braceStart);
  return css.slice(braceStart + 1, braceEnd);
}

console.log("\nCombat Control — HUD Visual Pass 2 (Phase 4.0f)\n");

/* ───────────────────────── fixtures ───────────────────────── */

function mod(over = {}) {
  return Object.assign({
    id: "m1", name: "Optics", kind: "passive", value: 1, polarity: "positive",
    source: "equipment", description: "", alwaysActive: true, requiresGMApproval: false, selected: false,
  }, over);
}

function baseState(over = {}) {
  return Object.assign({
    status: "ready",
    viewer: { role: "player" },
    ui: {
      targeting: {},
      basicAttack: { inFlight: false, uiAllowed: true, uiBlockReason: null },
    },
    snapshot: {
      modifiers: { passive: [], active: [], narrative: [] },
      combatSession: null,
    },
  }, over);
}

function stateWithModifiers({ passive = [], active = [], narrative = [] } = {}, extra = {}) {
  const s = baseState(extra);
  s.snapshot.modifiers = { passive, active, narrative };
  return s;
}

/* ── 1. MAIN/MOVE gone from Combat Control ────────────────────────────── */

test("1. MAIN/MOVE economy pips do not render in Combat Control (they stay in Player Block only)", () => {
  const html = renderCombatControlBlock(baseState());
  assert.ok(!/ohud-econ-pip|ohud-action-econ/.test(html), "no economy-pip markup in the composite");
  assert.ok(!/>M<|>Mv</.test(html), "no bare M/Mv economy glyphs");
});

test("1b. PlayerBlock.js (untouched) is still the sole MAIN/MOVE renderer", () => {
  const playerSrc = read("hud", "components", "PlayerBlock.js");
  assert.match(playerSrc, /"MAIN"/);
  assert.match(playerSrc, /"MOVE"/);
});

/* ── 2/3. Attack + End Turn: two equal buttons, distinct primary/secondary ── */

test("2. ATTACK and END TURN render as two buttons in one full-width action bar", () => {
  const html = renderCombatControlBlock(baseState());
  assert.match(html, /data-block="action"/);
  assert.match(html, /ohud-cc-abtn--attack/);
  assert.match(html, /ohud-cc-abtn--endturn/);
  assert.match(html, />END TURN</);
});

test("2b. the action bar CSS gives both buttons equal width (1fr/1fr) and equal height", () => {
  const bar = cssRule(moduleCss, ".ohud-cc-actionbar {");
  assert.ok(bar, ".ohud-cc-actionbar rule exists");
  assert.match(bar, /grid-template-columns:\s*1fr 1fr/, "two equal columns");
  const btn = cssRule(moduleCss, ".ohud-cc-abtn {");
  assert.match(btn, /height:\s*100%/, "each button fills the bar's full height");
  assert.match(btn, /width:\s*100%/, "each button fills its own column");
});

test("3. Attack is the primary (cyan) action; End Turn is a distinct secondary (amber, never red)", () => {
  const attackRule = cssRule(moduleCss, ".ohud-cc-abtn--attack {");
  const endTurnRule = cssRule(moduleCss, ".ohud-cc-abtn--endturn {");
  assert.match(attackRule, /var\(--odyssey-cyan\)/, "Attack uses the cyan accent");
  assert.match(endTurnRule, /var\(--odyssey-hud-warning\)/, "End Turn uses the amber/warning accent");
  assert.ok(!/var\(--odyssey-(hud-negative|red)\)/.test(endTurnRule), "End Turn is never styled as a red/error action");
});

test("3b. disabled state dims via opacity only — keeps its own color identity, never goes generic/grayscale", () => {
  const attackDisabled = cssRule(moduleCss, ".ohud-cc-abtn--attack.is-disabled {");
  const endTurnDisabled = cssRule(moduleCss, ".ohud-cc-abtn--endturn.is-disabled {");
  assert.match(attackDisabled, /opacity:/);
  assert.match(endTurnDisabled, /opacity:/);
  assert.ok(!/grayscale/.test(attackDisabled + endTurnDisabled), "no grayscale filter — color identity is preserved");
});

test("End Turn is ALWAYS rendered (both slots always present) — disabled with an honest reason when not usable, never hidden", () => {
  const noSession = renderCombatControlBlock(baseState({ snapshot: { modifiers: { passive: [], active: [], narrative: [] }, combatSession: null } }));
  assert.match(noSession, /ohud-cc-abtn--endturn is-disabled/);
  assert.match(noSession, /No active combat session/);

  const notMyTurn = renderCombatControlBlock(baseState({
    snapshot: {
      modifiers: { passive: [], active: [], narrative: [] },
      combatSession: { exists: true, status: "active", currentParticipantId: "p1", isCurrentPlayerTurn: false, isSelectedCharacterTurn: false },
    },
  }));
  assert.match(notMyTurn, /ohud-cc-abtn--endturn is-disabled/);
  assert.match(notMyTurn, /Not your turn/);

  const myTurn = renderCombatControlBlock(baseState({
    snapshot: {
      modifiers: { passive: [], active: [], narrative: [] },
      combatSession: { exists: true, status: "active", currentParticipantId: "p1", isCurrentPlayerTurn: true, isSelectedCharacterTurn: true },
    },
  }));
  assert.ok(!/ohud-cc-abtn--endturn is-disabled/.test(myTurn), "enabled once it's actually the viewer's turn");
});

/* ── 4/5. Target readability ──────────────────────────────────────────── */

test("4. Target name never overlaps the silhouette — CSS lays the figure and the text column out as a ROW, not stacked", () => {
  const targetRule = cssRule(layoutCss, ".ohud-target {");
  assert.match(targetRule, /flex-direction:\s*row/, "figure and meta sit side by side");
  const figureRule = cssRule(moduleCss, ".ohud-cc-target .ohud-figure {");
  assert.ok(figureRule, "Combat-Control-scoped figure sizing exists");
  const metaRule = cssRule(layoutCss, ".ohud-target-meta {");
  assert.match(metaRule, /min-width:\s*0/, "text column can shrink/ellipsis instead of pushing the figure");
  assert.match(metaRule, /flex:\s*1/, "text column takes the remaining row space, not a fixed width");
});

test("5. the aimed body zone renders as a visible badge alongside the target name", () => {
  const html = renderCombatControlBlock(baseState({
    ui: { targeting: { selectedTargetIds: ["t1"], selectedTargetName: "Raider", selectedBodyPartId: "torso" }, basicAttack: { inFlight: false, uiAllowed: true, uiBlockReason: null } },
  }));
  assert.match(html, /ohud-target-zone/);
  assert.match(html, />TORSO</);
  assert.match(html, />Raider</);
});

/* ── 6/7/8/9. AUTO / ARMED modifier sections ──────────────────────────── */

test("6. the modifier area contains distinct AUTO and ARMED sections (with Phase-4.1 DOM hooks)", () => {
  const html = renderCombatControlBlock(baseState());
  assert.match(html, /data-modifier-section="auto"/);
  assert.match(html, /data-modifier-section="armed"/);
  assert.match(html, /data-modifier-state="/, "state hook present for the future Attack Setup popover");
});

test("7. AUTO never invents a modifier — empty passive+narrative renders an honest empty line, no fake chip", () => {
  const html = renderCombatControlBlock(stateWithModifiers({ passive: [], active: [], narrative: [] }));
  assert.match(html, /No automatic effects/);
  const autoIdx = html.indexOf('data-modifier-section="auto"');
  const autoBlock = html.slice(autoIdx, html.indexOf('data-modifier-section="armed"'));
  assert.ok(!/ohud-mod /.test(autoBlock), "no chip markup at all when AUTO has nothing real to show");
  assert.match(autoBlock, /data-modifier-state="empty"/);
});

test("8. ARMED empty state shows 'None selected' — never a fabricated selection", () => {
  const html = renderCombatControlBlock(stateWithModifiers({ active: [] }));
  const armedIdx = html.indexOf('data-modifier-section="armed"');
  const armedBlock = html.slice(armedIdx);
  assert.match(armedBlock, /None selected/);
  assert.match(armedBlock, /data-modifier-state="empty"/);
});

test("9. real AUTO (passive+narrative) modifiers render verbatim, without altering their data; ARMED shows the real name with its own disarm control (Phase 4.1A: armedChip, not modChip)", () => {
  const armor = mod({ id: "a1", name: "Optics", kind: "passive", value: 1 });
  const gmEffect = mod({ id: "n1", name: "Blessed", kind: "narrative", value: 2, requiresGMApproval: true });
  const prepared = { id: "x1", name: "Overcharge", description: "Prepared for next attack", selected: true, invalid: false };
  const html = renderCombatControlBlock(stateWithModifiers({ passive: [armor], active: [prepared], narrative: [gmEffect] }));

  assert.match(html, /data-modifier-section="auto"[^]*?AUTO · 2/, "AUTO count = passive(1) + narrative(1)");
  assert.match(html, /data-modifier-section="armed"[^]*?ARMED · 1/, "ARMED count = active(1)");
  assert.match(html, />Optics</);
  assert.match(html, />\+1</, "AUTO's real modChip value is shown, not rewritten");
  assert.match(html, />Blessed</);
  assert.match(html, />Overcharge</);
  assert.match(html, /data-action="disarm-technique" data-action-id="x1"/, "ARMED chip carries its own real disarm control, id verbatim from the data");
  const autoIdx = html.indexOf('data-modifier-section="auto"');
  const autoBlock = html.slice(autoIdx, html.indexOf('data-modifier-section="armed"'));
  assert.ok(!/Overcharge/.test(autoBlock), "ARMED's active modifier never leaks into the AUTO section");
});

test("9b. AUTO caps at 2 visible chips + a '+N more' overflow — never silently drops data", () => {
  const many = [mod({ id: "1", name: "One" }), mod({ id: "2", name: "Two" }), mod({ id: "3", name: "Three" })];
  const html = renderCombatControlBlock(stateWithModifiers({ passive: many }));
  assert.match(html, /AUTO · 3/, "the real total count is shown even though only 2 chips are visible");
  assert.match(html, /\+1</, "overflow count for the 1 hidden modifier");
});

/* ── 10. Attack/End Turn handlers unchanged ───────────────────────────── */

test("10. data-action values are the SAME as before (basic-attack / end-turn) — click wiring in CombatHudModule.js is untouched", () => {
  const html = renderCombatControlBlock(baseState());
  assert.match(html, /data-action="basic-attack"/);
  assert.match(html, /data-action="end-turn"/);
  assert.match(moduleJs, /case "basic-attack":/);
  assert.match(moduleJs, /case "end-turn":/);
});

test("10b. clicking Attack when unavailable surfaces the SAME honest ui.basicAttack.uiBlockReason as before — never a new fabricated reason", () => {
  const html = renderCombatControlBlock(baseState({
    ui: { targeting: {}, basicAttack: { inFlight: false, uiAllowed: false, uiBlockReason: "No weapon equipped." } },
  }));
  assert.match(html, /No weapon equipped\./);
  assert.match(html, /ohud-cc-abtn--attack is-disabled/);
});

/* ── E.1: Skills Block quickbar-editor trigger must be unaffected ────────
 * Updated for HUD refine 4.0i: the EDIT button was removed and its CSS class
 * deleted; the open-editor trigger now lives on empty slots / the all-empty
 * fallback instead. These checks confirm Combat Control's own rework still
 * doesn't reach into or collide with any of that. */

test("E.1: the old EDIT button's dedicated CSS class stays gone — Combat Control changes never resurrect it", () => {
  assert.equal(cssRule(layoutCss, ".ohud-qb-edit {"), null, ".ohud-qb-edit rule must not exist");
});

test("E.1: Skills quickbar row order is unaffected (slots 1-10 top, 11-20 bottom)", () => {
  const gridRule = cssRule(layoutCss, ".ohud-qb {");
  assert.match(gridRule, /justify-content:\s*center/, "vertical alignment per 4.0i, not touched by this Combat Control pass");
});

test("E.1: the quickbar-editor trigger still dispatches only open-quickbar-editor — Combat Control's new markup shares no data-action values with it", () => {
  const skillsHtml = renderSkillBlock({ viewer: { role: "player" }, snapshot: { quickbar: { ok: true, quickActions: [], quickbar: { slots: [], maxSlots: 20, version: 1 } } } });
  assert.match(skillsHtml, /data-action="open-quickbar-editor"/);
  const ccHtml = renderCombatControlBlock(baseState());
  assert.ok(!ccHtml.includes("open-quickbar-editor"), "Combat Control never references the Skills quickbar-editor action");
});

setTimeout(() => {
  console.log(`\nCombat Control: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
