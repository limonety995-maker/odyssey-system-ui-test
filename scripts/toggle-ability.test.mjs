// Phase 4.1B.3 — Toggle / Stance / Maintained Abilities from Skills Block.
//
// Two layers, matching this project's established pattern (see e.g.
// scripts/instant-self-ability.test.mjs):
//   - PURE unit tests over hud/abilities/abilityAvailabilityPolicy.js,
//     hud/combat/toggleAbilityPolicy.js, hud/combat/toggleAbilityPayload.js,
//     hud/log/combatResultLogPolicy.js (fully executable — no OBR import);
//   - SOURCE-CONTRACT checks (regex/string assertions) for
//     hud/scene/sceneSelectionController.js, hud/abilities/QuickbarView.js,
//     hud/components/CombatHudModule.js — none executable under plain Node
//     (SDK/OBR imports).
//
// Numbered tests map to the phase spec's "Tests" list (58 items); items
// 44-58 (regression) are covered by the EXISTING suites (test:hud as a
// whole, plus the 3 extra required scripts) staying green — see the final
// report rather than duplicating them here.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isToggleAbility, deriveToggleAvailability, isDirectAttackAbility, isInstantSelfAbility,
  isDirectedTargetAbility, deriveSlotAvailability, SLOT_AVAILABILITY,
} from "../hud/abilities/abilityAvailabilityPolicy.js";
import {
  evaluateToggleAbilityExecution, TOGGLE_ABILITY_BLOCK_REASON,
  buildToggleAbilityRequestSignature, isToggleAbilityResultStale,
} from "../hud/combat/toggleAbilityPolicy.js";
import { buildToggleAbilityExecutionPayload, normalizeToggleAbilityResult } from "../hud/combat/toggleAbilityPayload.js";
import { buildToggleAbilityLogEntry, LOG_TYPE, LOG_OUTCOME } from "../hud/log/combatResultLogPolicy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const read = (...seg) => fs.readFileSync(path.join(repoRoot, ...seg), "utf8").replace(/\r\n/g, "\n");
const controllerSrc = read("hud", "scene", "sceneSelectionController.js");
const quickbarViewSrc = read("hud", "abilities", "QuickbarView.js");
const moduleSrc = read("hud", "components", "CombatHudModule.js");

function handlerBlock() {
  const idx = controllerSrc.indexOf('command?.type === "execute-toggle-ability"');
  return controllerSrc.slice(idx, controllerSrc.indexOf("\n      // Basic Weapon Attack v1:", idx));
}

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

console.log("\nPhase 4.1B.3 — Toggle / Stance / Maintained Abilities from Skills Block\n");

/* ── fixtures ─────────────────────────────────────────────────────────── */

