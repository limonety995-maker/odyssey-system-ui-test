// Bug fix — Ability Detail Card Clipping and Missing Execution Reason.
//
// Root cause (see abilityDetailPlacement.js's header comment): the card used
// to render as a `position:fixed` div INSIDE the Skills module's own popover
// iframe. An iframe is its own browsing context — content can never paint
// outside that iframe's own box (the small width/height OBR gave it), so
// anything taller than roughly the Skills module's own height was silently
// clipped by the IFRAME BOUNDARY itself, regardless of any CSS. The fix
// makes the card its OWN companion popover (like GM Tracker / Quickbar
// Editor), sized/positioned by combatHudOverlayController.js from REAL data.
//
// PURE tests over estimateAbilityDetailHeight/computeAbilityDetailRect, plus
// source-contract checks over combatHudOverlayController.js/
// combatHudOverlayPage.js/quickbarDetailCardController.js (DOM/OBR-touching,
// tested the same way every other such file in this suite is: reading the
// source text, never executing it in plain Node).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { estimateAbilityDetailHeight, computeAbilityDetailRect, ABILITY_DETAIL_WIDTH } from "../hud/abilities/abilityDetailPlacement.js";
import { mapQuickAction } from "../hud/abilities/abilityRuntimeMapper.js";
import { deriveSlotAvailability, SLOT_AVAILABILITY } from "../hud/abilities/abilityAvailabilityPolicy.js";
import { renderAbilityDetailCard } from "../hud/abilities/AbilityDetailCard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const read = (...seg) => fs.readFileSync(path.join(repoRoot, ...seg), "utf8").replace(/\r\n/g, "\n");
const controllerSrc = read("hud", "overlay", "combatHudOverlayController.js");
const pageSrc = read("hud", "overlay", "combatHudOverlayPage.js");
const detailControllerSrc = read("hud", "abilities", "quickbarDetailCardController.js");
const moduleSrc = read("hud", "components", "CombatHudModule.js");
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

console.log("\nBug fix — Ability Detail Card Clipping and Missing Execution Reason\n");

/* ── fixtures ─────────────────────────────────────────────────────────── */

function rawAction(over = {}) {
  return {
    characterActionId: over.id ?? "act-1", definitionId: "def-1", sourceType: "psi",
    type: "attack_technique", name: over.name ?? "Ethric Strike",
    fullDescription: over.fullDescription ?? "Materialized psionic force projected against a target body part.",
    iconKey: "brain", semanticKind: "attack",
    targeting: { mode: "body_part", minTargets: 1, maxTargets: 1, allowAllies: false, allowSelf: false, requiresBodyZone: true },
    costs: over.costs ?? { main: 1, move: 0, psi: 1, charges: 0 },
    cooldown: over.cooldown ?? { current: 0, max: 0, unit: "turn" },
    state: over.state ?? { available: true, active: false, disabledReason: null, selectable: true, executionAvailable: true, executionReason: null, resourceSufficient: true },
    requirements: { weaponClass: null, weaponId: null, conditionSummary: null },
  };
}
function action(over = {}) { return mapQuickAction(rawAction(over)); }

const skillsRectAt = (left, top) => ({ left, top, width: 600, height: 165 });

const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720 },
  { name: "1366x768", w: 1366, h: 768 },
  { name: "1920x1080", w: 1920, h: 1080 },
  { name: "2560x1440", w: 2560, h: 1440 },
];

/* ── 1/2. Content-aware height: short stays short, long grows ──────────── */

test("1. a short ability (one-line description, few costs) estimates a compact height — no unnecessary scroll/empty space", () => {
  const short = action({ fullDescription: "A quick jab." });
  const h = estimateAbilityDetailHeight(short);
  assert.ok(h >= 100 && h <= 180, `expected a compact estimate, got ${h}`);
});

test("2. a long description estimates a taller height than a short one — the card genuinely expands for real content, never one fixed number for every ability", () => {
  const short = action({ fullDescription: "Short." });
  const long = action({ fullDescription: "A very long, elaborate description of a technique that goes into extensive detail about the mechanics, flavor, and tactical implications of using it in combat against a variety of enemy types and situations, covering edge cases too." });
  assert.ok(estimateAbilityDetailHeight(long) > estimateAbilityDetailHeight(short));
});

test("no action selected still returns a sane minimum height, never 0/negative/NaN", () => {
  const h = estimateAbilityDetailHeight(null);
  assert.ok(Number.isFinite(h) && h > 0);
});

/* ── 3/4. Very long content: capped, scrolls only inside the body, header+status pinned ── */

test("3. an extremely long description is capped at a fraction of the real viewport height — it never claims more than that, however long the text", () => {
  const veryLong = action({ fullDescription: "X ".repeat(2000) });
  const estimated = estimateAbilityDetailHeight(veryLong);
  assert.ok(estimated > 1000, "the raw estimate itself is huge for such a long description");
  const rect = computeAbilityDetailRect(skillsRectAt(100, 900), estimated, 1920, 1080);
  assert.ok(rect.height <= Math.round(1080 * 0.7), "capped at MAX_VIEWPORT_FRACTION of the real viewport");
});

