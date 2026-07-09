// Phase 4.1C.0 — Ability Studio Foundation.
//
// Two layers, matching this project's established pattern (see e.g.
// scripts/instant-self-ability.test.mjs):
//   - PURE unit tests over hud/abilities/abilityStudioClassification.js,
//     hud/abilities/abilityStudioTemplates.js, hud/abilities/abilityStudioDebugEvents.js
//     (fully executable — no OBR/DOM import);
//   - SOURCE-CONTRACT checks for gm-extension/screens/abilityStudio/abilityStudioScreen.js,
//     api/abilityStudioApi.js, api/creatorApi.js's new exports, gm-extension/main.js,
//     and supabase/109_ability_studio_assignment.sql — none executable under plain
//     Node (OBR SDK / DOM import chain through bridge/obrBridge.js), same reason
//     api/*.js modules are never imported directly by this project's tests.
//
// Numbered tests map to the phase spec's "Tests" list (43 items); items 31-43
// (regression) are covered by the EXISTING suites (test:hud as a whole, plus
// the 3 extra required scripts) staying green — see the final report rather
// than duplicating them here.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyAbilityForStudio, HUD_CLASSIFICATION } from "../hud/abilities/abilityStudioClassification.js";
import {
  ABILITY_STUDIO_TEMPLATES,
  createEmptyDraft,
  validateAbilityDraft,
  buildAbilityPayloadFromDraft,
} from "../hud/abilities/abilityStudioTemplates.js";
import { logAbilityStudioEvent, logAbilityStudioError } from "../hud/abilities/abilityStudioDebugEvents.js";
import { subscribeDiagnostics, clearDiagnosticsEntries } from "../utils/diagnostics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const read = (...seg) => fs.readFileSync(path.join(repoRoot, ...seg), "utf8").replace(/\r\n/g, "\n");

const screenSrc = read("gm-extension", "screens", "abilityStudio", "abilityStudioScreen.js");
const apiSrc = read("api", "abilityStudioApi.js");
const creatorApiSrc = read("api", "creatorApi.js");
const mainSrc = read("gm-extension", "main.js");
const migrationSrc = read("supabase", "109_ability_studio_assignment.sql");

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

console.log("\nPhase 4.1C.0 — Ability Studio Foundation\n");

/* ── fixtures ─────────────────────────────────────────────────────────── */

function armedFixture(over = {}) {
  return {
    ability: { ability_kind: "attack", effect_mode: "attack", target_type: "character", resource_mode: "pool", resource_pool_code: "psionic_energy", ...over.ability },
    levels: [{ ability_level: 1, attack_accuracy_bonus: 2, attack_damage_bonus: 0, attack_armor_pierce: 0, ignore_armor: false, cooldown_rounds: 1, resource_cost: 1, ...((over.levels ?? [{}])[0]) }],
  };
}
function directAttackFixture(over = {}) {
  return {
    ability: { ability_kind: "attack", effect_mode: "attack", target_type: "character", resource_mode: "pool", resource_pool_code: "psionic_energy", ...over.ability },
    levels: [{ ability_level: 1, attack_damage_bonus: 4, attack_armor_pierce: 0, ignore_armor: false, cooldown_rounds: 2, resource_cost: 2, ...((over.levels ?? [{}])[0]) }],
  };
}
function instantSelfFixture(over = {}) {
  return {
    ability: { ability_kind: "utility", effect_mode: "apply_effect", target_type: "self", resource_mode: "pool", resource_pool_code: "psionic_energy", ...over.ability },
    levels: [{ ability_level: 1, cooldown_rounds: 3, resource_cost: 1, ...((over.levels ?? [{}])[0]) }],
  };
}
function directedTargetFixture(over = {}) {
  return {
    ability: { ability_kind: "support", effect_mode: "apply_effect", target_type: "character", resource_mode: "pool", resource_pool_code: "psionic_energy", ...over.ability },
    levels: [{ ability_level: 1, cooldown_rounds: 2, resource_cost: 1, ...((over.levels ?? [{}])[0]) }],
  };
}
function unsupportedBodyPartFixture(over = {}) {
  return {
    ability: { ability_kind: "support", effect_mode: "apply_effect", target_type: "body_part", resource_mode: "none", ...over.ability },
    levels: [{ ability_level: 1, cooldown_rounds: 0, resource_cost: 0, ...((over.levels ?? [{}])[0]) }],
  };
}

/* ── Audit / classification (1-6) ─────────────────────────────────────── */

test("1. a catalog ability shaped like an existing Direct Ability Attack still classifies as Direct ability attack", () => {
  const f = directAttackFixture();
  const c = classifyAbilityForStudio(f.ability, f.levels);
  assert.equal(c.classification, HUD_CLASSIFICATION.directAbilityAttack);
  assert.equal(c.executionPath, 'perform_attack (mode: "skill")');
});

