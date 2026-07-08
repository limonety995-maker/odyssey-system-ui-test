// HUD Targeting — local map-visuals tests (Phase 4.0g).
//
// Two layers, matching this project's established pattern for OBR-touching
// code (see combat-session.test.mjs / abilities-quickbar.test.mjs):
//   - PURE unit tests over targetingVisualPolicy.js (fully executable — no
//     OBR import at all) and over the TargetBlock.js/CombatHudModule.js
//     render/wiring output;
//   - SOURCE-CONTRACT checks (regex/string assertions over the raw file text)
//     for targetingVisualController.js / targetingVisualRenderer.js, which
//     import "@owlbear-rodeo/sdk" directly. That import is NOT executable
//     under plain Node (the SDK's own internal ESM imports omit extensions,
//     which Node's strict resolver rejects — esbuild/browsers tolerate it,
//     Node doesn't) — confirmed empirically before writing this suite, and
//     consistent with why movement/moveToolController.js has never been
//     imported by any existing test file either.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  shouldShowSourceOutline,
  shouldShowTargetRing,
  isPickingActive,
  computeOverlayGeometry,
  nextRingRotation,
  OUTLINE_GAP_RATIO,
  RING_GAP_RATIO,
  RING_ROTATION_PERIOD_MS,
} from "../hud/targeting/visuals/targetingVisualPolicy.js";
import { TARGET_CROSSHAIR_ICON, buildTargetCursorValue, buildTargetCursorToolIcon } from "../hud/targeting/targetCursorSvg.js";
import { renderTargetBlock } from "../hud/components/TargetBlock.js";
import { renderCombatControlBlock } from "../hud/components/CombatControlBlock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const read = (...seg) => fs.readFileSync(path.join(repoRoot, ...seg), "utf8").replace(/\r\n/g, "\n");
const controllerSrc = read("hud", "targeting", "visuals", "targetingVisualController.js");
const rendererSrc = read("hud", "targeting", "visuals", "targetingVisualRenderer.js");
const moduleSrc = read("hud", "components", "CombatHudModule.js");
const overlayControllerSrc = read("hud", "overlay", "combatHudOverlayController.js");

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

console.log("\nHUD Targeting — local map visuals (Phase 4.0g)\n");

/* ───────────────────────── fixtures ───────────────────────── */

function baseState(over = {}) {
  return Object.assign({
    status: "ready",
    viewer: { role: "player" },
    ui: { targeting: {} },
    snapshot: { modifiers: { passive: [], active: [], narrative: [] }, combatSession: null },
  }, over);
}

/* ── Policy: pure decision logic (spec §C/§D gating) ─────────────────── */

test("shouldShowSourceOutline: never shown for a GM, even with canView+source (spec: no new GM-specific rules)", () => {
  assert.equal(shouldShowSourceOutline({ viewerRole: "gm", canView: true, sourceTokenId: "t1" }), false);
});

test("shouldShowSourceOutline: shown for a player who owns the source (canView true, non-GM, has a token)", () => {
  assert.equal(shouldShowSourceOutline({ viewerRole: "player", canView: true, sourceTokenId: "t1" }), true);
});

test("shouldShowSourceOutline: not shown when canView is false (unlinked/uncontrolled source)", () => {
  assert.equal(shouldShowSourceOutline({ viewerRole: "player", canView: false, sourceTokenId: "t1" }), false);
});

test("shouldShowSourceOutline: not shown with no source token at all", () => {
  assert.equal(shouldShowSourceOutline({ viewerRole: "player", canView: true, sourceTokenId: null }), false);
});

test("shouldShowTargetRing: true iff a target token id exists — no other gating", () => {
  assert.equal(shouldShowTargetRing({ targetTokenId: null }), false);
  assert.equal(shouldShowTargetRing({ targetTokenId: "" }), false);
  assert.equal(shouldShowTargetRing({ targetTokenId: "t2" }), true);
});

test("isPickingActive: true only for the existing 'picking' mode string", () => {
  assert.equal(isPickingActive("picking"), true);
  assert.equal(isPickingActive("idle"), false);
  assert.equal(isPickingActive("none"), false);
  assert.equal(isPickingActive(undefined), false);
});

test("computeOverlayGeometry: sizes proportionally around the token's own bounds, centered on it", () => {
  const geo = computeOverlayGeometry({ width: 40, height: 60, center: { x: 5, y: 10 } }, 0.10);
  assert.equal(geo.width, 44);
  assert.equal(geo.height, 66);
  assert.deepEqual(geo.position, { x: 5, y: 10 });
});

