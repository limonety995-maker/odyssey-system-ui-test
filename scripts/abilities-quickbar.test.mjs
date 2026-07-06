// HUD Abilities — Phase 4.0 quickbar foundation tests (4.0a: runtime + policy).
//
// Two layers, matching the combat-session suite:
//   - PURE unit tests over hud/abilities/* (runtime mapper, layout policy, API
//     payload builder);
//   - SERVER-CONTRACT checks over migration 92 SQL asserting the eligibility
//     filter, version-conflict guard, and whitelist live where claimed (Node
//     cannot run Postgres, so the SQL contract is pinned by content).
//
// UI behaviours (tooltip render, Skills-block rows, editor drag wiring, "click
// does not fire a combat RPC") are covered in the Phase 4.0b UI suite.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  mapQuickActionsRuntime,
  mapQuickAction,
  findQuickAction,
  QUICK_ACTION_TYPES,
  FIELD_SENTINELS,
} from "../hud/abilities/abilityRuntimeMapper.js";
import {
  buildDraft,
  assignActionToSlot,
  moveSlot,
  removeSlot,
  unassignedActions,
  validateDraft,
  draftToSavePayload,
  hasVersionConflict,
  rowOfSlot,
  isDraftDirty,
  buildSlotPayload,
} from "../hud/abilities/quickbarLayoutPolicy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sql92 = fs.readFileSync(path.join(repoRoot, "supabase", "92_ability_quickbar_foundation.sql"), "utf8");

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

console.log("\nAbilities & Quickbar Foundation (Phase 4.0)\n");

/* ───────────────────────── fixtures ───────────────────────── */

function actionFixture(over = {}) {
  return {
    characterActionId: over.id ?? "act-1",
    definitionId: "def-1",
    sourceType: over.sourceType ?? "psionic",
    type: over.type ?? "directed",
    name: over.name ?? "Mind Spike",
    shortDescription: "A psi strike",
    fullDescription: "A focused psionic strike against one target.",
    iconKey: "brain",
    semanticKind: over.semanticKind ?? "psi",
    targeting: over.targeting ?? { mode: "character", minTargets: 1, maxTargets: 1, allowAllies: false, allowSelf: false, requiresBodyZone: false },
    costs: over.costs ?? { main: 1, move: 0, psi: 3, charges: 0 },
    cooldown: over.cooldown ?? { current: 0, max: 2, unit: "turn" },
    state: over.state ?? { available: true, active: false, disabledReason: null, selectable: true },
    requirements: over.requirements ?? { weaponClass: null, weaponId: null, conditionSummary: null },
    ...over.raw,
  };
}

function runtimeFixture(over = {}) {
  return {
    ok: true,
    error: null,
    characterId: "char-1",
    quickActions: over.quickActions ?? [
      actionFixture({ id: "act-1", name: "Mind Spike", type: "directed" }),
      actionFixture({ id: "act-2", name: "Overclock", type: "toggle", state: { available: false, active: false, disabledReason: "Cooldown: 2 turns", selectable: false } }),
    ],
    quickbar: over.quickbar ?? { slots: [{ slotIndex: 0, characterActionId: "act-1" }], maxSlots: 20, version: 3 },
  };
}

/* ── 1-3. Runtime mapping + eligibility ───────────────────────────────── */

test("1. runtime contains only quickbar-eligible active actions (SQL filters passive/hidden/disabled)", () => {
  assert.ok(sql92.includes("ad.ability_kind != 'passive'"), "passive abilities excluded");
  assert.ok(sql92.includes("ca.is_hidden = false"), "hidden abilities excluded");
  assert.ok(sql92.includes("ca.is_enabled = true"), "disabled abilities excluded");
  assert.ok(sql92.includes("ad.activation_type in ('manual', 'custom')"), "only manual/custom activation");
});

test("2. a passive skill / weapon-skill bonus is not a quick action (no skill_defs join in the action query)", () => {
  const actionQuery = sql92.slice(sql92.indexOf("from public.odyssey_character_abilities ca"));
  assert.ok(!/odyssey_character_skills/.test(actionQuery), "action list does not draw from character skills");
  assert.ok(!/skill_bonus|attribute_bonus/.test(actionQuery), "no passive bonus leaks in");
});

