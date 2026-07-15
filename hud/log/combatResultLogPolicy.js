// Combat HUD — real combat-result log normalizer (PURE).
//
// This is a LOCAL, runtime-only log for the current HUD session — no Supabase
// persistence, no shared/realtime distribution (that's a future, separate
// "shared Battle Log" phase). It only ever records what the SERVER actually
// returned; it never recomputes or invents a roll/damage/hit value.
//
// Every builder returns the same compact, safe shape:
//   { timestamp, type, outcome, title, details, sourceCharacterId, targetCharacterId }
// `details` is a plain array of short strings — never private target data
// (inventory/skills/PSI/hidden statuses).
//
// Attack entries source their numbers from hud/combat/attackResolutionTrace.js
// — the SAME shared normalization the Debug Console's roll-resolution event
// uses, so the game log and the debug trace can never disagree about one
// server result.

import { buildAttackResolutionTrace, buildCombatLogLines } from "../combat/attackResolutionTrace.js";
import { classifyAttackStatus, classifySeverity, buildAttackCompactText, buildAttackBreakdown } from "./battleLogEntryModel.js";

export const LOG_TYPE = Object.freeze({
  attack: "attack",
  reload: "reload",
  fireMode: "fire-mode",
  abilityExecute: "ability-execute",
  directedAbility: "directed-ability",
  toggleAbility: "toggle-ability",
  movement: "movement",
  endTurn: "end-turn",
});

export const LOG_OUTCOME = Object.freeze({
  success: "success",
  failure: "failure",
});

/** Cap for the in-memory log list — oldest entries fall off past this. */
export const COMBAT_LOG_MAX_ENTRIES = 100;

// Phase 4.2: a stable per-entry id, needed so BattleLogBlock.js can track
// which entries are currently expanded across re-renders (expand/collapse is
// local UI state, keyed by this id — see ephemeral.expandedLogEntryIds in
// sceneSelectionController.js). Monotonic within one HUD session; never
// persisted, never sent to the server.
let logEntrySeq = 0;
function nextLogEntryId(prefix) {
  logEntrySeq += 1;
  return `${prefix}-${logEntrySeq}`;
}

/**
 * Push `entry` onto `list` (newest first) and cap at COMBAT_LOG_MAX_ENTRIES.
 * Pure — returns a NEW array, never mutates `list`.
 */
export function appendCombatLogEntry(list, entry) {
  const next = [entry, ...(Array.isArray(list) ? list : [])];
  return next.length > COMBAT_LOG_MAX_ENTRIES ? next.slice(0, COMBAT_LOG_MAX_ENTRIES) : next;
}

/**
 * Build a Basic Weapon Attack log entry from the resolveAttackService-shaped
 * outcome (`{ ok, normalized, error, code }`) — never fabricates a roll/damage
 * field the server didn't actually return.
 *
 * Phase 4.2: also returns the Battle Log's compact one-line summary
 * (`compactText`), a machine-readable `status`/`severity`, and the expanded
 * Accuracy/Damage/Result breakdown (`breakdown`) — all derived from the SAME
 * verbatim trace `details` already used, via hud/log/battleLogEntryModel.js.
 * `sourceCharacterName`/`targetCharacterName`/`turnLabel` are optional and
 * default to omitted — existing callers that don't pass them still work,
 * they just get a name-less/turn-less compact line.
 *
 * @param {{
 *   sourceCharacterId:(string|null), targetCharacterId:(string|null),
 *   sourceCharacterName?:(string|null), targetCharacterName?:(string|null),
 *   turnLabel?:(string|null), actionLabel?:string,
 *   bodyZoneLabel:(string|null), outcome:{ok:boolean, normalized:object|null, error:(string|null)},
 * }} input
 */
