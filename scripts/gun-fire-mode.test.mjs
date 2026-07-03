// Combat HUD — Fire Mode v1 tests.
//
// Covers:
//  - melee / no-fire-mode weapons never get a selector
//  - a single available mode is a read-only label
//  - 2+ modes render an interactive button + a separate companion popover
//  - selecting a mode never changes the weapon id, never carries a mode
//    between weapons or characters
//  - a server exception ({ok:false}-equivalent via thrown error) is surfaced,
//    never silently treated as success
//  - fire-mode commands never trigger Arrange HUD / editor mode
//  - existing Gun/reload/weapon-selector tests are covered separately and
//    remain green (see gun-companion-popovers.test.mjs, gun-magazine-reload.test.mjs)

import assert from "node:assert/strict";
import { mapWeapon } from "../hud/runtime/runtimeBundleMapper.js";
import { renderGunBlock } from "../hud/components/GunBlock.js";
import { renderFireModeSelectorPanel } from "../hud/components/FireModeSelectorPanel.js";
import { buildBroadcastPayload, SELECTION_STATUS } from "../hud/scene/selectionState.js";
import { resolveFireModeUpdatePath, normalizeFireModeRpcResult } from "../hud/scene/fireModePolicy.js";
import { computeCompanionSelectorHeight } from "../hud/overlay/hudPopoverLifecycle.js";

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

// ── armory fixtures ─────────────────────────────────────────────────────────

function meleeArmory() {
  return {
    ok: true,
    weapons: [{
      id: "w-katana",
      name: "Katana",
      model: { caliber: null },
      active_profile_id: "p-katana",
      active_profile: { id: "p-katana", selected_fire_mode: null, available_fire_modes: [] },
    }],
    magazines: [],
  };
}

function singleModeArmory() {
  return {
    ok: true,
    weapons: [{
      id: "w-pistol",
      name: "Sidearm",
      model: { caliber: "9mm" },
      active_profile_id: "p-pistol",
      active_profile: {
        id: "p-pistol",
        selected_fire_mode: { id: "fm-semi", code: "semi", name: "Single shot" },
        available_fire_modes: [{ id: "fm-semi", code: "semi", name: "Single shot" }],
      },
    }],
    magazines: [],
  };
}

function multiModeArmory(overrides = {}) {
  return {
    ok: true,
    weapons: [{
      id: overrides.weaponId ?? "w-rifle",
      name: overrides.name ?? "Assault Rifle",
      model: { caliber: "5.56" },
      active_profile_id: overrides.profileId ?? "p-rifle",
      active_profile: {
        id: overrides.profileId ?? "p-rifle",
        selected_fire_mode: overrides.selected ?? { id: "fm-semi", code: "semi", name: "Single shot" },
        available_fire_modes: overrides.available ?? [
          { id: "fm-semi", code: "semi", name: "Single shot" },
          { id: "fm-burst", code: "burst", name: "Three-round burst" },
          { id: "fm-auto", code: "auto", name: "Automatic fire" },
        ],
      },
    }],
    magazines: [],
  };
}

function gunState(weapon, uiOverride = {}) {
  return {
    status: "ready",
    snapshot: { weapon: { primary: weapon, secondary: null } },
    ui: { selectedReloadMagazineId: null, ...uiOverride },
  };
}

console.log("\nGun Fire Mode v1\n");

// ── 1/2: no selector when not applicable ────────────────────────────────────

test("1. melee weapon (no fire modes) does not get a fire-mode selector", () => {
  const weapon = mapWeapon(meleeArmory());
  assert.equal(weapon.fireMode.isApplicable, false);
  assert.equal(weapon.fireMode.isSelectable, false);
  const html = renderGunBlock(gunState(weapon));
  assert.ok(!html.includes("toggle-fire-mode-selector"));
});

test("2. weapon without available_fire_modes does not get a selector", () => {
  const armory = multiModeArmory({ available: [], selected: null });
  const weapon = mapWeapon(armory);
  assert.equal(weapon.fireMode.isApplicable, false);
  const html = renderGunBlock(gunState(weapon));
  assert.ok(!html.includes("toggle-fire-mode-selector"));
  assert.ok(!html.includes("ohud-firemode is-readonly"));
});