function toggleFixture(over = {}) {
  return {
    characterActionId: "ability-1",
    definitionId: "def-1",
    type: "toggle",
    name: "Some Toggle Ability",
    semanticKind: "buff",
    targeting: { mode: "self", minTargets: 1, maxTargets: 1, allowAllies: true, allowSelf: true, requiresBodyZone: false },
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

function armableTechniqueFixture(over = {}) {
  return toggleFixture({
    type: "attack_technique",
    targeting: { mode: "character", minTargets: 1, maxTargets: 1, allowAllies: false, allowSelf: false, requiresBodyZone: false },
    state: { available: true, active: false, disabledReason: null, selectable: true, executionAvailable: true, executionReason: null, resourceSufficient: true },
    ...over,
  });
}

/* ── Runtime classification (1-7) ─────────────────────────────────────── */

test("1. a toggle ability is recognized purely from type==='toggle'", () => {
  assert.equal(isToggleAbility(toggleFixture()), true);
  assert.equal(isToggleAbility(toggleFixture({ targeting: { mode: "character" } })), true, "recognition does not depend on targeting.mode");
});

test("2. a direct-attack-eligible action remains direct attack, never toggle", () => {
  const directAttack = toggleFixture({ type: "attack_technique", state: { available: false, active: false, disabledReason: "Attack effect is not supported yet", selectable: false, executionAvailable: false, executionReason: "ACTION_EFFECT_NOT_IMPLEMENTED", resourceSufficient: true } });
  assert.equal(isDirectAttackAbility(directAttack), true);
  assert.equal(isToggleAbility(directAttack), false);
});

test("3. an instant/self ability remains instant/self, never toggle", () => {
  const instant = toggleFixture({ type: "instant" });
  assert.equal(isInstantSelfAbility(instant), true);
  assert.equal(isToggleAbility(instant), false);
});

test("4. a directed target ability remains directed target, never toggle", () => {
  const directed = toggleFixture({ type: "directed", targeting: { mode: "character", requiresBodyZone: false } });
  assert.equal(isDirectedTargetAbility(directed), true);
  assert.equal(isToggleAbility(directed), false);
});

test("5. an armable (accuracy-only) attack_technique remains on the ARMED flow — never toggle-eligible", () => {
  const armable = armableTechniqueFixture();
  assert.equal(isToggleAbility(armable), false);
  assert.equal(deriveSlotAvailability(armable, true), SLOT_AVAILABILITY.armed);
});

test("6. an unsupported/blocked toggle (e.g. character disabled) is recognized as unavailable, not silently ready", () => {
  const disabled = toggleFixture({ state: { available: false, active: false, disabledReason: "Ability is disabled", selectable: false, executionAvailable: true, executionReason: null, resourceSufficient: true } });
  assert.equal(isToggleAbility(disabled), true);
  assert.equal(deriveToggleAvailability(disabled), SLOT_AVAILABILITY.unavailable);
});

test("7. classification is metadata-driven, not name-based — isToggleAbility's own body never reads action.name", () => {
  const notNamed = toggleFixture({ name: "Some Other Ability Entirely" });
  assert.equal(isToggleAbility(notNamed), true);
  const src = read("hud", "abilities", "abilityAvailabilityPolicy.js");
  const body = src.slice(src.indexOf("export function isToggleAbility"), src.indexOf("export function deriveToggleAvailability"));
  assert.ok(!/\.name/i.test(body), "isToggleAbility never reads action.name");
  // No specific fictional example name from the task spec ("Combat Stance",
  // "Concentration Mode", "Implant Mode", "Sustained Buff", "Aura") is ever
  // hardcoded as a literal string anywhere in production HUD code.
  for (const src2 of [controllerSrc, quickbarViewSrc, moduleSrc]) {
    assert.ok(!/"combat stance"|"concentration mode"|"implant mode"|"sustained buff"|"active sensory mode"/i.test(src2));
  }
});

/* ── UI behavior (8-20) ───────────────────────────────────────────────── */

test("8. an inactive READY toggle is clickable — QuickbarView's occupiedTile sets data-action=execute-toggle-ability", () => {
  assert.match(quickbarViewSrc, /const toggleAbility = !isTechnique && !instantSelf && !directedTarget && isToggleAbility\(action\);/);
  assert.match(quickbarViewSrc, /toggleAbility\s*\n\s*\? "execute-toggle-ability"/);
});

test("9. an active toggle stays clickable (to deactivate) even while on cooldown or resource-insufficient — deriveToggleAvailability overrides those with active:true", () => {
  const activeOnCooldown = toggleFixture({ state: { ...toggleFixture().state, active: true, resourceSufficient: false }, cooldown: { current: 2, max: 2, unit: "turn" } });
  assert.equal(deriveToggleAvailability(activeOnCooldown), SLOT_AVAILABILITY.ready);
});

test("10. a toggle ability's evaluation function has NO target concept at all", () => {
  const result = evaluateToggleAbilityExecution({ sourceCharacterId: "char-1", abilityId: "ability-1", sessionExists: true });
  assert.deepEqual(result, { uiAllowed: true, uiBlockReason: null });
  const src = read("hud", "combat", "toggleAbilityPolicy.js");
  const body = src.slice(src.indexOf("export function evaluateToggleAbilityExecution"));
  assert.ok(!/target/i.test(body), "no target-related identifier anywhere in the actual evaluation function");
});

test("11. a toggle ability's evaluation function has NO body-zone concept at all", () => {
  const src = read("hud", "combat", "toggleAbilityPolicy.js");
  const body = src.slice(src.indexOf("export function evaluateToggleAbilityExecution"));
  assert.ok(!/zone|bodyPart/i.test(body), "no body-zone-related identifier anywhere in the actual evaluation function");
});

test("12. missing source character blocks execution", () => {
  const result = evaluateToggleAbilityExecution({ sourceCharacterId: null, abilityId: "ability-1", sessionExists: true });
  assert.equal(result.uiAllowed, false);
  assert.equal(result.uiBlockReason, TOGGLE_ABILITY_BLOCK_REASON.noCharacter);
});

test("13. not-in-an-active-encounter blocks locally, and the handler reuses the EXISTING generic sessionAttackGate for turn/MAIN, no second gate function", () => {
  const noSession = evaluateToggleAbilityExecution({ sourceCharacterId: "char-1", abilityId: "ability-1", sessionExists: false });
  assert.equal(noSession.uiAllowed, false);
  assert.equal(noSession.uiBlockReason, TOGGLE_ABILITY_BLOCK_REASON.noActiveEncounter);
  assert.match(handlerBlock(), /const sessionGate = sessionAttackGate\(sessionAtRequest\);/);
});

test("14. cooldown blocks execution while INACTIVE — deriveToggleAvailability categorizes an inactive, on-cooldown toggle as 'cooldown'", () => {
  const onCooldown = toggleFixture({ cooldown: { current: 2, max: 3, unit: "turn" }, state: { available: false, active: false, disabledReason: "Cooldown: 2 turns", selectable: false, executionAvailable: true, executionReason: null, resourceSufficient: true } });
  assert.equal(deriveToggleAvailability(onCooldown), SLOT_AVAILABILITY.cooldown);
});

test("15. insufficient PSI/resource blocks execution while INACTIVE", () => {
  const noResource = toggleFixture({ state: { available: false, active: false, disabledReason: "Not enough psi", selectable: false, executionAvailable: true, executionReason: null, resourceSufficient: false } });
  assert.equal(deriveToggleAvailability(noResource), SLOT_AVAILABILITY.insufficientResource);
});

test("16. a server-reported unsupported/unavailable toggle blocks execution instead of silently reading ready", () => {
  const unsupported = toggleFixture({ state: { available: false, active: false, disabledReason: "Character is dead", selectable: false, executionAvailable: true, executionReason: null, resourceSufficient: true } });
  assert.equal(deriveToggleAvailability(unsupported), SLOT_AVAILABILITY.unavailable);
});

test("17. pending state blocks duplicate clicks — per-ability, not whole-quickbar", () => {
  assert.match(handlerBlock(), /if \(ephemeral\.pendingToggleAbilityActionId\) return;/);
  assert.match(quickbarViewSrc, /const pending = \(directAttack \|\| instantSelf \|\| directedTarget \|\| toggleAbility\) && pendingActionId != null && pendingActionId === action\.characterActionId;/);
});

test("18. failure clears pending state unconditionally — reset to null right after the resolveToggleAbilityExecution() try/catch, before any outcome.ok branching", () => {
  const block = handlerBlock();
  const resetIdx = block.indexOf("ephemeral.pendingToggleAbilityActionId = null;");
  const okBranchIdx = block.indexOf("if (outcome.ok) {");
  assert.ok(resetIdx > -1 && okBranchIdx > -1 && resetIdx < okBranchIdx);
});

test("19. the client never locally flips active state before server success — no assignment to any active-flavored field anywhere in the handler", () => {
  const block = handlerBlock();
  assert.ok(!/\.active\s*=(?!=)/.test(block), "no local mutation of an 'active' field — the server alone decides ON/OFF");
});

test("20. the ON marker follows ONLY the authoritative runtime state — QuickbarView's active flag is read verbatim from action.state.active, never derived/guessed for toggle specifically", () => {
  assert.match(quickbarViewSrc, /const active = action\.state\?\.active === true;/);
  // No toggle-specific override of `active` exists anywhere near the toggle branch.
  const toggleIdx = quickbarViewSrc.indexOf("const toggleAbility = ");
  const nearby = quickbarViewSrc.slice(toggleIdx, toggleIdx + 800);
  assert.ok(!/active\s*=\s*toggleAbility/.test(nearby));
});

/* ── Payload (21-28) ──────────────────────────────────────────────────── */

function fullPayload(overrides = {}) {
  return buildToggleAbilityExecutionPayload({
    sourceCharacterId: "char-1",
    abilityId: "ability-1",
    encounterId: "enc-1",
    expectedEncounterVersion: 4,
    actorPlayerId: "player-1",
    actorIsGm: false,
    ...overrides,
  });
}

test("21. execution payload includes the source character (character_id)", () => {
  assert.equal(fullPayload().character_id, "char-1");
});

test("22. execution payload includes the character action/ability id (intent.character_ability_id)", () => {
  assert.equal(fullPayload().intent.character_ability_id, "ability-1");
});

test("23. execution payload includes the encounter id and expected version when in active combat", () => {
  const payload = fullPayload();
  assert.equal(payload.encounter_id, "enc-1");
  assert.equal(payload.expected_encounter_version, 4);
  assert.equal(payload.kind, "ability");
});

test("24. execution payload never includes a target character field", () => {
  assert.ok(!("target_character_id" in fullPayload()));
});

test("25. execution payload never includes a body zone/body part field", () => {
  assert.ok(!("target_body_part_id" in fullPayload()));
});

test("26. execution payload never includes a weapon id field", () => {
  assert.ok(!("weapon_id" in fullPayload()) && !("character_weapon_id" in fullPayload()) && !("selected_character_weapon_id" in fullPayload()));
});

test("27. execution payload never includes ammo/magazine/fire-mode fields", () => {
  const payload = fullPayload();
  for (const key of Object.keys(payload)) {
    assert.ok(!/ammo|magazine|fire_mode/i.test(key), `unexpected weapon-only field: ${key}`);
  }
});

test("28. no invented toggle/desired_state field is ever sent — the server alone decides ON vs OFF by checking for an existing active effect", () => {
  const payload = fullPayload();
  assert.ok(!("toggle" in payload));
  assert.ok(!("desired_state" in payload));
  assert.ok(!("toggle" in payload.intent));
  assert.ok(!("desired_state" in payload.intent));
});

/* ── Success handling (29-37) ─────────────────────────────────────────── */

test("29/30. a successful activation OR deactivation applies the authoritative runtime via refetchCurrent() (Skills Block ON/OFF + cooldown/PSI) AND sessionController.refresh() (Player Block MAIN) — the SAME single code path handles both, since the server alone decides which one happened", () => {
  const block = handlerBlock();
  const okIdx = block.indexOf("if (outcome.ok) {");
  const refetchIdx = block.indexOf("await refetchCurrent();", okIdx);
  assert.ok(okIdx > -1 && refetchIdx > okIdx);
  assert.match(block, /if \(sessionController\) void sessionController\.refresh\(\);/);
});

test("31. Skills Block ON/OFF state refreshes from server state — the success branch never assumes activation, it reads outcome.normalized.active for its own status message", () => {
  assert.match(handlerBlock(), /outcome\.normalized\?\.active === false \? "Ability deactivated\." : "Ability activated\."/);
});

test("32. Skills Block cooldown/availability refreshes via the same refetchCurrent() call as every other ability class", () => {
  assert.match(handlerBlock(), /await refetchCurrent\(\);/);
});

test("33. Player Block MAIN/PSI refreshes via sessionController.refresh()", () => {
  assert.match(handlerBlock(), /if \(sessionController\) void sessionController\.refresh\(\);/);
});

test("34. Combat Log receives a readable toggle summary via buildToggleAbilityLogEntry — never raw JSON, and picks activated/deactivated from the server's own active flag", () => {
  assert.match(handlerBlock(), /pushLog\(buildToggleAbilityLogEntry\(\{/);

  const activated = buildToggleAbilityLogEntry({
    sourceCharacterId: "char-1",
    abilityName: "Some Ability",
    outcome: { ok: true, normalized: normalizeToggleAbilityResult({ ok: true, spent: { action_cost: 1 }, result: { active: true, resource: { spent: 1 } } }) },
  });
  assert.equal(activated.type, LOG_TYPE.toggleAbility);
  assert.equal(activated.outcome, LOG_OUTCOME.success);
  assert.match(activated.details[0], /^Activated Some Ability\.$/);
  assert.ok(activated.details.every((d) => typeof d === "string" && !d.includes("{")), "no raw JSON in any detail line");

  const deactivated = buildToggleAbilityLogEntry({
    sourceCharacterId: "char-1",
    abilityName: "Some Ability",
    outcome: { ok: true, normalized: normalizeToggleAbilityResult({ ok: true, spent: {}, result: { active: false } }) },
  });
  assert.match(deactivated.details[0], /^Deactivated Some Ability\.$/);
});

test("35. Debug Console receives structured toggle trace events: toggle-ability-requested/payload-prepared/blocked/result/cost-consumed/active-state", () => {
  for (const evt of [
    '"toggle-ability-requested"', '"toggle-ability-payload-prepared"',
    '"toggle-ability-blocked"', '"toggle-ability-result"',
    '"toggle-ability-cost-consumed"', '"toggle-ability-active-state"',
  ]) {
    assert.ok(controllerSrc.includes(evt), `missing Debug Console event ${evt}`);
  }
});

test("36/37. the selected target and static target ring are never touched by this handler — no ephemeral.targeting reassignment, no clear-target command, anywhere in the block (this ability class has no target concept at all)", () => {
  const block = handlerBlock();
  assert.ok(!/ephemeral\.targeting/.test(block), "targeting state is never referenced by this handler");
  assert.ok(!/clear-target|clearTarget\(/.test(block));
});

/* ── Failure handling (38-43) ─────────────────────────────────────────── */

test("38/39/40. a rejected execution never locally spends MAIN/PSI or applies cooldown — the handler only READS cooldown/costs for gating/display, it never assigns to any cost/cooldown/main field", () => {
  const block = handlerBlock();
  assert.ok(!/\.main\s*=|\.psi\s*=|\.cooldown\s*=|current_cooldown/i.test(block));
});

test("41. a rejected execution never locally applies/removes active effects — no assignment to any effect/active field in the handler", () => {
  const block = handlerBlock();
  assert.ok(!/add_character_effect|remove_character_effect|is_active\s*=/.test(block));
});

test("42. a server/network error path shows a useful, real error message — never a fabricated success", () => {
  assert.match(handlerBlock(), /outcome = \{ ok: false, payload: null, raw: null, normalized: null, code: null, error: String\(error\?\.message \?\? error \?\? "Ability execution failed\."\) \};/);
});

test("43. a stale version response never overwrites newer runtime — isToggleAbilityResultStale detects a changed source/ability, and the handler checks it BEFORE applying success/failure state", () => {
  const requestCtx = { sourceCharacterId: "char-1", abilityId: "ability-1" };
  assert.equal(isToggleAbilityResultStale(requestCtx, requestCtx), false);
  assert.equal(isToggleAbilityResultStale(requestCtx, { ...requestCtx, abilityId: "ability-2" }), true);
  assert.equal(buildToggleAbilityRequestSignature(requestCtx), "char-1|ability-1");
  const block = handlerBlock();
  const staleCheckIdx = block.indexOf("const stale = isToggleAbilityResultStale(");
  const staleGuardIdx = block.indexOf("if (stale) {");
  assert.ok(staleCheckIdx > -1 && staleGuardIdx > staleCheckIdx);
});

/* ── combat_execute_action/toggle_character_ability server-side sanity ──── */

test("no later migration removed the turn-gate/ability-dispatch this phase's audit relied on in combat_execute_action — the outer function that owns the gate", () => {
  const migrationsDir = path.join(repoRoot, "supabase");
  const files = fs.readdirSync(migrationsDir).filter((f) => /^1[1-9][0-9]_/.test(f));
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

test("migration 109 routes toggle abilities to toggle_character_ability, delegates activation to the existing unchanged apply_effect resolver, and its toggle_character_ability function never touches the quickbar layout table", () => {
  const src = read("supabase", "109_toggle_ability_execution.sql");
  assert.match(src, /if v_toggle_activation_type = 'toggle' then/);
  assert.match(src, /v_result := public\.toggle_character_ability\(/);
  assert.match(src, /v_activation_result := public\.odyssey_use_ability_with_weapon_support_legacy\(v_payload\);/);
  const toggleFnBody = src.slice(
    src.indexOf("create or replace function public.toggle_character_ability"),
    src.indexOf("create or replace function public.combat_execute_action"),
  );
  assert.ok(!/odyssey_character_quickbar_layouts/i.test(toggleFnBody), "toggle execution must never touch quickbar layout");
});

test("migration 109's quick-actions runtime query derives state.active from odyssey_character_effects instead of the old hardcoded value", () => {
  const src = read("supabase", "109_toggle_ability_execution.sql");
  const runtimeFnBody = src.slice(
    src.indexOf("create or replace function public.odyssey_get_character_quick_actions_runtime"),
    src.indexOf("create or replace function public.toggle_character_ability"),
  );
  assert.ok(!/'active',\s*false,/.test(runtimeFnBody), "the old hardcoded false must be gone from the runtime query");
  assert.match(runtimeFnBody, /'active', coalesce\(active_state\.is_active, false\),/);
  assert.match(runtimeFnBody, /fx\.source_id = ca\.id::text/);
});

setTimeout(() => {
  console.log(`\nPhase 4.1B.3 toggle ability: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