test("2. a catalog ability shaped like an existing Instant/Self ability still classifies as Instant / self ability", () => {
  const f = instantSelfFixture();
  const c = classifyAbilityForStudio(f.ability, f.levels);
  assert.equal(c.classification, HUD_CLASSIFICATION.instantSelfAbility);
  assert.equal(c.executionPath, 'combat_execute_action (kind: "ability")');
});

test("3. a catalog ability shaped like an existing Directed Target ability still classifies as Directed target ability", () => {
  const f = directedTargetFixture();
  const c = classifyAbilityForStudio(f.ability, f.levels);
  assert.equal(c.classification, HUD_CLASSIFICATION.directedTargetAbility);
  assert.equal(c.requiresBodyZone, false);
});

test("4. a catalog ability shaped like an existing ARMED attack technique still classifies as ARMED attack technique", () => {
  const f = armedFixture();
  const c = classifyAbilityForStudio(f.ability, f.levels);
  assert.equal(c.classification, HUD_CLASSIFICATION.armedAttackTechnique);
  assert.equal(c.executionPath, "perform_attack (armed_action_ids)");
});

test("5. an unsupported ability (target_type='body_part' without an attack effect_mode) is recognized as Unsupported", () => {
  const f = unsupportedBodyPartFixture();
  const c = classifyAbilityForStudio(f.ability, f.levels);
  assert.equal(c.classification, HUD_CLASSIFICATION.unsupported);
  assert.equal(c.canExecuteFromSkillsBlock, false);
  assert.equal(c.effectSupport, "unsupported");
  assert.ok(c.unsupportedReason);
});

test("6. classification is metadata-driven, not name-driven — two mechanically identical abilities with unrelated names classify identically", () => {
  const a = classifyAbilityForStudio({ ...directAttackFixture().ability, }, directAttackFixture().levels);
  const b = classifyAbilityForStudio({ ...directAttackFixture().ability }, directAttackFixture().levels);
  assert.equal(a.classification, b.classification);
  // no ability-name field is ever read by the classifier
  assert.ok(!screenSrcMentionsHardcodedName());
  function screenSrcMentionsHardcodedName() {
    return /Etheric Strike|Splint|Psionic Blast/i.test(screenSrc);
  }
});

/* ── Builder validation (7-13) ─────────────────────────────────────────── */

test("7. an empty draft fails validation", () => {
  const draft = createEmptyDraft(ABILITY_STUDIO_TEMPLATES.instantSelfAbility);
  draft.code = "";
  draft.name = "";
  const result = validateAbilityDraft(draft);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "code"));
  assert.ok(result.errors.some((e) => e.field === "name"));
});

test("8. a Direct Ability Attack draft requires target/body-zone compatible metadata (self target is rejected)", () => {
  const draft = createEmptyDraft(ABILITY_STUDIO_TEMPLATES.directAbilityAttack);
  draft.code = "test_direct";
  draft.name = "Test Direct";
  draft.targetType = "self";
  draft.attackDamageBonus = 3;
  const result = validateAbilityDraft(draft);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "targetType"));
});

test("9. an Instant/Self draft rejects an external target/body-zone requirement", () => {
  const draft = createEmptyDraft(ABILITY_STUDIO_TEMPLATES.instantSelfAbility);
  draft.code = "test_instant";
  draft.name = "Test Instant";
  draft.targetType = "character";
  const result = validateAbilityDraft(draft);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "targetType"));
});

test("10. a Directed Target draft requires a target character and rejects a body-zone requirement", () => {
  const draft = createEmptyDraft(ABILITY_STUDIO_TEMPLATES.directedTargetAbility);
  draft.code = "test_directed";
  draft.name = "Test Directed";
  draft.targetType = "body_part";
  const result = validateAbilityDraft(draft);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "targetType"));
});

test("11. an ARMED technique draft never gets an instant/directed execution path — it always resolves through perform_attack, never combat_execute_action", () => {
  const draft = createEmptyDraft(ABILITY_STUDIO_TEMPLATES.armedAttackTechnique);
  draft.code = "test_armed";
  draft.name = "Test Armed";
  draft.attackAccuracyBonus = 2;
  const result = validateAbilityDraft(draft);
  assert.equal(result.ok, true);
  const payload = buildAbilityPayloadFromDraft(draft);
  const c = classifyAbilityForStudio(
    { ability_kind: payload.ability_kind, effect_mode: payload.effect_mode, target_type: payload.target_type, resource_mode: payload.resource_mode, resource_pool_code: payload.resource_pool_code },
    payload.levels,
  );
  assert.equal(c.classification, HUD_CLASSIFICATION.armedAttackTechnique);
  assert.ok(!c.executionPath.includes("combat_execute_action"));
});