test("3. all four action types map correctly, unknown degrades to instant", () => {
  assert.equal(mapQuickAction({ type: "attack_technique" }).type, QUICK_ACTION_TYPES.attackTechnique);
  assert.equal(mapQuickAction({ type: "directed" }).type, QUICK_ACTION_TYPES.directed);
  assert.equal(mapQuickAction({ type: "instant" }).type, QUICK_ACTION_TYPES.instant);
  assert.equal(mapQuickAction({ type: "toggle" }).type, QUICK_ACTION_TYPES.toggle);
  // hyphen / space / case tolerated
  assert.equal(mapQuickAction({ type: "Attack-Technique" }).type, QUICK_ACTION_TYPES.attackTechnique);
  // unknown → inert instant (never fabricate toggle/directed)
  assert.equal(mapQuickAction({ type: "wat" }).type, QUICK_ACTION_TYPES.instant);
  // attack semantic hint with no explicit type → attack_technique
  assert.equal(mapQuickAction({ semanticKind: "attack" }).type, QUICK_ACTION_TYPES.attackTechnique);
});

/* ── 4-7. Layout policy: assign / move / remove / duplicate ───────────── */

test("4. an empty slot is preserved through draft → save payload", () => {
  const draft = buildDraft([{ slotIndex: 2, characterActionId: "act-1" }], new Set(["act-1"]), 5);
  assert.equal(draft.length, 5);
  assert.equal(draft[0].empty, true);
  const payload = draftToSavePayload(draft);
  assert.equal(payload.length, 5, "all slots incl. empties persisted");
  assert.equal(payload[0].characterActionId, null);
  assert.equal(payload[2].characterActionId, "act-1");
});

test("5. one action cannot occupy two slots (validateDraft flags duplicate; buildDraft drops it)", () => {
  const dup = buildDraft([
    { slotIndex: 0, characterActionId: "act-1" },
    { slotIndex: 1, characterActionId: "act-1" },
  ], new Set(["act-1"]), 5);
  // buildDraft keeps only the first occurrence
  assert.equal(dup.filter((s) => s.characterActionId === "act-1").length, 1);
  // and if a corrupt draft has a dup, validateDraft catches it
  const corrupt = [
    { slotIndex: 0, characterActionId: "act-1" },
    { slotIndex: 1, characterActionId: "act-1" },
  ];
  const v = validateDraft(corrupt, 5);
  assert.equal(v.valid, false);
  assert.ok(v.errors.some((e) => e.code === "DUPLICATE_ACTION"));
});

test("6. drag slot-to-slot moves (swaps) the action", () => {
  let draft = buildDraft([{ slotIndex: 0, characterActionId: "act-1" }], new Set(["act-1"]), 5);
  draft = moveSlot(draft, 0, 3);
  assert.equal(draft[0].empty, true);
  assert.equal(draft[3].characterActionId, "act-1");
  // swap: move act-2 into occupied slot 3 → they exchange
  draft = buildDraft([
    { slotIndex: 0, characterActionId: "act-1" },
    { slotIndex: 3, characterActionId: "act-2" },
  ], new Set(["act-1", "act-2"]), 5);
  draft = moveSlot(draft, 0, 3);
  assert.equal(draft[0].characterActionId, "act-2");
  assert.equal(draft[3].characterActionId, "act-1");
});

test("7. drag library action onto an occupied slot displaces the old one — never duplicates", () => {
  const ids = new Set(["act-1", "act-2"]);
  let draft = buildDraft([{ slotIndex: 0, characterActionId: "act-1" }], ids, 5);
  // Assign a library action act-2 onto occupied slot 0.
  draft = assignActionToSlot(draft, "act-2", 0, ids);
  assert.equal(draft[0].characterActionId, "act-2");
  // act-1 was displaced back to the library (not present in any slot).
  assert.equal(draft.filter((s) => s.characterActionId === "act-1").length, 0);
  // No duplicate act-2.
  assert.equal(draft.filter((s) => s.characterActionId === "act-2").length, 1);
});

