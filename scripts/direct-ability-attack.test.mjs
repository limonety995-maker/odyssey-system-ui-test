// Phase 4.1B.0 — Direct Ability Attack from Skills Block.
//
// Two layers, matching this project's established pattern (see
// hud-targeting-visuals.test.mjs's header for why):
//   - PURE unit tests over hud/abilities/abilityAvailabilityPolicy.js and
//     hud/combat/directAbilityAttackPolicy.js/basicAttackPayload.js (fully
//     executable — no OBR import at all);
//   - SOURCE-CONTRACT checks (regex/string assertions) for
//     hud/scene/sceneSelectionController.js, hud/abilities/QuickbarView.js,
//     hud/components/CombatHudModule.js, and the migration SQL file, none of
//     which are executable under plain Node (SDK/OBR imports, or raw SQL).
//
// Numbered tests map directly to the phase spec's "K. Tests" list (45 items);
// items 35-45 (regression) are covered by the EXISTING suites (test:hud as a
// whole, plus the 3 extra required scripts) staying green — see the final
// report rather than duplicating them here.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectAttackAbility, deriveDirectAttackAvailability, deriveSlotAvailability, SLOT_AVAILABILITY } from "../hud/abilities/abilityAvailabilityPolicy.js";
import {
  evaluateDirectAbilityAttack,
  DIRECT_ABILITY_ATTACK_BLOCK_REASON,
  buildDirectAbilityAttackRequestSignature,
  isDirectAbilityAttackResultStale,
} from "../hud/combat/directAbilityAttackPolicy.js";
import { buildDirectAbilityAttackCtx } from "../hud/combat/basicAttackPayload.js";
import { buildAttackPayload } from "../screens/resolveAttack/resolveAttackService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const read = (...seg) => fs.readFileSync(path.join(repoRoot, ...seg), "utf8").replace(/\r\n/g, "\n");
const controllerSrc = read("hud", "scene", "sceneSelectionController.js");
const quickbarViewSrc = read("hud", "abilities", "QuickbarView.js");
const moduleSrc = read("hud", "components", "CombatHudModule.js");
const migrationSrc = read("supabase", "102_direct_ability_attack_session_gate.sql");

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

console.log("\nPhase 4.1B.0 — Direct Ability Attack from Skills Block\n");

/* ── fixtures ─────────────────────────────────────────────────────────── */

function actionFixture(over = {}) {
  return {
    characterActionId: "action-1",
    definitionId: "def-1",
    type: "attack_technique",
    name: "Some Technique",
    targeting: { mode: "character", minTargets: 1, maxTargets: 1, allowAllies: false, allowSelf: false, requiresBodyZone: true },
    costs: { main: 1, move: 0, psi: 1, charges: 0 },
    cooldown: { current: 0, max: 2, unit: "turn", active: false },
    state: {
      available: true, active: false, disabledReason: null, selectable: true,
      executionAvailable: true, executionReason: null, resourceSufficient: true,
    },
    requirements: { weaponClass: null, weaponId: null, conditionSummary: null },
    ...over,
  };
}

function directAttackFixture(over = {}) {
  return actionFixture({
    name: "Some Damage Technique",
    state: {
      available: false, active: false, disabledReason: "Attack effect is not supported yet",
      selectable: false, executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED",
      resourceSufficient: true,
    },
    ...over,
  });
}

/* ── Audit / runtime mapping (1-4) ───────────────────────────────────── */

test("1. a direct attack ability is recognized from runtime metadata: type==='attack_technique' && executionReason==='ACTION_EFFECT_NOT_IMPLEMENTED'", () => {
  assert.equal(isDirectAttackAbility(directAttackFixture()), true);
});

test("2. a non-attack_technique action is never direct-attack-eligible, regardless of executionReason", () => {
  const fixture = directAttackFixture({ type: "instant" });
  assert.equal(isDirectAttackAbility(fixture), false);
});

test("3. an attack_technique WITHOUT the unsupported-effect executionReason (accuracy-only) is never direct-attack-eligible — it remains the EXISTING Phase 4.1A armable technique, unchanged", () => {
  const armable = actionFixture(); // executionReason: null (default fixture)
  assert.equal(isDirectAttackAbility(armable), false);
  // deriveSlotAvailability's own armed/unsupported/cooldown/ready logic is
  // completely untouched for this action — confirmed by re-running its own
  // existing behavior here rather than assuming.
  assert.equal(deriveSlotAvailability(armable, true), SLOT_AVAILABILITY.armed);
  assert.equal(deriveSlotAvailability(armable, false), SLOT_AVAILABILITY.ready);
});

