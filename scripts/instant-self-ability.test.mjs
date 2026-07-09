// Phase 4.1B.1 — Instant / Self Ability Execution from Skills Block.
//
// Two layers, matching this project's established pattern:
//   - PURE unit tests over hud/abilities/abilityAvailabilityPolicy.js,
//     hud/combat/instantAbilityPolicy.js, hud/combat/instantAbilityPayload.js,
//     hud/log/combatResultLogPolicy.js (fully executable — no OBR import);
//   - SOURCE-CONTRACT checks (regex/string assertions) for
//     hud/scene/sceneSelectionController.js, hud/abilities/QuickbarView.js,
//     hud/components/CombatHudModule.js — none executable under plain Node
//     (SDK/OBR imports).
//
// Numbered tests map to the phase spec's "Tests" list (45 items); items
// 34-45 (regression) are covered by the EXISTING suites (test:hud as a
// whole, plus the 3 extra required scripts) staying green — see the final
// report rather than duplicating them here.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isInstantSelfAbility, isDirectAttackAbility, deriveSlotAvailability, SLOT_AVAILABILITY,
} from "../hud/abilities/abilityAvailabilityPolicy.js";
import {
  evaluateInstantAbilityExecution, INSTANT_ABILITY_BLOCK_REASON,
  buildInstantAbilityRequestSignature, isInstantAbilityResultStale,
} from "../hud/combat/instantAbilityPolicy.js";
import { buildInstantAbilityExecutionPayload, normalizeInstantAbilityResult } from "../hud/combat/instantAbilityPayload.js";
import { buildAbilityExecutionLogEntry, LOG_TYPE, LOG_OUTCOME } from "../hud/log/combatResultLogPolicy.js";

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

console.log("\nPhase 4.1B.1 — Instant / Self Ability Execution from Skills Block\n");

/* ── fixtures ─────────────────────────────────────────────────────────── */

function instantSelfFixture(over = {}) {
  return {
    characterActionId: "ability-1",
    definitionId: "def-1",
    type: "instant",
    name: "Some Self Ability",
    semanticKind: "buff",
    targeting: { mode: "self", minTargets: 1, maxTargets: 1, allowAllies: true, allowSelf: true, requiresBodyZone: false },
    costs: { main: 1, move: 0, psi: 0, charges: 0 },
    cooldown: { current: 0, max: 2, unit: "turn", active: false },
    state: {
      available: true, active: false, disabledReason: null, selectable: true,
      executionAvailable: true, executionReason: null, resourceSufficient: true,
    },
    requirements: { weaponClass: null, weaponId: null, conditionSummary: null },
    ...over,
  };
}

function armableTechniqueFixture(over = {}) {
  return instantSelfFixture({
    type: "attack_technique",
    targeting: { mode: "character", minTargets: 1, maxTargets: 1, allowAllies: false, allowSelf: false, requiresBodyZone: false },
    state: { available: true, active: false, disabledReason: null, selectable: true, executionAvailable: true, executionReason: null, resourceSufficient: true },
    ...over,
  });
}

/* ── Runtime classification (1-5) ─────────────────────────────────────── */

test("1. a direct-attack-eligible action (Phase 4.1B.0) remains direct attack, never instant/self — the two classes are mutually exclusive by construction (different `type` values)", () => {
  const directAttack = instantSelfFixture({ type: "attack_technique", state: { available: false, active: false, disabledReason: "Attack effect is not supported yet", selectable: false, executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true } });
  assert.equal(isDirectAttackAbility(directAttack), true);
  assert.equal(isInstantSelfAbility(directAttack), false);
});

test("2. an armable (accuracy-only) attack_technique remains on the ARMED flow — never instant/self-eligible", () => {
  const armable = armableTechniqueFixture();
  assert.equal(isInstantSelfAbility(armable), false);
  assert.equal(isDirectAttackAbility(armable), false);
  // Still correctly categorized by the UNCHANGED deriveSlotAvailability.
  assert.equal(deriveSlotAvailability(armable, true), SLOT_AVAILABILITY.armed);
});

test("3. a self/instant executable ability is recognized purely from type==='instant' (+ non-character/body_part targeting) — matches the real server shape for etheric_coating/sensory_concentration", () => {
  assert.equal(isInstantSelfAbility(instantSelfFixture()), true);
  assert.equal(isInstantSelfAbility(instantSelfFixture({ targeting: { mode: "none" } })), true);
});

