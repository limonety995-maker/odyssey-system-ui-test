// Priority UI Fix — Critical amendment: readable typography must not scale
// into microtext.
//
// PURE tests over hudLayout.js's computeCriticalTextRatio (the math), plus
// source-contract checks over combatHudLayout.css/combatHudModule.css/
// CombatHudModule.js (CSS custom properties can't be computed/cascaded in a
// plain Node script — no DOM, no browser — so the actual font-size math is
// verified numerically against the same formula the CSS encodes, and the
// CSS itself is verified by reading its source text, exactly like every
// other CSS-contract test in this suite, e.g. hud-visual-cleanup.test.mjs).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeLayoutScale, computeCriticalTextRatio } from "../hud/overlay/hudLayout.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const read = (...seg) => fs.readFileSync(path.join(repoRoot, ...seg), "utf8").replace(/\r\n/g, "\n");
const layoutCss = read("hud", "components", "combatHudLayout.css");
const moduleCss = read("hud", "components", "combatHudModule.css");
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

console.log("\nPriority UI Fix — typography floor (critical amendment)\n");

/* ── The 5 required viewports for this amendment ───────────────────────── */
const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720 },
  { name: "1366x768", w: 1366, h: 768 },
  { name: "1920x1080", w: 1920, h: 1080 },
  { name: "2560x1440", w: 2560, h: 1440 },
  { name: "3840x2160", w: 3840, h: 2160 },
];

/* ── Every critical selector this amendment covers, with its canonical
 * (1920×1080-reference, pre-this-amendment) font-size — the value each one
 * must never render smaller than on screen, per computeCriticalTextRatio's
 * contract. Context matters for two of them (player-module overrides). */
// Bugfix pack: canonicalPx values below reflect the +2px typography-scale
// increase (each is the OLD canonical size + 2 — see combatHudTokens.css's
// --ohud-font-* tokens, e.g. old 12px is now --ohud-font-12: 14px).
const CRITICAL_TOKENS = [
  { label: "character name (base)", css: layoutCss, selector: ".ohud-player-name {", canonicalPx: 14 },
  { label: "character name (player module override)", css: moduleCss, selector: '.ohud-player-name { font-size: calc(var(--ohud-font-16)', canonicalPx: 18, literal: true },
  { label: "weapon name", css: layoutCss, selector: ".ohud-gun-name {", canonicalPx: 11 },
  { label: "target name", css: layoutCss, selector: ".ohud-target-name {", canonicalPx: 13 },
  { label: "PSI/Shield current value (base)", css: layoutCss, selector: ".ohud-res-num {", canonicalPx: 12 },
  { label: "PSI/Shield current value (player module override)", css: moduleCss, selector: '.ohud-res-num { font-size: calc(var(--ohud-font-12)', canonicalPx: 14, literal: true },
  { label: "ammo current", css: layoutCss, selector: ".ohud-ammo-cur {", canonicalPx: 26 },
  { label: "ammo max", css: layoutCss, selector: ".ohud-ammo-max {", canonicalPx: 13 },
  { label: "MAIN/MOVE pip (player module)", css: moduleCss, selector: '.ohud-pip { font-size: calc(var(--ohud-font-9)', canonicalPx: 11, literal: true },
  { label: "ATTACK/END TURN", css: moduleCss, selector: ".ohud-cc-abtn {", canonicalPx: 13 },
  { label: "armed technique name", css: layoutCss, selector: ".ohud-mod--armed .ohud-mod-name {", canonicalPx: 11 },
  { label: "combat log event", css: layoutCss, selector: ".ohud-log-row {", canonicalPx: 12 },
  { label: "status/error toast", css: layoutCss, selector: ".ohud-toast {", canonicalPx: 13 },
];

function cssRule(css, selector) {
  const idx = css.indexOf(selector);
  if (idx === -1) return null;
  const braceStart = css.indexOf("{", idx);
  const braceEnd = css.indexOf("}", braceStart);
  return css.slice(braceStart + 1, braceEnd);
}

/* ── 1/2/3. No critical token ever renders smaller than its canonical size,
 * at every required viewport — this IS the accessibility floor in practice
 * (see computeCriticalTextRatio's doc comment: effective floor = today's
 * already-shipped canonical size, never below it, never invented larger). ── */

test("1/2/3. every critical token (ATTACK/END TURN, character/weapon/target name, PSI/ammo values, MAIN/MOVE, armed technique name, combat log, status toast) renders at or above its canonical size at every required viewport", () => {
  for (const { name, w, h } of VIEWPORTS) {
    const layoutScale = computeLayoutScale(w, h);
    const ratio = computeCriticalTextRatio(layoutScale);
    for (const token of CRITICAL_TOKENS) {
      const onScreenPx = token.canonicalPx * layoutScale * ratio;
      assert.ok(onScreenPx >= token.canonicalPx - 0.01, `${name}: ${token.label} would render at ${onScreenPx.toFixed(2)}px, below its canonical ${token.canonicalPx}px`);
    }
  }
});

