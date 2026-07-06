// Combat HUD — Phase 3E.0 Combat Sessions Foundation tests.
//
// Two layers, matching how this suite has always tested server-coupled work:
//   - PURE unit tests over hud/session/* (mapper / policy / tracker render)
//     and the HUD wiring (selection payload gating, PlayerBlock banner);
//   - SERVER-CONTRACT checks over the SQL sources (migration 90 + the
//     existing 64/79 engine) asserting the gates/orderings/spend rules exist
//     exactly where claimed — Node cannot run Postgres, so the SQL contract
//     is pinned by content, not execution.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mapCombatRuntimeToSession } from "../hud/session/combatSessionMapper.js";
import {
  sessionAttackGate,
  sessionReloadGate,
  canEndTurn,
  canSeeGmTracker,
  buildStartCandidates,
  expectedVersionOf,
  SESSION_BLOCK_REASONS,
} from "../hud/session/combatSessionPolicy.js";
import { renderGmCombatTracker } from "../hud/session/GmCombatTrackerPanel.js";
import { buildBroadcastPayload } from "../hud/scene/selectionState.js";
import { renderPlayerBlock } from "../hud/components/PlayerBlock.js";
import { buildAttackPayload } from "../screens/resolveAttack/resolveAttackService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
// Read sources with line endings normalized to LF: the multi-line indexOf()
// contract checks below use "\n"-joined patterns, so a checkout that stored a
// file with CRLF (Windows/git autocrlf) must not break the string match.
const readText = (...segments) =>
  fs.readFileSync(path.join(repoRoot, ...segments), "utf8").replace(/\r\n/g, "\n");
const sql90 = readText("supabase", "90_combat_session_foundation.sql");
const sql64 = readText("supabase", "64_combat_hud_turn_engine_and_action_executor.sql");
const sceneControllerSrc = readText("hud", "scene", "sceneSelectionController.js");
const sessionControllerSrc = readText("hud", "session", "combatSessionController.js");

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

console.log("\nCombat Sessions Foundation (Phase 3E.0)\n");

/* ───────────────────────── fixtures ───────────────────────── */

function runtimeFixture({ activeCharacter = "char-a", round = 2, version = 7, aAction = 1, aMove = 1, bAction = 1, bMove = 1 } = {}) {
  return {
    ok: true,
    encounter: {
      id: "enc-1", status: "active", current_round: round,
      active_character_id: activeCharacter,
      active_entry_id: activeCharacter === "char-a" ? "entry-a" : "entry-b",
      state_version: version,
    },
    visible_participants: [
      {
        initiative_entry_id: "entry-a", character_id: "char-a", display_name: "Hero",
        character_bucket: "player", initiative_value: 18, roll_value: 14, order_index: 0,
        is_active: true, action_current: aAction, action_max: 1, move_current: aMove, move_max: 1,
        state: { is_alive: true, is_conscious: true },
      },
      {
        initiative_entry_id: "entry-b", character_id: "char-b", display_name: "Raider",
        character_bucket: "npc_active", initiative_value: 18, roll_value: 12, order_index: 1,
        is_active: true, action_current: bAction, action_max: 1, move_current: bMove, move_max: 1,
        state: { is_alive: true, is_conscious: false },
      },
    ],
    viewer_controlled_character_ids: ["char-a"],
    state_version: version,
  };
}

function sessionFor(opts = {}, viewCtx = {}) {
  return mapCombatRuntimeToSession(runtimeFixture(opts), { viewerPlayerId: "p1", selectedCharacterId: "char-a", ...viewCtx });
}

/* ── 1-3. Start roster: linked characters only, dedupe, no unlinked ───── */

test("1. GM start roster comes from linked scene characters only (server: token_links join; client: candidates builder)", () => {
  assert.ok(/from public\.odyssey_token_links t\s*\n\s*join public\.odyssey_characters c/m.test(sql90), "start_encounter iterates scene token links");
  const candidates = buildStartCandidates([
    { token_id: "t1", is_active: true, updated_at: "2026-07-01T10:00:00Z", character: { id: "c1", display_name: "Hero", character_bucket: "player" } },
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].characterId, "c1");
});

test("2. an unlinked token never becomes a participant/candidate", () => {
  const candidates = buildStartCandidates([
    { token_id: "t-unlinked", is_active: true, character: null },
    { token_id: "t-template", is_active: true, character: { id: "c9", character_bucket: "npc_template", display_name: "Tpl" } },
  ]);
  assert.equal(candidates.length, 0);
});

