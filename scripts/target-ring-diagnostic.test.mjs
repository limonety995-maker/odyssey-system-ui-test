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

test("5b. every reconcileRing()/handleTargetingState phase (token lookup, ring creation, ring anchor update, ring animation, ring cleanup, scene change) calls logRingFailure with an explicit phase label — never a bare catch that drops the error", () => {
  for (const phase of [
    "target-state-to-token-lookup",
    "ring-cleanup",
    "ring-anchor-update",
    "ring-animation-update",
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
  assert.match(rendererSrc, /tagPhase\(error, "ring-creation", "addItems\(anchor\)"\)/);
  assert.match(rendererSrc, /tagPhase\(error, "ring-creation", "addItems\(ring\)"\)/);
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

test("self-heal: showTargetRing() defensively deletes any pre-existing anchor/ring by id BEFORE creating fresh ones — never assumes this module's own in-memory tracking is the only source of truth for what's already in the local scene store", () => {
  const idx = rendererSrc.indexOf("export async function showTargetRing");
  const block = rendererSrc.slice(idx, rendererSrc.indexOf("export async function hideTargetRing"));
  assert.match(block, /await OBR\.scene\.local\.deleteItems\(\[TARGET_RING_ITEM_ID, TARGET_RING_ANCHOR_ITEM_ID\]\)/);
});

test("self-heal: a failure creating the ring itself (after the anchor already succeeded) cleans up the orphaned anchor rather than leaving a half-shown invisible-only overlay", () => {
  const idx = rendererSrc.indexOf("export async function showTargetRing");
  const block = rendererSrc.slice(idx, rendererSrc.indexOf("export async function hideTargetRing"));
  const ringCatchIdx = block.indexOf('tagPhase(error, "ring-creation", "addItems(ring)")');
  const cleanupIdx = block.lastIndexOf("deleteItems([TARGET_RING_ANCHOR_ITEM_ID])", ringCatchIdx);
  assert.ok(cleanupIdx > -1 && cleanupIdx < ringCatchIdx, "orphaned anchor is deleted before the ring-creation failure is thrown");
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
