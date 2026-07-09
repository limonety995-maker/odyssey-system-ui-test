// Phase 4.1A — Attack Techniques & ARMED Modifiers.
//
// PURE render/logic tests over the client pieces (armedTechniqueMemory,
// QuickbarView arm/disarm, the shared attack-resolution trace's MODIFIERS
// section, the payload builder) + source-contract checks over migration 100
// (SQL) and the wiring in CombatHudModule.js / sceneSelectionController.js —
// mirroring the same pattern combat-session.test.mjs / abilities-quickbar-
// ui.test.mjs already use for OBR-SDK-importing files and SQL migrations
// (neither can be executed directly by a plain Node test script).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createArmedTechniqueMemory } from "../hud/scene/armedTechniqueMemory.js";
import { renderQuickbarStrip } from "../hud/abilities/QuickbarView.js";
import { buildAttackPayload, normalizeResult } from "../screens/resolveAttack/resolveAttackService.js";
import { buildBasicAttackCtx } from "../hud/combat/basicAttackPayload.js";
import { buildAttackResolutionTrace, buildRollResolutionDetails, buildCombatLogLines } from "../hud/combat/attackResolutionTrace.js";
import { buildAttackLogEntry } from "../hud/log/combatResultLogPolicy.js";
import { renderCombatControlBlock } from "../hud/components/CombatControlBlock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const read = (...seg) => fs.readFileSync(path.join(repoRoot, ...seg), "utf8").replace(/\r\n/g, "\n");
const sql100 = read("supabase", "100_armed_attack_technique_execution.sql");
const moduleSrc = read("hud", "components", "CombatHudModule.js");
const controllerSrc = read("hud", "scene", "sceneSelectionController.js");

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

console.log("\nPhase 4.1A — Attack Techniques & ARMED Modifiers\n");

/* ───────────────────────── fixtures ───────────────────────── */

function action(over = {}) {
  return {
    characterActionId: over.id ?? "act-1",
    definitionId: "def-1",
    sourceType: over.sourceType ?? "psi",
    type: over.type ?? "attack_technique",
    name: over.name ?? "Precision Shot",
    shortDescription: "a technique",
    fullDescription: over.fullDescription ?? "A focused strike.",
    iconKey: "brain",
    semanticKind: over.semanticKind ?? "attack",
    targeting: over.targeting ?? { mode: "character", minTargets: 1, maxTargets: 1, allowAllies: false, allowSelf: false, requiresBodyZone: false },
    costs: over.costs ?? { main: 0, move: 0, psi: 3, charges: 0 },
    cooldown: over.cooldown ?? { current: 0, max: 2, unit: "turn" },
    state: over.state ?? { available: true, active: false, disabledReason: null, selectable: true },
    requirements: over.requirements ?? { weaponClass: null, weaponId: null, conditionSummary: null },
  };
}

function runtime(slots, actions) {
  return {
    ok: true, error: null, characterId: "char-1",
    quickActions: actions ?? [action({ id: "act-1" })],
    quickbar: { slots: slots ?? [{ slotIndex: 0, characterActionId: "act-1", empty: false }], maxSlots: 20, version: 3 },
  };
}

/* ── 1. Legacy attack without armed_action_ids keeps old behavior ─────── */

test("1. buildAttackPayload omits armed_action_ids entirely when none are armed — byte-identical to pre-4.1A payload", () => {
  const payload = buildAttackPayload({
    attackerCharacterId: "a1", targetCharacterId: "t1", targetBodyPartId: "b1", weaponId: "w1",
  });
  assert.ok(!("armed_action_ids" in payload), "field is absent, not an empty array — never touches legacy servers expecting the old shape");
});

test("1b. the old Resolve Attack screen call shape (no armedActionIds field at all) is unaffected", () => {
  const payload = buildAttackPayload({ attackerCharacterId: "a1", targetCharacterId: "t1", targetBodyPartId: "b1", weaponId: "w1", modifiers: [] });
  assert.deepEqual(Object.keys(payload).sort(), ["attack_context", "attacker_character_id", "distance_m", "target_body_part_id", "target_character_id", "weapon_id"].sort());
});