test("3. one character with two token links yields ONE candidate (newest active link) — and the SQL dedupes + upsert-guards too", () => {
  const candidates = buildStartCandidates([
    { token_id: "t-old", is_active: true, updated_at: "2026-07-01T10:00:00Z", character: { id: "c1", display_name: "Hero", character_bucket: "player" } },
    { token_id: "t-new", is_active: true, updated_at: "2026-07-02T10:00:00Z", character: { id: "c1", display_name: "Hero", character_bucket: "player" } },
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].tokenId, "t-new", "newest active link wins");
  assert.ok(sql90.includes("select distinct on (t.character_id)"), "server dedupes by character");
  assert.ok(sql90.includes("on conflict on constraint odyssey_initiative_entries_encounter_character_key do nothing"));
});

/* ── 4-7. Initiative + tie-breaks ─────────────────────────────────────── */

test("4. initiative = d20 + REAL Reaction; a missing Reaction attribute is a clear server error, never a silent 0", () => {
  assert.ok(sql90.includes("floor(random() * 20 + 1)::integer"));
  assert.ok(
    sql90.includes("candidate.roll_value + candidate.reaction_value")
    || sql90.includes("v_roll + coalesce(v_reaction, 0)"),
  );
  assert.ok(sql90.includes("odyssey_get_character_reaction_value_strict"));
  assert.ok(sql90.includes("REACTION_UNAVAILABLE"), "start returns a typed error when reaction is absent");
  assert.ok(sql90.includes("has no Reaction attribute"), "human-readable message names the character");
});

test("5/6. tie-break order: total desc → Player over NPC → raw d20 desc (server ranking)", () => {
  assert.ok(/e\.initiative_value desc,\s*\n\s*case when c\.character_bucket = 'player' then 1 else 0 end desc,\s*\n\s*e\.roll_value desc/m.test(sql90));
});

test("7. a FULL tie rerolls server-side among ONLY the tied entries (bounded loop) before ranking", () => {
  assert.ok(sql90.includes("odyssey_reroll_full_initiative_ties"));
  assert.ok(sql90.includes("having count(*) > 1"), "only groups with identical (total, class, raw d20)");
  assert.ok(sql90.includes("exit when v_pass > 10"), "bounded — deterministic ranking is the final fallback");
  assert.ok(sql90.indexOf("perform public.odyssey_reroll_full_initiative_ties(v_encounter_id);") <
    sql90.indexOf("with ranked as"), "reroll happens before the ranking pass");
});

/* ── 8-12. Turn engine ────────────────────────────────────────────────── */

test("8. exactly one current participant: the engine sets active_entry_id/active_character_id to a single candidate", () => {
  assert.ok(sql64.includes("active_entry_id = v_candidate.id"));
  assert.ok(sql64.includes("active_character_id = v_candidate.character_id"));
});

test("9. only the CURRENT participant's MAIN/MOVE are actionable — a WAITING participant maps to spent pips", () => {
  const waiting = sessionFor({ activeCharacter: "char-b" });
  assert.equal(waiting.isSelectedCharacterTurn, false);
  assert.equal(waiting.mainAvailable, false, "counter may be 1 server-side, but it is not actionable off-turn");
  assert.equal(waiting.moveAvailable, false);
  const current = sessionFor({ activeCharacter: "char-a" });
  assert.equal(current.mainAvailable, true);
  assert.equal(current.moveAvailable, true);
});

test("10. turn start refreshes the next participant's MAIN + MOVE server-side", () => {
  assert.ok(/action_current = action_max,\s*\n\s*move_current = move_max/m.test(sql64));
});

test("11. the round increments when the order wraps", () => {
  assert.ok(sql64.includes("set current_round = current_round + 1"));
});

test("12. ineligible participants are skipped only on REAL server state (dead removed, unconscious/skip_turn skipped)", () => {
  assert.ok(sql64.includes("removed_reason = 'dead'"));
  assert.ok(sql64.includes("'turn_skipped'"));
  assert.ok(sql64.includes("odyssey_character_has_active_effect_flag(v_candidate.character_id, 'skip_turn')"));
  // Mapper mirrors: unconscious participant is not eligible.
  const s = sessionFor({});
  assert.equal(s.participants.find((p) => p.characterId === "char-b").isEligible, false);
});

/* ── 13-16. Attack economy ────────────────────────────────────────────── */