test("computeOverlayGeometry: never smaller than the token itself (gap ratio can't be negative)", () => {
  const geo = computeOverlayGeometry({ width: 20, height: 20, center: { x: 0, y: 0 } }, -5);
  assert.equal(geo.width, 20);
  assert.equal(geo.height, 20);
});

test("outline and ring use DIFFERENT gap ratios per spec (~3-6px vs ~6-10px — ring's gap is the larger one)", () => {
  assert.ok(RING_GAP_RATIO > OUTLINE_GAP_RATIO);
});

test("nextRingRotation: advances proportionally to elapsed time over the rotation period, and wraps at 360", () => {
  assert.equal(nextRingRotation(0, 1750, 3500), 180); // half a period → half a turn
  assert.equal(Math.round(nextRingRotation(350, 175, 3500) * 100) / 100, 8.00); // wraps past 360
});

/* ── Crosshair SVG: original, no bitmap, HUD-accent colored ───────────── */

test("crosshair icon is inline SVG (no bitmap), uses currentColor so CSS drives the accent", () => {
  assert.match(TARGET_CROSSHAIR_ICON, /^<svg/);
  assert.match(TARGET_CROSSHAIR_ICON, /stroke="currentColor"/);
  assert.ok(!/<image|href=".*\.(png|jpg|jpeg|gif)"/i.test(TARGET_CROSSHAIR_ICON), "no raster/bitmap reference");
});

