// Phase 4.1B.2 — Directed Target Abilities from Skills Block.
//
// Two layers, matching this project's established pattern:
//   - PURE unit tests over hud/abilities/abilityAvailabilityPolicy.js,
//     hud/combat/directedAbilityPolicy.js, hud/combat/directedAbilityPayload.js,
//     hud/log/combatResultLogPolicy.js (fully executable — no OBR import);
//   - SOURCE-CONTRACT checks (regex/string assertions) for
//     hud/scene/sceneSelectionController.js, hud/abilities/QuickbarView.js,
//     hud/components/CombatHudModule.js — none executable under plain Node
//     (SDK/OBR imports).
//
// No compatible directed-target ability exists in current seed data (see
// docs/PHASE_4_1B_2_DIRECTED_TARGET_ABILITIES_AUDIT.md §3) — every test here
// uses a mocked runtime fixture, the same two-layer pattern every OBR-
// touching change in this codebase already uses.
//
// Numbered tests map to the phase spec's "Tests" list (51 items); items
// 39-51 (regression) are covered by the EXISTING suites (test:hud as a
// whole, plus the 3 extra required scripts) staying green — see the final
// report rather than duplicating them here.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isDirectedTargetAbility, isDirectAttackAbility, isInstantSelfAbility,
  deriveSlotAvailability, SLOT_AVAILABILITY,
} from "../hud/abilities/abilityAvailabilityPolicy.js";
import {
  evaluateDirectedAbilityExecution, DIRECTED_ABILITY_BLOCK_REASON,
  buildDirectedAbilityRequestSignature, isDirectedAbilityResultStale,
} from "../hud/combat/directedAbilityPolicy.js";
import { buildDirectedAbilityExecutionPayload, normalizeDirectedAbilityResult } from "../hud/combat/directedAbilityPayload.js";
import { buildDirectedAbilityLogEntry, LOG_TYPE, LOG_OUTCOME } from "../hud/log/combatResultLogPolicy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const read = (...seg) => fs.readFileSync(path.join(repoRoot, ...seg), "utf8").replace(/\r\n/g, "\n");
const controllerSrc = read("hud", "scene", "sceneSelectionController.js");
const quickbarViewSrc = read("hud", "abilities", "QuickbarView.js");
const moduleSrc = read("hud", "components", "CombatHudModule.js");

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

console.log("\nPhase 4.1B.2 — Directed Target Abilities from Skills Block\n");

/* ── fixtures ─────────────────────────────────────────────────────────── */

function directedTargetFixture(over = {}) {
  return {
    characterActionId: "ability-1",
    definitionId: "def-1",
    type: "directed",
    name: "Some Directed Ability",
    semanticKind: "utility",
    targeting: { mode: "character", minTargets: 1, maxTargets: 1, allowAllies: true, allowSelf: false, requiresBodyZone: false },
    costs: { main: 1, move: 0, psi: 2, charges: 0 },
    cooldown: { current: 0, max: 2, unit: "turn", active: false },
    state: {
      available: true, active: false, disabledReason: null, selectable: true,
      executionAvailable: true, executionReason: null, resourceSufficient: true,
    },
    requirements: { weaponClass: null, weaponId: null, conditionSummary: null },
    ...over,
  };
}

function instantSelfFixture(over = {}) {
  return directedTargetFixture({
    type: "instant",
    targeting: { mode: "self", minTargets: 1, maxTargets: 1, allowAllies: true, allowSelf: true, requiresBodyZone: false },
    ...over,
  });
}

function directAttackFixture(over = {}) {
  return directedTargetFixture({
    type: "attack_technique",
    targeting: { mode: "body_part", minTargets: 1, maxTargets: 1, allowAllies: false, allowSelf: false, requiresBodyZone: true },
    state: { available: false, active: false, disabledReason: "Attack effect is not supported yet", selectable: false, executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true },
    ...over,
  });
}

function armableTechniqueFixture(over = {}) {
  return directedTargetFixture({
    type: "attack_technique",
    targeting: { mode: "character", minTargets: 1, maxTargets: 1, allowAllies: false, allowSelf: false, requiresBodyZone: false },
    ...over,
  });
}