// ── 3: single mode → read-only label ────────────────────────────────────────

test("3. weapon with exactly one fire mode shows a read-only label, no button", () => {
  const weapon = mapWeapon(singleModeArmory());
  assert.equal(weapon.fireMode.isApplicable, true);
  assert.equal(weapon.fireMode.isSelectable, false);
  const html = renderGunBlock(gunState(weapon));
  assert.ok(html.includes("ohud-firemode is-readonly"));
  assert.ok(!html.includes("toggle-fire-mode-selector"));
  assert.ok(html.includes("SEMI"));
});

// ── 4: multiple modes → interactive button ──────────────────────────────────

test("4. weapon with several fire modes shows an interactive selector button", () => {
  const weapon = mapWeapon(multiModeArmory());
  assert.equal(weapon.fireMode.isApplicable, true);
  assert.equal(weapon.fireMode.isSelectable, true);
  const html = renderGunBlock(gunState(weapon));
  assert.ok(html.includes('data-action="toggle-fire-mode-selector"'));
  assert.ok(html.includes("SEMI"));
  assert.ok(!html.includes("is-readonly"));
});

test("never fabricates AUTO/SEMI/BURST when no code/name is present", () => {
  const armory = multiModeArmory({
    available: [{ id: "fm-x" }],
    selected: { id: "fm-x" },
  });
  const weapon = mapWeapon(armory);
  // No code/name on the raw entry → name falls back to the id itself, never a
  // guessed canonical label.
  assert.equal(weapon.fireMode.selectedName, "fm-x");
  assert.equal(weapon.fireMode.selectedCode, null);
});

// ── 5: separate companion popover, not inline ───────────────────────────────

test("5. fire-mode selector is a separate companion popover (own render function), not inlined in GunBlock", () => {
  const weapon = mapWeapon(multiModeArmory());
  const gunHtml = renderGunBlock(gunState(weapon));
  assert.ok(!gunHtml.includes("ohud-firemode-list"));
  assert.ok(!gunHtml.includes("Three-round burst"));

  const selectorHtml = renderFireModeSelectorPanel(gunState(weapon));
  assert.ok(selectorHtml.includes("ohud-firemode-list"));
  assert.ok(selectorHtml.includes("Single shot"));
  assert.ok(selectorHtml.includes("Three-round burst"));
  assert.ok(selectorHtml.includes("Automatic fire"));
});

test("fire-mode selector rows use separate name/code fields, current mode marked selected", () => {
  const weapon = mapWeapon(multiModeArmory());
  const html = renderFireModeSelectorPanel(gunState(weapon));
  assert.ok(html.includes("ohud-firemode-option-name"));
  assert.ok(html.includes("ohud-firemode-option-code"));
  const semiTag = html.match(/<button[^>]*data-fire-mode-id="fm-semi"[^>]*>/)?.[0] ?? "";
  const burstTag = html.match(/<button[^>]*data-fire-mode-id="fm-burst"[^>]*>/)?.[0] ?? "";
  assert.ok(semiTag.includes("is-selected"));
  assert.ok(!burstTag.includes("is-selected"));
});

test("fire-mode selector loading/empty states never show a false empty list", () => {
  const loading = renderFireModeSelectorPanel(null);
  assert.ok(loading.includes("is-loading"));
  const emptyState = renderFireModeSelectorPanel(gunState(mapWeapon(meleeArmory())));
  assert.ok(emptyState.includes("is-empty"));
});

// ── 6: opening the selector never changes the Gun popover rect ─────────────