test("cursor value is a real CSS cursor string: custom SVG + hotspot + a safe 'crosshair' fallback", () => {
  const value = buildTargetCursorValue();
  assert.match(value, /^url\("data:image\/svg\+xml,/);
  assert.match(value, /,\s*crosshair$/, "falls back to the native crosshair keyword");
  assert.match(value, /16 16/, "hotspot is centered in the 32x32 cursor image");
});

test("toolbar icon is a standalone data URI (explicit color, not currentColor, since <img> can't inherit it)", () => {
  const icon = buildTargetCursorToolIcon();
  assert.match(icon, /^data:image\/svg\+xml,/);
  assert.match(icon, /%2334e1d6/i, "explicit cyan color baked in");
});

/* ── TargetBlock: empty/picking states (spec §A) ──────────────────────── */

test("A.1: no humanoid silhouette renders when there is no target", () => {
  const html = renderTargetBlock(baseState());
  assert.ok(!html.includes("ohud-figure--ghost"), "no ghost silhouette wrapper");
  assert.ok(!html.includes("humanoid"), "no humanoid reference at all in the empty state");
});

test("A.2: the crosshair placeholder renders in the empty (idle) state", () => {
  const html = renderTargetBlock(baseState());
  assert.match(html, /ohud-target-crosshair/);
  assert.match(html, /<svg/);
});

test("A.3: the WHOLE Target Area is one interactive element wired to the EXISTING pick-target command", () => {
  const html = renderTargetBlock(baseState());
  assert.match(html, /<button[^>]*class="[^"]*ohud-target-pickarea[^"]*"[^>]*data-action="pick-target"/);
  assert.match(html, /role="button"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /aria-label="Pick target on map"/);
  assert.match(html, />Pick target on map</);
});

test("A.3b: the small standalone Pick/Cancel button is gone — the big area is the only control", () => {
  const html = renderTargetBlock(baseState());
  assert.ok(!html.includes("ohud-target-pick\""), "no leftover small pick button class");
});

test("A.4: a repeat click cannot fire pick-target twice — the picking state renders NO data-action at all (a static div, not a button)", () => {
  const html = renderTargetBlock(baseState({ ui: { targeting: { mode: "picking" } } }));
  assert.ok(!html.includes("data-action="), "picking state has zero clickable data-action targets");
  assert.ok(!html.includes("<button"), "picking state is not a button element");
});

test("A.5: picking state shows 'Selecting target…' and 'Press Esc to cancel'", () => {
  const html = renderTargetBlock(baseState({ ui: { targeting: { mode: "picking" } } }));
  assert.match(html, /Selecting target…/);
  assert.match(html, /Press Esc to cancel/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
});

test("A.6: a successful target selection returns to the EXISTING selected-target view unchanged (silhouette, name, zone, Clear)", () => {
  const html = renderTargetBlock(baseState({
    ui: { targeting: { selectedTargetIds: ["t1"], selectedTargetName: "Raider", selectedBodyPartId: "torso" } },
  }));
  assert.match(html, /ohud-figure--targetable/, "the real selected-target silhouette still renders");
  assert.match(html, />Raider</);
  assert.match(html, />TORSO</);
  assert.match(html, /data-action="clear-target"/);
  assert.ok(!html.includes("ohud-target-pickarea"), "pick area is gone once a target is selected");
});

test("Combat Control composite still embeds the Target Area correctly (no target)", () => {
  const html = renderCombatControlBlock(baseState());
  assert.match(html, /Pick target on map/);
  assert.match(html, /data-block="target"/);
});

/* ── CombatHudModule wiring: Esc cancels picking, reusing the existing command ── */

test("Esc in the combatControl module dispatches ONLY the existing cancel-target command (no new command type)", () => {
  const idx = moduleSrc.indexOf('moduleId === "combatControl"', moduleSrc.indexOf("function onKeyDown"));
  assert.ok(idx > -1, "combatControl branch exists in onKeyDown");
  const block = moduleSrc.slice(idx, moduleSrc.indexOf("}", moduleSrc.indexOf("}", idx) + 1));
  assert.match(block, /type:\s*"cancel-target"/);
});

/* ── Source-contract: controller/renderer never touch shared state ────── */

test("visuals never call OBR.scene.items (shared/synced scene state) — only OBR.scene.local (never-synced)", () => {
  assert.ok(!/OBR\.scene\.items\.(addItems|updateItems|deleteItems)/.test(rendererSrc), "renderer never WRITES shared scene items");
  assert.match(rendererSrc, /OBR\.scene\.local\.addItems/);
  assert.match(rendererSrc, /OBR\.scene\.local\.updateItems/);
  assert.match(rendererSrc, /OBR\.scene\.local\.deleteItems/);
});

test("visuals never create a persistent/shared scene item — no metadata writes, no Supabase, no RPC", () => {
  // Checks actual USAGE (imports/calls), not the word "Supabase" anywhere —
  // the files' own doc comments explain they avoid it, which would otherwise
  // false-positive against a blanket keyword search.
  for (const src of [controllerSrc, rendererSrc]) {
    assert.ok(!/OBR\.scene\.items\.addItems/.test(src));
    assert.ok(!/\.setMetadata\(/.test(src));
    assert.ok(!/from\s+["'][^"']*supabase[^"']*["']/i.test(src), "no Supabase bridge import");
    assert.ok(!/callSupabaseRpc\(|characterPlacementApi\./.test(src), "no RPC call");
  }
});

test("the cursor tool mode defines NO click/drag/key handlers — it can only skin the cursor, never intercept token selection", () => {
  const modeCallIdx = controllerSrc.indexOf("OBR.tool.createMode(");
  const modeCallEnd = controllerSrc.indexOf(");", modeCallIdx);
  const modeCallBlock = controllerSrc.slice(modeCallIdx, modeCallEnd);
  for (const handler of ["onClick", "onToolClick", "onToolDown", "onToolMove", "onToolUp", "onToolDragStart", "onKeyDown"]) {
    assert.ok(!modeCallBlock.includes(handler), `tool mode must not define ${handler}`);
  }
  assert.match(modeCallBlock, /cursors:/);
});

test("the tool restores whatever tool was active BEFORE picking — never leaves the user stuck on the picker tool", () => {
  assert.match(controllerSrc, /previousToolId/);
  assert.match(controllerSrc, /restorePickingCursor/);
  assert.match(controllerSrc, /activateTool\(previousToolId\)/);
});

test("controller reacts ONLY to the existing targeting/selection broadcasts — it sends no new commands into the target-selection flow", () => {
  assert.match(controllerSrc, /handleTargetingState/);
  assert.match(controllerSrc, /handleSelectionState/);
  assert.ok(!/BC_HUD_TARGETING_COMMAND|sendMessage/.test(controllerSrc), "never sends a targeting command itself");
});

test("cleanup tears down the tool, the local items, and the scene-ready subscription", () => {
  const cleanupIdx = controllerSrc.indexOf("async cleanup()");
  const cleanupBlock = controllerSrc.slice(cleanupIdx, controllerSrc.indexOf("};", cleanupIdx));
  assert.match(cleanupBlock, /hideAllTargetingVisuals/);
  assert.match(cleanupBlock, /OBR\.tool\.removeMode/);
  assert.match(cleanupBlock, /OBR\.tool\.remove\(/);
  assert.match(cleanupBlock, /unsubscribeSceneReady/);
  assert.match(cleanupBlock, /stopRingTimer/);
});

test("scene onReadyChange(false) resets local tracking so a scene switch never leaves stale visuals", () => {
  const idx = controllerSrc.indexOf("OBR.scene.onReadyChange");
  assert.ok(idx > -1);
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("});", idx));
  assert.match(block, /stopRingTimer/);
  assert.match(block, /outlineVisible = false/);
  assert.match(block, /ringVisible = false/);
  assert.match(block, /ringTokenId = null/, "Fix #4: which-token tracking is reset too, not just the visibility flag");
});

test("outline uses attachedTo so OBR itself keeps it synced to the source token's move/resize/rotation — no manual re-positioning code", () => {
  const idx = rendererSrc.indexOf("function buildSourceOutlineItem");
  const block = rendererSrc.slice(idx, rendererSrc.indexOf("function buildTargetRingItem"));
  assert.match(block, /\.attachedTo\(tokenId\)/);
  assert.match(block, /\.disableHit\(true\)/, "never blocks clicks");
  assert.ok(!block.includes("disableAttachmentBehavior"), "outline keeps ALL default sync (position/rotation/scale/delete)");
});

test("ring uses attachedTo for position/scale/delete but frees rotation for its own independent spin", () => {
  const idx = rendererSrc.indexOf("function buildTargetRingItem");
  const block = rendererSrc.slice(idx, rendererSrc.indexOf("async function getTokenBounds"));
  assert.match(block, /\.attachedTo\(anchorItemId\)/);
  assert.match(block, /disableAttachmentBehavior\(\["ROTATION"\]\)/);
  assert.match(block, /strokeDash:\s*\[/, "dashed stroke per spec");
  assert.match(block, /\.disableHit\(true\)/);
});

/* ── Fix #4: outer anchor / inner ring separation (Bugfix Pack) ────────── */

test("Fix #4: the ring is attached to a separate ANCHOR item, never directly to the target token — the anchor is the ONLY thing attachedTo(tokenId)", () => {
  const anchorIdx = rendererSrc.indexOf("function buildTargetRingAnchorItem");
  const anchorBlock = rendererSrc.slice(anchorIdx, rendererSrc.indexOf("function buildTargetRingItem"));
  assert.match(anchorBlock, /\.attachedTo\(tokenId\)/, "anchor tracks the token directly");
  assert.ok(!anchorBlock.includes("disableAttachmentBehavior"), "anchor keeps full default sync (position/scale/rotation/delete)");

  const ringIdx = rendererSrc.indexOf("function buildTargetRingItem");
  const ringBlock = rendererSrc.slice(ringIdx, rendererSrc.indexOf("async function getTokenBounds"));
  assert.ok(!ringBlock.includes(".attachedTo(tokenId)"), "ring is NEVER attached to the token directly");
  assert.match(ringBlock, /\.attachedTo\(anchorItemId\)/);
});

test("Fix #4: the anchor is invisible (zero opacity) — a purely geometric tracker, never a second visible ring", () => {
  const idx = rendererSrc.indexOf("function buildTargetRingAnchorItem");
  const block = rendererSrc.slice(idx, rendererSrc.indexOf("function buildTargetRingItem"));
  assert.match(block, /fillOpacity:\s*0/);
  assert.match(block, /strokeOpacity:\s*0/);
});

test("Fix #4: showTargetRing() creates the anchor AND the ring together, ring attached to the anchor's own item id", () => {
  const idx = rendererSrc.indexOf("export async function showTargetRing");
  const block = rendererSrc.slice(idx, rendererSrc.indexOf("export async function hideTargetRing"));
  assert.match(block, /buildTargetRingAnchorItem\(tokenId,\s*bounds\)/);
  assert.match(block, /buildTargetRingItem\(TARGET_RING_ANCHOR_ITEM_ID,\s*bounds/);
});

test("Fix #4: hideTargetRing()/hideAllTargetingVisuals() always delete BOTH the ring and its anchor — no orphaned anchor left behind", () => {
  const hideIdx = rendererSrc.indexOf("export async function hideTargetRing");
  const hideBlock = rendererSrc.slice(hideIdx, rendererSrc.indexOf("export async function setTargetRingRotation"));
  assert.match(hideBlock, /TARGET_RING_ITEM_ID/);
  assert.match(hideBlock, /TARGET_RING_ANCHOR_ITEM_ID/);

  const idx = rendererSrc.indexOf("export async function hideAllTargetingVisuals");
  const block = rendererSrc.slice(idx);
  assert.match(block, /TARGET_RING_ITEM_ID/);
  assert.match(block, /TARGET_RING_ANCHOR_ITEM_ID/);
});

test("Fix #4: setTargetRingRotation() touches ONLY the ring item — never the anchor, never re-adds/removes either item", () => {
  const idx = rendererSrc.indexOf("export async function setTargetRingRotation");
  const block = rendererSrc.slice(idx, rendererSrc.indexOf("export async function hideAllTargetingVisuals"));
  assert.match(block, /updateItems\(\[TARGET_RING_ITEM_ID\]/);
  assert.ok(!block.includes("TARGET_RING_ANCHOR_ITEM_ID"), "never touches the anchor");
  assert.ok(!block.includes("addItems") && !block.includes("deleteItems"), "rotation ticks never add/remove items");
});

test("Fix #4: the controller tracks WHICH token the ring is attached to, and reattaches (tears down + recreates) when the target switches to a DIFFERENT token — never just leaves it on the stale one", () => {
  assert.match(controllerSrc, /ringTokenId/);
  const idx = controllerSrc.indexOf("async function reconcileRing");
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("async function reconcileCursor"));
  assert.match(block, /ringVisible && ringTokenId === targetTokenId/, "no-op only when already correctly attached to THIS token");
  assert.match(block, /hideTargetRing/);
  assert.match(block, /showTargetRing/);
});

test("Fix #4: reconcileRing() only runs when the TARGET token id itself changes (handleTargetingState gates it on targetChanged) — a normal token move/resize broadcast never re-triggers it", () => {
  const idx = controllerSrc.indexOf("function handleTargetingState");
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("/** @param {{ viewer"));
  assert.match(block, /if \(targetChanged\) void reconcileRing\(\);/);
});

test("Fix #4: rotation animation is linear and completes one full turn in 3-4 seconds", () => {
  assert.ok(RING_ROTATION_PERIOD_MS >= 3000 && RING_ROTATION_PERIOD_MS <= 4000);
});

test("Fix #4: rotation origin stays centered — the ring is a CIRCLE shape whose .position() IS its own center (OBR circles have no separate top-left anchor), never an offset/top-left transform-origin", () => {
  const idx = rendererSrc.indexOf("function buildTargetRingItem");
  const block = rendererSrc.slice(idx, rendererSrc.indexOf("async function getTokenBounds"));
  assert.match(block, /\.shapeType\("CIRCLE"\)/, "a CIRCLE shape's position is its geometric center by construction");
  assert.match(block, /\.position\(geo\.position\)/, "position is the SAME center computeOverlayGeometry derived from the token's own center, not a top-left offset");
  assert.match(block, /\.rotation\(rotationDeg\)/, "rotation is set on this same centered item — never a separately-offset child");
});

test("Fix #4: computeOverlayGeometry's position IS the token's own center (never top-left), which is what both the anchor and the ring inherit", () => {
  const geo = computeOverlayGeometry({ width: 40, height: 60, center: { x: 100, y: 200 } }, 0.10);
  assert.deepEqual(geo.position, { x: 100, y: 200 }, "geometry position is exactly the token's center, never a top-left corner derivation");
});

test("the outline/ring/cursor wiring is called from the SAME two existing hook points (onTargetingState/onSelectionState) — no new controller entry point added to combatHudOverlayController.js", () => {
  assert.match(overlayControllerSrc, /targetingVisuals\?\.handleTargetingState\?\./);
  assert.match(overlayControllerSrc, /targetingVisuals\?\.handleSelectionState\?\./);
  // Both calls must live INSIDE the existing setupTargetSelection/setupSceneSelection callbacks.
  const targetSelectionIdx = overlayControllerSrc.indexOf("targetSelection = setupTargetSelection(");
  const sceneSelectionIdx = overlayControllerSrc.indexOf("sceneCleanup = setupSceneSelection(");
  const handleTargetingIdx = overlayControllerSrc.indexOf("targetingVisuals?.handleTargetingState?.");
  const handleSelectionIdx = overlayControllerSrc.indexOf("targetingVisuals?.handleSelectionState?.");
  assert.ok(handleTargetingIdx > targetSelectionIdx && handleTargetingIdx < sceneSelectionIdx);
  assert.ok(handleSelectionIdx > sceneSelectionIdx);
});

setTimeout(() => {
  console.log(`\nHUD Targeting visuals: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