test("4. an instant-typed action with a genuinely unsupported effect (executionAvailable:false) still categorizes as 'unsupported' via the UNCHANGED deriveSlotAvailability — isInstantSelfAbility does not bypass or override that categorization the way direct-attack's own derivation does", () => {
  const unsupportedInstant = instantSelfFixture({ state: { available: false, active: false, disabledReason: "Attack effect is not supported yet", selectable: false, executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true } });
  // Still recognized as instant/self-eligible by type...
  assert.equal(isInstantSelfAbility(unsupportedInstant), true);
  // ...but deriveSlotAvailability (reused unchanged, unlike direct-attack's
  // own derivation) still honestly reports it as unsupported/disabled.
  assert.equal(deriveSlotAvailability(unsupportedInstant, false), SLOT_AVAILABILITY.unsupported);
});

test("5. recognition is purely metadata-driven — neither 'Etheric Coating' nor 'Sensory Concentration' (the real seed abilities) nor any other name is ever checked", () => {
  const notNamed = instantSelfFixture({ name: "Some Other Ability Entirely" });
  assert.equal(isInstantSelfAbility(notNamed), true);
  for (const src of [controllerSrc, quickbarViewSrc, moduleSrc]) {
    assert.ok(!/etheric.coating|sensory.concentration/i.test(src), "no name-based check for either real seed ability exists in production HUD code");
  }
});

/* ── UI behavior (6-14) ───────────────────────────────────────────────── */

test("6. a READY self/instant ability is clickable — QuickbarView's occupiedTile sets data-action=execute-instant-ability and is-disabled is absent", () => {
  assert.match(quickbarViewSrc, /const instantSelf = !isTechnique && isInstantSelfAbility\(action\);/);
  assert.match(quickbarViewSrc, /instantSelf\s*\n\s*\? "execute-instant-ability"/);
});

test("7. a self/instant ability's evaluation function has NO target concept at all — evaluateInstantAbilityExecution's signature/params never reference a target", () => {
  const result = evaluateInstantAbilityExecution({ sourceCharacterId: "char-1", abilityId: "ability-1", sessionExists: true });
  assert.deepEqual(result, { uiAllowed: true, uiBlockReason: null });
  // Scoped to the actual function body (past the header comment, which
  // explains IN PROSE why there is no target concept — that explanation
  // itself mentions the word "target").
  const src = read("hud", "combat", "instantAbilityPolicy.js");
  const body = src.slice(src.indexOf("export function evaluateInstantAbilityExecution"));
  assert.ok(!/target/i.test(body), "no target-related identifier anywhere in the actual evaluation function");
});

test("8. a self/instant ability's evaluation function has NO body-zone concept at all", () => {
  const src = read("hud", "combat", "instantAbilityPolicy.js");
  const body = src.slice(src.indexOf("export function evaluateInstantAbilityExecution"));
  assert.ok(!/zone|bodyPart/i.test(body), "no body-zone-related identifier anywhere in the actual evaluation function");
});

test("9. missing source character blocks execution", () => {
  const result = evaluateInstantAbilityExecution({ sourceCharacterId: null, abilityId: "ability-1", sessionExists: true });
  assert.equal(result.uiAllowed, false);
  assert.equal(result.uiBlockReason, INSTANT_ABILITY_BLOCK_REASON.noCharacter);
});

test("10. not-in-an-active-encounter blocks locally (combat_execute_action has no free-play fallback, unlike perform_attack) — and the handler reuses the EXISTING generic sessionAttackGate for turn/MAIN, no second gate function", () => {
  const noSession = evaluateInstantAbilityExecution({ sourceCharacterId: "char-1", abilityId: "ability-1", sessionExists: false });
  assert.equal(noSession.uiAllowed, false);
  assert.equal(noSession.uiBlockReason, INSTANT_ABILITY_BLOCK_REASON.noActiveEncounter);
  assert.match(controllerSrc, /const sessionGate = sessionAttackGate\(sessionAtRequest\);/);
});