/* ── Runtime classification (1-6) ─────────────────────────────────────── */

test("1. a direct-attack-eligible action (Phase 4.1B.0) remains direct attack, never directed-target", () => {
  const a = directAttackFixture();
  assert.equal(isDirectAttackAbility(a), true);
  assert.equal(isDirectedTargetAbility(a), false);
});

test("2. an instant/self ability (Phase 4.1B.1) remains instant/self, never directed-target", () => {
  const a = instantSelfFixture();
  assert.equal(isInstantSelfAbility(a), true);
  assert.equal(isDirectedTargetAbility(a), false);
});

test("3. an armable (accuracy-only) attack_technique remains on the ARMED flow — never directed-target-eligible", () => {
  const a = armableTechniqueFixture();
  assert.equal(isDirectedTargetAbility(a), false);
  assert.equal(deriveSlotAvailability(a, true), SLOT_AVAILABILITY.armed);
});

test("4. a directed target ability is recognized from metadata: type==='directed' && targeting.requiresBodyZone !== true", () => {
  assert.equal(isDirectedTargetAbility(directedTargetFixture()), true);
});

test("5. a 'directed' action that ALSO requires a body zone (target_type='body_part', non-attack) remains OUT of this phase's scope — not directed-target-eligible", () => {
  const bodyZoneDirected = directedTargetFixture({ targeting: { mode: "body_part", minTargets: 1, maxTargets: 1, allowAllies: true, allowSelf: false, requiresBodyZone: true } });
  assert.equal(isDirectedTargetAbility(bodyZoneDirected), false);
  // Still correctly disabled/unsupported via the UNCHANGED deriveSlotAvailability if the server ever flags it so.
  const unsupported = directedTargetFixture({
    targeting: { mode: "body_part", minTargets: 1, maxTargets: 1, allowAllies: true, allowSelf: false, requiresBodyZone: true },
    state: { available: false, active: false, disabledReason: "Attack effect is not supported yet", selectable: false, executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true },
  });
  assert.equal(deriveSlotAvailability(unsupported, false), SLOT_AVAILABILITY.unsupported);
});

test("6. recognition is purely metadata-driven — no ability name is ever checked", () => {
  const notNamed = directedTargetFixture({ name: "Something Entirely Different" });
  assert.equal(isDirectedTargetAbility(notNamed), true);
  for (const src of [controllerSrc, quickbarViewSrc, moduleSrc]) {
    assert.ok(!/mind.spike/i.test(src), "no name-based check for any specific directed ability exists in production HUD code");
  }
});

/* ── UI behavior (7-17) ───────────────────────────────────────────────── */

test("7. a READY directed target ability is clickable — QuickbarView's occupiedTile sets data-action=execute-directed-ability", () => {
  assert.match(quickbarViewSrc, /const directedTarget = !isTechnique && !instantSelf && isDirectedTargetAbility\(action\);/);
  assert.match(quickbarViewSrc, /directedTarget\s*\n\s*\? "execute-directed-ability"/);
});

test("8. a directed target ability requires a selected target character — evaluateDirectedAbilityExecution blocks without one", () => {
  const result = evaluateDirectedAbilityExecution({ sourceCharacterId: "char-1", abilityId: "ability-1", targetTokenId: null, targetCharacterId: null, sessionExists: true });
  assert.equal(result.uiAllowed, false);
  assert.equal(result.uiBlockReason, DIRECTED_ABILITY_BLOCK_REASON.noTarget);
});

test("9. a directed target ability does NOT require a body zone — evaluateDirectedAbilityExecution has no body-zone parameter/check at all", () => {
  const result = evaluateDirectedAbilityExecution({
    sourceCharacterId: "char-1", abilityId: "ability-1",
    targetTokenId: "tok-1", targetCharacterId: "char-2",
    sessionExists: true,
  });
  assert.deepEqual(result, { uiAllowed: true, uiBlockReason: null });
  // Checks actual PARAMETER/VARIABLE identifiers, not prose — the function's
  // own comment legitimately explains (in prose) that there is deliberately
  // no body-zone check, which must not itself fail this check.
  const src = read("hud", "combat", "directedAbilityPolicy.js");
  const body = src.slice(src.indexOf("export function evaluateDirectedAbilityExecution"));
  assert.ok(!/bodyZoneId|resolvedBodyPartId|targetBodyPartId/.test(body), "no body-zone-related parameter/variable anywhere in the actual evaluation function");
});

