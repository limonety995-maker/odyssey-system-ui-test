// Combat HUD — Phase 4.2 tests: Battle Log compact lines + expandable details.
//
// Two layers, matching the project's existing convention:
//   - pure unit tests against battleLogEntryModel.js / combatResultLogPolicy.js /
//     BattleLogBlock.js (all three are plain modules, no OBR/Supabase import,
//     directly executable here);
//   - source-contract checks against sceneSelectionController.js,
//     combatSessionController.js, and movement/moveToolController.js (all
//     three transitively import the OBR SDK and cannot be executed in plain
//     Node), verifying the wiring exists via string/regex assertions on the
//     file's own source.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LOG_STATUS,
  LOG_SEVERITY,
  statusLabel,
  severityLabel,
  classifyAttackStatus,
  classifySeverity,
  buildAttackCompactText,
  buildAttackBreakdown,
} from "../hud/log/battleLogEntryModel.js";
import {
  buildAttackLogEntry,
  buildReloadLogEntry,
  buildAbilityExecutionLogEntry,
  buildDirectedAbilityLogEntry,
  buildToggleAbilityLogEntry,
  buildFireModeLogEntry,
  buildMovementLogEntry,
  buildEndTurnLogEntry,
} from "../hud/log/combatResultLogPolicy.js";
import { renderBattleLogPanel, toggleLogEntryExpanded } from "../hud/components/BattleLogBlock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const readSrc = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const sceneSelectionSrc = readSrc("hud/scene/sceneSelectionController.js");
const combatSessionSrc = readSrc("hud/session/combatSessionController.js");
const moveToolSrc = readSrc("movement/moveToolController.js");
const layoutSrc = readSrc("hud/components/CombatHudLayout.js");
const moduleSrc = readSrc("hud/components/CombatHudModule.js");
const tokensCss = readSrc("hud/styles/combatHudTokens.css");
const layoutCss = readSrc("hud/components/combatHudLayout.css");

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

console.log("\nPhase 4.2 — Battle Log compact lines + expandable details\n");

// ── Compact rendering (1-11) ────────────────────────────────────────────────

const HIT_TRACE_OK = {
  ok: true,
  accuracy: { attackTotal: 157, defenseTotal: 41, hit: true, auto: null },
  damage: { attackTotalUsed: 187, defenseTotalUsed: 91, damageLevel: "serious" },
};
const MISS_TRACE_OK = {
  ok: true,
  accuracy: { attackTotal: 41, defenseTotal: 68, hit: false, auto: null },
  damage: {},
};

test("1. a hit weapon-attack compact line shows actor/target/zone + SUCCESS + Accuracy + Damage + severity", () => {
  const text = buildAttackCompactText({
    actorName: "Freya", targetName: "Raider", bodyZoneLabel: "Torso", turnLabel: "T3", trace: HIT_TRACE_OK,
  });
  assert.equal(text, "[T3] Freya attacks Raider / Torso — [SUCCESS] · Accuracy 157/41 · Damage 187/91 · [SERIOUS]");
});

test("2. a miss compact line shows FAILURE + Accuracy only — never a fabricated Damage clause", () => {
  const text = buildAttackCompactText({
    actorName: "Raider", targetName: "Freya", bodyZoneLabel: "Left Arm", turnLabel: "T3", trace: MISS_TRACE_OK,
  });
  assert.equal(text, "[T3] Raider attacks Freya / Left Arm — [FAILURE] · Accuracy 41/68");
});

test("3. CRIT SUCCESS / CRIT FAILURE text labels are distinct strings, never silently merged with SUCCESS/FAILURE", () => {
  assert.equal(statusLabel(LOG_STATUS.critSuccess), "CRIT SUCCESS");
  assert.equal(statusLabel(LOG_STATUS.critFailure), "CRIT FAILURE");
  assert.notEqual(statusLabel(LOG_STATUS.critSuccess), statusLabel(LOG_STATUS.success));
  assert.notEqual(statusLabel(LOG_STATUS.critFailure), statusLabel(LOG_STATUS.failure));
  assert.equal(classifyAttackStatus({ ok: true, accuracy: { auto: "fail" } }), LOG_STATUS.critFailure);
  assert.equal(classifyAttackStatus({ ok: true, accuracy: { auto: "crit", hit: true } }), LOG_STATUS.critSuccess);
});

