// Priority Bugfix Pack — HUD typography scale increase (+2px readability
// pass). SOURCE-CONTRACT checks only (no DOM/browser — CSS custom properties
// can't be computed/cascaded under plain Node, exactly like
// hud-typography-floor.test.mjs's own established pattern for this codebase).
//
// Distinct from hud-typography-floor.test.mjs (which covers the SEPARATE
// --ohud-critical-text-ratio/--ohud-slot-marker-ratio "never shrink below a
// floor" system): this file covers the shared --ohud-font-* base tokens that
// EVERY font-size declaration across the main HUD CSS now reads from, each
// one exactly 2px larger than its pre-existing value.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const read = (...seg) => fs.readFileSync(path.join(repoRoot, ...seg), "utf8").replace(/\r\n/g, "\n");

const tokensCss = read("hud", "styles", "combatHudTokens.css");
const layoutCss = read("hud", "components", "combatHudLayout.css");
const moduleCss = read("hud", "components", "combatHudModule.css");
const overlayCss = read("hud", "overlay", "combatHudOverlay.css");
const debugCss = read("hud", "debug", "debugConsole.css");

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

console.log("\nHUD typography scale — +2px readability pass\n");

/* Every shared token, and the OLD (pre-increase) value it replaces. */
const TOKENS = {
  "--ohud-font-5-5": { old: 5.5, new: 7.5 },
  "--ohud-font-6": { old: 6, new: 8 },
  "--ohud-font-6-5": { old: 6.5, new: 8.5 },
  "--ohud-font-7": { old: 7, new: 9 },
  "--ohud-font-7-5": { old: 7.5, new: 9.5 },
  "--ohud-font-8": { old: 8, new: 10 },
  "--ohud-font-8-5": { old: 8.5, new: 10.5 },
  "--ohud-font-9": { old: 9, new: 11 },
  "--ohud-font-9-5": { old: 9.5, new: 11.5 },
  "--ohud-font-10": { old: 10, new: 12 },
  "--ohud-font-10-5": { old: 10.5, new: 12.5 },
  "--ohud-font-11": { old: 11, new: 13 },
  "--ohud-font-11-5": { old: 11.5, new: 13.5 },
  "--ohud-font-12": { old: 12, new: 14 },
  "--ohud-font-13": { old: 13, new: 15 },
  "--ohud-font-14": { old: 14, new: 16 },
  "--ohud-font-15": { old: 15, new: 17 },
  "--ohud-font-16": { old: 16, new: 18 },
  "--ohud-font-17": { old: 17, new: 19 },
  "--ohud-font-20": { old: 20, new: 22 },
  "--ohud-font-24": { old: 24, new: 26 },
};

function tokenValue(name) {
  const re = new RegExp(`${name}:\\s*([0-9]+(?:\\.[0-9]+)?)px;`);
  const m = re.exec(tokensCss);
  return m ? Number(m[1]) : null;
}

test("1. every shared HUD font-size token is defined and is exactly its OLD value + 2px", () => {
  for (const [name, { old, new: expected }] of Object.entries(TOKENS)) {
    const actual = tokenValue(name);
    assert.ok(actual !== null, `${name} is not defined in combatHudTokens.css`);
    assert.equal(actual, expected, `${name}: expected old ${old}px + 2 = ${expected}px, got ${actual}px`);
  }
});

test("2. no plain literal font-size px value remains in the main HUD CSS files — every declaration reads from a shared --ohud-font-* token", () => {
  for (const [label, css] of [["combatHudLayout.css", layoutCss], ["combatHudModule.css", moduleCss], ["combatHudOverlay.css", overlayCss]]) {
    const literal = /font-size:\s*[0-9]+(?:\.[0-9]+)?px/.exec(css);
    assert.equal(literal, null, `${label} still has a literal font-size: ${literal?.[0]}`);
  }
});

test("2b. Player Block selectors reference the new (bumped) tokens, never their old literal size", () => {
  for (const selector of [".ohud-player-name {", ".ohud-gun-name {", ".ohud-pip {"]) {
    const idx = layoutCss.indexOf(selector) > -1 ? layoutCss.indexOf(selector) : moduleCss.indexOf(selector);
    assert.ok(idx > -1, `${selector} exists`);
  }
  assert.match(layoutCss, /\.ohud-player-name \{[\s\S]*?font-size:\s*calc\(var\(--ohud-font-12\)/);
  assert.match(layoutCss, /\.ohud-pip \{ font-size: var\(--ohud-font-8\)/);
});

test("3. Combat Control selectors reference the new (bumped) tokens", () => {
  assert.match(moduleCss, /\.ohud-cc-abtn \{[^}]*font-size:\s*calc\(var\(--ohud-font-11\)/);
  assert.match(layoutCss, /\.ohud-target-name \{ font-size: calc\(var\(--ohud-font-11\)/);
});

test("4. Debug Console (isolated stylesheet) text no longer uses its old smaller literal sizes", () => {
  assert.ok(!/font:\s*12px\/1\.4/.test(debugCss), "root font is no longer the old 12px");
  assert.match(debugCss, /font:\s*14px\/1\.4/);
  assert.ok(!/font-size:\s*11px/.test(debugCss), "no remaining old 11px literal");
  assert.match(debugCss, /font-size:\s*13px/);
});

test("5. no HUD module's own canonical (unscaled) footprint changed — the +2px pass is a font-size-only change, not a layout/module-size redesign", () => {
  // hudLayout.js's DEFAULT_HUD_LAYOUT_V2 canonical dimensions are unchanged
  // (already independently pinned by hud-visual-cleanup.test.mjs's own test 5
  // and hud-responsive-layout.test.mjs's aspect-ratio tests, both still
  // green) — the extra 2px of text has to fit the SAME box, never a
  // silently-enlarged one.
  const hudLayoutSrc = read("hud", "overlay", "hudLayout.js");
  assert.match(hudLayoutSrc, /combatControl:\s*Object\.freeze\(\{\s*left:\s*1263,\s*bottom:\s*16,\s*width:\s*330,\s*height:\s*165/);
});

test("5b. the ARMED chip and ATTACK/END TURN fixed-height containers are untouched by this pass (already independently height-audited by hud-typography-floor.test.mjs's tests 4/4b)", () => {
  assert.match(layoutCss, /\.ohud-mod--armed\s*\{[^}]*height:\s*auto[^}]*min-height:\s*17px/s);
  assert.match(moduleCss, /\.ohud-cc-actionbar\s*\{[^}]*height:\s*34px/s);
});

test("6. the --ohud-critical-text-ratio / --ohud-slot-marker-ratio multiplier system still layers on TOP of the new base tokens, unchanged in mechanism", () => {
  assert.match(moduleCss, /font-size:\s*calc\(var\(--ohud-font-11\) \* var\(--ohud-critical-text-ratio, 1\)\)/);
  assert.match(layoutCss, /font-size:\s*calc\(var\(--ohud-font-10\) \* var\(--ohud-slot-marker-ratio, 1\)\)/);
});

setTimeout(() => {
  console.log(`\nHUD typography scale: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