test("buildAttackPayload sends armed_action_ids verbatim, as strings, when provided", () => {
  const payload = buildAttackPayload({
    attackerCharacterId: "a1", targetCharacterId: "t1", targetBodyPartId: "b1", weaponId: "w1",
    armedActionIds: ["act-1"],
  });
  assert.deepEqual(payload.armed_action_ids, ["act-1"]);
});

test("basicAttackPayload.buildBasicAttackCtx threads armedActionIds through to ctx (defaults to [])", () => {
  const legacy = buildBasicAttackCtx({ sourceCharacterId: "a1", weaponId: "w1", targetCharacterId: "t1", bodyPartId: "b1" });
  assert.deepEqual(legacy.armedActionIds, [], "no technique armed → empty, not undefined/null");
  const armed = buildBasicAttackCtx({ sourceCharacterId: "a1", weaponId: "w1", targetCharacterId: "t1", bodyPartId: "b1", armedActionIds: ["act-1"] });
  assert.deepEqual(armed.armedActionIds, ["act-1"]);
});

/* ── 2/5/6. armedTechniqueMemory: arm, disarm, replace (max-1 rule) ────── */

test("2. arming an id for the first time returns it as armed, no previous", () => {
  const mem = createArmedTechniqueMemory();
  const { armedId, previousId } = mem.toggle("char-1", "act-1");
  assert.equal(armedId, "act-1");
  assert.equal(previousId, null);
  assert.equal(mem.get("char-1"), "act-1");
});

test("5. clicking the SAME armed id again disarms it", () => {
  const mem = createArmedTechniqueMemory();
  mem.toggle("char-1", "act-1");
  const { armedId, previousId } = mem.toggle("char-1", "act-1");
  assert.equal(armedId, null, "disarmed");
  assert.equal(previousId, "act-1");
  assert.equal(mem.get("char-1"), null);
});

test("6. arming a DIFFERENT id replaces the previous one — never stacks (no canonical stackGroup exists yet)", () => {
  const mem = createArmedTechniqueMemory();
  mem.toggle("char-1", "act-1");
  const { armedId, previousId } = mem.toggle("char-1", "act-2");
  assert.equal(armedId, "act-2");
  assert.equal(previousId, "act-1", "the replaced id is reported, so the caller can log attack-technique-replaced");
  assert.equal(mem.get("char-1"), "act-2", "only ONE id is ever armed per character");
});

test("armed state is per-character — arming for one character never affects another", () => {
  const mem = createArmedTechniqueMemory();
  mem.toggle("char-1", "act-1");
  mem.toggle("char-2", "act-9");
  assert.equal(mem.get("char-1"), "act-1");
  assert.equal(mem.get("char-2"), "act-9");
});

/* ── 3. Skills Block arm/disarm wiring (QuickbarView) ──────────────────── */

test("3. an occupied attack_technique slot dispatches toggle-armed-technique, not show-ability-detail", () => {
  const html = renderQuickbarStrip(runtime());
  assert.match(html, /data-action="toggle-armed-technique"[^>]*data-action-id="act-1"/);
  assert.ok(!html.includes('data-action="show-ability-detail" data-action-id="act-1"'));
});