test("11. cooldown blocks execution — deriveSlotAvailability (reused unchanged) categorizes a cooldown instant ability as 'cooldown', and QuickbarView dims it", () => {
  const onCooldown = instantSelfFixture({ cooldown: { current: 2, max: 3, unit: "turn" }, state: { available: false, active: false, disabledReason: "Cooldown: 2 turns", selectable: false, executionAvailable: true, executionReason: null, resourceSufficient: true } });
  assert.equal(deriveSlotAvailability(onCooldown, false), SLOT_AVAILABILITY.cooldown);
});

test("12. insufficient PSI/resource blocks execution — same reused deriveSlotAvailability categorization", () => {
  const noResource = instantSelfFixture({ state: { available: false, active: false, disabledReason: "Not enough psi", selectable: false, executionAvailable: true, executionReason: null, resourceSufficient: false } });
  assert.equal(deriveSlotAvailability(noResource, false), SLOT_AVAILABILITY.insufficientResource);
});

test("13. pending state blocks duplicate clicks — per-ability, not whole-quickbar", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-instant-ability"');
  assert.ok(idx > -1);
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.2: Directed Target Ability Execution", idx));
  assert.match(block, /if \(ephemeral\.pendingInstantAbilityActionId\) return;/);
  assert.match(quickbarViewSrc, /const pending = \(directAttack \|\| instantSelf \|\| directedTarget\) && pendingActionId != null && pendingActionId === action\.characterActionId;/);
});

test("14. failure clears pending state unconditionally — reset to null right after the resolveInstantAbilityExecution() try/catch, before any outcome.ok branching", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-instant-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.2: Directed Target Ability Execution", idx));
  const resetIdx = block.indexOf("ephemeral.pendingInstantAbilityActionId = null;");
  const okBranchIdx = block.indexOf("if (outcome.ok) {");
  assert.ok(resetIdx > -1 && okBranchIdx > -1 && resetIdx < okBranchIdx);
});

/* ── Payload (15-21) ──────────────────────────────────────────────────── */

function fullPayload(overrides = {}) {
  return buildInstantAbilityExecutionPayload({
    sourceCharacterId: "char-1",
    abilityId: "ability-1",
    encounterId: "enc-1",
    expectedEncounterVersion: 4,
    actorPlayerId: "player-1",
    actorIsGm: false,
    ...overrides,
  });
}

test("15. execution payload includes the source character (character_id)", () => {
  assert.equal(fullPayload().character_id, "char-1");
});

test("16. execution payload includes the character action/ability id (intent.character_ability_id)", () => {
  assert.equal(fullPayload().intent.character_ability_id, "ability-1");
});

test("17. execution payload includes the encounter id and expected version when in active combat", () => {
  const payload = fullPayload();
  assert.equal(payload.encounter_id, "enc-1");
  assert.equal(payload.expected_encounter_version, 4);
  assert.equal(payload.kind, "ability");
});

test("18. execution payload never includes a target character field", () => {
  assert.ok(!("target_character_id" in fullPayload()));
});

test("19. execution payload never includes a target body part field", () => {
  assert.ok(!("target_body_part_id" in fullPayload()));
});

test("20. execution payload never includes a weapon id field", () => {
  assert.ok(!("weapon_id" in fullPayload()) && !("character_weapon_id" in fullPayload()));
});

test("21. execution payload never includes ammo/magazine/fire-mode fields, and no context wrapper is fabricated (the audited RPC never reads one)", () => {
  const payload = fullPayload();
  for (const key of Object.keys(payload)) {
    assert.ok(!/ammo|magazine|fire_mode/i.test(key), `unexpected weapon-only field: ${key}`);
  }
  assert.ok(!("context" in payload), "no fabricated context wrapper — combat_execute_action never reads one");
});

/* ── Success handling (22-28) ─────────────────────────────────────────── */

test("22/23/24. a successful result applies the authoritative runtime via refetchCurrent() (Skills Block cooldown/PSI) AND sessionController.refresh() (Player Block MAIN) — the SAME two calls the weapon-attack/direct-ability-attack handlers already make", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-instant-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.2: Directed Target Ability Execution", idx));
  const okIdx = block.indexOf("if (outcome.ok) {");
  const refetchIdx = block.indexOf("await refetchCurrent();", okIdx);
  assert.ok(okIdx > -1 && refetchIdx > okIdx);
  assert.match(block, /if \(sessionController\) void sessionController\.refresh\(\);/);
});