test("10. missing target blocks with the exact required error text", () => {
  const result = evaluateDirectedAbilityExecution({ sourceCharacterId: "char-1", abilityId: "ability-1", sessionExists: true });
  assert.equal(result.uiBlockReason, "Select a target first.");
});

test("11. missing body zone does NOT block directed ability execution — a selected target with no zone concept at all still allows execution", () => {
  const result = evaluateDirectedAbilityExecution({
    sourceCharacterId: "char-1", abilityId: "ability-1",
    targetTokenId: "tok-1", targetCharacterId: "char-2",
    sessionExists: true,
    // Deliberately no bodyZoneId/resolvedBodyPartId field at all — the function has no such param.
  });
  assert.equal(result.uiAllowed, true);
});

test("12. missing source character blocks execution", () => {
  const result = evaluateDirectedAbilityExecution({ sourceCharacterId: null, abilityId: "ability-1", targetCharacterId: "char-2", sessionExists: true });
  assert.equal(result.uiAllowed, false);
  assert.equal(result.uiBlockReason, DIRECTED_ABILITY_BLOCK_REASON.noCharacter);
});

test("13. not-in-an-active-encounter blocks locally, and the handler reuses the EXISTING generic sessionAttackGate for turn/MAIN, no second gate function", () => {
  const noSession = evaluateDirectedAbilityExecution({ sourceCharacterId: "char-1", abilityId: "ability-1", targetCharacterId: "char-2", sessionExists: false });
  assert.equal(noSession.uiAllowed, false);
  assert.equal(noSession.uiBlockReason, DIRECTED_ABILITY_BLOCK_REASON.noActiveEncounter);
  const idx = controllerSrc.indexOf('command?.type === "execute-directed-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.length);
  assert.match(block, /const sessionGate = sessionAttackGate\(sessionAtRequest\);/);
});

test("14. cooldown blocks execution — deriveSlotAvailability (reused unchanged) categorizes a cooldown directed ability as 'cooldown'", () => {
  const onCooldown = directedTargetFixture({ cooldown: { current: 2, max: 3, unit: "turn" }, state: { available: false, active: false, disabledReason: "Cooldown: 2 turns", selectable: false, executionAvailable: true, executionReason: null, resourceSufficient: true } });
  assert.equal(deriveSlotAvailability(onCooldown, false), SLOT_AVAILABILITY.cooldown);
});

test("15. insufficient PSI/resource blocks execution — same reused deriveSlotAvailability categorization", () => {
  const noResource = directedTargetFixture({ state: { available: false, active: false, disabledReason: "Not enough psi", selectable: false, executionAvailable: true, executionReason: null, resourceSufficient: false } });
  assert.equal(deriveSlotAvailability(noResource, false), SLOT_AVAILABILITY.insufficientResource);
});

test("16. pending state blocks duplicate clicks — per-ability, not whole-quickbar", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-directed-ability"');
  assert.ok(idx > -1);
  const block = controllerSrc.slice(idx);
  assert.match(block, /if \(ephemeral\.pendingDirectedAbilityActionId\) return;/);
  assert.match(quickbarViewSrc, /const pending = \(directAttack \|\| instantSelf \|\| directedTarget \|\| toggleAbility\) && pendingActionId != null && pendingActionId === action\.characterActionId;/);
});

test("17. failure clears pending state unconditionally — reset to null right after the resolveDirectedAbilityExecution() try/catch, before any outcome.ok branching", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-directed-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Basic Weapon Attack v1", idx));
  const resetIdx = block.indexOf("ephemeral.pendingDirectedAbilityActionId = null;");
  const okBranchIdx = block.indexOf("if (outcome.ok) {");
  assert.ok(resetIdx > -1 && okBranchIdx > -1 && resetIdx < okBranchIdx);
});

/* ── Payload (18-25) ──────────────────────────────────────────────────── */