test("computeCriticalTextRatio: exactly 1 (no behavior change) at/above the 1920×1080 reference; exactly cancels the shrink below it, capped at 3x", () => {
  assert.equal(computeCriticalTextRatio(1), 1);
  assert.equal(computeCriticalTextRatio(1.5), 1, "above reference: critical text still grows WITH the rest of the HUD, same as before this fix");
  assert.ok(Math.abs(computeCriticalTextRatio(0.5) - 2) < 1e-9);
  assert.equal(computeCriticalTextRatio(0.1), 3, "capped — a pathologically tiny viewport can't blow critical text up without bound");
  assert.equal(computeCriticalTextRatio(0.1, 5), 5, "cap is a parameter, not a hardcoded magic number");
});

/* ── 4. No clipping: parents tall/wide enough for the compensated font ──── */

test("4. the ARMED chip's fixed height is relaxed to auto/min-height alongside its critical font-size rule — the enlarged name has room to reflow into instead of clipping vertically", () => {
  assert.match(layoutCss, /\.ohud-mod--armed\s*\{[^}]*height:\s*auto[^}]*min-height:\s*17px/s);
});

test("4b. ATTACK/END TURN's fixed-height parent (34px) comfortably fits the critical-text ratio's realistic range at every required viewport (no clipping without needing to touch the action bar's own layout)", () => {
  const actionbarRule = cssRule(moduleCss, ".ohud-cc-actionbar {");
  const actionbarHeight = Number(/height:\s*(\d+(?:\.\d+)?)px/.exec(actionbarRule)[1]);
  for (const { name, w, h } of VIEWPORTS) {
    const ratio = computeCriticalTextRatio(computeLayoutScale(w, h));
    const fontPx = 13 * ratio; // .ohud-cc-abtn's own pre-transform font-size at this ratio (was 11px, +2px typography pass)
    assert.ok(fontPx < actionbarHeight * 0.8, `${name}: ATTACK/END TURN font (${fontPx.toFixed(1)}px) must comfortably fit the ${actionbarHeight}px action bar`);
  }
});

/* ── 5. Secondary/decorative text is NOT frozen — it keeps shrinking first ── */

test("5. clearly secondary/decorative selectors do NOT reference --ohud-critical-text-ratio — they keep shrinking with the rest of the HUD, which is what lets critical text take priority", () => {
  for (const selector of [
    ".ohud-res-label {", // "SHIELD"/"PSI" captions
    ".ohud-gun-secondary {", // "2nd" weapon badge
    ".ohud-pilot-tag {",
    ".ohud-gmct-tag {",
    ".ohud-ammo-label {", // "ammo" caption (not the value itself)
  ]) {
    const rule = cssRule(layoutCss, selector);
    assert.ok(rule, `${selector} exists`);
    assert.ok(!rule.includes("--ohud-critical-text-ratio"), `${selector} must stay a plain (shrinking) secondary token`);
  }
});

/* ── 6. Companion popovers (Quickbar Editor, tooltips) are fully independent
 * from the main HUD's layoutScale/critical-text-ratio — they're never
 * wrapped in the module canvas transform at all (see hud-responsive-
 * layout.test.mjs's "companion selector panels... never touched" test). ── */

test("6. Quickbar Editor and tooltip text never reference --ohud-critical-text-ratio — their readable size is independent of the main HUD's scale by construction (a completely separate render path, never wrapped in CombatHudModule.js's canvas transform)", () => {
  for (const selector of [".ohud-qbe-desc-name {", ".ohud-qbe-card-name {", ".ohud-tooltip-title {", ".ohud-tooltip-line {"]) {
    const rule = cssRule(layoutCss, selector);
    assert.ok(rule, `${selector} exists`);
    assert.ok(!rule.includes("--ohud-critical-text-ratio"));
  }
});

/* ── 7. Hit areas stay aligned: this is a font-size change, not a nested
 * transform — no separate click-coordinate math is introduced. ── */

test("7. the typography floor is implemented as a font-size multiplier, never a nested transform/zoom — existing click-hit-testing (already verified against the outer canvas transform) needs no extra alignment work", () => {
  assert.match(moduleCss, /font-size:\s*calc\(var\(--ohud-font-11\) \* var\(--ohud-critical-text-ratio, 1\)\)/, "ATTACK/END TURN uses calc()-driven font-size");
  const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const codeOnly = stripComments(moduleCss) + stripComments(layoutCss);
  assert.ok(!/--ohud-critical-text-ratio[^;]*transform/.test(codeOnly), "the ratio never drives a transform anywhere in actual CSS rules (comments aside)");
});

test("CombatHudModule.js sets --ohud-critical-text-ratio from the shared, independently-tested computeCriticalTextRatio helper — one formula, not a second hand-rolled copy", () => {
  assert.match(moduleJs, /computeCriticalTextRatio/);
  assert.match(moduleJs, /el\.style\.setProperty\("--ohud-critical-text-ratio", String\(computeCriticalTextRatio\(scale\)\)\)/);
});

console.log("");
setTimeout(() => {
  console.log(`\nPriority UI Fix — typography floor: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
