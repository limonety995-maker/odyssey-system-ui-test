// Combat HUD — Urgent Target Ring Failure Diagnostic Fix.
//
// Root cause of the reported bug: a real target-ring creation failure was
// logged as `message: String(error?.message ?? error)`. When the thrown
// value has no `.message` (e.g. most non-Error SDK rejection shapes),
// `error?.message` is undefined, the `??` falls back to the error object
// itself, and `String(someObject)` collapses to the literal, useless
// "[object Object]" — exactly the symptom reported ("TARGETING ·
// target-ring-failed · FAIL, message: [object Object]"). This file tests
// hud/debug/errorSerialization.js (the fix) and its wiring into
// hud/targeting/visuals/targetingVisualController.js's phase-labeled
// failure logging.
//
// Two layers, matching this project's established pattern:
//   - PURE unit tests over hud/debug/errorSerialization.js (fully
//     executable — no OBR import at all);
//   - SOURCE-CONTRACT checks (regex/string assertions) for
//     targetingVisualController.js/targetingVisualRenderer.js, which import
//     "@owlbear-rodeo/sdk" directly and are not executable under plain Node
//     (see hud-targeting-visuals.test.mjs's header comment for why).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { serializeError } from "../hud/debug/errorSerialization.js";
import { detailLines, buildEntryCopyText } from "../hud/debug/DebugConsolePanel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const read = (...seg) => fs.readFileSync(path.join(repoRoot, ...seg), "utf8").replace(/\r\n/g, "\n");
const controllerSrc = read("hud", "targeting", "visuals", "targetingVisualController.js");
const rendererSrc = read("hud", "targeting", "visuals", "targetingVisualRenderer.js");

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

console.log("\nTarget ring diagnostic fix — safe error serialization\n");

/* ── 1. Object error no longer renders as [object Object] ───────────────── */

test("1. a plain object error never serializes to the literal string '[object Object]'", () => {
  const result = serializeError({ code: "SOME_SDK_ERROR", detail: "attachment target not found" });
  const asString = JSON.stringify(result);
  assert.ok(!asString.includes("[object Object]"));
  assert.equal(result.code, "SOME_SDK_ERROR");
  assert.equal(result.detail, "attachment target not found");
});

/* ── 2. Error instance logs name/message/stack ───────────────────────────── */

test("2. an Error instance serializes name, message, and stack", () => {
  const err = new Error("attachment failed");
  err.name = "AttachmentError";
  const result = serializeError(err);
  assert.equal(result.name, "AttachmentError");
  assert.equal(result.message, "attachment failed");
  assert.ok(typeof result.stack === "string" && result.stack.length > 0);
});

test("2b. an Error's cause chains through serializeError recursively", () => {
  const inner = new Error("inner cause");
  const outer = new Error("outer failure", { cause: inner });
  const result = serializeError(outer);
  assert.equal(result.cause.message, "inner cause");
});

test("2c. extra enumerable fields on an Error (e.g. a real SDK error's own .code) survive serialization", () => {
  const err = new Error("failed");
  err.code = "ITEM_NOT_FOUND";
  const result = serializeError(err);
  assert.equal(result.code, "ITEM_NOT_FOUND");
});

/* ── 3. Plain object error logs JSON fields ──────────────────────────────── */

test("3. a plain JSON-safe object error logs its own fields verbatim (never fabricated, never dropped)", () => {
  const result = serializeError({ status: 409, reason: "conflict", itemId: "abc-123" });
  assert.deepEqual(result, { status: 409, reason: "conflict", itemId: "abc-123" });
});

/* ── 4. Circular object error logs safe fallback keys/type ───────────────── */

test("4. a circular-reference object logs a safe fallback shape (type + keys), never throws, never '[object Object]'", () => {
  const circular = { name: "CircularThing" };
  circular.self = circular;
  const result = serializeError(circular);
  assert.equal(result.type, "[object Object]"); // Object.prototype.toString.call() result — an honest type tag, not the bug
  assert.ok(Array.isArray(result.keys) && result.keys.includes("name") && result.keys.includes("self"));
});