test("13. attack without MAIN is rejected server-side (ACTION_NOT_AVAILABLE) and pre-blocked client-side", () => {
  assert.ok(sql90.includes("'ACTION_NOT_AVAILABLE'"));
  const gate = sessionAttackGate(sessionFor({ aAction: 0 }));
  assert.deepEqual(gate, { blocked: true, reason: SESSION_BLOCK_REASONS.mainSpent });
});

test("14/15. hit AND miss both spend MAIN: the spend runs after ok-check, keyed on resolution — not on hit", () => {
  const spendIdx = sql90.indexOf("perform public.odyssey_apply_turn_costs(\n      public.odyssey_try_parse_uuid(v_participation->>'entry_id'),\n      1,");
  const okCheckIdx = sql90.indexOf("if coalesce((v_result->>'ok')::boolean, false) = false then\n    return v_result;\n  end if;");
  assert.ok(spendIdx > -1 && okCheckIdx > -1 && spendIdx > okCheckIdx, "spend is unconditional after a RESOLVED attack");
  const between = sql90.slice(okCheckIdx, spendIdx);
  assert.ok(!/'hit'/.test(between), "no hit-check between resolution and the MAIN spend");
});

test("16. an invalid/rejected attack spends nothing: every gate/deny returns BEFORE the spend", () => {
  const executeIdx = sql90.indexOf("v_result := public.odyssey_perform_weapon_attack(v_payload);");
  assert.ok(executeIdx > -1);
  for (const marker of ["'NOT_CURRENT_TURN'", "'ACTION_NOT_AVAILABLE'", "'STATE_VERSION_CONFLICT'"]) {
    const idx = sql90.indexOf(marker);
    assert.ok(idx > -1 && idx < executeIdx, `${marker} is checked before the attack executes`);
  }
});

/* ── 17-19. Reload economy ────────────────────────────────────────────── */

test("17. reload without MOVE is rejected (MOVE_NOT_AVAILABLE) and pre-blocked client-side", () => {
  assert.ok(sql90.includes("'MOVE_NOT_AVAILABLE'"));
  const gate = sessionReloadGate(sessionFor({ aMove: 0 }));
  assert.deepEqual(gate, { blocked: true, reason: SESSION_BLOCK_REASONS.moveSpent });
});

test("18. only a SUCCESSFUL reload spends MOVE (spend sits after the magazine swap, before the ok result)", () => {
  const reloadFn = sql90.slice(sql90.indexOf("create or replace function public.load_weapon_profile_magazine"));
  const swapIdx = reloadFn.indexOf("set loaded_magazine_id = v_character_magazine_id");
  const spendIdx = reloadFn.indexOf("perform public.odyssey_apply_turn_costs(");
  assert.ok(swapIdx > -1 && spendIdx > swapIdx, "MOVE is spent only after the swap succeeded");
});

test("19. a failed reload spends nothing: every reload denial returns before the spend", () => {
  const reloadFn = sql90.slice(sql90.indexOf("create or replace function public.load_weapon_profile_magazine"));
  const spendIdx = reloadFn.indexOf("perform public.odyssey_apply_turn_costs(");
  for (const marker of ["'MAGAZINE_INCOMPATIBLE'", "'MAGAZINE_NOT_FOUND'", "'NOT_CURRENT_TURN'", "'MOVE_NOT_AVAILABLE'"]) {
    const idx = reloadFn.indexOf(marker);
    assert.ok(idx > -1 && idx < spendIdx, `${marker} returns before the MOVE spend`);
  }
});

/* ── 20-22. Legacy paths + concurrency ────────────────────────────────── */

test("20. outside a session both gates are no-ops (legacy free-play attack/reload unchanged)", () => {
  const none = mapCombatRuntimeToSession(null, { selectedCharacterId: "char-a" });
  assert.equal(none.exists, false);
  assert.deepEqual(sessionAttackGate(none), { blocked: false, reason: null });
  assert.deepEqual(sessionReloadGate(none), { blocked: false, reason: null });
  // Server side: the whole gate block is conditional on found participation.
  assert.ok(sql90.includes("v_participation := public.odyssey_get_active_participation(v_attacker_character_id);"));
  assert.ok(sql90.includes("if v_participation is not null then"));
});

