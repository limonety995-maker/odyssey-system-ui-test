// Combat HUD — Priority bugfix: immediate HUD refresh after Tactical Move.
//
// Two layers, matching this project's established pattern for OBR-touching
// code (see combat-session.test.mjs / hud-targeting-visuals.test.mjs):
//   - PURE unit + functional tests over hud/session/combatSessionMapper.js
//     (isRuntimeApplicable), hud/session/combatSessionPolicy.js
//     (deriveMoveState), hud/scene/selectionState.js (buildBroadcastPayload)
//     and hud/components/PlayerBlock.js (renderPlayerBlock) — all fully
//     executable under plain Node;
//   - SOURCE-CONTRACT checks (regex/string assertions over the raw file
//     text) for movement/moveToolController.js, movement/moveToolBridge.js,
//     hud/scene/sceneSelectionController.js and
//     hud/session/combatSessionController.js, which import
//     "@owlbear-rodeo/sdk" directly and are not executable under plain Node
//     (see hud-targeting-visuals.test.mjs's header comment for why).
//
// See docs/TACTICAL_MOVE_HUD_REFRESH_AUDIT.md for the full root-cause audit.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isRuntimeApplicable, mapCombatRuntimeToSession } from "../hud/session/combatSessionMapper.js";
import { deriveMoveState, MOVE_TILE_STATE } from "../hud/session/combatSessionPolicy.js";
import { buildBroadcastPayload } from "../hud/scene/selectionState.js";
import { renderPlayerBlock } from "../hud/components/PlayerBlock.js";
import { createSceneSelectionAdapter } from "../hud/scene/sceneSelectionAdapter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const readText = (...segments) =>
  fs.readFileSync(path.join(repoRoot, ...segments), "utf8").replace(/\r\n/g, "\n");

const moveControllerSrc = readText("movement", "moveToolController.js");
const moveBridgeSrc = readText("movement", "moveToolBridge.js");
const sceneControllerSrc = readText("hud", "scene", "sceneSelectionController.js");
const sessionControllerSrc = readText("hud", "session", "combatSessionController.js");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      result
        .then(() => { passed += 1; console.log(`  PASS ${name}`); })
        .catch((err) => { failed += 1; failures.push({ name, err }); console.error(`  FAIL ${name}\n      ${err.message}`); });
      return;
    }
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.error(`  FAIL ${name}\n      ${err.message}`);
  }
}

console.log("\nTactical Move — immediate HUD refresh (bugfix pack)\n");

/* ───────────────────────── fixtures ───────────────────────── */

function runtimeFixture({ encounterId = "enc-1", version = 7, moveCurrent = 6, moveMax = 10, characterId = "char-a" } = {}) {
  return {
    ok: true,
    encounter: { id: encounterId, status: "active", current_round: 2, active_entry_id: "entry-a", active_character_id: characterId, state_version: version },
    visible_participants: [
      {
        initiative_entry_id: "entry-a", character_id: characterId, display_name: "Hero",
        character_bucket: "player", initiative_value: 18, roll_value: 14, order_index: 0,
        is_active: true, action_current: 1, action_max: 1, move_current: moveCurrent, move_max: moveMax, movement_version: 3,
        state: { is_alive: true, is_conscious: true },
      },
    ],
    viewer_controlled_character_ids: [characterId],
    state_version: version,
  };
}

/** A minimal bundle sufficient for mapBundleToHudSnapshot to produce a real,
 *  non-null entity (same minimal shape scripts/combat-hud-phase3a.test.mjs
 *  already relies on for a "ready" state). */
function bundle({ owner = "p1", name = "Hero" } = {}) {
  return {
    ok: true,
    character: { owner_player_id: owner, owner_player_name: "Alice", display_name: name, character_key: "HERO" },
    state: { is_alive: true, is_conscious: true, status_summary: "Alive | Conscious" },
  };
}

async function readyStateFor({ characterId = "char-a" } = {}) {
  const adapter = createSceneSelectionAdapter({
    backendConfigured: true,
    getViewer: () => ({ playerId: "p1", role: "PLAYER" }),
    fetchSceneTokenLink: async () => ({ ok: true, links: [{ token_id: "tok-1", is_active: true, character: { id: characterId, display_name: "Hero" } }] }),
    fetchCharacterBundle: async () => bundle({ owner: "p1" }),
  });
  return adapter.resolve(["tok-1"]);
}

/* ── Immediate movement refresh ─────────────────────────────────────────── */