test("4b. a non-Error, non-JSON-serializable value (e.g. containing a function) also falls back safely", () => {
  const weird = { fn: () => {}, label: "weird" };
  const result = serializeError(weird);
  // JSON.stringify silently drops function-valued properties rather than
  // throwing, so this actually succeeds via the JSON path — either way, it
  // must never be the bare string "[object Object]".
  assert.notEqual(JSON.stringify(result), '"[object Object]"');
});

/* ── redaction: never leak credential-shaped fields ──────────────────────── */

test("9. no credentials/auth tokens/Supabase keys ever survive serialization, even if a thrown error happened to carry one", () => {
  const dangerous = {
    message: "request failed",
    auth_token: "secret-token-value",
    apiKey: "sk-should-not-leak",
    request: { headers: { Authorization: "Bearer super-secret" }, password: "hunter2" },
  };
  const result = serializeError(dangerous);
  const asString = JSON.stringify(result);
  assert.ok(!asString.includes("secret-token-value"));
  assert.ok(!asString.includes("sk-should-not-leak"));
  assert.ok(!asString.includes("super-secret"));
  assert.ok(!asString.includes("hunter2"));
  assert.equal(result.auth_token, "[redacted]");
  assert.equal(result.apiKey, "[redacted]");
  assert.equal(result.request.headers.Authorization, "[redacted]");
  assert.equal(result.request.password, "[redacted]");
});

test("9b. an Error instance's own dangerous extra fields are redacted the same way", () => {
  const err = new Error("failed");
  err.sessionToken = "leak-me-not";
  const result = serializeError(err);
  assert.equal(result.sessionToken, "[redacted]");
});

/* ── primitives never crash serializeError ───────────────────────────────── */

test("serializeError never throws on any input shape (string/number/null/undefined/symbol-ish)", () => {
  for (const value of ["plain string", 42, null, undefined, NaN]) {
    assert.doesNotThrow(() => serializeError(value));
  }
  assert.deepEqual(serializeError("plain string"), { message: "plain string" });
  assert.deepEqual(serializeError(null), { message: "null" });
});

/* ── 5/6. Target ring failure log includes tokenId, phase, and operation ── */

test("5/6. logRingFailure() always includes tokenId, phase, and operation in the Debug Console details, alongside the character/scene context fields", () => {
  const idx = controllerSrc.indexOf("function logRingFailure");
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("function logRingSuccess"));
  assert.match(block, /phase, operation,/);
  assert.match(block, /tokenId: targetTokenId,/);
  assert.match(block, /targetCharacterId,/);
  assert.match(block, /sourceCharacterId,/);
  assert.match(block, /sceneId,/);
});

test("5b. every reconcileRing()/handleTargetingState phase (token lookup, ring creation, ring anchor update, ring geometry sync, ring cleanup, scene change) calls logRingFailure with an explicit phase label — never a bare catch that drops the error", () => {
  for (const phase of [
    "target-state-to-token-lookup",
    "ring-cleanup",
    "ring-anchor-update",
    "ring-geometry-sync",
    "scene-change-handling",
  ]) {
    assert.ok(controllerSrc.includes(`"${phase}"`), `missing phase label: ${phase}`);
  }
  // ring-creation is reported via the renderer's own tagged error.phase,
  // with a string-literal fallback of the same name in the controller.
  assert.match(controllerSrc, /error\?\.phase \?\? "ring-creation"/);
});

test("6b. the renderer tags scene-item-lookup vs ring-creation distinctly, so a bounds-fetch failure is never misreported as a ring-creation failure", () => {
  assert.match(rendererSrc, /tagPhase\(error, "scene-item-lookup", "getItemBounds"\)/);
  assert.match(rendererSrc, /tagPhase\(error, "ring-creation", "addItems\(ring\)"\)/);
  // The old two-step anchor+ring creation (and its distinct "addItems(anchor)"
  // operation label passed to tagPhase) is gone entirely — there is exactly
  // one addItems call for ring creation now. (The string may still appear in
  // a header comment describing the historical bug — check the actual
  // tagPhase call site, not the whole file.)
  assert.ok(!rendererSrc.includes('tagPhase(error, "ring-creation", "addItems(anchor)")'));
});

/* ── 7. Debug Console displays a useful error message ────────────────────── */