test("7b. assigning an action already in another slot moves it (swap), no duplicate", () => {
  const ids = new Set(["act-1", "act-2"]);
  let draft = buildDraft([
    { slotIndex: 0, characterActionId: "act-1" },
    { slotIndex: 1, characterActionId: "act-2" },
  ], ids, 5);
  // Drag act-1 (in slot 0) onto slot 1 (act-2): swap.
  draft = assignActionToSlot(draft, "act-1", 1, ids);
  assert.equal(draft[1].characterActionId, "act-1");
  assert.equal(draft[0].characterActionId, "act-2");
  assert.equal(draft.filter((s) => s.characterActionId === "act-1").length, 1);
});

/* ── 8. Unavailable action assignable but disabled ────────────────────── */

test("8. a temporarily-unavailable action still maps (disabled) and can be assigned to a slot", () => {
  const mapped = mapQuickActionsRuntime(runtimeFixture());
  const overclock = findQuickAction(mapped, "act-2");
  assert.equal(overclock.state.available, false);
  assert.equal(overclock.state.disabledReason, "Cooldown: 2 turns", "server reason preserved");
  // It is still in the library and can be placed in the quickbar.
  const ids = new Set(mapped.quickActions.map((a) => a.characterActionId));
  let draft = buildDraft(mapped.quickbar.slots, ids, 20);
  draft = assignActionToSlot(draft, "act-2", 5, ids);
  assert.equal(draft[5].characterActionId, "act-2");
});

/* ── 9-11. Save / version conflict ────────────────────────────────────── */

test("9. Cancel semantics: draftToSavePayload is pure — building a payload never mutates the draft", () => {
  const draft = buildDraft([{ slotIndex: 0, characterActionId: "act-1" }], new Set(["act-1"]), 5);
  const snapshot = JSON.stringify(draft);
  draftToSavePayload(draft);
  assignActionToSlot(draft, "act-1", 2, new Set(["act-1"]));
  assert.equal(JSON.stringify(draft), snapshot, "policy ops return new arrays, never mutate input");
});

test("10. Save sends the expected version; the SQL rejects a mismatch without mutation", () => {
  const payload = buildSlotPayload([{ slotIndex: 1, actionId: "act-1" }, { slotIndex: 0, actionId: null }]);
  assert.deepEqual(payload, [
    { slotIndex: 0, characterActionId: null },
    { slotIndex: 1, characterActionId: "act-1" },
  ]);
  assert.ok(sql92.includes("p_expected_version != v_current_version"), "version compared");
  const conflictIdx = sql92.indexOf("QUICKBAR_VERSION_CONFLICT");
  const insertIdx = sql92.indexOf("insert into public.odyssey_character_quickbar_layouts");
  assert.ok(conflictIdx > -1 && conflictIdx < insertIdx, "conflict returns BEFORE the insert/update");
});

test("11. version conflict does not clobber the server layout (early return, no write)", () => {
  assert.ok(hasVersionConflict(3, 5), "client detects drift");
  assert.equal(hasVersionConflict(3, 3), false);
  // SQL: the conflict branch returns a jsonb error object and never reaches the upsert.
  const fn = sql92.slice(sql92.indexOf("function public.odyssey_save_character_quickbar_layout"));
  const conflictReturn = fn.indexOf("'QUICKBAR_VERSION_CONFLICT'");
  const upsert = fn.indexOf("on conflict (character_id) do update");
  assert.ok(conflictReturn > -1 && conflictReturn < upsert, "conflict short-circuits before upsert");
});

/* ── 12. Missing / removed action ─────────────────────────────────────── */

test("12. a removed action shows as a missing slot and can be cleared", () => {
  // Layout references act-9 which is no longer in the library.
  const mapped = mapQuickActionsRuntime(runtimeFixture({
    quickbar: { slots: [{ slotIndex: 0, characterActionId: "act-9" }], maxSlots: 20, version: 1 },
  }));
  assert.equal(mapped.quickbar.slots[0].missing, true, "stale reference flagged");
  const ids = new Set(mapped.quickActions.map((a) => a.characterActionId));
  let draft = buildDraft(mapped.quickbar.slots, ids, 20);
  assert.equal(draft[0].missing, true);
  // Save payload drops the missing reference (won't persist a dead action).
  assert.equal(draftToSavePayload(draft)[0].characterActionId, null);
  // And the user can remove it explicitly.
  draft = removeSlot(draft, 0);
  assert.equal(draft[0].empty, true);
});