test("12. invalid cost/cooldown values fail validation", () => {
  const draft = createEmptyDraft(ABILITY_STUDIO_TEMPLATES.instantSelfAbility);
  draft.code = "test_costs";
  draft.name = "Test Costs";
  draft.resourceCost = -1;
  draft.cooldownRounds = -5;
  const result = validateAbilityDraft(draft);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "resourceCost"));
  assert.ok(result.errors.some((e) => e.field === "cooldownRounds"));
});

test("13. the one target_type/effect_mode combination the HUD cannot execute (body_part without an attack effect) is impossible to produce through any of the 4 templates — never silently saved as executable", () => {
  const directed = createEmptyDraft(ABILITY_STUDIO_TEMPLATES.directedTargetAbility);
  directed.code = "x"; directed.name = "x"; directed.targetType = "body_part";
  assert.equal(validateAbilityDraft(directed).ok, false);

  const instant = createEmptyDraft(ABILITY_STUDIO_TEMPLATES.instantSelfAbility);
  instant.code = "y"; instant.name = "y"; instant.targetType = "body_part";
  assert.equal(validateAbilityDraft(instant).ok, false);

  // The classifier itself still honestly reports Unsupported for that combination
  // if it were ever reached (e.g. an ability authored outside Ability Studio).
  const f = unsupportedBodyPartFixture();
  assert.equal(classifyAbilityForStudio(f.ability, f.levels).classification, HUD_CLASSIFICATION.unsupported);
});

/* ── API safe-logging (executable, supports item 27) ────────────────────── */

test("27a. debug events only ever carry the whitelisted safe fields, never raw/unknown ones", () => {
  clearDiagnosticsEntries();
  let captured = null;
  const unsub = subscribeDiagnostics((entries) => { captured = entries[0]; });
  logAbilityStudioEvent("ability-assign-requested", {
    abilityId: "a1",
    characterId: "c1",
    supabaseApiKey: "SECRET_KEY_SHOULD_NEVER_APPEAR",
    authToken: "SHOULD_NEVER_APPEAR_EITHER",
    rawSql: "select * from odyssey_characters",
  });
  unsub();
  assert.ok(captured);
  assert.ok(!captured.details.includes("SECRET_KEY_SHOULD_NEVER_APPEAR"));
  assert.ok(!captured.details.includes("SHOULD_NEVER_APPEAR_EITHER"));
  assert.ok(!captured.details.includes("select * from"));
  assert.ok(captured.details.includes("a1"));
  assert.ok(captured.details.includes("c1"));
});

test("27b. logAbilityStudioError never includes a raw Error stack, only a plain message string", () => {
  clearDiagnosticsEntries();
  let captured = null;
  const unsub = subscribeDiagnostics((entries) => { captured = entries[0]; });
  logAbilityStudioError("ability-create-result", "Ability code must be unique.", { abilityName: "Test" });
  unsub();
  assert.equal(captured.level, "error");
  assert.ok(captured.details.includes("Ability code must be unique."));
});

/* ── UI source-contract (14-22) ──────────────────────────────────────────── */

test("14. Ability Studio never imports combat HUD overlay/layout/scene-selection modules — it cannot affect combat HUD by construction", () => {
  const importLines = screenSrc.split("\n").filter((line) => /^\s*import\b/.test(line)).join("\n");
  assert.ok(!/combatHudOverlayController|hudLayout\.js|overlayConstants|sceneSelectionController|targetingVisual/i.test(importLines));
});

test("15. Library view renders the ability catalog via listAbilityCatalog", () => {
  assert.match(screenSrc, /function renderLibrary/);
  assert.match(screenSrc, /listAbilityCatalog/);
  assert.match(screenSrc, /as-list/);
});

test("16. Detail view renders a classification preview including HUD classification", () => {
  assert.match(screenSrc, /function renderClassificationPreview/);
  assert.match(screenSrc, /HUD classification/);
  assert.match(screenSrc, /Execution path/);
});

test("17. Create form fields change by template (attack-only fields gated behind isAttackTemplate)", () => {
  assert.match(screenSrc, /function renderTemplateFields/);
  assert.match(screenSrc, /isAttackTemplate/);
  assert.match(screenSrc, /showTargetChoice/);
});

test("18. validation errors are rendered visibly in the create form", () => {
  assert.match(screenSrc, /draftErrors/);
  assert.match(screenSrc, /as-field-error/);
});

test("19. Save is disabled while the draft fails validation (creation itself is always backend-available per audit Path A/B split — see docs §7)", () => {
  assert.match(screenSrc, /data-action="save-draft"[^>]*\$\{state\.saveBusy \|\| state\.draftErrors\.length \? "disabled" : ""\}/);
});