test("7. logRingFailure() merges the serialized error INTO the Debug Console details object (not as a single opaque 'message' string) — the existing detail-area renderer already expands nested objects field by field", () => {
  const idx = controllerSrc.indexOf("function logRingFailure");
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("function logRingSuccess"));
  assert.match(block, /logDebugEvent\("targeting", "target-ring-failed", \{ \.\.\.context, \.\.\.serializeError\(error\) \}, false\)/);
  // Never the old bug: a bare String(error) collapsing to "[object Object]".
  assert.ok(!controllerSrc.includes("String(error?.message ?? error)"));
});

test("7b. end-to-end: the REAL Debug Console detail renderer shows every field for a realistic target-ring-failed entry — no [object Object] anywhere, tokenId reasonably truncated", () => {
  const error = { code: "ATTACHMENT_NOT_FOUND", detail: "parent item does not exist" };
  const details = {
    phase: "ring-creation", operation: "addItems(ring)",
    tokenId: "aae8a1ab-b111-2222-3333-444455554d06",
    targetCharacterId: "char-1", sourceCharacterId: "char-2", sceneId: "scene-1",
    ...serializeError(error),
  };
  const lines = detailLines(details);
  const rendered = lines.join("\n");
  assert.ok(!rendered.includes("[object Object]"));
  assert.ok(rendered.includes("phase: ring-creation"));
  assert.ok(rendered.includes("operation: addItems(ring)"));
  assert.ok(rendered.includes("code: ATTACHMENT_NOT_FOUND"));
  assert.ok(rendered.includes("detail: parent item does not exist"));
  const entry = { timestamp: Date.now(), category: "targeting", action: "target-ring-failed", details, success: false };
  const copyText = buildEntryCopyText(entry);
  assert.ok(!copyText.includes("[object Object]"));
  assert.ok(copyText.includes("action: target-ring-failed"));
  assert.ok(copyText.includes("status: fail"));
});

/* ── 8. Browser console receives the original error object and context ──── */

test("8. logRingFailure() logs the RAW, unserialized error object (plus the same context) to the real browser console — full devtools inspection, not just the trimmed Debug Console fields", () => {
  const idx = controllerSrc.indexOf("function logRingFailure");
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("function logRingSuccess"));
  assert.match(block, /console\.error\("\[Odyssey HUD\] target ring failed", error, context\)/);
});

/* ── self-healing: the actual ring creation/update fix ───────────────────── */

test("self-heal: showTargetRing() defensively deletes any pre-existing ring by id BEFORE creating a fresh one — never assumes this module's own in-memory tracking is the only source of truth for what's already in the local scene store", () => {
  const idx = rendererSrc.indexOf("export async function showTargetRing");
  const block = rendererSrc.slice(idx, rendererSrc.indexOf("export async function hideTargetRing"));
  assert.match(block, /await OBR\.scene\.local\.deleteItems\(\[TARGET_RING_ITEM_ID\]\)/);
});

/* ── Hotfix: ValidationError on addItems(anchor) — single valid local item ── */

test("hotfix 1/2: showTargetRing() never passes anchorState (or any TARGET_RING_ANCHOR-shaped object) into OBR.scene.local.addItems — the anchor OBR item concept is removed entirely", () => {
  assert.ok(!rendererSrc.includes("TARGET_RING_ANCHOR_ITEM_ID"));
  assert.ok(!rendererSrc.includes("buildTargetRingAnchorItem"));
  const idx = rendererSrc.indexOf("export async function showTargetRing");
  const block = rendererSrc.slice(idx, rendererSrc.indexOf("export async function hideTargetRing"));
  // The ring-creation path itself must never use attachedTo — that scoped
  // check matters more than a whole-file ban, since buildSourceOutlineItem
  // (a separate, not-yet-reported-broken overlay) still legitimately uses
  // attachedTo(tokenId) and is out of scope for this hotfix.
  assert.ok(!block.includes(".attachedTo("));
  const addItemsCalls = block.match(/OBR\.scene\.local\.addItems/g) ?? [];
  assert.equal(addItemsCalls.length, 1, "showTargetRing() must call addItems exactly once");
});