/* ── 13. Whitelist — no leaked private/inventory/auth data ────────────── */

test("13. mapped runtime carries only safe fields (no inventory/private target/auth/raw json)", () => {
  const mapped = mapQuickActionsRuntime(runtimeFixture({
    quickActions: [actionFixture({ raw: {
      inventory: [{ item: "grenade" }],
      owner_player_id: "player-secret",
      target_state: { hp: 3 },
      auth_token: "xyz",
      raw_definition: { secret: true },
    } })],
  }));
  const json = JSON.stringify(mapped);
  assert.ok(!/inventory|owner_player_id|target_state|auth_token|raw_definition|secret/i.test(json), "no private fields leak through the mapper");
  // And the SQL runtime does not select inventory/auth either.
  assert.ok(!/odyssey_character_items|odyssey_character_inventory|auth\./i.test(sql92));
});

/* ── 16. Tooltip data completeness (server-provided) ──────────────────── */

test("16. every action exposes server reason, cost, cooldown, targeting for the tooltip", () => {
  const a = mapQuickAction(actionFixture());
  assert.ok(a.costs && typeof a.costs.main === "number" && typeof a.costs.psi === "number");
  assert.ok(a.cooldown && typeof a.cooldown.current === "number" && typeof a.cooldown.max === "number");
  assert.ok(a.targeting && typeof a.targeting.mode === "string");
  // disabledReason is null when available, server string otherwise — never fabricated.
  assert.equal(mapQuickAction(actionFixture({ state: { available: true, disabledReason: null } })).state.disabledReason, null);
  assert.equal(mapQuickAction(actionFixture({ state: { available: false, disabledReason: "Out of PSI" } })).state.disabledReason, "Out of PSI");
  // unavailable + no server reason → neutral fallback, not an invented cause
  assert.equal(mapQuickAction(actionFixture({ state: { available: false, disabledReason: null } })).state.disabledReason, "Not available");
});

/* ── 17. Row layout: 1-10 first row, 11+ upward ───────────────────────── */

test("17. slots 0-9 are row 0; slot 10+ start row 1 (second row grows upward in the panel)", () => {
  assert.equal(rowOfSlot(0), 0);
  assert.equal(rowOfSlot(9), 0);
  assert.equal(rowOfSlot(10), 1);
  assert.equal(rowOfSlot(19), 1);
});

/* ── version-default consistency (regression) ─────────────────────────── */

test("regression: 'no layout saved yet' means version 0 in BOTH the getter and the save-conflict check", () => {
  // Bug reproduced live: the getter defaulted a missing layout to version 1
  // while the save function's own missing-row default was 0. A client that
  // read version 1 and saved with expected_version=1 was rejected against the
  // save function's real default of 0 (QUICKBAR_VERSION_CONFLICT: expected 1,
  // server has 0) on the very first save for a character with no prior layout.
  const getterFn = sql92.slice(sql92.indexOf("function public.odyssey_get_character_quick_actions_runtime"));
  const saveFn = sql92.slice(sql92.indexOf("function public.odyssey_save_character_quickbar_layout"), sql92.indexOf("function public.odyssey_quickbar_layout_update_timestamp"));
  assert.match(getterFn, /v_version := coalesce\(v_version, 0\)/, "getter's missing-row default is 0");
  assert.match(saveFn, /v_current_version := coalesce\(v_current_version, 0\)/, "save's missing-row default is 0");
  assert.ok(!/coalesce\(v_version, 1\)/.test(getterFn), "getter must never default to 1 again");
});

test("regression: the client mapper's version fallback also defaults to 0, not 1", () => {
  const noVersionField = mapQuickActionsRuntime({ ok: true, characterId: "c1", quickActions: [], quickbar: { slots: [] } });
  assert.equal(noVersionField.quickbar.version, 0);
});

/* ── extra contract + honesty checks ──────────────────────────────────── */