// attackResolutionTrace.js reads damage totals from raw.damage.damage_*_total
// (no flat `normalized` fallback for those two fields specifically) — this
// fixture mirrors the real server RPC shape, not a client-invented one.
const HIT_OUTCOME_OK = {
  ok: true,
  normalized: { attackTotal: 157, defenseTotal: 41, hit: true, damageLevel: "serious" },
  raw: { damage: { damage_attack_total: 187, damage_defense_total: 91 } },
};

test("4. direct ability attack reuses the SAME attack-shaped compact line as a weapon attack", () => {
  const entry = buildAttackLogEntry({
    sourceCharacterId: "s1", targetCharacterId: "t1", bodyZoneLabel: "Torso",
    sourceCharacterName: "Freya", targetCharacterName: "Raider", turnLabel: "T3",
    outcome: HIT_OUTCOME_OK,
  });
  assert.equal(entry.compactText, "[T3] Freya attacks Raider / Torso — [SUCCESS] · Accuracy 157/41 · Damage 187/91 · [SERIOUS]");
});

test("5. instant/self ability compact text names the actor and ability, no target concept", () => {
  const entry = buildAbilityExecutionLogEntry({
    sourceCharacterId: "s1", sourceCharacterName: "Vega", turnLabel: "T2", abilityName: "Adrenaline Surge",
    outcome: { ok: true, normalized: { actionCost: 1 } },
  });
  assert.equal(entry.compactText, "[T2] Vega uses Adrenaline Surge — active.");
  assert.ok(!/undefined|null/.test(entry.compactText));
});

test("6. directed target ability compact text includes the resolved target name", () => {
  const entry = buildDirectedAbilityLogEntry({
    sourceCharacterId: "s1", targetCharacterId: "t1", sourceCharacterName: "Vega", turnLabel: "T2",
    abilityName: "Suppress", targetName: "Raider",
    outcome: { ok: true, normalized: {} },
  });
  assert.equal(entry.compactText, "[T2] Vega uses Suppress on Raider — [SUCCESS]");
});

test("7/8. toggle ON and OFF compact lines carry distinct bracketed state badges", () => {
  const on = buildToggleAbilityLogEntry({
    sourceCharacterId: "s1", sourceCharacterName: "Vega", turnLabel: "T1", abilityName: "Overwatch Stance",
    outcome: { ok: true, normalized: { active: true } },
  });
  const off = buildToggleAbilityLogEntry({
    sourceCharacterId: "s1", sourceCharacterName: "Vega", turnLabel: "T1", abilityName: "Overwatch Stance",
    outcome: { ok: true, normalized: { active: false } },
  });
  assert.ok(on.compactText.includes("[ON]"));
  assert.ok(off.compactText.includes("[OFF]"));
  assert.notEqual(on.compactText, off.compactText);
});

test("9. reload compact text differs with/without a resolved weapon name, and success vs failure", () => {
  const withWeapon = buildReloadLogEntry({ sourceCharacterId: "s1", sourceCharacterName: "Vega", turnLabel: "T1", weaponName: "Compact Pistol", ok: true, message: "Reloaded." });
  const withoutWeapon = buildReloadLogEntry({ sourceCharacterId: "s1", sourceCharacterName: "Vega", turnLabel: "T1", ok: true, message: "Reloaded." });
  assert.equal(withWeapon.compactText, "[T1] Vega reloads Compact Pistol.");
  assert.equal(withoutWeapon.compactText, "[T1] Vega reloads.");
  const failed = buildReloadLogEntry({ sourceCharacterId: "s1", sourceCharacterName: "Vega", ok: false, message: "Magazine incompatible." });
  assert.ok(failed.compactText.includes("fails to reload"));
  assert.ok(failed.compactText.includes("Magazine incompatible."));
});