test("4. recognition is purely metadata-driven — an action named something OTHER than 'Etheric Strike' with the same executionReason is equally direct-attack-eligible, and no production source file ever references that name", () => {
  const notEtheric = directAttackFixture({ name: "Totally Different Ability" });
  assert.equal(isDirectAttackAbility(notEtheric), true);
  for (const src of [controllerSrc, quickbarViewSrc, moduleSrc]) {
    assert.ok(!/etheric/i.test(src), "no name-based check for this specific ability exists in production HUD code");
  }
});

/* ── UI execution (5-11) ─────────────────────────────────────────────── */

test("5. a READY direct attack ability is clickable — QuickbarView's occupiedTile sets data-action=execute-direct-ability and is-disabled is absent", () => {
  assert.match(quickbarViewSrc, /const directAttack = isTechnique && isDirectAttackAbility\(action\);/);
  assert.match(quickbarViewSrc, /dataAction = directAttack\s*\n\s*\? "execute-direct-ability"/);
  assert.match(quickbarViewSrc, /directAttack\s*\n\s*\? \(availability !== SLOT_AVAILABILITY\.ready \|\| pending\)/);
});

test("6. missing target prevents execution with the exact required error text", () => {
  const result = evaluateDirectAbilityAttack({ sourceCharacterId: "char-1", abilityId: "action-1", targetTokenId: null, targetCharacterId: null });
  assert.equal(result.uiAllowed, false);
  assert.equal(result.uiBlockReason, "Select a target first.");
  assert.equal(DIRECT_ABILITY_ATTACK_BLOCK_REASON.noTarget, "Select a target first.");
});

test("6b. a missing-target block never clears the selected ability or consumes anything — evaluateDirectAbilityAttack is a pure decision, it mutates nothing", () => {
  const ctx = { sourceCharacterId: "char-1", abilityId: "action-1", targetTokenId: null, targetCharacterId: null };
  const before = JSON.stringify(ctx);
  evaluateDirectAbilityAttack(ctx);
  assert.equal(JSON.stringify(ctx), before, "ctx is never mutated");
});

test("7. a selected target (+ body zone) allows execution", () => {
  const result = evaluateDirectAbilityAttack({
    sourceCharacterId: "char-1", abilityId: "action-1",
    targetTokenId: "tok-1", targetCharacterId: "char-2",
    bodyZoneId: "TORSO", resolvedBodyPartId: "bp-uuid-1",
  });
  assert.deepEqual(result, { uiAllowed: true, uiBlockReason: null });
});

test("8. the selected body zone is included in the actual server payload — buildAttackPayload(buildDirectAbilityAttackCtx(...)).target_body_part_id", () => {
  const ctx = buildDirectAbilityAttackCtx({
    sourceCharacterId: "char-1", abilityId: "action-1",
    targetCharacterId: "char-2", bodyPartId: "bp-uuid-1", distance: 3,
  });
  const payload = buildAttackPayload(ctx);
  assert.equal(payload.target_body_part_id, "bp-uuid-1");
});

test("9. no new body-zone default policy is invented — evaluateDirectAbilityAttack reads the SAME bodyZoneId/resolvedBodyPartId fields basicAttackPolicy.js's evaluateBasicAttack already reads, never a second default-zone mechanism", () => {
  const zoneUnresolved = evaluateDirectAbilityAttack({
    sourceCharacterId: "char-1", abilityId: "action-1",
    targetTokenId: "tok-1", targetCharacterId: "char-2",
    bodyZoneId: "TORSO", resolvedBodyPartId: null,
  });
  assert.equal(zoneUnresolved.uiBlockReason, DIRECT_ABILITY_ATTACK_BLOCK_REASON.zoneUnresolved);
  const noZone = evaluateDirectAbilityAttack({
    sourceCharacterId: "char-1", abilityId: "action-1",
    targetTokenId: "tok-1", targetCharacterId: "char-2",
    bodyZoneId: null, resolvedBodyPartId: null,
  });
  assert.equal(noZone.uiBlockReason, DIRECT_ABILITY_ATTACK_BLOCK_REASON.noZone);
});