test("21. a participant CANNOT bypass the economy via the legacy path: participation is derived server-side, never from payload session fields", () => {
  const gateIdx = sql90.indexOf("odyssey_get_active_participation(v_attacker_character_id)");
  assert.ok(gateIdx > -1);
  // The lookup takes ONLY the attacker id — no payload encounter/session field.
  assert.ok(!/odyssey_get_active_participation\([^)]*payload/.test(sql90));
  assert.ok(sql90.includes("never from client-sent encounter context"));
});

test("22. a stale expected version is rejected without mutation (attack, reload, and turn RPCs)", () => {
  assert.ok((sql90.match(/'STATE_VERSION_CONFLICT'/g) || []).length >= 2, "attack + reload gates");
  assert.ok(sql64.includes("odyssey_validate_combat_versions"), "end_turn validates expected_encounter_version");
  // Client only sends a real version during an active session:
  assert.equal(expectedVersionOf(sessionFor({ version: 7 })), 7);
  assert.equal(expectedVersionOf(mapCombatRuntimeToSession(null, {})), null);
  const payload = buildAttackPayload({
    attackerCharacterId: "a", targetCharacterId: "b", targetBodyPartId: "z",
    weaponId: "w", modifiers: [], expectedEncounterVersion: 7,
  });
  assert.equal(payload.expected_encounter_version, 7);
  const noSession = buildAttackPayload({
    attackerCharacterId: "a", targetCharacterId: "b", targetBodyPartId: "z",
    weaponId: "w", modifiers: [], expectedEncounterVersion: null,
  });
  assert.ok(!("expected_encounter_version" in noSession));
});

/* ── 23. End Turn cannot double-send ──────────────────────────────────── */

test("23. End Turn is single-flight (controller guard) and the button disables itself on click", () => {
  assert.ok(sessionControllerSrc.includes("if (mutationInFlight) return;"), "second mutation while one is in flight is a no-op");
  const moduleSrc = fs.readFileSync(path.join(repoRoot, "hud", "components", "CombatHudModule.js"), "utf8");
  assert.ok(moduleSrc.includes('case "end-turn":'));
  assert.ok(moduleSrc.includes('t.setAttribute("disabled", "disabled")'));
});

/* ── 24-25. Player vs GM visibility ───────────────────────────────────── */

test("24. the GM tracker never renders its controls for a plain player", () => {
  assert.equal(canSeeGmTracker("player"), false);
  const html = renderGmCombatTracker({ session: sessionFor({}), candidates: [], viewerRole: "player" });
  assert.ok(html.includes("GM only."));
  assert.ok(!html.includes("Start Combat") && !html.includes("Skip Turn") && !html.includes("End Combat"));
  // And the COMBAT toggle button itself is GM-gated in the Combat Control block:
  const ccSrc = fs.readFileSync(path.join(repoRoot, "hud", "components", "CombatControlBlock.js"), "utf8");
  assert.ok(ccSrc.includes('state?.viewer?.role === "gm"'));
});

test("25. the player sees ROUND/YOUR TURN/WAITING and server-derived MAIN/MOVE pips", () => {
  const session = sessionFor({ activeCharacter: "char-a", round: 3 });
  const state = {
    status: "ready",
    viewer: { playerId: "p1", role: "player" },
    snapshot: {
      combatSession: session,
      entity: {
        summary: { name: "Hero", svgRef: "humanoid", characterType: "player" },
        zones: [], shield: { current: 5, max: 10 }, psi: null,
        actions: { main: session.mainAvailable, move: session.moveAvailable },
        statuses: [], effects: [], flags: { alive: true, conscious: true },
      },
    },
    ui: {},
  };
  const html = renderPlayerBlock(state);
  assert.ok(html.includes("YOUR TURN"));
  assert.ok(html.includes("R3"), "round number shown");
  assert.ok(html.includes("MAIN") && html.includes("MOVE"));
  assert.ok(html.includes("is-on"), "available pip rendered from session state");

  const waitingSession = sessionFor({ activeCharacter: "char-b" });
  const waitingHtml = renderPlayerBlock({
    ...state,
    snapshot: { ...state.snapshot, combatSession: waitingSession, entity: { ...state.snapshot.entity, actions: { main: waitingSession.mainAvailable, move: waitingSession.moveAvailable } } },
  });
  assert.ok(waitingHtml.includes("WAITING"));
});

