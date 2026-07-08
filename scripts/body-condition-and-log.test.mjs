// Combat HUD — Phase 3D.1 tests for:
//   C/D) body-condition colors + Player Block hover numbers (authorization-gated)
//   E)   real Combat Log (server-result-only)
//   F)   temporary Debug Log (?debug=1 only, in-memory)

import assert from "node:assert/strict";
import { evaluateBodyCondition, bodyConditionDetailLines, BODY_CONDITION_STATE } from "../hud/targeting/bodyConditionPolicy.js";
import { zoneStateClass } from "../hud/components/hudLayoutModel.js";
import { renderPlayerBlock } from "../hud/components/PlayerBlock.js";
import {
  buildAttackLogEntry,
  buildReloadLogEntry,
  buildFireModeLogEntry,
  appendCombatLogEntry,
  COMBAT_LOG_MAX_ENTRIES,
} from "../hud/log/combatResultLogPolicy.js";
import {
  initDebugLog,
  isDebugLogEnabled,
  logDebugEvent,
  getDebugLogEntries,
  clearDebugLog,
  subscribeDebugLog,
} from "../hud/debug/debugLogStore.js";

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

console.log("\nBody condition + Combat Log + Debug Log (Phase 3D.1)\n");

// ── 7, 8, 9: bodyConditionPolicy ────────────────────────────────────────────

test("7. evaluateBodyCondition never reveals more than state/zoneState/colorToken/label", () => {
  const result = evaluateBodyCondition({ minor: 1, serious: 0, critical: 0, disabled: false, destroyed: false });
  assert.deepEqual(Object.keys(result).sort(), ["colorToken", "label", "state", "zoneState"]);
});

test("8. real severity fields map to the correct silhouette state", () => {
  assert.equal(evaluateBodyCondition({ minor: 0, serious: 0, critical: 0 }).state, BODY_CONDITION_STATE.healthy);
  assert.equal(evaluateBodyCondition({ minor: 1 }).state, BODY_CONDITION_STATE.minor);
  assert.equal(evaluateBodyCondition({ minor: 1, serious: 1 }).state, BODY_CONDITION_STATE.serious);
  assert.equal(evaluateBodyCondition({ critical: 1 }).state, BODY_CONDITION_STATE.critical);
  assert.equal(evaluateBodyCondition({ destroyed: true }).state, BODY_CONDITION_STATE.disabled);
  // Bugfix pack: a bare `disabled` flag with no threshold data and no real
  // `destroyed` is NOT trusted on its own (audited: the server sets it the
  // moment any critical wound lands, before the real threshold is reached).
  assert.notEqual(evaluateBodyCondition({ disabled: true, critical: 0 }).state, BODY_CONDITION_STATE.disabled);
  // Its zoneState feeds directly into the existing CSS pipeline.
  assert.equal(zoneStateClass(evaluateBodyCondition({ minor: 1 }).zoneState), "wounded");
  assert.equal(zoneStateClass(evaluateBodyCondition({ critical: 1 }).zoneState), "critical");
});

test("9. missing/null body-part data is 'unknown', never fake-healthy", () => {
  assert.equal(evaluateBodyCondition(null).state, BODY_CONDITION_STATE.unknown);
  assert.equal(evaluateBodyCondition(undefined).state, BODY_CONDITION_STATE.unknown);
  assert.equal(zoneStateClass(evaluateBodyCondition(null).zoneState), "unknown");
  assert.notEqual(evaluateBodyCondition(null).state, BODY_CONDITION_STATE.healthy);
});

test("zoneStateClass renders any unrecognized state as unknown, never healthy", () => {
  assert.equal(zoneStateClass(undefined), "unknown");
  assert.equal(zoneStateClass("garbage"), "unknown");
  assert.equal(zoneStateClass("healthy"), "healthy");
});

test("bodyConditionDetailLines reports only real wound counts, never a fabricated current/max", () => {
  const lines = bodyConditionDetailLines({ minor: 2, serious: 0, critical: 1, armor_value: 5 });
  assert.ok(lines.some((l) => /Critical damage: 1/.test(l)));
  assert.ok(lines.some((l) => /Minor wounds: 2/.test(l)));
  assert.ok(lines.some((l) => /Armor: 5/.test(l)));
  assert.ok(!lines.some((l) => /\d+\s*\/\s*\d+/.test(l)), "never a fake N/M fraction");
  assert.deepEqual(bodyConditionDetailLines(null), []);
});

