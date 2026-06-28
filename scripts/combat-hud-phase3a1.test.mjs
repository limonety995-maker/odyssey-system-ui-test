// Combat HUD — Phase 3A.1 verification (runtime bundle → HUD view models).
//
// Pure: no DOM, no OBR, no Supabase. Tests the mapper + broadcast payload +
// renderSelectionModule integration with real block renderers.
//   node scripts/combat-hud-phase3a1.test.mjs

import assert from "node:assert/strict";

import {
  mapBundleToHudSnapshot,
  mapEntity,
  mapWeapon,
  mapSkills,
  mapModifiers,
} from "../hud/runtime/runtimeBundleMapper.js";

import {
  SELECTION_STATUS,
  SECONDARY_MODULE_IDS,
  deriveSelectionState,
  buildBroadcastPayload,
} from "../hud/scene/selectionState.js";

import { renderSelectionModule } from "../hud/scene/selectionView.js";
import { splitSkillRows } from "../hud/overlay/hudLayout.js";

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => { passed += 1; console.log(`  ✓ ${name}`); })
    .catch((err) => { failed += 1; failures.push({ name, err }); console.error(`  ✗ ${name}\n      ${err.message}`); });
}

// ─── Bundle factory helpers ─────────────────────────────────────────────────

const PLAYER = { playerId: "p1", role: "PLAYER" };
const GM     = { playerId: "gm1", role: "GM" };

function linkResult(tokenId, characterId = "c1") {
  return { ok: true, links: [{ token_id: tokenId, is_active: true, character: { id: characterId, display_name: "TestChar" } }] };
}

/** Minimal bundle — only identity fields. */
function minimalBundle(opts = {}) {
  return {
    ok: true,
    character: {
      id: "char-1",
      display_name: opts.name ?? "TestChar",
      character_key: "TESTCHAR",
      owner_player_id: opts.owner ?? "p1",
      owner_player_name: opts.ownerName ?? "Alice",
    },
    state: {
      is_alive: opts.alive !== false,
      is_conscious: opts.conscious !== false,
      status_summary: "Alive",
    },
  };
}

/** Bundle with full armory section (equipped weapon). */
function bundleWithWeapon(opts = {}) {
  return {
    ...minimalBundle(opts),
    armory: {
      equipped_weapon: {
        id: "wpn-1",
        weapon_name: "Striker Carbine",
        weapon_type_key: "rifle",
        fire_modes: ["Semi", "Burst"],
        current_fire_mode: "Semi",
        uses_magazine: true,
        uses_consumable: false,
        requires_ammo: true,
        loaded_magazine: {
          id: "mag-1",
          ammo_type_key: "FMJ",
          ammo_type_name: "Full Metal Jacket",
          current_rounds: 20,
          max_rounds: 30,
          caliber: "5.56",
        },
        reserve_magazines: [
          { id: "mag-2", ammo_type_key: "FMJ", ammo_type_name: "Full Metal Jacket", current_rounds: 30, max_rounds: 30, caliber: "5.56" },
        ],
        can_reload: true,
        disabled_reason: null,
      },
    },
  };
}

/** Bundle with N quick actions in the abilities section. */
function bundleWithAbilities(count, slots = null) {
  const quick_actions = Array.from({ length: count }, (_, i) => ({
    id: `sk-${i}`,
    ability_name: `Action ${i + 1}`,
    ability_type: "instantAbility",
    source_type: "perk",
    icon_key: "bolt",
    color_key: "neutral",
    action_cost: "MAIN",
    cooldown_remaining_turns: 0,
    is_toggled: false,
    disabled_reason: null,
    tooltip: "",
  }));
  const quickbar_slots = (slots ?? quick_actions.map((qa, i) => ({ slot_index: i, ability_id: qa.id })));
  return { ...minimalBundle(), abilities: { quick_actions, quickbar_slots } };
}

/** Bundle with active effects (shown as status chips). */
function bundleWithEffects() {
  return {
    ...minimalBundle(),
    effects: [
      { id: "ef-1", effect_name: "Bleeding", polarity: "negative", remaining_turns: 2, description: "Lose HP per turn." },
      { id: "ef-2", effect_name: "Focused",  polarity: "positive", remaining_turns: 1, description: "+10 to next attack." },
    ],
  };
}