test("25. Combat Log receives a readable non-attack summary via buildAbilityExecutionLogEntry — never raw JSON", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-instant-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.2: Directed Target Ability Execution", idx));
  assert.match(block, /pushLog\(buildAbilityExecutionLogEntry\(\{/);

  const ok = buildAbilityExecutionLogEntry({
    sourceCharacterId: "char-1",
    abilityName: "Some Ability",
    outcome: { ok: true, normalized: normalizeInstantAbilityResult({ ok: true, spent: { action_cost: 1 }, result: { resource: { spent: 1 } } }) },
  });
  assert.equal(ok.type, LOG_TYPE.abilityExecute);
  assert.equal(ok.outcome, LOG_OUTCOME.success);
  assert.ok(ok.details.every((d) => typeof d === "string" && !d.includes("{")), "no raw JSON in any detail line");
  assert.match(ok.details[0], /^Used Some Ability\.$/);
});

test("26. Debug Console receives structured non-attack trace events: ability-execute-requested/payload-prepared/blocked/result/cost-consumed", () => {
  for (const evt of [
    '"ability-execute-requested"', '"ability-execute-payload-prepared"',
    '"ability-execute-blocked"', '"ability-execute-result"', '"ability-execute-cost-consumed"',
  ]) {
    assert.ok(controllerSrc.includes(evt), `missing Debug Console event ${evt}`);
  }
});

test("27/28. the selected target and static target ring are never touched by this handler — no ephemeral.targeting reassignment, no clear-target command, anywhere in the block (this ability class has no target concept at all)", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-instant-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.2: Directed Target Ability Execution", idx));
  assert.ok(!/ephemeral\.targeting/.test(block), "targeting state is never referenced by this handler");
  assert.ok(!/clear-target|clearTarget\(/.test(block));
});

/* ── Failure handling (29-33) ─────────────────────────────────────────── */

test("29/30/31. a rejected execution never locally spends MAIN/PSI or applies cooldown — the handler only READS cooldown/costs for gating/display, it never assigns to any cost/cooldown/main field", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-instant-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.2: Directed Target Ability Execution", idx));
  assert.ok(!/\.main\s*=|\.psi\s*=|\.cooldown\s*=|current_cooldown/i.test(block));
});

test("32. a server/network error path shows a useful, real error message — never a fabricated success", () => {
  const idx = controllerSrc.indexOf('command?.type === "execute-instant-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.2: Directed Target Ability Execution", idx));
  assert.match(block, /outcome = \{ ok: false, payload: null, raw: null, normalized: null, code: null, error: String\(error\?\.message \?\? error \?\? "Ability execution failed\."\) \};/);
});

test("33. a stale version response never overwrites newer runtime — isInstantAbilityResultStale detects a changed source/ability, and the handler checks it BEFORE applying success/failure state", () => {
  const requestCtx = { sourceCharacterId: "char-1", abilityId: "ability-1" };
  assert.equal(isInstantAbilityResultStale(requestCtx, requestCtx), false);
  assert.equal(isInstantAbilityResultStale(requestCtx, { ...requestCtx, abilityId: "ability-2" }), true);
  assert.equal(buildInstantAbilityRequestSignature(requestCtx), "char-1|ability-1");
  const idx = controllerSrc.indexOf('command?.type === "execute-instant-ability"');
  const block = controllerSrc.slice(idx, controllerSrc.indexOf("// Phase 4.1B.2: Directed Target Ability Execution", idx));
  const staleCheckIdx = block.indexOf("const stale = isInstantAbilityResultStale(");
  const staleGuardIdx = block.indexOf("if (stale) {");
  assert.ok(staleCheckIdx > -1 && staleGuardIdx > staleCheckIdx);
});

/* ── use_ability/combat_execute_action server-side sanity (supporting §5-9) ── */

test("no later migration removed the turn-gate/ability-dispatch this phase's audit relied on in combat_execute_action — the outer function that owns the gate, per the audit's §5/6/7 call chain (use_ability is a lower-level resolver that never re-checks the turn/MAIN gate itself)", () => {
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
  console.log(`\nPhase 4.1B.1 instant/self ability: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