test("mapper returns honest empty runtime for null/garbage input (never throws)", () => {
  const empty = mapQuickActionsRuntime(null);
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.quickActions, []);
  assert.equal(empty.quickbar.maxSlots, 20);
  assert.doesNotThrow(() => mapQuickActionsRuntime("garbage"));
  assert.doesNotThrow(() => mapQuickAction(undefined));
});

test("sentinels exist for honestly-missing fields (never masked as working values)", () => {
  assert.equal(FIELD_SENTINELS.notReturned, "not returned by server");
  assert.equal(FIELD_SENTINELS.notConfigured, "not configured");
});

test("unassignedActions lists only library actions not already placed", () => {
  const mapped = mapQuickActionsRuntime(runtimeFixture());
  const draft = buildDraft(mapped.quickbar.slots, new Set(mapped.quickActions.map((a) => a.characterActionId)), 20);
  const free = unassignedActions(mapped.quickActions, draft);
  // act-1 is placed in slot 0; only act-2 remains free.
  assert.deepEqual(free.map((a) => a.characterActionId), ["act-2"]);
});

test("isDraftDirty detects any slot→action change (Cancel/close guard)", () => {
  const ids = new Set(["act-1", "act-2"]);
  const original = buildDraft([{ slotIndex: 0, characterActionId: "act-1" }], ids, 5);
  assert.equal(isDraftDirty(original, original), false);
  const moved = assignActionToSlot(original, "act-1", 2, ids);
  assert.equal(isDraftDirty(moved, original), true);
});

test("SQL: quickbar table is per-character (unique), versioned, cascade-deleted with character", () => {
  assert.ok(sql92.includes("constraint unique_layout_per_character unique (character_id)"));
  assert.ok(sql92.includes("version integer not null default 1"));
  assert.ok(sql92.includes("references public.odyssey_characters(id) on delete cascade"));
});

test("SQL: save increments version and returns fresh layout (server is source of truth)", () => {
  assert.ok(/version = version \+ 1/.test(sql92), "version bumped on update");
  assert.ok(sql92.includes("'layout', v_result"), "fresh layout returned");
  assert.ok(sql92.includes("'version', v_current_version"), "fresh version returned");
});

test("SQL: migration 92 does not touch combat session (90) or perform_attack", () => {
  assert.ok(!/perform_attack|combat_start_encounter|odyssey_perform_weapon_attack/.test(sql92), "no unrelated combat fixes in 92");
});

test("SQL: type is a canonical value derived from the definition (not the raw activation_type)", () => {
  // Regression: the runtime must emit one of attack_technique|directed|instant
  // (toggle deferred), NOT the raw activation_type ('manual'). attack effect/kind
  // → attack_technique; a character/body-part target → directed; else instant.
  assert.ok(!/'type', ad\.activation_type/.test(sql92), "type is not the raw activation_type");
  assert.ok(sql92.includes("then 'attack_technique'"));
  assert.ok(sql92.includes("in ('character', 'body_part') then 'directed'"));
});

test("SQL: alive/conscious come from the combat-state table, skip_turn from the engine helper (real schema)", () => {
  // Regression: alive/conscious are NOT columns on odyssey_characters — they live
  // on odyssey_character_combat_state. A prior version wrongly selected c.is_alive
  // from odyssey_characters and crashed at runtime (42703 undefined column).
  assert.ok(!/\bc\.is_alive\b|\bc\.is_conscious\b/.test(sql92), "never reads is_alive/is_conscious off odyssey_characters");
  assert.ok(sql92.includes("odyssey_character_combat_state cs"), "joins the combat-state table");
  assert.ok(/coalesce\(cs\.is_alive, true\)/.test(sql92), "missing combat-state row defaults to alive");
  // skip_turn uses the canonical helper, not a hand-rolled effects query with
  // wrong column names (effect_flag/remaining_turns do not exist).
  assert.ok(sql92.includes("odyssey_character_has_active_effect_flag(p_character_id, 'skip_turn')"));
  assert.ok(!/effect_flag|remaining_turns/.test(sql92.replace(/has_active_effect_flag/g, "")), "no non-existent effect columns");
});

setTimeout(() => {
  console.log(`\nAbilities & Quickbar Foundation: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