test("4. the card's markup keeps header and status OUTSIDE the scrollable body — only description/pills scroll, so a long description never hides the header or the status/reason", () => {
  const a = action({ state: { available: false, disabledReason: "Attack effect is not supported yet", executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true, selectable: false, active: false } });
  const html = renderAbilityDetailCard(a, { scrollableBody: true });
  const bodyIdx = html.indexOf('<div class="ohud-qbe-desc-body">');
  const bodyEnd = html.indexOf("</div>", bodyIdx);
  const headIdx = html.indexOf("ohud-qbe-desc-head");
  const statusIdx = html.indexOf("ohud-qbe-desc-status");
  assert.ok(headIdx > -1 && (headIdx < bodyIdx || headIdx > bodyEnd) === false ? true : headIdx < bodyIdx, "head renders before the scrollable body");
  assert.ok(statusIdx > bodyEnd, "status renders AFTER (outside) the scrollable body, never inside it");
  // CSS: header and status are flex:0 0 auto (never shrink/scroll away); the
  // body is the one flexible, overflow-y:auto region.
  assert.match(layoutCss, /\.ohud-qbe-desc--card \.ohud-qbe-desc-head,\s*\n\.ohud-qbe-desc--card \.ohud-qbe-desc-status \{ flex: 0 0 auto; \}/);
  assert.match(layoutCss, /\.ohud-qbe-desc-body \{ flex: 1 1 auto; min-height: 0; overflow-y: auto;/);
});

test("the Quickbar Editor's own (non-card) rendering is completely unaffected — no scrollableBody, no --card class, exact same markup as before this fix", () => {
  const html = renderAbilityDetailCard(action());
  assert.ok(!html.includes("ohud-qbe-desc--card"));
  assert.ok(!html.includes("ohud-qbe-desc-body"));
});

/* ── 5. Card stays inside the viewport at every required resolution ────── */

test("5. the computed rect stays fully inside [0,vw]x[0,vh] at every required resolution, for Skills Block anywhere on screen", () => {
  for (const { name, w, h } of VIEWPORTS) {
    for (const skillsRect of [skillsRectAt(16, h - 181), skillsRectAt(w - 616, h - 181), skillsRectAt(Math.round(w / 2), Math.round(h / 2))]) {
      const estimated = estimateAbilityDetailHeight(action());
      const rect = computeAbilityDetailRect(skillsRect, estimated, w, h);
      assert.ok(rect.left >= 0 && rect.left + rect.width <= w, `${name}: left within bounds`);
      assert.ok(rect.top >= 0 && rect.top + rect.height <= h, `${name}: top within bounds`);
    }
  }
});

/* ── 6. Safe fallback placement near screen edges ───────────────────────── */

test("6. Skills Block flush with the LEFT edge and near the TOP (no room above) still produces a fully on-screen card — the placement policy falls back instead of clipping off the top-left", () => {
  const skillsRect = { left: 0, top: 5, width: 600, height: 165 };
  const rect = computeAbilityDetailRect(skillsRect, estimateAbilityDetailHeight(action()), 1920, 1080);
  assert.ok(rect.left >= 0 && rect.top >= 0, "never placed off the top/left edge");
  assert.ok(rect.left + rect.width <= 1920 && rect.top + rect.height <= 1080);
});

test("6b. Skills Block flush with the RIGHT edge still produces a card fully within the viewport width", () => {
  const skillsRect = { left: 1920 - 600, top: 900, width: 600, height: 165 };
  const rect = computeAbilityDetailRect(skillsRect, estimateAbilityDetailHeight(action()), 1920, 1080);
  assert.ok(rect.left + rect.width <= 1920);
});

test("preferred placement (directly above Skills Block) is used when there is genuinely room for it", () => {
  const skillsRect = skillsRectAt(700, 700);
  const height = estimateAbilityDetailHeight(action());
  const rect = computeAbilityDetailRect(skillsRect, height, 1920, 1080);
  assert.equal(rect.left, skillsRect.left);
  assert.equal(rect.top, skillsRect.top - rect.height - 6);
});

test("the card is never a large centered modal — its width is the fixed, compact ABILITY_DETAIL_WIDTH regardless of viewport size", () => {
  for (const { w, h } of VIEWPORTS) {
    const rect = computeAbilityDetailRect(skillsRectAt(100, 100), estimateAbilityDetailHeight(action()), w, h);
    assert.equal(rect.width, ABILITY_DETAIL_WIDTH);
    assert.ok(rect.width < w / 2, "narrow compact card, not a half-screen-or-bigger modal");
  }
});

/* ── 7. No parent overflow can clip it — it's a real, separate popover ──── */

test("7a. the Ability Detail Card is opened as its OWN OBR companion popover (ABILITY_DETAIL_POPOVER_ID) — not a DOM element living inside the Skills module's own (size-constrained) iframe", () => {
  assert.match(controllerSrc, /OBR\.popover\.open\(\{ id: ABILITY_DETAIL_POPOVER_ID, url: pageUrl\("ability-detail"\)/);
  assert.match(controllerSrc, /OBR\.popover\.close\(ABILITY_DETAIL_POPOVER_ID\)/);
});

test("7b. quickbarDetailCardController.js no longer creates any local DOM element — it only sends commands; nothing here can ever be clipped by the Skills module's own iframe boundary again", () => {
  assert.ok(!detailControllerSrc.includes("document.createElement"));
  assert.ok(!detailControllerSrc.includes("appendChild"));
  assert.match(detailControllerSrc, /sendCommand\(\{ type: "show"/);
});

test("7c. CombatHudModule.js never CALLS a local detailCard DOM element (.element/.contains as actual code — comments are stripped first, since the code intentionally explains the OLD, now-removed behavior in prose) — the card is a separate popover it cannot reach", () => {
  const codeOnly = moduleSrc.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!codeOnly.includes("detailCard.element"));
  assert.ok(!codeOnly.includes("detailCard.contains("));
});

test("7d. the ability-detail companion page fills its OWN popover (height:100%) rather than floating with position:fixed over shared content", () => {
  assert.match(layoutCss, /\.ohud-ability-detail-page \{ height: 100%; width: 100%; display: flex; \}/);
  assert.ok(!layoutCss.includes(".ohud-ability-card {"), "the old position:fixed shell class is gone");
});

test("the overlay page's ability-detail route resolves the shown action from the SAME live BC_HUD_SELECTION quickActions list every other module/companion reads — never a second data path", () => {
  const idx = pageSrc.indexOf('moduleParam === "ability-detail"');
  assert.ok(idx > -1);
  const block = pageSrc.slice(idx, pageSrc.indexOf('moduleParam === "quickbar-editor"', idx));
  assert.match(block, /rawPayload\?\.hudSnapshot\?\.quickbar\?\.quickActions/);
  assert.match(block, /renderAbilityDetailCard\(resolveShownAction\(\), \{ armed: !!shown\?\.armed, scrollableBody: true \}\)/);
});

test("a just-mounted ability-detail companion asks for the current state (request-current) so it never permanently misses a 'show' it loaded too late to catch — and the controller replies from its own remembered state", () => {
  assert.match(pageSrc, /type: "request-current"/);
  assert.match(controllerSrc, /adType === "request-current" && abilityDetailShown/);
});

test("closing/reopening the Skills character (companion cleanup) also closes the Ability Detail popover — a stale card must never survive a character switch", () => {
  const idx = controllerSrc.indexOf("async function closeAllCompanionSelectors()");
  assert.ok(idx > -1);
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("\n}\n", idx));
  assert.match(block, /closeAbilityDetail\(\)/);
});

/* ── 8. Ethric-Strike-shaped runtime: unsupported, unarmable, human reason ── */

test("8. an executionAvailable:false runtime action maps to 'unsupported', is never armable, and the card shows the human-readable canonical reason (never the raw code)", () => {
  const ethricStrike = action({
    name: "Ethric Strike",
    costs: { main: 1, move: 0, psi: 1, charges: 0 },
    state: { available: false, active: false, disabledReason: "Attack effect is not supported yet", selectable: false, executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true },
  });
  assert.equal(deriveSlotAvailability(ethricStrike, false), SLOT_AVAILABILITY.unsupported);
  assert.equal(ethricStrike.state.available, false, "not armable — available is false");

  const html = renderAbilityDetailCard(ethricStrike, { scrollableBody: true });
  assert.match(html, /ETHRIC STRIKE|Ethric Strike/);
  assert.match(html, /Attack technique/);
  assert.match(html, /Materialized psionic force projected against a target body part\./);
  assert.match(html, /MAIN.1/);
  assert.match(html, /PSI 1/);
  assert.match(html, /body zone|One character/i);
  assert.match(html, />Status: Attack effect is not supported yet\.</);
});

/* ── 9. No raw server error code anywhere in player UI ──────────────────── */

test("9. ACTION_EFFECT_NOT_IMPLEMENTED (or any other raw canonical code) never appears in the rendered card — only its mapped human-readable text does", () => {
  const a = action({ state: { available: false, disabledReason: "Attack effect is not supported yet", executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true, selectable: false, active: false } });
  const html = renderAbilityDetailCard(a, { scrollableBody: true });
  assert.ok(!html.includes("ACTION_EFFECT_NOT_IMPLEMENTED"));
});

console.log("");
setTimeout(() => {
  console.log(`\nBug fix — Ability Detail Card Clipping and Missing Execution Reason: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