function fullPayload(overrides = {}) {
  return buildDirectedAbilityExecutionPayload({
    sourceCharacterId: "char-1",
    abilityId: "ability-1",
    targetCharacterId: "char-2",
    encounterId: "enc-1",
    expectedEncounterVersion: 4,
    actorPlayerId: "player-1",
    actorIsGm: false,
    ...overrides,
  });
}

test("18. execution payload includes the source character (character_id)", () => {
  assert.equal(fullPayload().character_id, "char-1");
});

test("19. execution payload includes the character action/ability id (intent.character_ability_id)", () => {
  assert.equal(fullPayload().intent.character_ability_id, "ability-1");
});

test("20. execution payload includes the target character id (intent.target_character_id)", () => {
  assert.equal(fullPayload().intent.target_character_id, "char-2");
});

test("21. execution payload includes the encounter id and expected version when in active combat", () => {
  const payload = fullPayload();
  assert.equal(payload.encounter_id, "enc-1");
  assert.equal(payload.expected_encounter_version, 4);
  assert.equal(payload.kind, "ability");
});

test("22. execution payload never includes a target body part field", () => {
  assert.ok(!("target_body_part_id" in fullPayload()));
  assert.ok(!("target_body_part_id" in fullPayload().intent));
});

test("23. execution payload never includes a body zone id field", () => {
  const payload = fullPayload();
  assert.ok(!("body_zone_id" in payload) && !("zone_id" in payload));
  assert.ok(!("body_zone_id" in payload.intent) && !("zone_id" in payload.intent));
});

test("24. execution payload never includes a weapon id field", () => {
  assert.ok(!("weapon_id" in fullPayload()) && !("character_weapon_id" in fullPayload()));
});

test("25. execution payload never includes ammo/magazine/fire-mode fields", () => {
  const payload = fullPayload();
  for (const key of [...Object.keys(payload), ...Object.keys(payload.intent)]) {
    assert.ok(!/ammo|magazine|fire_mode/i.test(key), `unexpected weapon-only field: ${key}`);
  }
});

/* ── Success handling (26-32) ─────────────────────────────────────────── */

test("26/27/28. a successful result applies the authoritative runtime via refetchCurrent() (Skills Block cooldown/PSI) AND sessionController.refresh() (Player Block MAIN) — the SAME two calls the other execution classes already make", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-directed-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Basic Weapon Attack v1", idx));
  const okIdx = block.indexOf("if (outcome.ok) {");
  const refetchIdx = block.indexOf("await refetchCurrent();", okIdx);
  assert.ok(okIdx > -1 && refetchIdx > okIdx);
  assert.match(block, /if \(sessionController\) void sessionController\.refresh\(\);/);
});