export function buildAttackLogEntry({ sourceCharacterId, targetCharacterId, sourceCharacterName = null, targetCharacterName = null, turnLabel = null, actionLabel = "attacks", bodyZoneLabel, outcome }) {
  const ok = !!outcome?.ok;
  const trace = buildAttackResolutionTrace(outcome);
  const details = ok
    ? buildCombatLogLines(trace, bodyZoneLabel)
    : [String(outcome?.error || "Attack denied.")];
  const compactText = ok
    ? buildAttackCompactText({ actorName: sourceCharacterName, actionLabel, targetName: targetCharacterName, bodyZoneLabel, turnLabel, trace })
    : `${turnLabel ? `[${turnLabel}] ` : ""}${sourceCharacterName || "Someone"} cannot ${actionLabel.replace(/s$/, "")} — ${String(outcome?.error || "denied")}`;
  return {
    id: nextLogEntryId("attack"),
    timestamp: Date.now(),
    type: LOG_TYPE.attack,
    outcome: ok ? LOG_OUTCOME.success : LOG_OUTCOME.failure,
    title: ok ? "Attack" : "Attack failed",
    details,
    sourceCharacterId: sourceCharacterId ?? null,
    targetCharacterId: targetCharacterId ?? null,
    turnLabel: turnLabel ?? null,
    compactText,
    status: ok ? classifyAttackStatus(trace) : null,
    severity: ok ? classifySeverity(trace) : null,
    breakdown: ok ? buildAttackBreakdown(trace) : null,
  };
}

/**
 * @param {{
 *   sourceCharacterId:(string|null), sourceCharacterName?:(string|null),
 *   turnLabel?:(string|null), weaponName?:(string|null),
 *   ok:boolean, message:(string|null),
 * }} input
 */
export function buildReloadLogEntry({ sourceCharacterId, sourceCharacterName = null, turnLabel = null, weaponName = null, ok, message }) {
  const actor = sourceCharacterName || "Someone";
  const weapon = weaponName ? ` ${weaponName}` : "";
  const compactText = ok
    ? `${turnLabel ? `[${turnLabel}] ` : ""}${actor} reloads${weapon}.`
    : `${turnLabel ? `[${turnLabel}] ` : ""}${actor} fails to reload${weapon} — ${String(message || "denied")}`;
  return {
    id: nextLogEntryId("reload"),
    timestamp: Date.now(),
    type: LOG_TYPE.reload,
    outcome: ok ? LOG_OUTCOME.success : LOG_OUTCOME.failure,
    title: ok ? "Reload" : "Reload failed",
    details: [String(message || (ok ? "Reloaded." : "Reload denied."))],
    sourceCharacterId: sourceCharacterId ?? null,
    targetCharacterId: null,
    turnLabel: turnLabel ?? null,
    compactText,
    status: null,
    severity: null,
    breakdown: null,
  };
}

/**
 * Build a Phase 4.1B.1 instant/self ability-execution log entry from the
 * instantAbilityPayload-shaped outcome (`{ ok, normalized, error, code }`) —
 * only ever shows fields the server actually returned (never a fabricated
 * cost/effect). `abilityName` is passed in separately: the client's own
 * mapped quick-action list already has it (the same source the Skills Block
 * tile itself renders), so it never needs to be re-derived from the
 * server's own trimmed `ability.name` echo, which may be null on failure.
 *
 * @param {{
 *   sourceCharacterId:(string|null), sourceCharacterName?:(string|null),
 *   turnLabel?:(string|null), abilityName:(string|null),
 *   outcome:{ok:boolean, normalized:object|null, error:(string|null)},
 * }} input
 */
export function buildAbilityExecutionLogEntry({ sourceCharacterId, sourceCharacterName = null, turnLabel = null, abilityName, outcome }) {
  const ok = !!outcome?.ok;
  const name = String(abilityName || outcome?.normalized?.abilityName || "ability");
  const actor = sourceCharacterName || "Someone";
  const prefix = turnLabel ? `[${turnLabel}] ` : "";
  let details;
  let compactText;
  if (ok) {
    const n = outcome?.normalized ?? {};
    const costParts = [];
    if (Number(n.actionCost) > 0) costParts.push("MAIN spent");
    if (Number(n.resourceSpent) > 0) costParts.push(`Resource spent: ${n.resourceSpent}`);
    const effectPart = n.narrativeOnly ? "No mechanical effect." : null;
    details = [
      `Used ${name}.`,
      costParts.length ? costParts.join(", ") + "." : "No cost recorded.",
      ...(effectPart ? [effectPart] : []),
    ];
    compactText = `${prefix}${actor} uses ${name}${n.narrativeOnly ? "" : " — active"}.`;
  } else {
    details = [String(outcome?.error || `${name} denied.`)];
    compactText = `${prefix}${actor} cannot use ${name} — ${String(outcome?.error || "denied")}`;
  }
  return {
    id: nextLogEntryId("ability"),
    timestamp: Date.now(),
    type: LOG_TYPE.abilityExecute,
    outcome: ok ? LOG_OUTCOME.success : LOG_OUTCOME.failure,
    title: ok ? "Ability used" : "Ability failed",
    details,
    sourceCharacterId: sourceCharacterId ?? null,
    targetCharacterId: null,
    turnLabel: turnLabel ?? null,
    compactText,
    status: null,
    severity: null,
    breakdown: null,
  };
}