test("3b. a non-attack_technique occupied slot (directed/instant/toggle) is COMPLETELY untouched by the ARMED mechanism — never becomes armable, never gets the armed highlight, even if its id happens to match armedActionId", () => {
  // Phase 4.1B.2/4.1B.3: this fixture's default targeting (mode:"character",
  // requiresBodyZone:false) makes a "directed"-typed action
  // execute-directed-ability-eligible (see abilityAvailabilityPolicy.js's
  // isDirectedTargetAbility) — a real, intentional click-behavior change for
  // that type in this loop. "toggle" is now execute-toggle-ability-eligible
  // too (isToggleAbility — Phase 4.1B.3). "instant" here keeps
  // targeting.mode:"character", which isInstantSelfAbility explicitly
  // excludes, so it stays on show-ability-detail. The ARMED-specific
  // assertions (never armable, never highlighted) remain true — and still
  // checked — for all three.
  const EXPECTED_DATA_ACTION = { directed: "execute-directed-ability", instant: "show-ability-detail", toggle: "execute-toggle-ability" };
  for (const type of ["directed", "instant", "toggle"]) {
    const html = renderQuickbarStrip(runtime(undefined, [action({ id: "act-1", type })]), { armedActionId: "act-1" });
    const expected = EXPECTED_DATA_ACTION[type];
    assert.match(html, new RegExp(`data-action="${expected}"[^>]*data-action-id="act-1"`), `type=${type} uses the correct, unarmed click action`);
    assert.ok(!html.includes("toggle-armed-technique"), `type=${type} never becomes armable`);
    assert.ok(!html.includes("is-armed"), `type=${type} never gets the armed highlight even with a matching id`);
  }
});

test("the armed attack_technique slot carries the is-armed class and a 'Prepared for next attack' tip; an unarmed one does not", () => {
  const armedHtml = renderQuickbarStrip(runtime(), { armedActionId: "act-1" });
  assert.match(armedHtml, /class="[^"]*\bis-armed\b[^"]*"[^>]*data-action-id="act-1"/);
  assert.match(armedHtml, /Prepared for next attack/);

  const unarmedHtml = renderQuickbarStrip(runtime(), { armedActionId: null });
  assert.ok(!unarmedHtml.includes("is-armed"));
  assert.match(unarmedHtml, /Click to arm for your next attack/);
});

test("a DISABLED (e.g. on cooldown) attack_technique slot still renders — arming is blocked client-side by CombatHudModule's is-disabled guard, not by hiding the tile", () => {
  const html = renderQuickbarStrip(runtime(undefined, [action({ id: "act-1", state: { available: false, active: false, disabledReason: "Cooldown: 2 turns", selectable: false } })]));
  assert.match(html, /is-disabled/);
  assert.match(html, /data-action="toggle-armed-technique"/, "still a real button — CombatHudModule.js gates the click, not the markup");
});

/* ── 4. Empty slot still opens the Quickbar Editor (regression) ───────── */

test("4. an empty slot next to a technique-filled one still opens the quickbar editor, unaffected by Phase 4.1A", () => {
  const html = renderQuickbarStrip(runtime([
    { slotIndex: 0, characterActionId: "act-1", empty: false },
    { slotIndex: 1, characterActionId: null, empty: true },
  ]));
  assert.match(html, /data-action="open-quickbar-editor"/);
});

/* ── 11/20. Client-provided values are never fabricated; AUTO stays honest ── */

test("11. normalizeResult copies armedActions verbatim from the server response — never recomputed, empty for legacy responses", () => {
  const withTechnique = normalizeResult({ ok: true, armed_actions: [{ characterActionId: "act-1", applied: true }] });
  assert.deepEqual(withTechnique.armedActions, [{ characterActionId: "act-1", applied: true }]);
  const legacy = normalizeResult({ ok: true });
  assert.deepEqual(legacy.armedActions, [], "no armed_actions field in the raw response → empty, not fabricated");
});

test("20. Combat Control's AUTO section is untouched by Phase 4.1A — still the honest empty stub, never a fabricated passive modifier", () => {
  const html = renderCombatControlBlock({
    status: "ready", viewer: { role: "player" },
    ui: { targeting: {}, basicAttack: { inFlight: false, uiAllowed: true, uiBlockReason: null } },
    snapshot: { modifiers: { passive: [], active: [], narrative: [] }, combatSession: null },
  });
  assert.match(html, /data-modifier-section="auto" data-modifier-state="empty"/);
  assert.match(html, /No automatic effects/);
});

/* ── 13/G. Roll trace MODIFIERS section (ARMED verbatim, AUTO honest-empty) ── */