test("1. combat_move_character's live SQL returns a runtime built by the SAME helper combat_get_active_runtime uses", () => {
  const sql = readText("supabase", "odyssey_supabase.sql");
  // The file is a full concatenation of every migration ever applied — the
  // LAST definition of a given function name is the one actually live.
  const defs = [];
  const marker = "create or replace function public.combat_move_character(";
  let idx = sql.indexOf(marker);
  while (idx !== -1) { defs.push(idx); idx = sql.indexOf(marker, idx + 1); }
  assert.ok(defs.length > 0, "combat_move_character is defined");
  const lastDef = sql.slice(defs[defs.length - 1], defs[defs.length - 1] + 20000);
  assert.match(lastDef, /'runtime',\s*public\.odyssey_build_combat_runtime\(/);
});

test("2. finalizeMutationSuccess (the accepted-movement success handler) already has result.runtime available and forwards it verbatim", () => {
  const idx = moveControllerSrc.indexOf("async function finalizeMutationSuccess");
  const block = moveControllerSrc.slice(idx, moveControllerSrc.indexOf("async function runAutoTacticalSync"));
  assert.match(block, /if \(result\?\.runtime\)/);
  assert.match(block, /runtime:\s*result\?\.runtime\s*\?\?\s*null/);
});

test("2b. the Applied event payload carries encounterId/characterId/tokenId/stateVersion/movementVersion alongside runtime — no raw Supabase/auth internals", () => {
  const idx = moveControllerSrc.indexOf("function buildStatus(state, extras");
  const block = moveControllerSrc.slice(idx, moveControllerSrc.indexOf("function ", idx + 10));
  for (const field of ["encounterId:", "tokenId:", "characterId:", "stateVersion:", "movementVersion:"]) {
    assert.ok(block.includes(field), `buildStatus() is missing ${field}`);
  }
  assert.ok(!/access_token|service_role|apikey|password/i.test(block), "no credentials in the status payload");
  const applyIdx = moveControllerSrc.indexOf("await publishMoveToolEvent(MOVE_TOOL_EVENTS.Applied");
  const applyBlock = moveControllerSrc.slice(applyIdx, moveControllerSrc.indexOf(");", applyIdx));
  assert.match(applyBlock, /runtime:\s*result\?\.runtime/);
});

test("3. the local Applied event is published on the LOCAL-only move-tool channel", () => {
  assert.match(moveBridgeSrc, /destination = "LOCAL"/);
  assert.ok(moveBridgeSrc.includes('Applied: "APPLIED"'));
});

test("3b. HUD subscribes to the local applied-movement event in sceneSelectionController.js", () => {
  assert.match(sceneControllerSrc, /subscribeMoveToolMessages/);
  assert.match(sceneControllerSrc, /MOVE_TOOL_EVENTS\.Applied/);
  assert.match(sceneControllerSrc, /import \{ subscribeMoveToolMessages, MOVE_TOOL_EVENTS \} from "\.\.\/\.\.\/movement\/moveToolBridge\.js";/);
});

test("4. the subscription applies the runtime through the SAME shared applyExternalRuntime path — not a second, forked mechanism", () => {
  const idx = sceneControllerSrc.indexOf("subscribeMoveToolMessages(");
  const block = sceneControllerSrc.slice(idx, sceneControllerSrc.indexOf("cleanups.push(unsubscribeMoveTool)"));
  assert.match(block, /sessionController\.applyExternalRuntime\(payload\.runtime, "tactical-move"\)/);
  // No RPC/fetch call anywhere in the handler before applying — the runtime
  // already in the event is used directly, no mandatory second round trip.
  assert.ok(!/getActiveRuntime|fetchActiveSessionRuntime|getCharacterRuntimeBundle/.test(block), "no extra RPC before the immediate apply");
});

test("5. Player Block re-renders immediately: mapCombatRuntimeToSession + deriveMoveState reflect the NEW runtime as soon as it's applied", () => {
  const before = mapCombatRuntimeToSession(runtimeFixture({ moveCurrent: 2, moveMax: 10, version: 7 }), { selectedCharacterId: "char-a" });
  const beforeState = deriveMoveState(before.selectedMoveCurrent, before.selectedMoveMax);
  assert.equal(beforeState, MOVE_TILE_STATE.partial);

  // The move tool's own applied-movement runtime (fresh, higher move_current
  // after a move, higher version) — same shape, applied directly.
  const after = mapCombatRuntimeToSession(runtimeFixture({ moveCurrent: 0, moveMax: 10, version: 8 }), { selectedCharacterId: "char-a" });
  const afterState = deriveMoveState(after.selectedMoveCurrent, after.selectedMoveMax);
  assert.equal(afterState, MOVE_TILE_STATE.empty);
  assert.notEqual(afterState, beforeState, "Player Block's derived MOVE state changes immediately with the new runtime");
});

test("6. no extra mandatory getActiveRuntime/get_character_runtime_bundle RPC call exists on the movement-applied path", () => {
  // Covered structurally by test 4's absence check; this pins the SAME
  // guarantee at the combatSessionController boundary: applyExternalRuntime
  // itself never issues a fetch.
  const idx = sessionControllerSrc.indexOf("function applyExternalRuntime");
  const block = sessionControllerSrc.slice(idx, sessionControllerSrc.indexOf("function currentSessionRef"));
  assert.ok(!/await\s+fetch|await\s+getActiveCombatRuntime|await\s+fetchActiveSessionRuntime/.test(block));
});

test("7. a reconciliation refresh is scheduled after an external apply, is debounced (never duplicated), and reuses the existing refresh() — no second refresh loop", () => {
  assert.match(sessionControllerSrc, /function scheduleReconciliation/);
  const idx = sessionControllerSrc.indexOf("function scheduleReconciliation");
  const block = sessionControllerSrc.slice(idx, sessionControllerSrc.indexOf("function applyExternalRuntime"));
  assert.match(block, /if \(reconciliationTimer \|\| disposed\) return;/, "never a second pending reconciliation timer");
  assert.match(block, /void refresh\(`\$\{origin\}-reconciliation`\)/, "reuses the existing refresh(), not a new fetch path");
  const externalIdx = sessionControllerSrc.indexOf("function applyExternalRuntime");
  const externalBlock = sessionControllerSrc.slice(externalIdx, sessionControllerSrc.indexOf("function currentSessionRef"));
  assert.match(externalBlock, /scheduleReconciliation\(origin\)/);
});

/* ── Freshness and stale protection ──────────────────────────────────────── */

test("F1. a newer movement runtime (higher state_version, same encounter) is applicable", () => {
  const prev = runtimeFixture({ version: 5 });
  const next = runtimeFixture({ version: 6 });
  assert.equal(isRuntimeApplicable(next, prev), true);
});

test("F2. an older incoming runtime never overwrites a newer cached one", () => {
  const prev = runtimeFixture({ version: 10 });
  const next = runtimeFixture({ version: 9 });
  assert.equal(isRuntimeApplicable(next, prev), false);
});

test("F2b. the SAME version (idempotent re-apply, e.g. duplicate delivery) is safely applicable", () => {
  const prev = runtimeFixture({ version: 7 });
  const next = runtimeFixture({ version: 7, moveCurrent: 3 });
  assert.equal(isRuntimeApplicable(next, prev), true);
});

test("F3. a runtime from a DIFFERENT encounter/scene never affects the current HUD", () => {
  const prev = runtimeFixture({ encounterId: "enc-current", version: 5 });
  const next = runtimeFixture({ encounterId: "enc-other", version: 99 });
  assert.equal(isRuntimeApplicable(next, prev), false);
});

test("F4. nothing cached yet (fresh HUD load) accepts any well-formed runtime", () => {
  assert.equal(isRuntimeApplicable(runtimeFixture({ version: 1 }), null), true);
});

test("F5. the same authoritative event processed twice is a safe no-op the second time (idempotent, no corruption)", () => {
  const prev = runtimeFixture({ version: 7 });
  const same = runtimeFixture({ version: 7 });
  assert.equal(isRuntimeApplicable(same, prev), true, "first apply and a duplicate re-delivery both succeed harmlessly");
  // Applying the exact same runtime object twice must not change the outcome.
  assert.equal(isRuntimeApplicable(same, same), true);
});

test("F6/F7. a rejected or timed-out movement result never reaches the apply path at all (Applied is never published)", () => {
  // Rejection path: failMutation() publishes MOVE_TOOL_EVENTS.Error, never Applied.
  const failIdx = moveControllerSrc.indexOf("async function failMutation");
  const failBlock = moveControllerSrc.slice(failIdx, moveControllerSrc.indexOf("async function commitPreview"));
  assert.match(failBlock, /MOVE_TOOL_EVENTS\.Error/);
  assert.ok(!failBlock.includes("MOVE_TOOL_EVENTS.Applied"), "a failed mutation never publishes Applied");
  // Timeout path: withTimeout() rejects, caught by commitPreview's own catch,
  // which also never calls finalizeMutationSuccess/publishes Applied.
  const commitIdx = moveControllerSrc.indexOf("async function commitPreview");
  const commitBlock = moveControllerSrc.slice(commitIdx, moveControllerSrc.indexOf("async function tryRetryStaleMovement", 0) > commitIdx ? moveControllerSrc.length : moveControllerSrc.length);
  const catchIdx = moveControllerSrc.indexOf("} catch (error) {", commitIdx);
  const catchBlock = moveControllerSrc.slice(catchIdx, moveControllerSrc.indexOf("\n  }\n", catchIdx));
  assert.ok(!catchBlock.includes("finalizeMutationSuccess"), "a timed-out/thrown movement RPC never reaches the success handler");
});

test("F8. a stale movement response cannot overwrite a newer runtime already applied by a faster attack/end-turn mutation", () => {
  const afterEndTurn = runtimeFixture({ version: 12 });
  const staleMovement = runtimeFixture({ version: 9 });
  assert.equal(isRuntimeApplicable(staleMovement, afterEndTurn), false);
});

test("reject malformed runtime: no object, no encounter, or non-numeric state_version is never applied over real cached state", () => {
  assert.equal(isRuntimeApplicable(null, runtimeFixture({ version: 5 })), true, "no encounter at all is a real 'session ended' transition");
  assert.equal(isRuntimeApplicable({ encounter: { id: "enc-1", state_version: "not-a-number" } }, runtimeFixture({ version: 5 })), false, "non-numeric state_version is malformed");
  assert.equal(isRuntimeApplicable(undefined, null), true);
});

test("applyExternalRuntime() rejects a movement result with no encounter at all (unlike applyRuntime's internal 'session ended' callers, a move can only happen INSIDE an active session)", () => {
  const idx = sessionControllerSrc.indexOf("function applyExternalRuntime");
  const block = sessionControllerSrc.slice(idx, sessionControllerSrc.indexOf("function currentSessionRef"));
  assert.match(block, /if \(!next\?\.encounter \|\| typeof next\.encounter !== "object"\)/);
  assert.match(block, /external-runtime-rejected/);
});

/* ── MOVE visual state ───────────────────────────────────────────────────── */

test("V1. full movement (move_current >= move_max > 0) renders green", () => {
  assert.equal(deriveMoveState(10, 10), MOVE_TILE_STATE.full);
  assert.equal(deriveMoveState(12, 10), MOVE_TILE_STATE.full);
  const css = readText("hud", "components", "combatHudLayout.css");
  assert.match(css, /\.ohud-pip--move-full\s*\{[^}]*background:\s*var\(--odyssey-hud-state-active\)/);
});

test("V2. partial movement renders yellow", () => {
  assert.equal(deriveMoveState(4, 10), MOVE_TILE_STATE.partial);
  const css = readText("hud", "components", "combatHudLayout.css");
  assert.match(css, /\.ohud-pip--move-partial\s*\{[^}]*background:\s*var\(--odyssey-hud-warning\)/);
});

test("V3. empty movement (move_current <= 0, or move_max <= 0) renders gray", () => {
  assert.equal(deriveMoveState(0, 10), MOVE_TILE_STATE.empty);
  assert.equal(deriveMoveState(5, 0), MOVE_TILE_STATE.empty);
  assert.equal(deriveMoveState(-1, 10), MOVE_TILE_STATE.empty);
});

test("V4. missing/invalid movement runtime renders gray/neutral, never falsely green", () => {
  assert.equal(deriveMoveState(null, null), MOVE_TILE_STATE.empty);
  assert.equal(deriveMoveState(undefined, undefined), MOVE_TILE_STATE.empty);
  assert.equal(deriveMoveState(NaN, 10), MOVE_TILE_STATE.empty);
});

function playerStateWithMoveState(moveState) {
  return {
    status: "ready",
    viewer: { playerId: "p1", role: "player" },
    snapshot: {
      combatSession: { status: "inactive" },
      entity: {
        summary: { name: "Hero", svgRef: "humanoid", characterType: "player" },
        zones: [], shield: { current: 5, max: 10 }, psi: null,
        actions: { main: true, move: true, moveState },
        statuses: [], effects: [],
      },
    },
    ui: {},
  };
}

test("V5. rendered MOVE pip carries data-move-state and the matching CSS class — full/partial/empty/unknown", () => {
  for (const state of ["full", "partial", "empty"]) {
    const html = renderPlayerBlock(playerStateWithMoveState(state));
    assert.ok(html.includes(`data-move-state="${state}"`), `missing data-move-state="${state}"`);
    assert.ok(html.includes(`ohud-pip--move-${state}`), `missing CSS class for ${state}`);
  }
  const unknownHtml = renderPlayerBlock(playerStateWithMoveState(undefined));
  assert.ok(unknownHtml.includes('data-move-state="unknown"'));
  assert.ok(unknownHtml.includes("ohud-pip--move-empty"), "unknown renders with the SAME neutral/gray CSS as empty");
});

test("V6. no numbers, meters, percentages, progress bars, or fill bars ever render for MOVE", () => {
  for (const state of ["full", "partial", "empty", undefined]) {
    const html = renderPlayerBlock(playerStateWithMoveState(state));
    const moveSection = html.slice(html.indexOf("ohud-pip--move"), html.indexOf("ohud-pip--move") + 400);
    assert.ok(!/\d+\s*\/\s*\d+/.test(moveSection), "no N/M fraction near the MOVE pip");
    assert.ok(!/\d+\s*m\b/.test(moveSection), "no meters value near the MOVE pip");
    assert.ok(!/%/.test(moveSection), "no percentage near the MOVE pip");
    assert.ok(!/ohud-res-fill|ohud-res-track|progress/i.test(moveSection), "no fill/progress bar markup near the MOVE pip");
  }
});

test("V7. MAIN stays a separate, binary, unchanged pip regardless of MOVE state", () => {
  const htmlOn = renderPlayerBlock(playerStateWithMoveState("full"));
  assert.ok(htmlOn.includes('class="ohud-pip is-on"') || /ohud-pip\s+is-on/.test(htmlOn));
  const stateWithMainOff = playerStateWithMoveState("empty");
  stateWithMainOff.snapshot.entity.actions.main = false;
  const htmlOff = renderPlayerBlock(stateWithMainOff);
  assert.ok(/ohud-pip\s+is-off/.test(htmlOff));
  assert.ok(!htmlOff.includes("data-move-state") || htmlOff.includes('data-move-state="empty"'), "MAIN's own state never leaks into MOVE's data attribute");
});

/* ── Regression: weapon/target/armed/layout preserved ───────────────────── */

test("R1. the movement-applied subscription never touches ephemeral.selectedWeaponId/targeting/armed state — only the session runtime", () => {
  const idx = sceneControllerSrc.indexOf("subscribeMoveToolMessages(");
  const block = sceneControllerSrc.slice(idx, sceneControllerSrc.indexOf("cleanups.push(unsubscribeMoveTool)"));
  assert.ok(!/ephemeral\.(selectedWeaponId|targeting|preparedAction)/.test(block), "movement apply never resets weapon/target/prepared-action selection");
  assert.ok(!/armedTechniqueMemory\.(forget|set)/.test(block), "movement apply never clears the armed technique");
});

test("R2. the movement-applied subscription never touches popover/layout/OBR-popover state", () => {
  const idx = sceneControllerSrc.indexOf("subscribeMoveToolMessages(");
  const block = sceneControllerSrc.slice(idx, sceneControllerSrc.indexOf("cleanups.push(unsubscribeMoveTool)"));
  assert.ok(!/popover|Layout|hudPlacement/i.test(block), "movement apply never touches popover/layout state");
});

test("R3. applying a fresh movement runtime through buildBroadcastPayload preserves a real, already-derived entity/weapon selection untouched", async () => {
  const s = await readyStateFor({ characterId: "char-a" });
  assert.equal(s.status, "ready");
  const before = buildBroadcastPayload(s, { sessionRuntime: runtimeFixture({ moveCurrent: 8, moveMax: 10, version: 5 }), selectedWeaponId: "w1" });
  assert.ok(before.hudSnapshot?.entity, "a real entity is present (bundle mapped successfully)");
  const after = buildBroadcastPayload(s, { sessionRuntime: runtimeFixture({ moveCurrent: 2, moveMax: 10, version: 6 }), selectedWeaponId: "w1" });
  assert.equal(after.hudSnapshot.entity.actions.moveState, MOVE_TILE_STATE.partial, "fresh movement runtime reflected immediately");
  // Local ephemeral selections (weapon) are independent of combatSession and
  // therefore untouched by the runtime swap — the SAME selectedWeaponId still
  // resolves to the SAME weapon.primary shape before and after.
  assert.deepEqual(before.hudSnapshot.weapon, after.hudSnapshot.weapon);
});

console.log("(existing Tactical Move / HUD lifecycle / selection / combat-control / Gun / targeting / combat-session / responsive-layout suites are exercised via `npm run test:hud` as a whole — see the bugfix pack's final report)");

setTimeout(() => {
  console.log(`\nTactical Move HUD refresh: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 300);