/**
 * Build a Phase 4.1B.2 directed-target-ability log entry — same honesty
 * rules as buildAbilityExecutionLogEntry (Phase 4.1B.1), plus the target's
 * display name in the summary line. `targetName` is passed in separately
 * (the client's own resolved target state already has it — the same source
 * Combat Control's own target display already renders).
 *
 * @param {{
 *   sourceCharacterId:(string|null), targetCharacterId:(string|null),
 *   sourceCharacterName?:(string|null), turnLabel?:(string|null),
 *   abilityName:(string|null), targetName:(string|null),
 *   outcome:{ok:boolean, normalized:object|null, error:(string|null)},
 * }} input
 */
export function buildDirectedAbilityLogEntry({ sourceCharacterId, targetCharacterId, sourceCharacterName = null, turnLabel = null, abilityName, targetName, outcome }) {
  const ok = !!outcome?.ok;
  const name = String(abilityName || outcome?.normalized?.abilityName || "ability");
  const target = String(targetName || "the target");
  const actor = sourceCharacterName || "Someone";
  const prefix = turnLabel ? `[${turnLabel}] ` : "";
  let details;
  let compactText;
  if (ok) {
    const n = outcome?.normalized ?? {};
    const costParts = [];
    if (Number(n.actionCost) > 0) costParts.push("MAIN spent");
    if (Number(n.resourceSpent) > 0) costParts.push(`Resource spent: ${n.resourceSpent}`);
    const effectPart = n.narrativeOnly ? "No mechanical effect." : null;
    details = [
      `Used ${name} on ${target}.`,
      costParts.length ? costParts.join(", ") + "." : "No cost recorded.",
      ...(effectPart ? [effectPart] : []),
    ];
    compactText = `${prefix}${actor} uses ${name} on ${target} — [SUCCESS]`;
  } else {
    details = [String(outcome?.error || `${name} denied.`)];
    compactText = `${prefix}${actor} cannot use ${name} on ${target} — ${String(outcome?.error || "denied")}`;
  }
  return {
    id: nextLogEntryId("directed-ability"),
    timestamp: Date.now(),
    type: LOG_TYPE.directedAbility,
    outcome: ok ? LOG_OUTCOME.success : LOG_OUTCOME.failure,
    title: ok ? "Ability used" : "Ability failed",
    details,
    sourceCharacterId: sourceCharacterId ?? null,
    targetCharacterId: targetCharacterId ?? null,
    turnLabel: turnLabel ?? null,
    compactText,
    status: null,
    severity: null,
    breakdown: null,
  };
}

/**
 * Build a Phase 4.1B.3 toggle-ability log entry from the
 * toggleAbilityPayload-shaped outcome (`{ ok, normalized, error, code }`) —
 * same honesty rules as buildAbilityExecutionLogEntry. Picks "activated"/
 * "deactivated" from the server's own `active` flag when present; falls back
 * to a neutral "toggled" line only if the server response is missing it
 * (never guessed from any other field).
 *
 * @param {{
 *   sourceCharacterId:(string|null), sourceCharacterName?:(string|null),
 *   turnLabel?:(string|null), abilityName:(string|null),
 *   outcome:{ok:boolean, normalized:object|null, error:(string|null)},
 * }} input
 */
export function buildToggleAbilityLogEntry({ sourceCharacterId, sourceCharacterName = null, turnLabel = null, abilityName, outcome }) {
  const ok = !!outcome?.ok;
  const name = String(abilityName || outcome?.normalized?.abilityName || "ability");
  const actor = sourceCharacterName || "Someone";
  const prefix = turnLabel ? `[${turnLabel}] ` : "";
  let details;
  let compactText;
  if (ok) {
    const n = outcome?.normalized ?? {};
    const verb = n.active === true ? "activated" : n.active === false ? "deactivated" : "toggled";
    const costParts = [];
    if (Number(n.actionCost) > 0) costParts.push("MAIN spent");
    if (Number(n.resourceSpent) > 0) costParts.push(`Resource spent: ${n.resourceSpent}`);
    details = [
      `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${name}.`,
      costParts.length ? costParts.join(", ") + "." : "No cost recorded.",
    ];
    const stateBadge = n.active === true ? "[ON]" : n.active === false ? "[OFF]" : "";
    compactText = `${prefix}${actor} ${verb} ${name}${stateBadge ? ` — ${stateBadge}` : ""}`;
  } else {
    details = [String(outcome?.error || `${name} denied.`)];
    compactText = `${prefix}${actor} cannot use ${name} — ${String(outcome?.error || "denied")}`;
  }
  return {
    id: nextLogEntryId("toggle"),
    timestamp: Date.now(),
    type: LOG_TYPE.toggleAbility,
    outcome: ok ? LOG_OUTCOME.success : LOG_OUTCOME.failure,
    title: ok ? "Ability toggled" : "Ability failed",
    details,
    sourceCharacterId: sourceCharacterId ?? null,
    targetCharacterId: null,
    turnLabel: turnLabel ?? null,
    compactText,
    status: null,
    severity: null,
    breakdown: null,
  };
}