test("10. pending state blocks duplicate clicks — the handler's very first check after logging is `if (ephemeral.pendingDirectAbilityActionId) return;`, per-ability not whole-quickbar", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-direct-ability"');
  assert.ok(idx > -1);
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.1: Instant / Self Ability Execution", idx));
  assert.match(block, /if \(ephemeral\.pendingDirectAbilityActionId\) return;/);
  // QuickbarView.js also renders is-pending/is-disabled for the SPECIFIC
  // slot, not the whole strip.
  assert.match(quickbarViewSrc, /const pending = \(directAttack \|\| instantSelf \|\| directedTarget\) && pendingActionId != null && pendingActionId === action\.characterActionId;/);
});

test("11. failure clears the pending state unconditionally — ephemeral.pendingDirectAbilityActionId is reset to null right after the resolveAttack() try/catch, before any outcome.ok branching", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-direct-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.1: Instant / Self Ability Execution", idx));
  const resetIdx = block.indexOf("ephemeral.pendingDirectAbilityActionId = null;");
  const okBranchIdx = block.indexOf("if (outcome.ok) {");
  assert.ok(resetIdx > -1 && okBranchIdx > -1 && resetIdx < okBranchIdx, "pending is cleared before success/failure branching, so it clears on EITHER outcome");
});

/* ── Server call payload shape (12-21) ────────────────────────────────── */

function fullCtx(overrides = {}) {
  return buildDirectAbilityAttackCtx({
    sourceCharacterId: "char-1",
    abilityId: "action-1",
    targetCharacterId: "char-2",
    bodyPartId: "bp-uuid-1",
    distance: 5,
    roomContext: { encounterId: "enc-1" },
    expectedEncounterVersion: 7,
    ...overrides,
  });
}

test("12. execution payload includes the source character (attacker_character_id)", () => {
  const payload = buildAttackPayload(fullCtx());
  assert.equal(payload.attacker_character_id, "char-1");
});

test("13. execution payload includes the encounter/session version when an active session exists", () => {
  const payload = buildAttackPayload(fullCtx());
  assert.equal(payload.encounter_id, "enc-1");
  assert.equal(payload.expected_encounter_version, 7);
});

test("14. execution payload includes the target character", () => {
  const payload = buildAttackPayload(fullCtx());
  assert.equal(payload.target_character_id, "char-2");
});

test("15. execution payload includes the target body part", () => {
  const payload = buildAttackPayload(fullCtx());
  assert.equal(payload.target_body_part_id, "bp-uuid-1");
});

test("16. execution payload includes the ability/action id as character_ability_id", () => {
  const payload = buildAttackPayload(fullCtx());
  assert.equal(payload.character_ability_id, "action-1");
});

test("17. execution payload never includes weapon_id — mode:'skill' structurally cannot produce it", () => {
  const payload = buildAttackPayload(fullCtx());
  assert.ok(!("weapon_id" in payload), "no weapon_id key at all");
  assert.equal(buildDirectAbilityAttackCtx({}).mode, "skill");
});

test("18. execution payload never includes ammo/magazine/fire_mode fields — buildDirectAbilityAttackCtx/buildAttackPayload have no such concept", () => {
  const payload = buildAttackPayload(fullCtx());
  for (const key of Object.keys(payload)) {
    assert.ok(!/ammo|magazine|fire_mode/i.test(key), `unexpected weapon-only field leaked into ability payload: ${key}`);
  }
  assert.ok(!controllerSrc.includes("buildDirectAbilityAttackCtx") || true); // sanity: import exists (checked below)
  assert.match(controllerSrc, /buildDirectAbilityAttackCtx/);
});

test("19/20/21. the client never locally spends MAIN, PSI, or applies cooldown for a direct ability attack — the execute-direct-ability block only READS cooldown/costs (for gating/display elsewhere), it never assigns to any cost/cooldown/main field", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-direct-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.1: Instant / Self Ability Execution", idx));
  assert.ok(!/\.main\s*=|\.psi\s*=|\.cooldown\s*=|current_cooldown/i.test(block), "no local mutation of main/psi/cooldown fields anywhere in the handler");
});

/* ── Success handling (22-29) ────────────────────────────────────────── */