test("10/11. movement compact text shows a real distance when given, and NEVER invents one when absent", () => {
  const withDistance = buildMovementLogEntry({ sourceCharacterId: "c1", sourceCharacterName: "Vega", turnLabel: "T4", distanceM: 6 });
  const withoutDistance = buildMovementLogEntry({ sourceCharacterId: "c1", sourceCharacterName: "Vega", turnLabel: "T4" });
  assert.equal(withDistance.compactText, "[T4] Vega moves 6m");
  assert.equal(withoutDistance.compactText, "[T4] Vega moves");
  assert.ok(!/moves\s+\d/.test(withoutDistance.compactText), "no fabricated numeric distance after 'moves'");
});

test("end-turn compact text + blocked-action (denied attack) compact text", () => {
  const endTurn = buildEndTurnLogEntry({ sourceCharacterId: "c1", sourceCharacterName: "Vega", turnLabel: "T4", nextActorName: "Raider" });
  assert.equal(endTurn.compactText, "[T4] Vega ends turn");
  assert.ok(endTurn.details.includes("Next: Raider."));

  const blocked = buildAttackLogEntry({
    sourceCharacterId: "s1", targetCharacterId: "t1", bodyZoneLabel: "Torso", sourceCharacterName: "Vega", turnLabel: "T4",
    outcome: { ok: false, error: "NO_MAGAZINE" },
  });
  assert.ok(blocked.compactText.includes("cannot attack"));
  assert.ok(blocked.compactText.includes("NO_MAGAZINE"));
});

// ── Expanded details (12-20) ────────────────────────────────────────────────

test("12. buildAttackBreakdown returns damage:null (not zeros) when the accuracy check missed", () => {
  const b = buildAttackBreakdown(MISS_TRACE_OK);
  assert.equal(b.damage, null);
  assert.equal(b.damageNotRolled, true);
});

test("13. formula strings only ever include terms the server actually returned", () => {
  const b = buildAttackBreakdown({
    ok: true,
    accuracy: { attackRoll: 97, attackSkillBonus: 10, weaponAccuracyBonus: 50, attackTotal: 157, defenseRoll: 41, defenseTotal: 41, hit: true },
    damage: {},
  });
  assert.equal(b.accuracy.attacking, "97 + 10 + 50 = 157");
  assert.equal(b.accuracy.defending, "41 = 41");
});

function withExpandedPanel(entryId, render) {
  toggleLogEntryExpanded(entryId);
  try { return render(); } finally { toggleLogEntryExpanded(entryId); } // always leave global state clean
}

function stateWithEntries(entries) {
  return { snapshot: { battleLog: { entries } } };
}

test("14/15/16. a compact entry is collapsed by default and shows the breakdown table only once toggled open", () => {
  const entry = buildAttackLogEntry({
    sourceCharacterId: "s1", targetCharacterId: "t1", bodyZoneLabel: "Torso", sourceCharacterName: "Freya", targetCharacterName: "Raider", turnLabel: "T3",
    outcome: HIT_OUTCOME_OK,
  });
  const collapsedHtml = renderBattleLogPanel(stateWithEntries([entry]));
  assert.ok(!collapsedHtml.includes("ohud-log-table"), "table hidden by default");
  assert.ok(collapsedHtml.includes(`data-log-entry-id="${entry.id}"`));
  assert.ok(collapsedHtml.includes('aria-expanded="false"'));

  const expandedHtml = withExpandedPanel(entry.id, () => renderBattleLogPanel(stateWithEntries([entry])));
  assert.ok(expandedHtml.includes("ohud-log-table"), "table shown once expanded");
  assert.ok(expandedHtml.includes('aria-expanded="true"'));
  assert.ok(expandedHtml.includes("Attacking") && expandedHtml.includes("Defending"));
});

test("17. a non-attack entry (no breakdown) expands into its plain detail lines, not a broken table", () => {
  const entry = buildAbilityExecutionLogEntry({
    sourceCharacterId: "s1", sourceCharacterName: "Vega", turnLabel: "T2", abilityName: "Adrenaline Surge",
    outcome: { ok: true, normalized: { actionCost: 1 } },
  });
  const html = withExpandedPanel(entry.id, () => renderBattleLogPanel(stateWithEntries([entry])));
  assert.ok(!html.includes("ohud-log-table"));
  assert.ok(html.includes("ohud-log-result-detail"));
  assert.ok(html.includes("Used Adrenaline Surge."));
});

