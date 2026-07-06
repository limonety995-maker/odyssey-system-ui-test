// HUD visual cleanup (Phase 4.0h): remove the decorative shield icon from
// Player Block + Combat Control, and grow the selected-target silhouette to
// 1.25x. UI/layout only — no shield DATA, armour mechanics, server defence
// math, roll trace, or tooltip contract touched (the SHIELD resource bar
// showing real current/max values in Player Block is untouched on purpose).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createMockCombatHudAdapter } from "../hud/adapters/mockCombatHudAdapter.js";
import { createCombatHudStore } from "../hud/core/combatHudStore.js";
import { renderPlayerBlock } from "../hud/components/PlayerBlock.js";
import { renderCombatControlBlock } from "../hud/components/CombatControlBlock.js";
import { renderTargetBlock } from "../hud/components/TargetBlock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const read = (...seg) => fs.readFileSync(path.join(repoRoot, ...seg), "utf8").replace(/\r\n/g, "\n");
const moduleCss = read("hud", "components", "combatHudModule.css");
const layoutCss = read("hud", "components", "combatHudLayout.css");

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
function cssNum(rule, prop) {
  const m = new RegExp(`(?:^|[^-])${prop}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)px`).exec(rule);
  return m ? Number(m[1]) : null;
}

console.log("\nHUD visual cleanup — shield icon removal + 1.25x target silhouette (Phase 4.0h)\n");

function buildState(scenarioId = "A") {
  const adapter = createMockCombatHudAdapter({ scenarioId });
  const store = createCombatHudStore({ adapter });
  store.initialize();
  return store.getState();
}

function baseTargetState(over = {}) {
  return Object.assign({
    status: "ready",
    viewer: { role: "player" },
    ui: { targeting: {}, basicAttack: { inFlight: false, uiAllowed: true, uiBlockReason: null } },
    snapshot: { modifiers: { passive: [], active: [], narrative: [] }, combatSession: null },
  }, over);
}

/* ── 1. Player Block: no shield icon/badge (real shield DATA bar stays) ── */

test("1. Player Block renders no shield icon/badge — but the real SHIELD resource bar (data) is untouched", () => {
  const html = renderPlayerBlock(buildState("A"));
  assert.ok(!html.includes("ohud-figure-shield"), "no decorative shield icon overlay on the silhouette");
  // The SHIELD resource bar is DATA (current/max values), not a decorative
  // marker — the task explicitly says not to touch shield data, so this must
  // still be present.
  assert.match(html, /ohud-res--shield/, "the shield VALUE bar is still rendered");
  assert.match(html, />SHIELD</);
});

test("1b. PlayerBlock.js no longer imports the now-unused ICON_SHIELD", () => {
  const src = read("hud", "components", "PlayerBlock.js");
  assert.ok(!src.includes("ICON_SHIELD"), "dead import removed along with its only usage");
});

/* ── 2. Combat Control selected-target view: no shield icon/badge ────────── */

test("2. Combat Control's selected-target view renders no shield icon/badge", () => {
  const html = renderCombatControlBlock(baseTargetState({
    ui: { targeting: { selectedTargetIds: ["t1"], selectedTargetName: "Raider", selectedBodyPartId: "torso" }, basicAttack: { inFlight: false, uiAllowed: true, uiBlockReason: null } },
  }));
  assert.ok(!html.includes("ohud-figure-shield"), "no shield icon in the selected-target silhouette");
  assert.ok(!html.includes("Target shield"), "the old 'Target shield' tooltip text is gone too");
});

test("2b. TargetBlock.js no longer imports the now-unused ICON_SHIELD", () => {
  const src = read("hud", "components", "TargetBlock.js");
  assert.ok(!src.includes("ICON_SHIELD"));
});

/* ── 3. Empty Target Area: no shield icon/badge ───────────────────────────── */

test("3. Empty Target Area (idle) renders no shield icon/badge", () => {
  const html = renderTargetBlock(baseTargetState());
  assert.ok(!html.includes("ohud-figure-shield"));
  assert.ok(!html.includes("ohud-figure"), "no humanoid figure wrapper of any kind in the empty state");
});

test("3b. Picking-state Target Area renders no shield icon/badge either", () => {
  const html = renderTargetBlock(baseTargetState({ ui: { targeting: { mode: "picking" } } }));
  assert.ok(!html.includes("ohud-figure-shield"));
});

/* ── 4. Selected-target silhouette is 1.25x the previous layout contract ─── */