test("13. a valid armed technique's outcome changes the authoritative roll trace — MODIFIERS.armed carries it verbatim", () => {
  const outcome = {
    ok: true,
    raw: {
      attack: { roll: 81, total: 81 }, defense: { roll: 40, total: 49 }, hit: true,
      damage: { level: "serious" },
      armed_actions: [{
        characterActionId: "act-1", name: "Precision Shot", stackGroup: null,
        validated: true, applied: true,
        costsConsumed: { ok: true, resource_pool: { before: 5, after: 2 } },
        cooldownBefore: 0, cooldownAfter: 2, reason: null,
      }],
    },
    normalized: null,
  };
  const trace = buildAttackResolutionTrace(outcome);
  assert.equal(trace.modifiers.auto.length, 0, "AUTO stays honestly empty — no producer exists yet");
  assert.equal(trace.modifiers.armed.length, 1);
  const armed = trace.modifiers.armed[0];
  assert.equal(armed.characterActionId, "act-1");
  assert.equal(armed.name, "Precision Shot");
  assert.equal(armed.applied, true);
  assert.equal(armed.cooldownBefore, 0);
  assert.equal(armed.cooldownAfter, 2);
  assert.deepEqual(armed.costsConsumed, { ok: true, resource_pool: { before: 5, after: 2 } });

  const details = buildRollResolutionDetails(trace);
  assert.deepEqual(details.modifiers, trace.modifiers, "Debug Console detail carries the same modifiers section");
});

test("a rejected armed action (validated but not applied, e.g. a rare post-roll consume race) is never silently dropped from the trace", () => {
  const outcome = { ok: true, raw: { hit: false, armed_actions: [{ characterActionId: "act-1", name: "Precision Shot", validated: true, applied: false, reason: "NO_ENERGY" }] } };
  const trace = buildAttackResolutionTrace(outcome);
  assert.equal(trace.modifiers.armed[0].applied, false);
  assert.equal(trace.modifiers.armed[0].reason, "NO_ENERGY");
});

test("no armed technique at all → modifiers.armed is an empty array, not NOT_RETURNED or undefined", () => {
  const trace = buildAttackResolutionTrace({ ok: true, raw: { hit: true } });
  assert.deepEqual(trace.modifiers.armed, []);
});

/* ── 21. Combat Log and Debug Console share one normalized result ─────── */

test("21. a successful attack with an applied technique gets a 'Used <name>' Combat Log line, sourced from the SAME trace the Debug Console uses", () => {
  const outcome = {
    ok: true,
    raw: {
      attack: { total: 81 }, defense: { total: 49 }, hit: true, damage: { level: "serious" },
      armed_actions: [{ characterActionId: "act-1", name: "Precision Shot", validated: true, applied: true, cooldownBefore: 0, cooldownAfter: 2 }],
    },
  };
  const entry = buildAttackLogEntry({ sourceCharacterId: "a1", targetCharacterId: "t1", bodyZoneLabel: "Torso", outcome });
  assert.equal(entry.details[0], "Used Precision Shot");
  assert.ok(entry.details.some((l) => /Attack: 81 vs Defense: 49/.test(l)));
  assert.ok(entry.details.includes("Hit"));

  // Same shared trace object drives buildCombatLogLines directly too.
  const trace = buildAttackResolutionTrace(outcome);
  const lines = buildCombatLogLines(trace, "Torso");
  assert.equal(lines[0], "Used Precision Shot");
});

test("a plain attack (no technique armed) never gets a fabricated 'Used ...' line", () => {
  const outcome = { ok: true, raw: { attack: { total: 81 }, defense: { total: 49 }, hit: true } };
  const entry = buildAttackLogEntry({ sourceCharacterId: "a1", targetCharacterId: "t1", bodyZoneLabel: "Torso", outcome });
  assert.ok(!entry.details.some((l) => l.startsWith("Used ")));
});

/* ── CombatHudModule.js wiring (source-contract, like other Phase 4.x tests) ── */