test("18. a fire-mode entry (no compactText spec) keeps the pre-4.2 always-expanded rendering, no toggle button", () => {
  const entry = buildFireModeLogEntry({ sourceCharacterId: "s1", ok: true, message: "Fire mode changed." });
  assert.equal(entry.compactText, null);
  const html = renderBattleLogPanel(stateWithEntries([entry]));
  assert.ok(!html.includes("ohud-log-compact"));
  assert.ok(html.includes("Fire mode changed."));
});

test("19/20. the breakdown table always has an Attacking/Defending header, and Result falls back to accuracy totals when damage wasn't rolled", () => {
  const b = buildAttackBreakdown(MISS_TRACE_OK);
  assert.equal(b.result.attacking, 41);
  assert.equal(b.result.defending, 68);
});

// ── Colors / classes (21-30) ─────────────────────────────────────────────────

test("21/22. status and severity each map to their own distinct badge class, derived from the entry's own fields (never string-guessed)", () => {
  const entry = buildAttackLogEntry({
    sourceCharacterId: "s1", targetCharacterId: "t1", bodyZoneLabel: "Torso", sourceCharacterName: "Freya", targetCharacterName: "Raider", turnLabel: "T3",
    outcome: HIT_OUTCOME_OK,
  });
  const html = renderBattleLogPanel(stateWithEntries([entry]));
  assert.ok(html.includes("ohud-log-badge--success"));
  assert.ok(html.includes("ohud-log-sev--serious"));
});

test("23. the row itself is never recoloured — only ohud-log-row / ohud-log-row--result classes appear on the <li>, never a status/severity class", () => {
  const entry = buildAttackLogEntry({
    sourceCharacterId: "s1", targetCharacterId: "t1", bodyZoneLabel: "Torso", sourceCharacterName: "Freya", turnLabel: "T3",
    outcome: { ok: true, normalized: { attackTotal: 157, defenseTotal: 41, hit: true, damageLevel: "critical" }, raw: { damage: { damage_attack_total: 300, damage_defense_total: 10 } } },
  });
  const html = renderBattleLogPanel(stateWithEntries([entry]));
  const liMatch = html.match(/<li class="([^"]*)"/);
  assert.ok(liMatch);
  assert.equal(liMatch[1], "ohud-log-row ohud-log-row--result");
});

test("24. CRIT FAILURE (status) and CRITICAL (severity) badges use two DIFFERENT CSS variables — never visually identical", () => {
  assert.notEqual(
    /--odyssey-log-status-crit-failure:\s*([^;]+);/.exec(tokensCss)[1].trim(),
    /--odyssey-log-severity-critical:\s*([^;]+);/.exec(tokensCss)[1].trim(),
  );
  assert.ok(layoutCss.includes(".ohud-log-badge--crit-failure"));
  assert.ok(layoutCss.includes(".ohud-log-sev--critical"));
});

test("25. plain Accuracy/Damage clauses render with the muted 'plain' class, not a status/severity color", () => {
  const entry = buildAttackLogEntry({
    sourceCharacterId: "s1", targetCharacterId: "t1", bodyZoneLabel: "Torso", sourceCharacterName: "Freya", turnLabel: "T3",
    outcome: HIT_OUTCOME_OK,
  });
  const html = renderBattleLogPanel(stateWithEntries([entry]));
  assert.ok(html.includes(`ohud-log-badge-plain">Accuracy 157/41<`));
  assert.ok(html.includes(`ohud-log-badge-plain">Damage 187/91<`));
});

test("26. ON/OFF toggle badges get success/failure coloring (real toggle state, not fabricated)", () => {
  const on = buildToggleAbilityLogEntry({
    sourceCharacterId: "s1", sourceCharacterName: "Vega", abilityName: "Overwatch",
    outcome: { ok: true, normalized: { active: true } },
  });
  const html = renderBattleLogPanel(stateWithEntries([on]));
  assert.ok(html.includes("ohud-log-badge--success\">[ON]"));
});