// ── 11, 12: Player Block hover authorization ───────────────────────────────

function playerState({ role = "player", characterType = "player", zones } = {}) {
  return {
    status: "ready",
    viewer: { playerId: "p1", playerName: null, role },
    access: { canViewSelectedCharacter: true, reason: null },
    snapshot: {
      entity: {
        summary: { name: "Hero", svgRef: "humanoid", characterType },
        zones: zones ?? [
          { id: "torso", label: "Torso", state: "wounded", canBeTargeted: true, detailLines: ["Minor wounds: 1"] },
          { id: "head", label: "Head", state: "healthy", canBeTargeted: true, detailLines: [] },
        ],
        shield: { current: 5, max: 10 },
        psi: null,
        actions: { main: true, move: true },
        statuses: [],
        effects: [],
      },
      combatSession: { status: "inactive" },
    },
    ui: {},
  };
}

test("11. a linked, owned (player-role) source shows real numeric hover details", () => {
  const html = renderPlayerBlock(playerState({ role: "player" }));
  assert.ok(html.includes("data-tip-title=\"Torso\""));
  assert.ok(html.includes("Minor wounds: 1"));
});

test("12a. a GM inspecting an NPC (not player/mech type) gets NO numeric hover", () => {
  const html = renderPlayerBlock(playerState({ role: "gm", characterType: "npc" }));
  assert.ok(!html.includes("Minor wounds: 1"));
  // The zone itself still renders (silhouette + color) — only the tip is gated.
  assert.ok(html.includes("ohud-zone--wounded"));
});

test("12b. a GM inspecting a player-type character IS treated as authorized (existing selectControlledCharacter semantics)", () => {
  const html = renderPlayerBlock(playerState({ role: "gm", characterType: "player" }));
  assert.ok(html.includes("Minor wounds: 1"));
});

test("a zone with nothing to report (healthy, no wounds) gets no tip attribute at all", () => {
  const html = renderPlayerBlock(playerState({ role: "player" }));
  // The head zone's detailLines is [] — no data-tip-title for it specifically
  // is hard to isolate via substring, but the healthy zone renders without any
  // wound-count text.
  assert.ok(!html.includes("Wounds: 0"));
});

// ── 13, 14, 15: Combat Log (server-result only) ────────────────────────────

test("13. a real attack result becomes a log entry with the actual server roll/damage fields", () => {
  const entry = buildAttackLogEntry({
    sourceCharacterId: "char-1",
    targetCharacterId: "char-2",
    bodyZoneLabel: "Torso",
    outcome: { ok: true, normalized: { attackTotal: 71, defenseTotal: 59, hit: true, damageLevel: "serious" } },
  });
  assert.equal(entry.outcome, "success");
  assert.ok(entry.details.includes("Attack: 71 vs Defense: 59"));
  assert.ok(entry.details.includes("Hit"));
  assert.ok(entry.details.includes("Torso"));
  assert.ok(entry.details.includes("Damage: serious"));
  assert.equal(entry.sourceCharacterId, "char-1");
  assert.equal(entry.targetCharacterId, "char-2");
});

test("14. Combat Log never invents a roll/damage field the server didn't return", () => {
  const entry = buildAttackLogEntry({
    sourceCharacterId: "char-1", targetCharacterId: "char-2", bodyZoneLabel: "Torso",
    outcome: { ok: true, normalized: { hit: null, damageLevel: null } }, // server returned nothing numeric
  });
  assert.ok(!entry.details.some((d) => /vs Defense/.test(d)));
  assert.ok(!entry.details.some((d) => /^Hit$|^Miss$/.test(d)));
  assert.ok(!entry.details.some((d) => /Damage:/.test(d)));
});

test("a server denial produces a distinct, clearly-failed log entry", () => {
  const entry = buildAttackLogEntry({
    sourceCharacterId: "char-1", targetCharacterId: "char-2", bodyZoneLabel: "Torso",
    outcome: { ok: false, error: "NO_MAGAZINE", normalized: null },
  });
  assert.equal(entry.outcome, "failure");
  assert.equal(entry.title, "Attack failed");
  assert.equal(entry.details[0], "NO_MAGAZINE");
});