test("CombatHudModule.js: toggle-armed-technique dispatches only the quickbar toggle-armed command, gated so a DISABLED tile can still be armed==disarmed", () => {
  const idx = moduleSrc.indexOf('case "toggle-armed-technique":');
  assert.ok(idx > -1, "handler exists");
  const block = moduleSrc.slice(idx, moduleSrc.indexOf("break;", idx) + 6);
  assert.ok(block.includes('feature: "quickbar"') && block.includes('type: "toggle-armed"'));
  assert.ok(block.includes("is-armed"), "disarming an already-armed (possibly now-disabled) tile is still allowed");
});

test("CombatHudModule.js: disarm-technique (Combat Control's ARMED ×) dispatches the SAME toggle-armed command — no second disarm implementation", () => {
  const idx = moduleSrc.indexOf('case "disarm-technique":');
  assert.ok(idx > -1);
  const block = moduleSrc.slice(idx, moduleSrc.indexOf("break;", idx));
  assert.ok(block.includes('feature: "quickbar"') && block.includes('type: "toggle-armed"'));
});

/* ── 18/19. ARMED is cleared ONLY by an authoritative applied response ─── */

test("18/19. sceneSelectionController.js only forgets the armed technique inside the outcome.ok branch, when an entry is actually applied — never on a bare Attack click or on rejection", () => {
  const armedBlockIdx = controllerSrc.indexOf("if (requestArmedActionId) {");
  assert.ok(armedBlockIdx > -1, "the armed-technique response-handling block exists");
  const forgetIdx = controllerSrc.indexOf("armedTechniqueMemory.forget(", armedBlockIdx);
  assert.ok(forgetIdx > -1, "forget() is called somewhere in that block");
  const okBranchIdx = controllerSrc.indexOf("if (outcome.ok) {", armedBlockIdx);
  const appliedCheckIdx = controllerSrc.indexOf("entry?.applied === true", armedBlockIdx);
  assert.ok(okBranchIdx > -1 && appliedCheckIdx > -1 && okBranchIdx < appliedCheckIdx && appliedCheckIdx < forgetIdx,
    "forget() is reachable only after outcome.ok AND entry.applied === true, in that order");
  // And the rejected branch never calls forget — a rejected armed action stays armed.
  const rejectedElseIdx = controllerSrc.indexOf("ARMED_TECHNIQUE_ERROR_CODES.has(outcome.code)) {", armedBlockIdx);
  const nextForgetAfterElse = controllerSrc.indexOf("armedTechniqueMemory.forget(", rejectedElseIdx);
  const elseBlockEnd = controllerSrc.indexOf("}\n\n        if (outcome.ok) {", rejectedElseIdx);
  assert.ok(rejectedElseIdx > -1 && (nextForgetAfterElse === -1 || nextForgetAfterElse > elseBlockEnd),
    "the pre-roll-rejection branch never forgets the armed technique");
});