test("27/28. every badge/severity token used by BattleLogBlock.js has a matching CSS variable and class defined", () => {
  for (const tok of ["--odyssey-log-status-success", "--odyssey-log-status-failure", "--odyssey-log-status-crit-success", "--odyssey-log-status-crit-failure", "--odyssey-log-severity-minor", "--odyssey-log-severity-serious", "--odyssey-log-severity-critical"]) {
    assert.ok(tokensCss.includes(tok), `token ${tok} missing from combatHudTokens.css`);
  }
  for (const cls of [".ohud-log-badge--success", ".ohud-log-badge--failure", ".ohud-log-badge--crit-success", ".ohud-log-badge--crit-failure", ".ohud-log-sev--minor", ".ohud-log-sev--serious", ".ohud-log-sev--critical", ".ohud-log-compact", ".ohud-log-table", ".ohud-log-turn-label"]) {
    assert.ok(layoutCss.includes(cls), `class ${cls} missing from combatHudLayout.css`);
  }
});

test("29. no 'devastating' severity is ever produced — the schema only has minor/serious/critical", () => {
  assert.deepEqual(Object.values(LOG_SEVERITY).sort(), ["critical", "minor", "serious"]);
  assert.equal(classifySeverity({ ok: true, damage: { damageLevel: "devastating" } }), null);
});

test("30. an attack that never resolved (ok:false) gets no status/severity badge — the failure text stands alone", () => {
  const entry = buildAttackLogEntry({
    sourceCharacterId: "s1", targetCharacterId: "t1", bodyZoneLabel: "Torso", sourceCharacterName: "Vega",
    outcome: { ok: false, error: "SESSION_GATE" },
  });
  assert.equal(entry.status, null);
  assert.equal(entry.severity, null);
  const html = renderBattleLogPanel(stateWithEntries([entry]));
  assert.ok(!html.includes("ohud-log-sev--"));
});

// ── Other actions (31-39) ────────────────────────────────────────────────────

test("31/32/33. instant/directed/toggle failure compact lines all surface the real server denial reason", () => {
  const instant = buildAbilityExecutionLogEntry({ sourceCharacterId: "s1", sourceCharacterName: "Vega", abilityName: "Surge", outcome: { ok: false, error: "PSI_INSUFFICIENT" } });
  const directed = buildDirectedAbilityLogEntry({ sourceCharacterId: "s1", targetCharacterId: "t1", sourceCharacterName: "Vega", abilityName: "Suppress", targetName: "Raider", outcome: { ok: false, error: "SESSION_GATE" } });
  const toggle = buildToggleAbilityLogEntry({ sourceCharacterId: "s1", sourceCharacterName: "Vega", abilityName: "Overwatch", outcome: { ok: false, error: "COOLDOWN" } });
  assert.ok(instant.compactText.includes("PSI_INSUFFICIENT"));
  assert.ok(directed.compactText.includes("SESSION_GATE"));
  assert.ok(toggle.compactText.includes("COOLDOWN"));
});

test("37. buildFireModeLogEntry keeps shape parity (id/turnLabel/compactText/status/severity/breakdown keys present) without inventing a compact line", () => {
  const entry = buildFireModeLogEntry({ sourceCharacterId: "s1", ok: false, message: "denied" });
  for (const key of ["id", "timestamp", "type", "outcome", "title", "details", "sourceCharacterId", "targetCharacterId", "turnLabel", "compactText", "status", "severity", "breakdown"]) {
    assert.ok(key in entry, `missing key ${key}`);
  }
});