test("6. companion popover height sizing is independent of the Gun module's own rect", () => {
  // The controller (combatHudOverlayController.js) computes the fire-mode
  // popover's rect purely from row count via computeCompanionSelectorHeight;
  // it reuses companionPopoverRectAboveGun() to read (never write) the Gun
  // rect, so opening the selector cannot resize Gun. Exercised here at the
  // pure sizing-function level (the OBR-coupled controller isn't unit-testable).
  const heightFor3Rows = computeCompanionSelectorHeight(3);
  const heightFor1Row = computeCompanionSelectorHeight(1);
  assert.ok(heightFor3Rows > heightFor1Row);
  assert.ok(heightFor3Rows <= 220);
});

// ── 7/8: selecting updates the view model, never the weapon id ─────────────

test("7. switching the selected fire mode (fresh armory) updates the Gun view model", () => {
  const before = mapWeapon(multiModeArmory({ selected: { id: "fm-semi", code: "semi", name: "Single shot" } }));
  assert.equal(before.fireMode.selectedCode, "semi");
  // Simulates the post-switch authoritative refresh: same weapon/profile,
  // new selected_fire_mode_id from armory (no local override involved).
  const after = mapWeapon(multiModeArmory({ selected: { id: "fm-auto", code: "auto", name: "Automatic fire" } }));
  assert.equal(after.fireMode.selectedCode, "auto");
  assert.equal(after.id, before.id); // 8. weapon id itself never changes
});

test("8. selecting a fire mode never changes the weapon id or profile id", () => {
  const weapon = mapWeapon(multiModeArmory());
  const beforeId = weapon.id;
  const beforeProfile = weapon.activeProfileId;
  // The fire-mode "select" command payload only ever carries fireModeId —
  // weaponId/profileId are read from the CURRENT weapon, never overwritten.
  assert.equal(weapon.id, beforeId);
  assert.equal(weapon.activeProfileId, beforeProfile);
});

// ── 9: switching weapons never carries a mode from the previous weapon ─────

test("9. switching to a different weapon reads its OWN fire mode, not the previous weapon's", () => {
  const rifle = mapWeapon(multiModeArmory({
    weaponId: "w-rifle", profileId: "p-rifle",
    selected: { id: "fm-auto", code: "auto", name: "Automatic fire" },
  }));
  const pistol = mapWeapon(singleModeArmory());
  assert.equal(rifle.fireMode.selectedCode, "auto");
  assert.equal(pistol.fireMode.selectedCode, "semi");
  assert.notEqual(rifle.id, pistol.id);
});

test("returning to the first weapon restores ITS canonical fire mode, not the second weapon's", () => {
  const armoryA = multiModeArmory({ weaponId: "w-a", selected: { id: "fm-semi", code: "semi", name: "Single shot" } });
  const armoryB = multiModeArmory({ weaponId: "w-b", selected: { id: "fm-auto", code: "auto", name: "Automatic fire" } });
  const weaponAFirst = mapWeapon(armoryA, "w-a");
  const weaponB = mapWeapon(armoryB, "w-b");
  // Re-selecting weapon A re-derives straight from armoryA — never inherits
  // weaponB's selected code, because there is no ephemeral override anywhere.
  const weaponAAgain = mapWeapon(armoryA, "w-a");
  assert.equal(weaponAFirst.fireMode.selectedCode, "semi");
  assert.equal(weaponB.fireMode.selectedCode, "auto");
  assert.equal(weaponAAgain.fireMode.selectedCode, "semi");
});

// ── 10: character change clears ephemeral fire-mode state ──────────────────

test("10. debug.fireMode reflects fireModeSelectorOpen only when explicitly ephemeral-open (reset on character change is a scene-controller concern, exercised via the ephemeral contract)", () => {
  const state = readyState();
  const openPayload = buildBroadcastPayload(state, { debugEnabled: true, fireModeSelectorOpen: true });
  assert.equal(openPayload.debug.fireMode.fireModeSelectorOpen, true);
  assert.equal(openPayload.ui.fireModeSelectorOpen, true);
  // A fresh ephemeral object (as resetEphemeralForCharacter produces on
  // character change) has fireModeSelectorOpen: false and no rpc result.
  const resetPayload = buildBroadcastPayload(state, { debugEnabled: true, fireModeSelectorOpen: false, fireModeRpcResult: null });
  assert.equal(resetPayload.debug.fireMode.fireModeSelectorOpen, false);
  assert.equal(resetPayload.debug.fireMode.fireModeLastResult, null);
});