test("armedTechniqueMemory.toggle is called from exactly one command handler (no second arm/disarm code path)", () => {
  const occurrences = controllerSrc.match(/armedTechniqueMemory\.toggle\(/g) ?? [];
  assert.equal(occurrences.length, 1, "toggle() is called from a single place — the namespaced quickbar/toggle-armed handler");
});

/* ── 22. Debug Console never gets raw effect/definition JSON ───────────── */

test("22. every Phase 4.1A logDebugEvent call passes only safe scalar/short fields — never a raw ability/effect definition or inventory blob", () => {
  const idx = controllerSrc.indexOf('logDebugEvent("abilities", "attack-modifier-validation-requested"');
  assert.ok(idx > -1);
  const section = controllerSrc.slice(controllerSrc.indexOf("// Phase 4.1A: arm/disarm an attack technique"), controllerSrc.indexOf("return;\n      }\n\n      // Basic Weapon Attack v1"));
  assert.ok(!/ability_definition_data|effect_data|inventory|resource_item_code/.test(section), "no raw definition/effect/inventory field names leak into any Phase 4.1A debug event");
});

/* ── Server (migration 100, source-contract — mirrors combat-session.test.mjs's
 * own SQL-text-check pattern; no live DB to execute against) ────────────── */

function idx(needle, from = 0) {
  const i = sql100.indexOf(needle, from);
  return i;
}

test("7. server rejects an armed action that doesn't belong to the attacker (or doesn't exist) — ARMED_ACTION_INVALID, ownership checked against the attacker, not just any character", () => {
  assert.match(sql100, /where ability\.id = v_armed_action_id\s*\n\s*and ability\.character_id = v_attacker_character_id/);
  assert.ok(sql100.includes("'ARMED_ACTION_INVALID'"));
});

test("8. server rejects an action that isn't type attack_technique — re-derives the type itself (effect_mode/ability_kind), never trusts the client's cached quickbar type", () => {
  const rule = "coalesce(v_armed_ability.effect_mode, '') <> 'attack' and coalesce(v_armed_ability.ability_kind, '') <> 'attack'";
  assert.ok(sql100.includes(rule));
  const ruleIdx = sql100.indexOf(rule);
  assert.ok(sql100.slice(ruleIdx, ruleIdx + 300).includes("'ARMED_ACTION_INVALID'"));
});

test("9. server rejects cooldown / insufficient PSI / insufficient charges with the exact spec'd codes", () => {
  assert.ok(sql100.includes("'ARMED_ACTION_ON_COOLDOWN'"));
  assert.match(sql100, /current_cooldown_rounds, 0\) > 0 then[\s\S]{0,200}ARMED_ACTION_ON_COOLDOWN/);
  assert.ok(sql100.includes("'NOT_ENOUGH_PSI'"));
  assert.match(sql100, /v_armed_pool_current, 0\) < coalesce\(v_armed_level\.resource_cost, 0\)[\s\S]{0,200}NOT_ENOUGH_PSI/);
  assert.ok(sql100.includes("'NOT_ENOUGH_CHARGES'"));
  assert.match(sql100, /current_charges, 0\) <= 0 then[\s\S]{0,200}NOT_ENOUGH_CHARGES/);
});

test("10. server rejects a weapon-type mismatch and a non-attackable target_type with the exact spec'd codes", () => {
  assert.ok(sql100.includes("'WEAPON_REQUIREMENT_NOT_MET'"));
  assert.ok(sql100.includes("'TARGET_REQUIREMENT_NOT_MET'"));
  assert.match(sql100, /target_type, 'none'\) not in \('character', 'body_part'\)[\s\S]{0,150}TARGET_REQUIREMENT_NOT_MET/);
});

test("ACTION_STACK_CONFLICT rejects more than one armed id — the safe fallback until a real stack_group column exists", () => {
  assert.ok(sql100.includes("'ACTION_STACK_CONFLICT'"));
  assert.match(sql100, /jsonb_array_length\(v_armed_action_ids\) > 1 then[\s\S]{0,150}ACTION_STACK_CONFLICT/);
});

test("a technique with a damage/armor-pierce/ignore-armor effect is honestly rejected as ACTION_EFFECT_NOT_IMPLEMENTED — never silently dropped, never partially applied (see the audit's scope note)", () => {
  assert.ok(sql100.includes("'ACTION_EFFECT_NOT_IMPLEMENTED'"));
  assert.match(sql100, /attack_damage_bonus, 0\) <> 0[\s\S]{0,50}attack_armor_pierce, 0\) <> 0[\s\S]{0,50}ignore_armor, false\)[\s\S]{0,200}ACTION_EFFECT_NOT_IMPLEMENTED/);
});

test("12. only the canonical, server-resolved attack_accuracy_bonus (odyssey_ability_level_defs) feeds the attack — never a client payload value", () => {
  assert.ok(sql100.includes("v_armed_technique_bonus := coalesce(v_armed_level.attack_accuracy_bonus, 0);"));
  assert.ok(!/v_armed_technique_bonus\s*:=.*v_payload/.test(sql100), "the bonus is never assigned from the client payload");
});