test("29. Combat Log receives a readable directed-ability summary via buildDirectedAbilityLogEntry — never raw JSON, includes the target's name", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-directed-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Basic Weapon Attack v1", idx));
  assert.match(block, /pushLog\(buildDirectedAbilityLogEntry\(\{/);

  const ok = buildDirectedAbilityLogEntry({
    sourceCharacterId: "char-1",
    targetCharacterId: "char-2",
    abilityName: "Some Ability",
    targetName: "Some Target",
    outcome: { ok: true, normalized: normalizeDirectedAbilityResult({ ok: true, spent: { action_cost: 1 }, result: { resource: { spent: 2 } } }) },
  });
  assert.equal(ok.type, LOG_TYPE.directedAbility);
  assert.equal(ok.outcome, LOG_OUTCOME.success);
  assert.ok(ok.details.every((d) => typeof d === "string" && !d.includes("{")), "no raw JSON in any detail line");
  assert.match(ok.details[0], /^Used Some Ability on Some Target\.$/);
});

test("30. Debug Console receives structured directed-ability trace events, including sourceCharacterId/targetCharacterId/targetTokenId", () => {
  for (const evt of [
    '"directed-ability-requested"', '"directed-ability-payload-prepared"',
    '"directed-ability-blocked"', '"directed-ability-result"', '"directed-ability-cost-consumed"',
  ]) {
    assert.ok(controllerSrc.includes(evt), `missing Debug Console event ${evt}`);
  }
  const idx = controllerSrc.indexOf('command?.type === "execute-directed-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Basic Weapon Attack v1", idx));
  assert.match(block, /targetCharacterId: requestCtx\.targetCharacterId,\s*\n\s*targetTokenId: evalCtx\.targetTokenId,/);
});

test("31/32. the selected target and static target ring are never cleared/reassigned by this handler — no ephemeral.targeting reassignment, no clear-target command, anywhere in the block; only a best-effort refreshBodyZones broadcast is sent on success", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-directed-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Basic Weapon Attack v1", idx));
  assert.ok(!/ephemeral\.targeting\s*=/.test(block), "targeting state is never reassigned by this handler");
  assert.ok(!/type:\s*"clear-target"|clearTarget\(/.test(block), "no clear-target command is ever sent from this handler");
  assert.match(block, /BC_HUD_TARGETING_COMMAND, \{ type: "refreshBodyZones" \}/);
  assert.match(block, /"target-refresh-result"/);
});

/* ── Failure handling (33-38) ─────────────────────────────────────────── */

test("33/34/35/36. a rejected execution never locally spends MAIN/PSI, applies cooldown, or applies a target effect — the handler only READS cooldown/costs for gating/display, it never assigns to any cost/cooldown/main/effect field", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-directed-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Basic Weapon Attack v1", idx));
  assert.ok(!/\.main\s*=|\.psi\s*=|\.cooldown\s*=|current_cooldown|\.effects\s*=|\.combat_state\s*=/i.test(block));
});

test("37. a server/network error path shows a useful, real error message — never a fabricated success", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-directed-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Basic Weapon Attack v1", idx));
  assert.match(block, /outcome = \{ ok: false, payload: null, raw: null, normalized: null, code: null, error: String\(error\?\.message \?\? error \?\? "Ability execution failed\."\) \};/);
});

test("38. a stale version response never overwrites newer runtime — isDirectedAbilityResultStale detects a changed source/ability/target, and the handler checks it BEFORE applying success/failure state", () => {
  const requestCtx = { sourceCharacterId: "char-1", abilityId: "ability-1", targetCharacterId: "char-2" };
  assert.equal(isDirectedAbilityResultStale(requestCtx, requestCtx), false);
  assert.equal(isDirectedAbilityResultStale(requestCtx, { ...requestCtx, targetCharacterId: "char-3" }), true);
  assert.equal(buildDirectedAbilityRequestSignature(requestCtx), "char-1|ability-1|char-2");
  const idx = controllerSrc.indexOf('command?.type === "execute-directed-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Basic Weapon Attack v1", idx));
  const staleCheckIdx = block.indexOf("const stale = isDirectedAbilityResultStale(");
  const staleGuardIdx = block.indexOf("if (stale) {");
  assert.ok(staleCheckIdx > -1 && staleGuardIdx > staleCheckIdx);
});

/* ── no migration for this phase ──────────────────────────────────────── */

test("no later migration removed the turn-gate/ability-dispatch this phase's audit relied on in combat_execute_action — the outer function that owns the gate (use_ability is a lower-level resolver that never re-checks the turn/MAIN gate itself)", () => {
  const migrationsDir = path.join(repoRoot, "supabase");
  const files = fs.readdirSync(migrationsDir).filter((f) => /^10[3-9]_|^1[1-9][0-9]_/.test(f) && f !== "108_direct_ability_attack_session_gate.sql");
  const touchingFiles = files.filter((f) => {
    const src = fs.readFileSync(path.join(migrationsDir, f), "utf8");
    return /create\s+or\s+replace\s+function\s+public\.combat_execute_action\s*\(/i.test(src);
  });
  for (const f of touchingFiles) {
    const src = fs.readFileSync(path.join(migrationsDir, f), "utf8");
    assert.match(src, /NOT_CURRENT_TURN/, `${f} redefines combat_execute_action but dropped the turn-order gate`);
    assert.match(src, /ACTION_NOT_AVAILABLE/, `${f} redefines combat_execute_action but dropped the MAIN-cost gate`);
    assert.match(src, /when\s+'ability'/, `${f} redefines combat_execute_action but dropped the 'ability' kind dispatch`);
  }
});

setTimeout(() => {
  console.log(`\nPhase 4.1B.2 directed target ability: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