test("4. selected-target silhouette CSS is exactly 1.25x the base .ohud-cc-target figure size", () => {
  const baseRule = cssRule(moduleCss, ".ohud-cc-target .ohud-figure {");
  const targetableRule = cssRule(moduleCss, ".ohud-cc-target .ohud-figure--targetable {");
  assert.ok(baseRule && targetableRule, "both rules exist");
  const baseWidth = cssNum(baseRule, "width");
  const baseHeight = cssNum(baseRule, "height");
  const bigWidth = cssNum(targetableRule, "width");
  const bigHeight = cssNum(targetableRule, "height");
  assert.equal(bigWidth, baseWidth * 1.25);
  assert.equal(bigHeight, baseHeight * 1.25);
});

test("4b. the crosshair placeholder is NOT scaled — it uses a completely different class untouched by the figure rules", () => {
  // No ACTUAL CSS rule for .ohud-target-crosshair in the Combat-Control-scoped
  // stylesheet (it's only mentioned in a doc comment here — its real sizing
  // rule lives in combatHudLayout.css, checked below).
  assert.equal(cssRule(moduleCss, ".ohud-target-crosshair {"), null);
  const crosshairRule = cssRule(layoutCss, ".ohud-target-crosshair {");
  assert.ok(crosshairRule, "the crosshair DOES have its own, separate sizing rule");
  assert.ok(!/57\.5|97\.5/.test(crosshairRule), "crosshair size is untouched by the 1.25x silhouette change");
});

/* ── 5. Enlarging the silhouette doesn't change Combat Control's own size ── */

test("5. Combat Control's own module footprint (330x165) is untouched by the silhouette size change", () => {
  const hudLayoutSrc = read("hud", "overlay", "hudLayout.js");
  assert.match(hudLayoutSrc, /combatControl:\s*Object\.freeze\(\{\s*left:\s*1263,\s*bottom:\s*16,\s*width:\s*330,\s*height:\s*165/);
});

/* ── 6. No overlap: silhouette vs name/zone-badge/Clear/Modifiers/action bar ── */

test("6. the enlarged silhouette still fits the Target column's own content box without overflowing into Modifiers or the action bar", () => {
  // A computed geometry budget (Node has no layout engine) — reconstructs the
  // vertical/horizontal budget from the ACTUAL CSS numbers, mirroring the
  // Phase 4.0e "positive gap" style checks used for the Skills quickbar.
  const panelWidth = 330; // hudLayout.js combatControl footprint (pinned above)
  const panelHeight = 165;
  const panelBorder = 1; // base .ohud-panel border
  const targetRule = cssRule(moduleCss, ".ohud-cc-target {");
  const padMatch = /padding:\s*(\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px/.exec(targetRule);
  const padV = padMatch ? Number(padMatch[1]) : 0;
  const padH = padMatch ? Number(padMatch[2]) : 0;

  const actionbarRule = cssRule(moduleCss, ".ohud-cc-actionbar {");
  const actionbarHeight = cssNum(actionbarRule, "height");

  const targetColWidth = (panelWidth - panelBorder * 2) / 2; // .ohud-cc-top is a 1fr/1fr grid
  const targetColHeight = panelHeight - panelBorder * 2 - actionbarHeight - 1 /* actionbar top border */;

  const contentWidth = targetColWidth - padH * 2 - 1 /* .ohud-cc-target's own right border */;
  const contentHeight = targetColHeight - padV * 2;

  const targetableRule = cssRule(moduleCss, ".ohud-cc-target .ohud-figure--targetable {");
  const figureWidth = cssNum(targetableRule, "width");
  const figureHeight = cssNum(targetableRule, "height");
  const rowGap = cssNum(cssRule(layoutCss, ".ohud-target {"), "gap") ?? 8;

  const metaColumnWidth = contentWidth - figureWidth - rowGap;

  assert.ok(figureHeight < contentHeight, `figure height (${figureHeight}) must fit inside the Target column's own content height (${contentHeight}) — no overflow into the action bar`);
  assert.ok(metaColumnWidth > 40, `name/zone-badge/Clear column (${metaColumnWidth}px) must keep a sane minimum width — the figure can't crowd it out`);
  assert.ok(figureWidth < targetColWidth, `figure width (${figureWidth}) must stay inside its own column (${targetColWidth}) — no bleed across the Modifiers border`);
});

test("6b. the Target row uses flex layout (width/height sizing, not transform:scale) — so siblings actually reflow instead of being overlapped", () => {
  const targetRule = cssRule(layoutCss, ".ohud-target {");
  assert.match(targetRule, /display:\s*flex/);
  const targetableRule = cssRule(moduleCss, ".ohud-cc-target .ohud-figure--targetable {");
  assert.match(targetableRule, /width:\s*57\.5px/);
  assert.match(targetableRule, /height:\s*97\.5px/);
  assert.ok(!/transform/.test(targetableRule), "sized via width/height, not transform:scale (per spec: avoids stale layout box / overlap risk)");
});

setTimeout(() => {
  console.log(`\nHUD visual cleanup: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