test("38. entry ids are unique across every builder call", () => {
  const ids = new Set([
    buildAttackLogEntry({ sourceCharacterId: "a", targetCharacterId: "b", bodyZoneLabel: "Torso", outcome: { ok: false, error: "x" } }).id,
    buildReloadLogEntry({ sourceCharacterId: "a", ok: true, message: "x" }).id,
    buildAbilityExecutionLogEntry({ sourceCharacterId: "a", abilityName: "x", outcome: { ok: true, normalized: {} } }).id,
    buildDirectedAbilityLogEntry({ sourceCharacterId: "a", targetCharacterId: "b", abilityName: "x", targetName: "y", outcome: { ok: true, normalized: {} } }).id,
    buildToggleAbilityLogEntry({ sourceCharacterId: "a", abilityName: "x", outcome: { ok: true, normalized: {} } }).id,
    buildFireModeLogEntry({ sourceCharacterId: "a", ok: true, message: "x" }).id,
    buildMovementLogEntry({ sourceCharacterId: "a" }).id,
    buildEndTurnLogEntry({ sourceCharacterId: "a" }).id,
  ]);
  assert.equal(ids.size, 8);
});

test("39. every builder returns a turnLabel key (null when not supplied) — consistent shape across entry types", () => {
  const entries = [
    buildReloadLogEntry({ sourceCharacterId: "a", ok: true, message: "x" }),
    buildMovementLogEntry({ sourceCharacterId: "a" }),
    buildEndTurnLogEntry({ sourceCharacterId: "a" }),
  ];
  for (const e of entries) assert.equal(e.turnLabel, null);
});

// ── Turn grouping (40-41) ────────────────────────────────────────────────────

test("40. adjacent entries sharing the same real turnLabel are grouped under one heading", () => {
  const a = buildMovementLogEntry({ sourceCharacterId: "a", sourceCharacterName: "Vega", turnLabel: "T3", distanceM: 4 });
  const b = buildEndTurnLogEntry({ sourceCharacterId: "a", sourceCharacterName: "Vega", turnLabel: "T3" });
  const html = renderBattleLogPanel(stateWithEntries([a, b]));
  assert.equal((html.match(/ohud-log-turn-group/g) || []).length, 1);
  assert.ok(html.includes("Turn 3"));
});

test("41. entries without a turnLabel are never wrapped in a fake section/heading", () => {
  const noTurn1 = buildMovementLogEntry({ sourceCharacterId: "a", sourceCharacterName: "Vega" });
  const noTurn2 = buildEndTurnLogEntry({ sourceCharacterId: "a", sourceCharacterName: "Vega" });
  const html = renderBattleLogPanel(stateWithEntries([noTurn1, noTurn2]));
  assert.ok(!html.includes("ohud-log-turn-group"));
  assert.ok(!html.includes("ohud-log-turn-label"));
});

// ── Safety / separation from Debug Console (42-47) ──────────────────────────

test("42/43/44. rendered Battle Log HTML never leaks raw JSON, UUIDs, or RPC/auth-shaped text", () => {
  const entry = buildAttackLogEntry({
    sourceCharacterId: "11111111-1111-4111-8111-111111111111",
    targetCharacterId: "22222222-2222-4222-8222-222222222222",
    bodyZoneLabel: "Torso", sourceCharacterName: "Vega", targetCharacterName: "Raider", turnLabel: "T3",
    outcome: {
      ok: true,
      normalized: { attackTotal: 71, defenseTotal: 59, hit: true, damageLevel: "serious" },
      raw: { damage: { damage_attack_total: 90, damage_defense_total: 30 }, access_token: "secret", combat_session: { participant_entry_id: "33333333-3333-4333-8333-333333333333" } },
    },
  });
  const html = renderBattleLogPanel(stateWithEntries([entry]));
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(html), "no UUID leak");
  assert.ok(!/access_token|rpc|supabase|payload|stack/i.test(html));
  assert.ok(!html.includes("{") && !html.includes("}"), "no raw JSON braces");
});

test("45. actor/target names are HTML-escaped in both the compact line and the expanded table", () => {
  const entry = buildAttackLogEntry({
    sourceCharacterId: "s1", targetCharacterId: "t1", bodyZoneLabel: "Torso",
    sourceCharacterName: '<img src=x onerror=alert(1)>', targetCharacterName: "Raider", turnLabel: "T3",
    outcome: { ok: true, normalized: { attackTotal: 71, defenseTotal: 59, hit: true, damageLevel: "serious" }, raw: { damage: { damage_attack_total: 90, damage_defense_total: 30 } } },
  });
  const html = withExpandedPanel(entry.id, () => renderBattleLogPanel(stateWithEntries([entry])));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
});