test("hotfix 2: the ring item built for addItems is a valid Owlbear local item shape — a buildShape() SHAPE item, same builder family as the project's proven local-overlay precedent (movement/combatMovementPreview.js), positioned via layer(\"POINTER\") with no attachedTo", () => {
  const idx = rendererSrc.indexOf("function buildTargetRingItem");
  const block = rendererSrc.slice(idx, rendererSrc.indexOf("function tagPhase"));
  assert.match(block, /buildShape\(\)/);
  assert.match(block, /\.shapeType\("CIRCLE"\)/);
  assert.match(block, /\.layer\("POINTER"\)/);
  assert.ok(!block.includes("attachedTo"));
  assert.ok(!block.includes('layer("ATTACHMENT")'));
});

test("hotfix 3/4: geometry updates go through a single updateItems() call (updateTargetRingGeometry), never a fresh addItems — addItems appears ONLY inside showTargetRing in the whole renderer file", () => {
  assert.match(rendererSrc, /export async function updateTargetRingGeometry\(tokenId, lastBounds\)/);
  const geomIdx = rendererSrc.indexOf("export async function updateTargetRingGeometry");
  const geomBlock = rendererSrc.slice(geomIdx, rendererSrc.indexOf("export async function hideAllTargetingVisuals"));
  assert.match(geomBlock, /OBR\.scene\.local\.updateItems\(\[TARGET_RING_ITEM_ID\]/);
  assert.match(geomBlock, /item\.position = geo\.position/);
  assert.match(geomBlock, /item\.width = geo\.width/);
  assert.match(geomBlock, /item\.height = geo\.height/);
  assert.ok(!geomBlock.includes("addItems"));
  const allAddItems = rendererSrc.match(/\.addItems\(/g) ?? [];
  assert.equal(allAddItems.length, 2, "addItems should appear exactly twice in the file: once for the source outline, once for the ring");
});

test("hotfix (superseded by the animation-stutter fix): the controller has no fixed-interval rotation tick at all — updateTargetRingGeometry is called only from the OBR.scene.items.onChange handler", () => {
  assert.ok(!controllerSrc.includes("setTargetRingRotation"));
  assert.ok(!controllerSrc.includes("setInterval"), "no fixed-interval animation timer survives");
  assert.match(controllerSrc, /await updateTargetRingGeometry\(ringTokenId, lastRingBounds\)/);
});

test("hotfix 8: target clear removes the valid local ring item(s) — hideTargetRing/hideAllTargetingVisuals only ever reference TARGET_RING_ITEM_ID, never an anchor id", () => {
  assert.match(rendererSrc, /export async function hideTargetRing\(\) \{\n\s*await OBR\.scene\.local\.deleteItems\(\[TARGET_RING_ITEM_ID\]\);/);
  const idx = rendererSrc.indexOf("export async function hideAllTargetingVisuals");
  const block = rendererSrc.slice(idx);
  assert.match(block, /deleteItems\(\[SOURCE_OUTLINE_ITEM_ID, TARGET_RING_ITEM_ID\]\)/);
});

test("hotfix 6/7: reconcileRing() only recreates the ring when the target token actually changes (ringTokenId !== targetTokenId) — a same-target HUD/Tactical-Move refresh re-running handleTargetingState with an unchanged target never re-enters showTargetRing", () => {
  assert.match(controllerSrc, /if \(ringVisible && ringTokenId === targetTokenId\) return;/);
});

test("hotfix 9: DebugConsolePanel's detailLines() no longer collapses a nested array of objects (e.g. ValidationError.details) into '[object Object]' — each object element expands onto its own indented line", () => {
  const details = {
    phase: "ring-creation",
    operation: "addItems(ring)",
    error: {
      name: "ValidationError",
      message: '"items[0]" does not match any of the allowed types',
      details: [
        { path: ["items", 0], message: "expected SHAPE", expected: "SHAPE", received: "unknown" },
      ],
    },
  };
  const lines = detailLines(details);
  const rendered = lines.join("\n");
  assert.ok(!rendered.includes("[object Object]"));
  assert.ok(rendered.includes("path:"));
  assert.ok(rendered.includes("expected: SHAPE"));
  assert.ok(rendered.includes("received: unknown"));
});

test("hotfix 9b: truncateValue() itself never returns the literal '[object Object]' for an object/array input", () => {
  const truncateValueDirect = detailLines({ x: [{ a: 1 }] }).join("\n");
  assert.ok(!truncateValueDirect.includes("[object Object]"));
});

test("hotfix 10: the Debug Console still shows phase, operation, tokenId, targetCharacterId, sourceCharacterId, and sceneId for a target-ring-failed entry, unchanged by the nested-details fix", () => {
  const details = {
    phase: "ring-creation", operation: "addItems(ring)",
    tokenId: "aae8a1ab-b111-2222-3333-444455554d06",
    targetCharacterId: "char-1", sourceCharacterId: "char-2", sceneId: "scene-1",
    name: "ValidationError", message: '"items[0]" does not match any of the allowed types',
    details: [{ path: ["items", 0], message: "bad type" }],
  };
  const rendered = detailLines(details).join("\n");
  for (const expected of [
    "phase: ring-creation", "operation: addItems(ring)", "tokenId: aae8a1ab-b…4d06",
    "targetCharacterId: char-1", "sourceCharacterId: char-2", "sceneId: scene-1",
  ]) {
    assert.ok(rendered.includes(expected), `missing "${expected}" in rendered details`);
  }
});

/* ── Video regression (2026-07-08): target ring stutter — see
 * docs/TARGET_RING_ANIMATION_AUDIT.md's "Video regression: 2026-07-08"
 * section for the full write-up. The ring used to "spin" via a 150ms
 * setInterval pushing a fresh rotation through updateItems — each write is a
 * real round trip, so what should have read as continuous motion instead
 * read as a visible step every tick. Fix: drop rotation entirely (nothing
 * left to step), and drive geometry-only sync off a real
 * OBR.scene.items.onChange event instead of a fixed-interval poll. ────────── */

test("1. the ring is created exactly once per target pick — reconcileRing() calls showTargetRing() from its target-changed branch, which itself issues exactly one addItems()", () => {
  const idx = controllerSrc.indexOf("async function reconcileRing");
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("async function reconcileCursor"));
  const showCalls = block.match(/showTargetRing\(targetTokenId\)/g) ?? [];
  assert.equal(showCalls.length, 1, "showTargetRing is called from exactly one place in reconcileRing");
});

test("2. a same-target refresh does not recreate the ring — reconcileRing() no-ops when ringVisible and ringTokenId already match targetTokenId, before ever reaching showTargetRing/hideTargetRing", () => {
  const idx = controllerSrc.indexOf("async function reconcileRing");
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("async function reconcileCursor"));
  const guardIdx = block.indexOf("if (ringVisible && ringTokenId === targetTokenId) return;");
  const showIdx = block.indexOf("showTargetRing(targetTokenId)");
  assert.ok(guardIdx > -1 && guardIdx < showIdx, "the no-op guard runs BEFORE any (re)creation call");
});

test("3/4/5. HUD refresh / Tactical Move runtime refresh / attack-result refresh cannot 'restart the animation' because there is no animation loop left to restart — no setInterval/RING_TICK_MS/nextRingRotation survives anywhere in the controller or policy files", () => {
  const policySrc = fs.readFileSync(path.join(repoRoot, "hud", "targeting", "visuals", "targetingVisualPolicy.js"), "utf8");
  for (const src of [controllerSrc, rendererSrc, policySrc]) {
    // Checks actual CALL syntax, not prose — the renderer's header comment
    // legitimately mentions "150ms setInterval" as history/context for why
    // the fix was needed, which must not itself fail this check.
    assert.ok(!src.includes("setInterval("), "no fixed-interval timer call anywhere in the targeting-visuals module");
    assert.ok(!src.includes("RING_TICK_MS"));
    assert.ok(!/\bnextRingRotation\(/.test(src));
    assert.ok(!src.includes("RING_ROTATION_PERIOD_MS"));
  }
  // The only remaining trigger for any ring write is the real scene event
  // subscribed once in OBR.onReady — never a HUD/Tactical-Move/attack-result
  // refresh call site (those all flow through handleTargetingState, which
  // only reconciles on an actual targetChanged — see test 2 above, and
  // hud-targeting-visuals.test.mjs's own body-zone-refresh/Tactical-Move
  // tests for the broadcast-level guarantee that a routine refresh never
  // changes target.tokenId in the first place).
  assert.match(controllerSrc, /OBR\.scene\.items\.onChange\(/);
});

test("6/7/9/10. token geometry updates never call addItems/deleteItems again — updateTargetRingGeometry only ever calls updateItems, and it is the ONLY function the onChange handler invokes", () => {
  const geomIdx = rendererSrc.indexOf("export async function updateTargetRingGeometry");
  const geomBlock = rendererSrc.slice(geomIdx, rendererSrc.indexOf("export async function hideAllTargetingVisuals"));
  assert.ok(!geomBlock.includes("addItems"), "geometry sync never re-adds the ring");
  assert.ok(!geomBlock.includes("deleteItems"), "geometry sync never deletes/recreates the ring");
  assert.match(geomBlock, /OBR\.scene\.local\.updateItems\(\[TARGET_RING_ITEM_ID\]/);
  const handlerIdx = controllerSrc.indexOf("async function handleSceneItemsChanged");
  const handlerBlock = controllerSrc.slice(handlerIdx, controllerSrc.indexOf("async function reconcileOutline"));
  assert.ok(!handlerBlock.includes("addItems") && !handlerBlock.includes("deleteItems") && !handlerBlock.includes("showTargetRing") && !handlerBlock.includes("hideTargetRing"), "the geometry-change handler only ever calls updateTargetRingGeometry, never add/delete/show/hide");
});

test("8/9/10. no per-frame animation loop exists at all — the ring's only writer is the event-driven handleSceneItemsChanged, gated on the change batch actually including the current target token", () => {
  assert.match(controllerSrc, /async function handleSceneItemsChanged\(items\)/);
  const idx = controllerSrc.indexOf("async function handleSceneItemsChanged");
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("async function reconcileOutline"));
  assert.match(block, /items\.some\(\(item\) => item\?\.id === ringTokenId\)/, "only reacts when the change batch actually names our target token");
  assert.match(block, /ringGeometrySyncInFlight/, "reentrancy guard: an in-flight sync is never piled on by a rapid burst of onChange events");
});

test("11/12. ring geometry (position AND size) is re-derived from the token's own CURRENT bounds on every real sync — computeOverlayGeometry centers on bounds.center and scales bounds.width/height by the ring's gap ratio, so a moved OR resized token yields correct new geometry", () => {
  const idx = rendererSrc.indexOf("export async function updateTargetRingGeometry");
  const block = rendererSrc.slice(idx, rendererSrc.indexOf("export async function hideAllTargetingVisuals"));
  assert.match(block, /const bounds = await getTokenBounds\(tokenId\)/, "bounds are re-read fresh, never reused from a stale cache");
  assert.match(block, /computeOverlayGeometry\(bounds, RING_GAP_RATIO\)/);
  assert.match(block, /item\.position = geo\.position/, "moved token -> new centered position");
  assert.match(block, /item\.width = geo\.width/, "resized token -> new width");
  assert.match(block, /item\.height = geo\.height/, "resized token -> new height");
});

test("13. the ring stays local-only even with the new event subscription — OBR.scene.items.onChange is a READ-only subscription (never itself an add/update/delete call), and every actual WRITE still goes through OBR.scene.local only", () => {
  assert.ok(!/OBR\.scene\.items\.(addItems|updateItems|deleteItems)/.test(controllerSrc), "controller never writes to the shared/synced scene");
  assert.ok(!/OBR\.scene\.items\.(addItems|updateItems|deleteItems)/.test(rendererSrc), "renderer never writes to the shared/synced scene");
  assert.match(controllerSrc, /OBR\.scene\.items\.onChange\(/, "the only shared-scene touch is a read-only change subscription");
});

test("14. nested error details still don't render as [object Object] after the animation-stutter fix — same coverage as the earlier hotfix, re-asserted here since this pass also touched logRingFailure's phase list", () => {
  const details = {
    phase: "ring-geometry-sync", operation: "updateTargetRingGeometry",
    error: { name: "ValidationError", details: [{ path: ["rotation"], message: "not allowed" }] },
  };
  const rendered = detailLines(details).join("\n");
  assert.ok(!rendered.includes("[object Object]"));
  assert.ok(rendered.includes("path:"));
});

setTimeout(() => {
  console.log(`\nTarget ring diagnostic: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