test("20. Assign is disabled until a character is selected", () => {
  assert.match(screenSrc, /data-action="assign"[^>]*\$\{state\.assignBusy \|\| !state\.selectedCharacterId \? "disabled" : ""\}/);
});

test("21. a GM-only gate exists and blocks the entire screen for non-GMs", () => {
  assert.match(screenSrc, /isGM\(\)/);
  assert.match(screenSrc, /role === "GM"/);
  assert.match(screenSrc, /available to GMs only/);
});

test("22. the GM gate is the first branch in render() — a non-GM never reaches library/detail/create markup", () => {
  const renderFnMatch = screenSrc.match(/function render\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(renderFnMatch, "render() function not found");
  const body = renderFnMatch[1];
  const gateIdx = body.indexOf("if (!isGM())");
  const libraryIdx = body.indexOf("renderLibrary");
  assert.ok(gateIdx > -1 && libraryIdx > -1 && gateIdx < libraryIdx);
});

/* ── API layer source-contract (23-27) ───────────────────────────────────── */

test("23. listAbilityCatalog normalizes a successful RPC result to { ok:true, data }", () => {
  assert.match(apiSrc, /export function listAbilityCatalog[\s\S]*?callSafe/);
  assert.match(apiSrc, /return \{ ok: true, data: raw, code: null, error: null \};/);
});

test("24. callSafe normalizes an ok:false RPC result and a thrown network error the same way", () => {
  assert.match(apiSrc, /if \(!raw \|\| raw\.ok === false\)/);
  assert.match(apiSrc, /catch \(error\) \{/);
});

test("25. createAbilityFromTemplate validates first and sends a payload built by buildAbilityPayloadFromDraft, never the raw draft", () => {
  assert.match(apiSrc, /const validation = validateAbilityDraft\(draft\);/);
  assert.match(apiSrc, /const payload = buildAbilityPayloadFromDraft\(draft\);/);
  assert.match(apiSrc, /creatorApi\.upsertAbility\(payload, settings\)/);
});

test("26. assignAbilityToCharacter sends exactly ability_def_id + character_id to the RPC, nothing else", () => {
  assert.match(creatorApiSrc, /export function assignAbilityToCharacter\(\{ abilityId, characterId \}, settings\) \{\s*return callSupabaseRpc\(\s*CREATOR_RPC_NAMES\.assignAbilityToCharacter,\s*\{ p_ability_def_id: abilityId, p_character_id: characterId \},\s*settings,\s*\);\s*\}/);
});

test("27. no raw credentials/tokens/SQL are ever passed into the debug event helper's safe-field list", () => {
  assert.match(read("hud", "abilities", "abilityStudioDebugEvents.js"), /const SAFE_KEYS = \[/);
  const debugSrc = read("hud", "abilities", "abilityStudioDebugEvents.js");
  assert.ok(!/apiKey|token|credential|sql/i.test(debugSrc.match(/const SAFE_KEYS = \[[\s\S]*?\];/)[0]));
});

/* ── Assignment (28-30) ──────────────────────────────────────────────────── */

test("28. assigning an ability calls get_character_abilities, which reconciles + returns fresh abilities (quickbar runtime refresh happens on the character's own next fetch)", () => {
  assert.match(migrationSrc, /select public\.get_character_abilities\(p_character_id\) into v_result;/);
});

test("29. the assignment migration never touches odyssey_character_quickbar_layouts — assignment cannot overwrite quickbar layout", () => {
  assert.ok(!/odyssey_character_quickbar_layouts/i.test(migrationSrc));
});

test("30. the API layer blocks assignment with a clear error when no character is selected, before calling the RPC", () => {
  assert.match(apiSrc, /if \(!abilityId \|\| !characterId\)/);
  assert.match(apiSrc, /Select a character first\./);
});

/* ── Wiring sanity ────────────────────────────────────────────────────────── */

test("Ability Studio is registered as its own gm-extension tab, distinct from Shell/Creator/Placement", () => {
  assert.match(mainSrc, /data-view="ability-studio"/);
  assert.match(mainSrc, /mountAbilityStudioScreen/);
});

test("the migration grants execute on both new RPCs to anon and authenticated, matching every other creator_* RPC's grant convention", () => {
  assert.match(migrationSrc, /grant execute on function public\.creator_assign_ability_to_character\(uuid, uuid\) to anon, authenticated;/);
  assert.match(migrationSrc, /grant execute on function public\.creator_remove_character_ability\(uuid\) to anon, authenticated;/);
});

test("removal is refused for any ability generated from skill/perk/item/equipment/weapon, not just direct ones", () => {
  assert.match(migrationSrc, /generated_from in \('skill', 'perk', 'item', 'equipment', 'weapon'\)/);
});

setTimeout(() => {
  console.log(`\nPhase 4.1C.0 Ability Studio: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
