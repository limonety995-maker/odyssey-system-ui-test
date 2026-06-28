// Combat HUD — Phase 3A.1 verification (runtime bundle → HUD view models).
//
// Pure: no DOM, no OBR, no Supabase. Tests the mapper + broadcast payload +
// renderSelectionModule integration with real block renderers.
//   node scripts/combat-hud-phase3a1.test.mjs

import assert from "node:assert/strict";

import {
  buildRuntimeDebugSummary,
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
import {
  applyResolvedTarget,
  applySource,
  buildTargetingBroadcast,
  createInitialTargetState,
  startPicking,
} from "../hud/targeting/targetSelectionState.js";

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

// CANONICAL armory shape — identical to get_character_armory, the RPC the
// existing Combat / Resolve-Attack menu renders from (weapons[], model.*,
// active_profile.loaded_magazine, available_fire_modes[]). NO equipped_weapon
// key; the active weapon is weapons[0] (or one bearing an explicit flag).
function canonicalWeapon(opts = {}) {
  const caliber = opts.caliber ?? "5.56";
  return {
    id: opts.id ?? "wpn-1",
    name: opts.name ?? "Striker Carbine",
    model: { weapon_class_name: opts.cls ?? "Assault Rifle", caliber: opts.melee ? null : caliber },
    active_profile_id: "prof-1",
    active_profile: {
      id: "prof-1",
      name: "Standard",
      code: "std",
      loaded_magazine: opts.noMag ? null : {
        id: opts.loadedMagId ?? "mag-1",
        current_rounds: opts.current ?? 20,
        ammo_type_name: "Full Metal Jacket",
        ammo_type: { name: "Full Metal Jacket" },
        magazine_def: { capacity: 30, caliber, caliber_name: caliber },
      },
      selected_fire_mode: opts.melee ? null : { id: "fm-1", name: "Semi", code: "semi" },
      available_fire_modes: opts.melee ? [] : [
        { id: "fm-1", name: "Semi", code: "semi" },
        { id: "fm-2", name: "Burst", code: "burst" },
      ],
    },
    ...(opts.extra ?? {}),
  };
}

/** Canonical single-weapon bundle (weapons[0] is the active weapon). */
function bundleWithWeapon(opts = {}) {
  return {
    ...minimalBundle(opts),
    armory: {
      weapons: [canonicalWeapon(opts.weapon)],
      // Character magazines: the loaded one + one compatible spare. The mapper
      // derives reserve magazines from here (caliber match, loaded excluded).
      magazines: [
        { id: "mag-1", current_rounds: 20, ammo_type_name: "Full Metal Jacket", ammo_type: { name: "Full Metal Jacket" }, magazine_def: { capacity: 30, caliber: "5.56", caliber_name: "5.56" } },
        { id: "mag-2", current_rounds: 30, ammo_type_name: "Full Metal Jacket", ammo_type: { name: "Full Metal Jacket" }, magazine_def: { capacity: 30, caliber: "5.56", caliber_name: "5.56" } },
      ],
    },
  };
}

/** Canonical multi-weapon bundle for active-weapon-selection tests. */
function bundleWithWeapons(weapons, magazines = []) {
  return { ...minimalBundle(), armory: { weapons, magazines } };
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

function liveSectionsBundle(opts = {}) {
  const weaponBundle = bundleWithWeapon(opts);
  const ability = {
    id: "ability-1",
    name: "Quick Hack",
    ability_kind: "active",
    source_type: "implant",
    activation_type: "active",
    description: "Disrupt nearby electronics.",
    current_cooldown_rounds: 0,
    resource: { pool_code: "psi", cost: 2 },
    is_enabled: true,
    is_hidden: false,
  };
  return {
    ok: true,
    character: weaponBundle.character,
    state: weaponBundle.state,
    sections: {
      combat: bundleWithCombat().combat,
      armory: weaponBundle.armory,
      abilities: { ok: true, abilities: opts.noAbilities ? [] : [ability], resource_pools: [] },
      effects: [{ id: "ef-live", effect_name: "Focused", polarity: "positive", remaining_turns: 1 }],
    },
    __hudDebug: { requestedSections: ["summary", "combat", "armory", "abilities", "effects"] },
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

// ── Test 1: exact Combat-Menu armory shape → correct Gun view model ──────────
test("1. exact runtime bundle shape (get_character_armory) → correct gun view model", () => {
  const snap = mapBundleToHudSnapshot(bundleWithWeapon());
  const w = snap.weapon.primary;
  assert.ok(w !== null, "weapon should be present");
  assert.equal(w.name, "Striker Carbine");
  // Fire modes read from active_profile.available_fire_modes (objects → names).
  assert.deepEqual(w.fireModes, ["Semi", "Burst"]);
  assert.equal(w.currentFireMode, "Semi");
  // Magazine from active_profile.loaded_magazine; capacity from magazine_def.
  assert.ok(w.loadedMagazine !== null, "loaded magazine present");
  assert.equal(w.loadedMagazine.current, 20);
  assert.equal(w.loadedMagazine.max, 30, "capacity from magazine_def.capacity");
  assert.equal(w.loadedMagazine.ammoType, "Full Metal Jacket", "ammo type = human name, as the menu shows");
  assert.equal(w.canReload, true);
  // Reserve derived from armory.magazines (loaded mag-1 excluded → only mag-2).
  assert.equal(w.reserveMagazines.length, 1);
  assert.equal(w.reserveMagazines[0].id, "mag-2");
});

// ── Test 1b: explicit equipped/active flag wins over array order ─────────────
test("1b. explicit equipped/active weapon wins over the first item in inventory", () => {
  const first  = canonicalWeapon({ id: "w-first",  name: "First Carbine" });
  const second = canonicalWeapon({ id: "w-second", name: "Equipped Pistol", extra: { is_equipped: true } });
  const snap = mapBundleToHudSnapshot(bundleWithWeapons([first, second]));
  assert.equal(snap.weapon.primary.name, "Equipped Pistol", "flagged weapon wins, not weapons[0]");
});

// ── Test 1c: no explicit flag → weapons[0] is the active weapon (menu parity) ─
test("1c. no explicit flag → weapons[0] is active (mirrors the existing Combat Menu)", () => {
  const first  = canonicalWeapon({ id: "w-first",  name: "First Carbine" });
  const second = canonicalWeapon({ id: "w-second", name: "Second Pistol" });
  const snap = mapBundleToHudSnapshot(bundleWithWeapons([first, second]));
  assert.equal(snap.weapon.primary.name, "First Carbine", "first weapon is active by array order");
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

// ── Test 2b: weapon present but no magazine → still renders, neutral ammo ─────
test("2b. weapon exists but no magazine/ammo → weapon still renders with neutral ammo state", () => {
  const snap = mapBundleToHudSnapshot(bundleWithWeapon({ weapon: { name: "Dry Carbine", noMag: true } }));
  const w = snap.weapon.primary;
  assert.ok(w !== null, "weapon present even without a magazine");
  assert.equal(w.name, "Dry Carbine");
  assert.equal(w.loadedMagazine, null, "no loaded magazine");
  assert.equal(w.ammo.current, 0, "neutral ammo current");
  assert.equal(w.ammo.max, 0, "neutral ammo max");

  const payload = payloadFromBundle(bundleWithWeapon({ weapon: { name: "Dry Carbine", noMag: true } }));
  const gunHtml = renderSelectionModule("gun", payload);
  assert.ok(gunHtml.includes("Dry Carbine"), "weapon name still shown");
  assert.ok(!gunHtml.includes("No weapon"),  "weapon does NOT disappear due to missing magazine");
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
  assert.equal(e.psi.current, null);
  assert.equal(e.psi.max, null);
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
  // A bundle with a character named "RealHero" (not a mock scenario name) and a
  // canonical armory weapon "Plasma Rifle".
  const b = {
    ...minimalBundle({ name: "RealHero", owner: "p1" }),
    armory: { weapons: [canonicalWeapon({ id: "w1", name: "Plasma Rifle", cls: "Energy Rifle" })], magazines: [] },
  };
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

test("13. live RPC sections.armory shape maps to Gun HUD", () => {
  const snap = mapBundleToHudSnapshot(liveSectionsBundle());
  assert.equal(snap.weapon.primary?.name, "Striker Carbine");
  assert.equal(snap.weapon.primary?.loadedMagazine?.current, 20);
  assert.equal(snap.weapon.primary?.loadedMagazine?.max, 30);
  assert.equal(snap.weapon.primary?.currentFireMode, "Semi");
});

test("14. live RPC sections.abilities shape maps to quick actions", () => {
  const snap = mapBundleToHudSnapshot(liveSectionsBundle());
  assert.equal(snap.skills.library.length, 1);
  assert.equal(snap.skills.library[0].name, "Quick Hack");
  assert.equal(snap.skills.library[0].source, "implant");
  assert.equal(snap.skills.library[0].resourceCost.amount, 2);
  assert.equal(snap.skills.quickSlots.length, 1);
});

test("15. hudSnapshot from sections bundle survives selection broadcast", () => {
  const payload = payloadFromBundle(liveSectionsBundle());
  assert.ok(payload.hudSnapshot, "hudSnapshot present");
  assert.equal(payload.hudSnapshot.weapon.primary?.name, "Striker Carbine");
  assert.equal(payload.debug?.returnedSections.armory, true);
  assert.equal(payload.debug?.requestedSections.includes("armory"), true);
});

test("16. module iframe uses live sections snapshot instead of mock or empty state", () => {
  const payload = payloadFromBundle(liveSectionsBundle());
  const gunHtml = renderSelectionModule("gun", payload);
  const skillsHtml = renderSelectionModule("skills", payload);
  assert.ok(gunHtml.includes("Striker Carbine"), "live weapon rendered");
  assert.ok(!gunHtml.includes("No weapon"), "weapon does not collapse to empty");
  assert.ok(!gunHtml.includes("AR-7"), "mock weapon not used");
  assert.ok(skillsHtml.includes("Quick Hack"), "live ability rendered");
  assert.ok(!skillsHtml.includes("No actions"), "actions do not collapse to empty");
});

test("17. missing live sections produce controlled empty state and debug reason", () => {
  const bundle = minimalBundle();
  const snap = mapBundleToHudSnapshot(bundle);
  const debug = buildRuntimeDebugSummary(bundle, snap, { selectionStatus: "ready", selectedTokenId: "tok-1", characterId: "char-1" });
  assert.equal(snap.weapon.primary, null);
  assert.equal(snap.skills.library.length, 0);
  assert.equal(debug.reason, "armory section missing");
  assert.equal(debug.broadcast.gunState, "empty");
});

test("18. live resource_pools PSI maps to Player view model", () => {
  const bundle = liveSectionsBundle();
  delete bundle.sections.combat.psi_current;
  delete bundle.sections.combat.psi_max;
  bundle.sections.abilities.resource_pools = [
    { code: "psi", name: "Psi", source_type: "psionic", current_value: 7, max_value: 12 },
  ];
  const snap = mapBundleToHudSnapshot(bundle);
  assert.equal(snap.entity.psi.current, 7);
  assert.equal(snap.entity.psi.max, 12);
  const html = renderSelectionModule("player", payloadFromBundle(bundle));
  assert.ok(html.includes("PSI"));
  assert.ok(html.includes(">7<span") || html.includes("7<span"), "psi current rendered");
});

test("19. Pick target is visible for ready source without target", () => {
  const payload = payloadFromBundle(liveSectionsBundle());
  const html = renderSelectionModule("combatControl", payload);
  assert.ok(html.includes("Pick target"));
  assert.ok(html.includes('data-action="pick-target"'));
});

test("20. selectedWeaponId picks a non-first weapon and weapon selector is closed by default", () => {
  const first = canonicalWeapon({ id: "w-first", name: "First Rifle" });
  const second = canonicalWeapon({ id: "w-second", name: "Sidearm", cls: "Pistol" });
  const bundle = bundleWithWeapons([first, second], [
    { id: "mag-2", current_rounds: 8, ammo_type_name: "FMJ", magazine_def: { capacity: 12, caliber: "5.56", caliber_name: "5.56" } },
  ]);
  const snap = mapBundleToHudSnapshot(bundle, { selectedWeaponId: "w-second" });
  assert.equal(snap.weapon.primary.name, "Sidearm");
  assert.equal(snap.weapon.available.length, 2);
  const state = deriveSelectionState({ viewer: PLAYER, selectionIds: ["tok-1"], link: { characterId: "char-1" }, bundle });
  const payload = buildBroadcastPayload(state, { selectedWeaponId: "w-second" });
  const html = renderSelectionModule("gun", payload);
  assert.ok(!html.includes("First Rifle"), "closed selector hides non-current weapon rows");
  assert.ok(html.includes("Sidearm"), "selected weapon becomes current Gun weapon");
  assert.ok(!html.includes("ohud-weapon-list"), "weapon list closed by default");
  assert.ok(html.includes('data-action="toggle-weapon-list"'), "caret toggles selector");
});

test("20b. weapon selector opens only from transient ui state", () => {
  const first = canonicalWeapon({ id: "w-first", name: "First Rifle" });
  const second = canonicalWeapon({ id: "w-second", name: "Sidearm", cls: "Pistol" });
  const bundle = bundleWithWeapons([first, second], [
    { id: "mag-2", current_rounds: 8, ammo_type_name: "FMJ", magazine_def: { capacity: 12, caliber: "5.56", caliber_name: "5.56" } },
  ]);
  const state = deriveSelectionState({ viewer: PLAYER, selectionIds: ["tok-1"], link: { characterId: "char-1" }, bundle });
  const payload = buildBroadcastPayload(state, { selectedWeaponId: "w-second", weaponSelectorOpen: true });
  const html = renderSelectionModule("gun", payload);
  assert.ok(html.includes("First Rifle"), "open selector lists available weapons");
  assert.ok(html.includes("Sidearm"), "open selector keeps selected weapon visible");
  assert.ok(html.includes("ohud-weapon-list"), "weapon list rendered only while open");
  assert.ok(html.includes('data-action="select-weapon"'));
});

test("21. reserve magazines exclude inserted and empty magazines", () => {
  const bundle = bundleWithWeapon();
  bundle.armory.magazines.push({ id: "mag-empty", current_rounds: 0, ammo_type_name: "FMJ", magazine_def: { capacity: 30, caliber: "5.56", caliber_name: "5.56" } });
  const snap = mapBundleToHudSnapshot(bundle);
  assert.equal(snap.weapon.primary.reserveMagazines.some((m) => m.id === "mag-1"), false);
  assert.equal(snap.weapon.primary.reserveMagazines.some((m) => m.id === "mag-empty"), true, "mapper keeps raw reserve");
  const payload = payloadFromBundle(bundle);
  const html = renderSelectionModule("gun", payload);
  assert.ok(html.includes("mag-2") || html.includes("Full Metal Jacket"));
  assert.ok(!html.includes("mag-empty"), "Gun UI hides empty reserve");
});

test("22. directed skill without target shows Select target and prepared state", () => {
  const bundle = liveSectionsBundle();
  bundle.sections.abilities.abilities[0].targeting_mode = "token";
  const state = deriveSelectionState({ viewer: PLAYER, selectionIds: ["tok-1"], link: { characterId: "char-1" }, bundle });
  const payload = buildBroadcastPayload(state, { preparedAction: { kind: "skill", id: "ability-1" } });
  const skillsHtml = renderSelectionModule("skills", payload);
  const actionHtml = renderSelectionModule("combatControl", payload);
  assert.ok(skillsHtml.includes("is-selected"), "prepared skill has selected state");
  assert.ok(actionHtml.includes("Select target"));
});

test("23. selected reserve magazine flows into canonical reload command data", () => {
  const bundle = bundleWithWeapon();
  bundle.armory.magazines.push({ id: "mag-3", current_rounds: 12, ammo_type_name: "AP", magazine_def: { capacity: 30, caliber: "5.56", caliber_name: "5.56" } });
  const state = deriveSelectionState({ viewer: PLAYER, selectionIds: ["tok-1"], link: { characterId: "char-1" }, bundle });
  const payload = buildBroadcastPayload(state, { selectedReloadMagazineId: "mag-3" });
  const html = renderSelectionModule("gun", payload);
  assert.ok(html.includes('data-action="reload"'), "reload action is present");
  assert.ok(html.includes('data-magazine-id="mag-3"'), "reload uses selected compatible magazine");
});

test("24. incompatible reserve magazines are not offered for selected weapon", () => {
  const bundle = bundleWithWeapon();
  bundle.armory.magazines.push({ id: "mag-other", current_rounds: 30, ammo_type_name: "Other", magazine_def: { capacity: 30, caliber: "9mm", caliber_name: "9mm" } });
  const snap = mapBundleToHudSnapshot(bundle);
  assert.equal(snap.weapon.primary.reserveMagazines.some((m) => m.id === "mag-other"), false);
  const html = renderSelectionModule("gun", payloadFromBundle(bundle));
  assert.ok(!html.includes("mag-other"), "Gun UI never offers incompatible magazine");
});

test("25. target picking state resolves target without changing source", () => {
  const source = { tokenId: "tok-source", characterId: "char-source", characterName: "Source" };
  const initial = applySource(createInitialTargetState(), source);
  const picking = startPicking(initial);
  assert.equal(picking.mode, "picking", "controller enters picking before token selection");
  const resolved = applyResolvedTarget(picking, {
    tokenId: "tok-target",
    characterId: "char-target",
    displayName: "Target NPC",
    profileId: "humanoid",
    distance: { value: 6, unit: "m" },
  });
  assert.equal(resolved.mode, "idle");
  assert.equal(resolved.source.tokenId, "tok-source", "source token remains unchanged");
  assert.equal(resolved.target.tokenId, "tok-target", "selected token becomes target");
  const wire = buildTargetingBroadcast(resolved);
  assert.equal(wire.source.tokenId, "tok-source");
  assert.equal(wire.target.tokenId, "tok-target");
});

test("26. resolved target payload satisfies prepared targeted action", () => {
  const bundle = liveSectionsBundle();
  bundle.sections.abilities.abilities[0].targeting_mode = "token";
  const state = deriveSelectionState({ viewer: PLAYER, selectionIds: ["tok-1"], link: { characterId: "char-1" }, bundle });
  const payload = buildBroadcastPayload(state, {
    preparedAction: { kind: "skill", id: "ability-1" },
    targeting: { mode: "none", selectedTargetIds: ["tok-target"], selectedTargetName: "Target NPC", selectedBodyPartId: "torso" },
  });
  const html = renderSelectionModule("combatControl", payload);
  assert.ok(html.includes("Target NPC"), "resolved target is displayed");
  assert.ok(!html.includes("Select target"), "targeted action is no longer blocked");
});

// Summary
setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    for (const f of failures) { console.error(`FAILED: ${f.name}`); console.error(f.err); }
    process.exit(1);
  }
}, 400);