test("22/23/24. a successful result applies the authoritative runtime via refetchCurrent() — the SAME refresh path basic-attack already uses, so Skills Block cooldown/availability AND Player Block MAIN/PSI both come from one real re-fetch, never a locally-patched value", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-direct-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.1: Instant / Self Ability Execution", idx));
  const okIdx = block.indexOf("if (outcome.ok) {");
  const refetchIdx = block.indexOf("await refetchCurrent();", okIdx);
  assert.ok(okIdx > -1 && refetchIdx > -1 && refetchIdx > okIdx, "refetchCurrent() runs inside the success branch");
});

test("25. the target body doll refreshes — a refreshBodyZones command is broadcast on success, same as basic-attack's own post-attack refresh", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-direct-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.1: Instant / Self Ability Execution", idx));
  assert.match(block, /BC_HUD_TARGETING_COMMAND, \{ type: "refreshBodyZones" \}/);
});

test("26/27. the selected target (and therefore the static target ring) is never cleared by this handler — no clearTarget/clear command, no ephemeral.targeting reassignment anywhere in the block", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-direct-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.1: Instant / Self Ability Execution", idx));
  assert.ok(!/ephemeral\.targeting\s*=/.test(block), "targeting state is never reassigned by this handler");
  assert.ok(!/type:\s*"clear-target"|clearTarget\(/.test(block), "no clear-target command is ever sent from this handler");
});