/**
 * @param {{ sourceCharacterId:(string|null), ok:boolean, message:(string|null) }} input
 */
export function buildFireModeLogEntry({ sourceCharacterId, ok, message }) {
  return {
    id: nextLogEntryId("fire-mode"),
    timestamp: Date.now(),
    type: LOG_TYPE.fireMode,
    outcome: ok ? LOG_OUTCOME.success : LOG_OUTCOME.failure,
    title: ok ? "Fire mode changed" : "Fire mode change failed",
    details: [String(message || (ok ? "Fire mode changed." : "Fire mode change denied."))],
    sourceCharacterId: sourceCharacterId ?? null,
    targetCharacterId: null,
    turnLabel: null,
    compactText: null,
    status: null,
    severity: null,
    breakdown: null,
  };
}

/**
 * Phase 4.2 — Tactical Move log entry. `distanceM` is passed in only when the
 * caller actually has it (movement/moveToolController.js's Applied event now
 * carries it); never fabricated. No before/after MOVE value is shown — the
 * listener that builds this entry (sceneSelectionController.js) only
 * observes the Applied event, which does not carry a pre-move snapshot, so
 * showing a "before" number here would be invented, not observed.
 *
 * @param {{ sourceCharacterId:(string|null), sourceCharacterName?:(string|null), turnLabel?:(string|null), distanceM?:(number|null) }} input
 */
export function buildMovementLogEntry({ sourceCharacterId, sourceCharacterName = null, turnLabel = null, distanceM = null }) {
  const actor = sourceCharacterName || "Someone";
  const prefix = turnLabel ? `[${turnLabel}] ` : "";
  const hasDistance = typeof distanceM === "number" && Number.isFinite(distanceM) && distanceM > 0;
  const compactText = hasDistance ? `${prefix}${actor} moves ${distanceM}m` : `${prefix}${actor} moves`;
  return {
    id: nextLogEntryId("movement"),
    timestamp: Date.now(),
    type: LOG_TYPE.movement,
    outcome: LOG_OUTCOME.success,
    title: "Movement",
    details: [compactText.replace(prefix, "")],
    sourceCharacterId: sourceCharacterId ?? null,
    targetCharacterId: null,
    turnLabel: turnLabel ?? null,
    compactText,
    status: null,
    severity: null,
    breakdown: null,
  };
}

/**
 * Phase 4.2 — End Turn log entry. `nextActorName` is included only when the
 * caller actually resolved it from the fresh runtime; omitted otherwise.
 *
 * @param {{ sourceCharacterId:(string|null), sourceCharacterName?:(string|null), turnLabel?:(string|null), nextActorName?:(string|null) }} input
 */
export function buildEndTurnLogEntry({ sourceCharacterId, sourceCharacterName = null, turnLabel = null, nextActorName = null }) {
  const actor = sourceCharacterName || "Someone";
  const prefix = turnLabel ? `[${turnLabel}] ` : "";
  const compactText = `${prefix}${actor} ends turn`;
  const details = [`${actor} ended their turn.`];
  if (nextActorName) details.push(`Next: ${nextActorName}.`);
  return {
    id: nextLogEntryId("end-turn"),
    timestamp: Date.now(),
    type: LOG_TYPE.endTurn,
    outcome: LOG_OUTCOME.success,
    title: "End turn",
    details,
    sourceCharacterId: sourceCharacterId ?? null,
    targetCharacterId: null,
    turnLabel: turnLabel ?? null,
    compactText,
    status: null,
    severity: null,
    breakdown: null,
  };
}