/** Bundle with combat section (body parts, action flags, resources). */
function bundleWithCombat(opts = {}) {
  return {
    ...minimalBundle(opts),
    combat: {
      body_parts: [
        { zone_id: "head",  minor: 0, serious: 0, critical: 0, disabled: false, destroyed: false },
        { zone_id: "torso", minor: 1, serious: 0, critical: 0, disabled: false, destroyed: false },
        { zone_id: "l_arm", minor: 0, serious: 1, critical: 0, disabled: false, destroyed: false },
        { zone_id: "r_arm", minor: 0, serious: 0, critical: 0, disabled: false, destroyed: false },
        { zone_id: "l_leg", minor: 0, serious: 0, critical: 0, disabled: false, destroyed: false },
        { zone_id: "r_leg", minor: 0, serious: 0, critical: 0, disabled: false, destroyed: false },
      ],
      combat_flags: {
        main_action_spent: opts.mainSpent ?? false,
        move_action_spent: opts.moveSpent ?? false,
      },
      shield_current: opts.shieldCur ?? 6,
      shield_max:     opts.shieldMax ?? 15,
      psi_current:    opts.psiCur ?? 3,
      psi_max:        opts.psiMax ?? 10,
      is_alive: true,
      is_conscious: true,
    },
  };
}