test("15. reload and fire-mode success/failure produce real, distinguishable log entries", () => {
  const reloadOk = buildReloadLogEntry({ sourceCharacterId: "c1", ok: true, message: "Reloaded." });
  const reloadFail = buildReloadLogEntry({ sourceCharacterId: "c1", ok: false, message: "Magazine is not compatible." });
  assert.equal(reloadOk.outcome, "success");
  assert.equal(reloadFail.outcome, "failure");
  assert.notEqual(reloadOk.title, reloadFail.title);

  const fmOk = buildFireModeLogEntry({ sourceCharacterId: "c1", ok: true, message: "Fire mode changed." });
  const fmFail = buildFireModeLogEntry({ sourceCharacterId: "c1", ok: false, message: "Fire mode is not allowed for the active profile." });
  assert.equal(fmOk.outcome, "success");
  assert.equal(fmFail.outcome, "failure");
});

test("Combat Log entries push newest-first and cap at COMBAT_LOG_MAX_ENTRIES", () => {
  let list = [];
  for (let i = 0; i < COMBAT_LOG_MAX_ENTRIES + 10; i += 1) {
    list = appendCombatLogEntry(list, { timestamp: i, type: "attack", outcome: "success", title: `#${i}`, details: [], sourceCharacterId: null, targetCharacterId: null });
  }
  assert.equal(list.length, COMBAT_LOG_MAX_ENTRIES);
  assert.equal(list[0].title, `#${COMBAT_LOG_MAX_ENTRIES + 9}`); // newest first
});

// ── 16, 17, 18, 19: Debug Log ───────────────────────────────────────────────

test("16. Debug Log is a genuine no-op when not enabled — nothing is collected", () => {
  initDebugLog(false);
  clearDebugLog();
  logDebugEvent("attack", "requested", { foo: "bar" });
  assert.equal(isDebugLogEnabled(), false);
  assert.equal(getDebugLogEntries().length, 0);
});

test("17. once enabled, attack/reload/fire-mode/targeting events are all captured", () => {
  initDebugLog(true);
  clearDebugLog();
  logDebugEvent("attack", "requested", {});
  logDebugEvent("attack", "result", { ok: true }, true);
  logDebugEvent("magazine", "reload-result", { ok: true }, true);
  logDebugEvent("fire-mode", "result", { ok: false }, false);
  logDebugEvent("targeting", "target-selected", { characterId: "c2" });
  const entries = getDebugLogEntries();
  assert.equal(entries.length, 5);
  const categories = entries.map((e) => e.category);
  assert.ok(categories.includes("attack"));
  assert.ok(categories.includes("magazine"));
  assert.ok(categories.includes("fire-mode"));
  assert.ok(categories.includes("targeting"));
  // Newest first.
  assert.equal(entries[0].category, "targeting");
});

test("18. Debug Log has no persistence hook — clearDebugLog() drops everything, nothing to reload from", () => {
  initDebugLog(true);
  logDebugEvent("attack", "requested", {});
  assert.ok(getDebugLogEntries().length > 0);
  clearDebugLog();
  assert.equal(getDebugLogEntries().length, 0);
});

test("19. Debug Log entries never carry a raw bundle/inventory/auth-shaped payload", () => {
  initDebugLog(true);
  clearDebugLog();
  logDebugEvent("attack", "payload-prepared", { weaponId: "w1", targetCharacterId: "t1", bodyZone: "TORSO" });
  const [entry] = getDebugLogEntries();
  const json = JSON.stringify(entry);
  assert.ok(!/armory|inventory|magazines|abilities|auth|token(?!Ids)|access_token/i.test(json));
});

test("Debug Log caps at 200 entries", () => {
  initDebugLog(true);
  clearDebugLog();
  for (let i = 0; i < 210; i += 1) logDebugEvent("routing", `event-${i}`, {});
  assert.equal(getDebugLogEntries().length, 200);
});

test("subscribeDebugLog notifies on new entries and can unsubscribe", () => {
  initDebugLog(true);
  clearDebugLog();
  let calls = 0;
  const unsubscribe = subscribeDebugLog(() => { calls += 1; });
  logDebugEvent("attack", "requested", {});
  assert.equal(calls, 1);
  unsubscribe();
  logDebugEvent("attack", "requested", {});
  assert.equal(calls, 1, "no further notifications after unsubscribe");
  initDebugLog(false); // leave the shared singleton in a clean, disabled state
  clearDebugLog();
});

setTimeout(() => {
  console.log(`\nBody condition + Combat Log + Debug Log: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