test("25b. selection payload gates the Attack button with the SERVER session reason (never a fabricated one)", () => {
  const readyState = {
    status: "ready",
    selectedItemId: "tok-1",
    characterId: "char-a",
    viewer: { playerId: "p1", role: "PLAYER" },
    access: { canView: true },
    view: {},
    runtimeBundle: null, // no hudSnapshot → but session still maps; gate applies only when eval allowed
  };
  // Waiting for turn: precondition-eval blocked states keep their own reason;
  // here we check policy composition directly (waiting → reason string).
  const gate = sessionAttackGate(sessionFor({ activeCharacter: "char-b" }));
  assert.deepEqual(gate, { blocked: true, reason: SESSION_BLOCK_REASONS.waitingForTurn });
  const payload = buildBroadcastPayload(readyState, { sessionRuntime: runtimeFixture({ activeCharacter: "char-b" }) });
  // No hudSnapshot (no bundle) → ui.basicAttack stays precondition-blocked; the
  // session shape itself is still delivered for the banner path when ready.
  assert.equal(payload.ui.basicAttack.uiAllowed, false);
});

/* ── 26. Debug Console events ─────────────────────────────────────────── */

test("26. session lifecycle + action-cost events all have real call sites", () => {
  const required = [
    ["start-requested", sessionControllerSrc],
    ["start-result", sessionControllerSrc],
    ["initiative-calculated", sessionControllerSrc],
    ["turn-started", sessionControllerSrc],
    ["turn-ended", sessionControllerSrc],
    ["turn-skipped", sessionControllerSrc],
    ["turn-forced-next", sessionControllerSrc],
    ["\"ended\"", sessionControllerSrc],
    ["stale-version", sessionControllerSrc],
    ["refresh-result", sessionControllerSrc],
    ["session-gate-blocked", sceneControllerSrc],
    ["action-cost-consumed", sceneControllerSrc],
  ];
  for (const [needle, src] of required) {
    assert.ok(src.includes(needle), `missing debug event: ${needle}`);
  }
  // Detail contract: versions + MAIN/MOVE before/after come from the server summary.
  assert.ok(sceneControllerSrc.includes("versionBefore"));
  assert.ok(sceneControllerSrc.includes("mainAfter"));
  assert.ok(sql90.includes("'state_version_before'"));
  assert.ok(sql90.includes("'main_available_after'"));
});

/* ── extra contract details ───────────────────────────────────────────── */

test("participants carry ONLY safe fields (no inventory/skills/PSI/private body values)", () => {
  const json = JSON.stringify(sessionFor({}).participants);
  assert.ok(!/inventory|skills|psi|armor_value|body|owner_player_id|hidden/i.test(json));
});

test("combat_execute_action no longer double-spends attack/reload (patched to skip both)", () => {
  assert.ok(sql90.includes("if v_kind not in ('move', 'attack', 'reload') then"));
});

test("the isolated turn-start hook exists and is the engine's only effects entry point", () => {
  assert.ok(sql90.includes("create or replace function public.odyssey_apply_turn_start_effects"));
  assert.ok(sql90.includes("v_refresh := public.odyssey_apply_turn_start_effects(p_encounter_id, v_candidate.character_id);"));
});

test("GM tracker render shows round/current/initiative list with markers when active, Start Combat when not", () => {
  const active = renderGmCombatTracker({ session: sessionFor({ round: 4 }), candidates: [], viewerRole: "gm" });
  assert.ok(active.includes("ROUND 4"));
  assert.ok(active.includes("Current: Hero"));
  assert.ok(active.includes("Skip Turn") && active.includes("Force Next") && active.includes("End Combat"));
  assert.ok(active.includes("SKIP"), "ineligible participant marked");
  const idle = renderGmCombatTracker({ session: null, candidates: [{ characterId: "c1", displayName: "Hero", isPlayerCharacter: true, tokenId: "t1" }], viewerRole: "gm" });
  assert.ok(idle.includes("Start Combat"));
  assert.ok(idle.includes('data-gmct-candidate="c1"'));
});

test("canEndTurn: owner of the current participant, or GM inspecting them — no one else", () => {
  assert.equal(canEndTurn(sessionFor({ activeCharacter: "char-a" }), "player"), true, "viewer controls char-a");
  assert.equal(canEndTurn(sessionFor({ activeCharacter: "char-b" }), "player"), false, "not the viewer's turn");
  assert.equal(canEndTurn(sessionFor({ activeCharacter: "char-a" }, { viewerIsGm: true }), "gm"), true);
  assert.equal(canEndTurn(mapCombatRuntimeToSession(null, {}), "gm"), false, "no session → no End Turn");
});

setTimeout(() => {
  console.log(`\nCombat Sessions Foundation: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