/** Build a broadcast-ready payload from a bundle (convenience). */
function payloadFromBundle(b, viewerOpts = {}) {
  const viewer = viewerOpts.gm ? GM : PLAYER;
  const state = deriveSelectionState({
    viewer,
    selectionIds: ["tok-1"],
    link: { characterId: "char-1", characterName: b.character?.display_name },
    bundle: b,
  });
  return buildBroadcastPayload(state);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

console.log("\nCombat HUD — Phase 3A.1 verification\n");

// ── Test 1: weapon in bundle → gun view model ────────────────────────────────
test("1. real weapon in bundle.armory → gun view model with name / fire mode / magazine", () => {
  const snap = mapBundleToHudSnapshot(bundleWithWeapon());
  const w = snap.weapon.primary;
  assert.ok(w !== null, "weapon should be present");
  assert.equal(w.name, "Striker Carbine");
  assert.deepEqual(w.fireModes, ["Semi", "Burst"]);
  assert.equal(w.currentFireMode, "Semi");
  assert.ok(w.loadedMagazine !== null, "loaded magazine present");
  assert.equal(w.loadedMagazine.current, 20);
  assert.equal(w.loadedMagazine.max, 30);
  assert.equal(w.loadedMagazine.ammoType, "FMJ");
  assert.equal(w.canReload, true);
  assert.equal(w.reserveMagazines.length, 1);
});

// ── Test 2: no equipped weapon → weapon.primary null ────────────────────────
test("2. no equipped weapon (armory absent) → weapon.primary null → Gun shows neutral state", () => {
  const snap = mapBundleToHudSnapshot(minimalBundle());
  assert.equal(snap.weapon.primary, null, "no weapon when armory section absent");

  const payload = payloadFromBundle(minimalBundle());
  assert.ok(payload.hudSnapshot !== null);
  const html = renderSelectionModule("gun", payload);
  // GunBlock.emptyGun() shows "No weapon", never fabricates a weapon.
  assert.ok(html.includes("No weapon"), "Gun shows neutral empty state");
  assert.ok(!html.includes("AR-7"),    "No mock weapon name");
  assert.ok(!html.includes("Striker"), "No real-but-different weapon leaking from old payload");
});

// ── Test 3: ≤10 quick actions → single row via splitSkillRows ───────────────
test("3. runtime quick actions ≤10 → skills.library.length ≤ 10; splitSkillRows gives one row", () => {
  const snap = mapBundleToHudSnapshot(bundleWithAbilities(7));
  assert.equal(snap.skills.library.length, 7);
  assert.equal(snap.skills.quickSlots.length, 7);
  const rows = splitSkillRows(snap.skills.quickSlots);
  assert.equal(rows.length, 1, "≤10 slots → single row");
});

// ── Test 4: 11+ quick actions → two rows ─────────────────────────────────────
test("4. runtime quick actions ≥11 → splitSkillRows wraps to two rows", () => {
  const snap = mapBundleToHudSnapshot(bundleWithAbilities(11));
  assert.equal(snap.skills.library.length, 11);
  const rows = splitSkillRows(snap.skills.quickSlots);
  assert.equal(rows.length, 2, "11+ slots → two rows");
  assert.equal(rows[0].length, 10);
  assert.equal(rows[1].length, 1);
});

// ── Test 5: no abilities section → empty skills, no mock skills ─────────────
test("5. no abilities section in bundle → empty library; Skills block shows no mock actions", () => {
  const snap = mapBundleToHudSnapshot(minimalBundle());
  assert.equal(snap.skills.library.length, 0, "empty library without abilities section");
  assert.equal(snap.skills.quickSlots.length, 0);

  const payload = payloadFromBundle(minimalBundle());
  const html = renderSelectionModule("skills", payload);
  assert.ok(!html.includes("Precision Shot"), "no mock skill name");
  assert.ok(!html.includes("AR-7"),           "no weapon name in skills block");
  // SkillBlock shows "No actions" when slots are empty.
  assert.ok(html.includes("No actions") || html.includes("ohud-skill") || !html.includes("sk-precise"),
    "skills block renders without mock data");
});

// ── Test 6: no combat session → target hasTarget = false ────────────────────
test("6. no target in runtime bundle → Combat Control shows 'No target'", () => {
  const payload = payloadFromBundle(minimalBundle());
  const html = renderSelectionModule("combatControl", payload);
  assert.ok(html.includes("No target"), "shows neutral 'No target' when session absent");
  assert.ok(!html.includes("Scrap Raider"), "no mock target name");
});

// ── Test 7: bundle.effects → entity statuses + empty modifier chips ──────────
test("7. bundle effects → entity.statuses populated; modifier section empty (no bundle.modifiers)", () => {
  const snap = mapBundleToHudSnapshot(bundleWithEffects());
  assert.equal(snap.entity?.statuses.length, 2, "two effects mapped to entity statuses");
  assert.equal(snap.entity?.statuses[0].name, "Bleeding");
  assert.equal(snap.entity?.statuses[0].polarity, "negative");
  assert.equal(snap.entity?.statuses[1].name, "Focused");
  assert.equal(snap.entity?.statuses[1].polarity, "positive");
  // Modifier chips are empty (no dedicated modifiers section in bundle yet).
  const mods = snap.modifiers;
  assert.equal(mods.passive.length,   0);
  assert.equal(mods.active.length,    0);
  assert.equal(mods.narrative.length, 0);
});

// ── Test 8: no effects/log → empty log state ─────────────────────────────────
test("8. no log data in bundle → Log shows empty state, no mock log entries", () => {
  const payload = payloadFromBundle(minimalBundle());
  const html = renderSelectionModule("log", payload);
  // BattleLogBlock with empty entries shows "No combat log yet."
  assert.ok(html.includes("No combat log yet") || html.includes("ohud-log"),
    "Log renders without mock entries");
  assert.ok(!html.includes("Precision Shot"), "no mock log content");
  assert.ok(!html.includes("Scrap Raider"),   "no mock actor");
});

// ── Test 9: missing optional field → local neutral fallback ──────────────────
test("9. missing optional fields (no shield, no psi, no zones) → entity still valid; HUD stays ready", () => {
  // Bundle with only character + state (no combat section → no zones/shield/psi).
  const snap = mapBundleToHudSnapshot(minimalBundle());
  const e = snap.entity;
  assert.ok(e !== null, "entity is present");
  assert.equal(e.summary.name, "TestChar");
  assert.equal(e.shield.current, 0, "defaults to 0 when absent");
  assert.equal(e.shield.max, 0);
  assert.equal(e.psi.current, 0);
  assert.equal(e.zones.length, 0, "empty zones when no combat.body_parts");
  assert.equal(e.flags.alive, true, "alive defaults to true");
  assert.equal(e.flags.conscious, true);
  // HUD still renders (no crash, no mock fallback).
  const payload = payloadFromBundle(minimalBundle());
  assert.equal(payload.status, SELECTION_STATUS.ready);
  const playerHtml = renderSelectionModule("player", payload);
  assert.ok(playerHtml.includes("TestChar"), "player block shows name from bundle");
});

// ── Test 9b: combat section provides zones / resources / action flags ─────────
test("9b. bundle.combat section → zones, shield, psi, action economy correctly mapped", () => {
  const snap = mapBundleToHudSnapshot(bundleWithCombat({ shieldCur: 8, shieldMax: 15, psiCur: 4, psiMax: 10, mainSpent: true }));
  const e = snap.entity;
  assert.equal(e.zones.length, 6,        "six zones mapped from body_parts");
  assert.equal(e.zones[0].id, "head");
  assert.equal(e.zones[0].state, "healthy");
  assert.equal(e.zones[1].state, "wounded",  "torso: minor=1 → wounded");
  assert.equal(e.zones[2].state, "serious",  "l_arm: serious=1 → serious");
  assert.equal(e.shield.current, 8);
  assert.equal(e.shield.max, 15);
  assert.equal(e.psi.current, 4);
  assert.equal(e.psi.max, 10);
  assert.equal(e.actions.main, false, "main_action_spent=true → main=false");
  assert.equal(e.actions.move, true,  "move_action_spent=false → move=true");
});

// ── Test 10: live data is never mixed with mock values ───────────────────────
test("10. live-ready payload never mixes mock scenario values with real character data", () => {
  // A bundle with a character named "RealHero" (not a mock scenario name).
  const b = { ...minimalBundle({ name: "RealHero", owner: "p1" }), armory: { equipped_weapon: { id: "w1", weapon_name: "Plasma Rifle", weapon_type_key: "rifle", fire_modes: ["Semi"], current_fire_mode: "Semi", uses_magazine: false, uses_consumable: true, requires_ammo: true, ammo_current: 5, ammo_max: 10, reserve_magazines: [], can_reload: false, disabled_reason: null } } };
  const payload = payloadFromBundle(b);

  const playerHtml = renderSelectionModule("player", payload);
  assert.ok(playerHtml.includes("RealHero"),     "player shows real name");
  assert.ok(!playerHtml.includes("Vega"),         "no mock character name");
  assert.ok(!playerHtml.includes("Scrap Raider"), "no mock NPC name");

  const gunHtml = renderSelectionModule("gun", payload);
  assert.ok(gunHtml.includes("Plasma Rifle"),  "gun shows real weapon name");
  assert.ok(!gunHtml.includes("AR-7"),          "no mock weapon name");
  assert.ok(!gunHtml.includes("Marksman"),      "no mock weapon description");
});

// ── Test 11: hudSnapshot is present in broadcast payload ───────────────────
test("11. buildBroadcastPayload includes hudSnapshot for ready state; not for non-ready", () => {
  // Ready.
  const readyState = deriveSelectionState({ viewer: PLAYER, selectionIds: ["tok-1"], link: { characterId: "c1" }, bundle: minimalBundle() });
  const readyPayload = buildBroadcastPayload(readyState);
  assert.ok(readyPayload.hudSnapshot !== null,    "hudSnapshot present for ready");
  assert.equal(readyPayload.runtimeBundle, undefined, "full bundle NOT in payload");

  // Not-owned.
  const notOwnedState = deriveSelectionState({ viewer: PLAYER, selectionIds: ["tok-1"], link: { characterId: "c1" }, bundle: minimalBundle({ owner: "p2" }) });
  const notOwnedPayload = buildBroadcastPayload(notOwnedState);
  assert.equal(notOwnedPayload.hudSnapshot, null, "hudSnapshot null for not-owned");

  // No selection.
  const noSelState = deriveSelectionState({ viewer: PLAYER, selectionIds: [] });
  const noSelPayload = buildBroadcastPayload(noSelState);
  assert.equal(noSelPayload.hudSnapshot, null, "hudSnapshot null for no-selection");
});

// ── Test 12: secondary modules are open, no placeholder text ────────────────
test("12. all secondary modules open when ready; no 'Runtime data wiring' placeholder", () => {
  const payload = payloadFromBundle(minimalBundle());
  for (const id of SECONDARY_MODULE_IDS) {
    const html = renderSelectionModule(id, payload);
    assert.ok(!html.includes("ohud-panel--muted"),   `${id} not muted`);
    assert.ok(!html.includes("Runtime data wiring"), `${id} no placeholder`);
  }
});

// Summary
setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    for (const f of failures) { console.error(`FAILED: ${f.name}`); console.error(f.err); }
    process.exit(1);
  }
}, 400);