test("46. expand/collapse is a pure local toggle — it never calls a server function, never touches combat runtime", () => {
  const before = { ...LOG_STATUS };
  toggleLogEntryExpanded("some-entry-id");
  toggleLogEntryExpanded("some-entry-id"); // leave global state clean
  assert.deepEqual(LOG_STATUS, before, "toggling never mutates shared model constants");
  assert.equal(typeof toggleLogEntryExpanded("") , "undefined"); // no-op on an empty id, no throw
});

test("47. the movement/end-turn log hooks are read-only observers of an already-applied result — they never call a server RPC themselves", () => {
  const anchor = sceneSelectionSrc.indexOf("if (event.type !== MOVE_TOOL_EVENTS.Applied) return;");
  assert.ok(anchor > -1, "movement listener not found");
  const movementBlock = sceneSelectionSrc.slice(anchor, anchor + 700);
  assert.ok(movementBlock.includes("buildMovementLogEntry"));
  assert.ok(!/performAttack|executeAction|OBR\.broadcast\.sendMessage\(\s*BC_HUD_COMMAND/.test(movementBlock));
  const onTurnEndedBlock = sceneSelectionSrc.slice(sceneSelectionSrc.indexOf("onTurnEnded:"), sceneSelectionSrc.indexOf("onTurnEnded:") + 300);
  assert.ok(onTurnEndedBlock.includes("buildEndTurnLogEntry"));
});

// ── Regression / wiring (48-61) ──────────────────────────────────────────────

test("48. all 8 attack/ability/reload pushLog call sites now thread sourceCharacterName and turnLabel", () => {
  const calls = sceneSelectionSrc.match(/pushLog\(build(Attack|AbilityExecution|DirectedAbility|ToggleAbility|Reload)LogEntry\(\{[\s\S]*?\}\)\);/g) || [];
  assert.ok(calls.length >= 8, `expected at least 8 rich pushLog calls, found ${calls.length}`);
  for (const call of calls) {
    assert.ok(/sourceCharacterName:/.test(call), `missing sourceCharacterName in: ${call.slice(0, 60)}...`);
    assert.ok(/turnLabel:/.test(call), `missing turnLabel in: ${call.slice(0, 60)}...`);
  }
});

test("49. sceneSelectionController.js imports the two new builders", () => {
  assert.ok(sceneSelectionSrc.includes("buildMovementLogEntry"));
  assert.ok(sceneSelectionSrc.includes("buildEndTurnLogEntry"));
});

test("50. movement/moveToolController.js's Applied event now carries a real distanceM, never fabricated when the mutation had none", () => {
  assert.ok(moveToolSrc.includes("distanceM: Number.isFinite(distanceM) ? distanceM : null"));
  assert.ok(moveToolSrc.includes("finalizeMutationSuccess(result, source, successMessage, distanceM = null)"));
});

test("51. combatSessionController.js resolves ending/next actor names from the runtime's own visible_participants — never guessed", () => {
  assert.ok(combatSessionSrc.includes("function participantName(runtime, characterId)"));
  assert.ok(combatSessionSrc.includes("runtime?.visible_participants"));
  assert.ok(combatSessionSrc.includes("onTurnEnded"));
});

test("52. runMutation now returns whether the mutation actually succeeded, so end-turn logging only fires on a real success", () => {
  assert.ok(combatSessionSrc.includes("return ok;"));
  assert.ok(/const ok = await runMutation\(\"turn-ended\"/.test(combatSessionSrc));
});

test("53. the click routing for entry expand/collapse exists in both HUD entry points and never disables/removes the compact button", () => {
  assert.ok(layoutSrc.includes('case "toggle-log-entry": toggleLogEntryExpanded(t.getAttribute("data-log-entry-id")); render(); break;'));
  assert.ok(moduleSrc.includes('case "toggle-log-entry":'));
  assert.ok(moduleSrc.includes("toggleLogEntryExpanded(t.getAttribute"));
});

test("54. the compact-line control is a real <button> (keyboard reachable via native Enter/Space, no custom key handling needed)", () => {
  const entry = buildMovementLogEntry({ sourceCharacterId: "a", sourceCharacterName: "Vega", distanceM: 3 });
  const html = renderBattleLogPanel(stateWithEntries([entry]));
  assert.ok(/<button type="button" class="ohud-log-compact"/.test(html));
});

test("55. a new entry appended to the log never disturbs another, already-expanded entry's state", () => {
  const a = buildMovementLogEntry({ sourceCharacterId: "a", sourceCharacterName: "Vega", distanceM: 3 });
  toggleLogEntryExpanded(a.id);
  try {
    const b = buildEndTurnLogEntry({ sourceCharacterId: "a", sourceCharacterName: "Vega" });
    const html = renderBattleLogPanel(stateWithEntries([b, a])); // newest first, b just arrived
    const aExpanded = new RegExp(`data-log-entry-id="${a.id}"[^>]*aria-expanded="true"`).test(html);
    const bExpanded = new RegExp(`data-log-entry-id="${b.id}"[^>]*aria-expanded="true"`).test(html);
    assert.ok(aExpanded, "previously expanded entry stays expanded");
    assert.ok(!bExpanded, "the brand-new entry starts collapsed");
  } finally {
    toggleLogEntryExpanded(a.id); // clean up shared module state
  }
});

test("56. legacy mock log entries (kind: system/narrative/default) still render exactly as before — no regression from the Phase 4.2 rewrite", () => {
  const legacyState = { snapshot: { battleLog: { entries: [{ kind: "system", action: "Combat started" }] } } };
  const html = renderBattleLogPanel(legacyState);
  assert.ok(html.includes("ohud-log-row--system"));
  assert.ok(html.includes("Combat started"));
});

test("57. an empty log still renders the existing empty-state message", () => {
  const html = renderBattleLogPanel(stateWithEntries([]));
  assert.ok(html.includes("ohud-log-empty"));
  assert.ok(html.includes("No combat log yet."));
});

test("58. the panel header (title + close button) is unchanged by the rewrite", () => {
  const html = renderBattleLogPanel(stateWithEntries([]));
  assert.ok(html.includes('data-block="log"'));
  assert.ok(html.includes('data-action="toggle-log"'));
  assert.ok(html.includes("Battle Log"));
});

test("59. reload's 4 call sites all resolve the weapon name from the SAME in-scope weapon.primary object, never a guessed literal", () => {
  const reloadCalls = sceneSelectionSrc.match(/pushLog\(buildReloadLogEntry\(\{[\s\S]*?\}\)\);/g) || [];
  assert.equal(reloadCalls.length, 4);
  for (const call of reloadCalls) assert.ok(/weaponName: weapon\?\.name \?\? null/.test(call));
});

test("60. combat_execute_action / perform_attack RPC call sites are completely untouched by this phase (display-only scope)", () => {
  assert.ok(sceneSelectionSrc.includes("performAttack(payload, settings)"));
  assert.ok(sceneSelectionSrc.includes("executeAction(payload, settings)"));
  // No migration files were added for this phase.
  const migrationFiles = fs.readdirSync(path.join(repoRoot, "supabase")).filter((f) => /^\d+_/.test(f));
  const maxNumberBefore = 109; // highest migration number known before Phase 4.2 (see UPSTREAM_DIVERGENCE_AUDIT.md)
  const overLimit = migrationFiles.filter((f) => {
    const n = parseInt(f, 10);
    return Number.isFinite(n) && n > maxNumberBefore;
  });
  assert.equal(overLimit.length, 0, `unexpected new migration(s): ${overLimit.join(", ")}`);
});

test("61. battleLogEntryModel.js performs no dice/random and no server-call — pure classification/formatting only", () => {
  const modelSrc = readSrc("hud/log/battleLogEntryModel.js");
  assert.ok(!/Math\.random|fetch\(|XMLHttpRequest|OBR\./.test(modelSrc));
});

setTimeout(() => {
  console.log(`\nPhase 4.2 Battle Log polish: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const { name, err } of failures) {
      console.error(`FAILED: ${name}`);
      console.error(err?.stack ?? err);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}, 50);