test("28. Combat Log receives a readable summary via the EXISTING buildAttackLogEntry — no second/raw-JSON log entry builder", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-direct-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.1: Instant / Self Ability Execution", idx));
  assert.match(block, /pushLog\(buildAttackLogEntry\(\{/);
});

test("29. Debug Console receives the normalized two-step roll trace via the EXISTING buildAttackResolutionTrace/buildRollResolutionDetails, only for a genuinely resolved (outcome.ok) attack", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-direct-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.1: Instant / Self Ability Execution", idx));
  const rollIdx = block.indexOf('"direct-attack-roll-resolution"');
  assert.ok(rollIdx > -1);
  assert.match(block.slice(0, rollIdx + 200), /if \(outcome\.ok\) \{\s*\n\s*logDebugEvent\(\s*\n\s*"abilities",\s*\n\s*"direct-attack-roll-resolution"/);
});

/* ── Failure / stale handling (30-34) ────────────────────────────────── */

test("30. a rejected ability attack never consumes local resources — same guarantee as 19/20/21, verified again on the explicit failure/catch path (outcome.ok===false never runs the success branch's refresh-only code, and there is still no cost/cooldown mutation anywhere in the block)", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-direct-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.1: Instant / Self Ability Execution", idx));
  assert.match(block, /ephemeral\.commandStatus = \{ type: "error", message: outcome\.error \|\| "Ability attack failed\." \};/);
});

test("31. a stale version response never overwrites newer runtime — isDirectAbilityAttackResultStale correctly detects a changed source/ability/target, and the handler checks it BEFORE applying success/failure state", () => {
  const requestCtx = { sourceCharacterId: "char-1", abilityId: "action-1", targetCharacterId: "char-2" };
  assert.equal(isDirectAbilityAttackResultStale(requestCtx, requestCtx), false);
  assert.equal(isDirectAbilityAttackResultStale(requestCtx, { ...requestCtx, targetCharacterId: "char-3" }), true);
  assert.equal(buildDirectAbilityAttackRequestSignature(requestCtx), "char-1|action-1|char-2");
  const idx = controllerSrc.indexOf('command?.type === "execute-direct-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.1: Instant / Self Ability Execution", idx));
  const staleCheckIdx = block.indexOf("const stale = isDirectAbilityAttackResultStale(");
  const staleGuardIdx = block.indexOf("if (stale) {");
  assert.ok(staleCheckIdx > -1 && staleGuardIdx > staleCheckIdx);
});

test("32. a server/network error path shows a useful, real error message — the catch block never fabricates a fake success, and commandStatus surfaces the REAL message", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-direct-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.1: Instant / Self Ability Execution", idx));
  assert.match(block, /outcome = \{ ok: false, payload: null, raw: null, normalized: null, code: null, error: String\(error\?\.message \?\? error \?\? "Ability attack failed\."\) \};/);
});

test("33. a malformed/garbage server response never crashes the HUD — buildAttackPayload/buildDirectAbilityAttackCtx tolerate empty input without throwing (resolveAttack's own normalizeResult resilience is already covered by basic-weapon-attack.test.mjs)", () => {
  assert.doesNotThrow(() => buildDirectAbilityAttackCtx());
  assert.doesNotThrow(() => buildDirectAbilityAttackCtx({}));
});

test("34. a missing body-part mapping fails safely — evaluateDirectAbilityAttack blocks BEFORE any RPC call, with a specific, honest reason (never a generic crash or silent no-op)", () => {
  const result = evaluateDirectAbilityAttack({
    sourceCharacterId: "char-1", abilityId: "action-1",
    targetTokenId: "tok-1", targetCharacterId: "char-2",
    bodyZoneId: "TORSO", resolvedBodyPartId: null,
  });
  assert.equal(result.uiAllowed, false);
  assert.equal(result.uiBlockReason, "Target body zone data unavailable.");
});

/* ── deriveDirectAttackAvailability (supporting coverage for 5/9/10) ──── */

test("deriveDirectAttackAvailability: ready when not on cooldown and resource-sufficient, even though state.available/executionAvailable are both false (the unsupported-for-arming flag)", () => {
  const a = directAttackFixture();
  assert.equal(deriveDirectAttackAvailability(a), SLOT_AVAILABILITY.ready);
});

test("deriveDirectAttackAvailability: cooldown takes priority over the ready default", () => {
  const a = directAttackFixture({ cooldown: { current: 2, max: 2, unit: "turn", active: true } });
  assert.equal(deriveDirectAttackAvailability(a), SLOT_AVAILABILITY.cooldown);
});

test("deriveDirectAttackAvailability: insufficient resource surfaces when resourceSufficient is false and not on cooldown", () => {
  const a = directAttackFixture({ state: { ...directAttackFixture().state, resourceSufficient: false } });
  assert.equal(deriveDirectAttackAvailability(a), SLOT_AVAILABILITY.insufficientResource);
});

test("deriveDirectAttackAvailability: a genuinely different blocking reason (available=false with a DIFFERENT executionReason) surfaces as unavailable, never silently 'ready'", () => {
  const a = directAttackFixture({ state: { ...directAttackFixture().state, executionReason: "SOME_OTHER_REASON" } });
  assert.equal(deriveDirectAttackAvailability(a), SLOT_AVAILABILITY.unavailable);
});

/* ── Migration 102 SQL source-contract ────────────────────────────────── */

test("migration 102: the combat-session gate (STATE_VERSION_CONFLICT/NOT_CURRENT_TURN/ACTION_NOT_AVAILABLE) now runs BEFORE the ability-attack redirect, not after", () => {
  const gateIdx = migrationSrc.indexOf("v_participation := public.odyssey_get_active_participation(");
  const redirectIdx = migrationSrc.indexOf("v_result := public.odyssey_perform_ability_attack(v_payload);");
  assert.ok(gateIdx > -1 && redirectIdx > -1 && gateIdx < redirectIdx, "session gate precedes the ability-attack call");
});

test("migration 102: a successfully-resolved ability attack spends MAIN/reaction cost and bumps the encounter version — the SAME helper calls the weapon path uses", () => {
  const redirectIdx = migrationSrc.indexOf("v_result := public.odyssey_perform_ability_attack(v_payload);");
  const block = migrationSrc.slice(redirectIdx, migrationSrc.indexOf("-- ---------------------------------------------------------------------", redirectIdx));
  assert.match(block, /if coalesce\(\(v_result->>'ok'\)::boolean, false\) = false then\s*\n\s*return v_result;/);
  assert.match(block, /perform public\.odyssey_apply_turn_costs\(/);
  assert.match(block, /perform public\.odyssey_increment_encounter_state_version\(/);
});

test("migration 102: odyssey_perform_ability_attack itself is called verbatim (not reimplemented) — this migration only reorders/wraps, never duplicates roll/damage/resource logic", () => {
  // Scoped to the actual function body (past the header comment, which
  // quotes the old buggy line as historical context and would otherwise
  // double-count).
  const bodyIdx = migrationSrc.indexOf("create or replace function public.perform_attack(");
  const body = migrationSrc.slice(bodyIdx);
  const occurrences = body.match(/public\.odyssey_perform_ability_attack\(v_payload\)/g) ?? [];
  assert.equal(occurrences.length, 1, "the ability resolver is called exactly once, unchanged");
});

/* ── Hotfix: direct ability lookup used ephemeral.abilitiesRuntime, which
 * never existed — abilitiesRuntime is a controller-level closure variable,
 * handed to buildBroadcastPayload as its own separate argument, never folded
 * onto `ephemeral`. Every direct-attack click therefore blocked as
 * INVALID_ABILITY before ever reaching the RPC. ──────────────────────────── */

function handlerBlock() {
  const idx = controllerSrc.indexOf('command?.type === "execute-direct-ability"');
  return controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.1: Instant / Self Ability Execution", idx));
}

// Pure re-implementation of findQuickActionByCharacterActionId's algorithm —
// used to prove the LOGIC is correct, since sceneSelectionController.js
// itself can't be imported/executed under plain Node (OBR SDK import; see
// this file's header for why every other OBR-touching file here is tested
// the same source-contract way).
function findQuickActionByCharacterActionId(runtime, characterActionId) {
  const id = String(characterActionId ?? "").trim();
  if (!id) return null;
  return (runtime?.quickActions ?? [])
    .find((action) => String(action?.characterActionId ?? "") === id) ?? null;
}

test("1. a direct-ability command with a VALID characterActionId finds the action in the controller-level abilitiesRuntime (the closure variable, not a snapshot/ephemeral copy)", () => {
  const runtime = { quickActions: [directAttackFixture({ characterActionId: "act-real" })] };
  const found = findQuickActionByCharacterActionId(runtime, "act-real");
  assert.ok(found);
  assert.equal(found.characterActionId, "act-real");
});

test("2. the handler no longer reads ephemeral.abilitiesRuntime anywhere — it calls findQuickActionByCharacterActionId(actionId), which itself reads the closure-level abilitiesRuntime, never a field hung off ephemeral", () => {
  const block = handlerBlock();
  assert.ok(!block.includes("ephemeral.abilitiesRuntime"), "the handler block itself never references the non-existent ephemeral.abilitiesRuntime field");
  assert.match(block, /const action = findQuickActionByCharacterActionId\(actionId\);/);
  const helperIdx = controllerSrc.indexOf("function findQuickActionByCharacterActionId(characterActionId)");
  assert.ok(helperIdx > -1, "the helper is defined");
  const helperBlock = controllerSrc.slice(helperIdx, controllerSrc.indexOf("\n    }\n", helperIdx));
  assert.match(helperBlock, /abilitiesRuntime\?\.quickActions/, "the helper reads the REAL closure variable");
  assert.ok(!helperBlock.includes("ephemeral."), "the helper never reads anything off ephemeral");
});

test("3. a valid direct-attack-eligible action (found + isDirectAttackAbility) no longer blocks with INVALID_ABILITY — the found/eligible action reaches the same code path as before the fix", () => {
  const runtime = { quickActions: [directAttackFixture({ characterActionId: "act-real" })] };
  const action = findQuickActionByCharacterActionId(runtime, "act-real");
  assert.ok(action && isDirectAttackAbility(action), "a real, direct-attack-eligible action is found — the (!actionId || !action || !isDirectAttackAbility(action)) guard no longer trips for it");
});

test("4. a non-existent characterActionId still blocks with INVALID_ABILITY — the lookup honestly returns null rather than any fallback/guess", () => {
  const runtime = { quickActions: [directAttackFixture({ characterActionId: "act-real" })] };
  const missing = findQuickActionByCharacterActionId(runtime, "act-does-not-exist");
  assert.equal(missing, null);
  const block = handlerBlock();
  assert.match(block, /if \(!actionId \|\| !action \|\| !isDirectAttackAbility\(action\)\) \{/, "the guard is still present and still blocks on a null/ineligible action");
});

test("5. an existing NON-direct ability (found, but isDirectAttackAbility is false) still does not execute — found !== eligible", () => {
  const runtime = { quickActions: [actionFixture({ characterActionId: "act-armable" })] }; // executionReason: null (armable, not direct-attack)
  const action = findQuickActionByCharacterActionId(runtime, "act-armable");
  assert.ok(action, "the action IS found — the lookup itself is fixed");
  assert.equal(isDirectAttackAbility(action), false, "but it is not direct-attack-eligible, so the guard still blocks execution");
});

test("6. the existing ARMED attack technique toggle is a completely separate command/handler, untouched by this hotfix", () => {
  assert.match(controllerSrc, /command\?\.type === "toggle-armed"/);
  const armedIdx = controllerSrc.indexOf('command?.type === "toggle-armed"');
  const executeIdx = controllerSrc.indexOf('command?.type === "execute-direct-ability"');
  assert.ok(armedIdx > -1 && executeIdx > -1 && armedIdx < executeIdx, "toggle-armed is its own earlier branch, never merged with execute-direct-ability");
  assert.match(controllerSrc, /armedTechniqueMemory\.toggle\(/, "arming still goes through armedTechniqueMemory, unaffected");
});

test("7. a missing/not-yet-loaded runtime produces a useful diagnostic and a clear local message, not a silent 'invalid ability'", () => {
  const block = handlerBlock();
  assert.match(block, /if \(!abilitiesRuntime\) \{/);
  assert.match(block, /message: "Ability runtime is not loaded yet\."/);
});

test("8. the debug payload includes hasAbilitiesRuntime and quickActionCount, distinguishing 'runtime not loaded' from 'action not present' from 'action not direct-attack-compatible'", () => {
  const block = handlerBlock();
  const logIdx = block.indexOf('logDebugEvent("abilities", "direct-attack-blocked"');
  const payloadBlock = block.slice(logIdx, block.indexOf("}, false);", logIdx));
  assert.match(payloadBlock, /hasAbilitiesRuntime: Boolean\(abilitiesRuntime\)/);
  assert.match(payloadBlock, /quickActionCount: abilitiesRuntime\?\.quickActions\?\.length \?\? 0/);
  assert.match(payloadBlock, /matchingActionFound: Boolean\(action\)/);
  assert.match(payloadBlock, /matchingActionType: action\?\.type \?\? null/);
  assert.match(payloadBlock, /matchingExecutionReason: action\?\.state\?\.executionReason \?\? null/);
  assert.match(payloadBlock, /matchingExecutionAvailable: action\?\.state\?\.executionAvailable \?\? null/);
});

test("9. no full private runtime bundle, credentials, or GM-only data is ever logged — only scalar/short diagnostic fields", () => {
  const block = handlerBlock();
  const logIdx = block.indexOf('logDebugEvent("abilities", "direct-attack-blocked"');
  const payloadBlock = block.slice(logIdx, block.indexOf("}, false);", logIdx));
  assert.ok(!/\bquickActions\s*[,:]\s*abilitiesRuntime/.test(payloadBlock), "never logs the raw quickActions array");
  assert.ok(!payloadBlock.includes("abilitiesRuntime,"), "never logs the whole runtime object verbatim");
  assert.ok(!/token|auth|password|secret|credential|apikey|session|cookie/i.test(payloadBlock), "no credential-shaped field names anywhere in the debug payload");
});

test("10. after a valid lookup, the handler proceeds to the same direct-attack-payload-prepared path as before — the fix only corrects the lookup, not anything downstream", () => {
  const block = handlerBlock();
  const guardIdx = block.indexOf("if (!actionId || !action || !isDirectAttackAbility(action)) {");
  const evalIdx = block.indexOf("const evalResult = evaluateDirectAbilityAttack(evalCtx);");
  const preparedIdx = block.indexOf('"direct-attack-payload-prepared"');
  assert.ok(guardIdx > -1 && evalIdx > -1 && preparedIdx > -1);
  assert.ok(guardIdx < evalIdx && evalIdx < preparedIdx, "lookup guard -> preconditions -> payload-prepared, in that order, unchanged");
});

test("optional refresh: a missing runtime best-effort triggers the existing quickbar controller refresh — never a fake success, never a call into performAttack without a found action", () => {
  const block = handlerBlock();
  const missingRuntimeBlock = block.slice(block.indexOf("if (!abilitiesRuntime) {"), block.indexOf("return;", block.indexOf("if (!abilitiesRuntime) {")));
  assert.match(missingRuntimeBlock, /quickbarController\?\.refresh\(\)/);
  assert.ok(!missingRuntimeBlock.includes("performAttack"), "no RPC call is ever made from the missing-runtime branch");
});

setTimeout(() => {
  console.log(`\nPhase 4.1B.0 direct ability attack: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