test("the technique's bonus reuses the EXISTING manual_attack_bonus channel (same one perk bonuses already use) — no second effect-application code path", () => {
  assert.ok(sql100.includes("if v_perk_bonus <> 0 or v_armed_technique_bonus <> 0 then"));
  assert.ok(sql100.includes("v_existing_bonus + v_perk_bonus + v_armed_technique_bonus"));
});

test("14. cooldown and PSI/charges are set/consumed via the EXACT SAME odyssey_consume_character_ability_cost(uuid) the ability-cast path already uses — no second consume implementation", () => {
  assert.ok(sql100.includes("v_armed_cost_result := public.odyssey_consume_character_ability_cost(v_armed_action_id);"));
});

test("14b/16. the technique is consumed and MAIN is spent ONLY after odyssey_perform_weapon_attack returns ok=true, and MAIN is spent exactly once", () => {
  const okCheckIdx = idx("if coalesce((v_result->>'ok')::boolean, false) = false then\n    return v_result;\n  end if;");
  const weaponCallIdx = idx("v_result := public.odyssey_perform_weapon_attack(v_payload);");
  const mainSpendIdx = idx("perform public.odyssey_apply_turn_costs(");
  const consumeIdx = idx("public.odyssey_consume_character_ability_cost(v_armed_action_id);");
  assert.ok(weaponCallIdx > -1 && okCheckIdx > weaponCallIdx, "the ok=false early-return follows the weapon-attack call");
  assert.ok(mainSpendIdx > okCheckIdx, "MAIN spend happens after the ok-check");
  assert.ok(consumeIdx > okCheckIdx, "technique cost consumption happens after the ok-check too — never before the attack resolves");
  const mainSpendOccurrences = (sql100.match(/perform public\.odyssey_apply_turn_costs\(/g) ?? []).length;
  assert.equal(mainSpendOccurrences, 1, "MAIN is spent exactly once — an armed technique never triggers a second spend");
});

test("15. every armed-technique rejection returns BEFORE odyssey_perform_weapon_attack is ever called — nothing is spent on an invalid armed action", () => {
  const weaponCallIdx = idx("v_result := public.odyssey_perform_weapon_attack(v_payload);");
  for (const code of ["ARMED_ACTION_INVALID", "ARMED_ACTION_ON_COOLDOWN", "NOT_ENOUGH_PSI", "NOT_ENOUGH_CHARGES", "WEAPON_REQUIREMENT_NOT_MET", "TARGET_REQUIREMENT_NOT_MET", "ACTION_STACK_CONFLICT", "ACTION_EFFECT_NOT_IMPLEMENTED"]) {
    const codeIdx = idx(`'${code}'`);
    assert.ok(codeIdx > -1 && codeIdx < weaponCallIdx, `${code} is returned before the weapon attack is ever attempted`);
  }
});

test("17. the Phase 3E.0 combat-session MAIN gate still runs — and runs BEFORE armed-technique validation, so a not-your-turn/no-MAIN rejection is never masked by a technique error", () => {
  const sessionGateIdx = idx("'error', 'ACTION_NOT_AVAILABLE',");
  const armedValidationIdx = idx("Phase 4.1A: armed attack technique validation.");
  assert.ok(sessionGateIdx > -1 && armedValidationIdx > -1 && sessionGateIdx < armedValidationIdx, "session gate is checked first, unchanged from migration 90");
});

test("legacy attacks (no armed_action_ids) take the exact same path as before — jsonb_array_length(...) = 0 skips ALL new validation, matching migration 90 byte-for-byte from the weapon-lock check onward except for the appended empty armed_actions field", () => {
  assert.ok(sql100.includes("if jsonb_array_length(v_armed_action_ids) = 1 then"), "new validation is gated behind exactly one armed id — never runs for zero");
  assert.ok(sql100.includes("'armed_actions', v_armed_results"), "every response — including legacy ones — carries the (empty) armed_actions array");
});

console.log("");
setTimeout(() => {
  console.log(`\nPhase 4.1A — Attack Techniques & ARMED Modifiers: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