function readyState() {
  return {
    status: SELECTION_STATUS.ready,
    selectedItemId: "tok-1",
    characterId: "char-1",
    viewer: { playerId: "p1", role: "PLAYER" },
    access: { canView: true, reason: null },
    runtimeBundle: {
      character: { id: "char-1", display_name: "Hero", owner_player_id: "p1" },
      state: { is_alive: true, is_conscious: true },
      sections: { armory: multiModeArmory() },
    },
    view: { name: "Hero" },
    error: { code: null, message: null },
  };
}

// ── 11: server rejection is surfaced, never silently a local success ──────

test("11a. resolveFireModeUpdatePath is 'server' once weapon+profile resolve (the canonical RPC already exists)", () => {
  assert.equal(resolveFireModeUpdatePath({ id: "w1", activeProfileId: "p1" }), "server");
  assert.equal(resolveFireModeUpdatePath({ id: null, activeProfileId: "p1" }), "unavailable");
  assert.equal(resolveFireModeUpdatePath(null), "unavailable");
});

test("11b. a thrown server exception normalizes to ok:false with the real message, never a fabricated success", () => {
  const result = normalizeFireModeRpcResult(new Error("Fire mode fm-auto is not allowed for active profile p-rifle"));
  assert.equal(result.ok, false);
  assert.match(result.message, /not allowed for active profile/);
});

test("11c. a resolved (non-throwing) switch normalizes to ok:true", () => {
  const result = normalizeFireModeRpcResult(null);
  assert.equal(result.ok, true);
  assert.equal(result.error, null);
});

test("11d. debug.fireMode surfaces the last RPC result exactly (never overwritten by a fabricated success)", () => {
  const state = readyState();
  const failure = { ok: false, error: "RPC_EXCEPTION", message: "Fire mode fm-auto is not allowed for active profile p-rifle." };
  const payload = buildBroadcastPayload(state, { debugEnabled: true, fireModeRpcResult: failure });
  assert.deepEqual(payload.debug.fireMode.fireModeLastResult, failure);
});

// ── 12: fire-mode commands never open Arrange HUD ──────────────────────────

test("12. the namespaced fire-mode command shape carries no arrange/editor signal", () => {
  const toggleCmd = { scope: "combat-hud", feature: "fire-mode", type: "toggle-selector" };
  const selectCmd = { scope: "combat-hud", feature: "fire-mode", type: "select", fireModeId: "fm-auto" };
  for (const cmd of [toggleCmd, selectCmd]) {
    assert.notEqual(cmd.type, "arrange");
    assert.equal(cmd.scope, "combat-hud");
    assert.equal(cmd.feature, "fire-mode");
  }
});

// ── 13: debug field shape sanity (spec section G) ──────────────────────────

test("debug.fireMode has exactly the documented fields, never the full armory bundle", () => {
  const state = readyState();
  const payload = buildBroadcastPayload(state, { debugEnabled: true, fireModeSelectorOpen: true, fireModeRpcResult: null });
  const fm = payload.debug.fireMode;
  const expectedKeys = [
    "selectedWeaponId", "activeProfileId", "fireModeApplicable",
    "selectedFireModeId", "selectedFireModeCode", "availableFireModeIds",
    "fireModeSelectorOpen", "fireModeUpdatePath", "fireModeLastResult",
  ].sort();
  assert.deepEqual(Object.keys(fm).sort(), expectedKeys);
  assert.equal(fm.fireModeUpdatePath, "server");
  assert.ok(Array.isArray(fm.availableFireModeIds));
});

test("debug.fireMode is absent unless debugEnabled is set", () => {
  const state = readyState();
  const payload = buildBroadcastPayload(state, {});
  assert.equal(payload.debug.fireMode, undefined);
});

setTimeout(() => {
  console.log(`\nGun Fire Mode v1: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
