// Combat HUD — Instant / Self Ability Execution (Phase 4.1B.1) payload
// adapter (PURE). Builds the public.combat_execute_action(jsonb) payload for
// kind:"ability" — see docs/PHASE_4_1B_1_INSTANT_SELF_ABILITIES_AUDIT.md §5/6/7
// for why this RPC (not perform_attack, not a new one) is the correct,
// already-server-authoritative path for this ability class.
//
// No target_character_id/target_body_part_id/weapon_id/ammo/magazine/
// fire_mode field is ever built — this ability class has none of those
// concepts; use_ability resolves the target to the acting character itself
// when none is supplied (confirmed server-side). No `context` wrapper is
// sent either: the audited combat_execute_action body never reads a
// `context`/`room_id`/`scene_id`/`token_id` field, so one is not fabricated
// just to match the phase spec's own "conceptual" payload shape.

import { describeError, ERROR_MESSAGES } from "../../screens/resolveAttack/resolveAttackService.js";

export { describeError, ERROR_MESSAGES };

/**
 * @param {{
 *   sourceCharacterId: string,
 *   abilityId: string,
 *   encounterId: string,
 *   expectedEncounterVersion?: (number|null),
 *   actorPlayerId?: (string|null),
 *   actorIsGm?: boolean,
 * }} input
 * @returns {object} the exact combat_execute_action(jsonb) payload
 */
export function buildInstantAbilityExecutionPayload(input = {}) {
  const payload = {
    kind: "ability",
    character_id: String(input.sourceCharacterId ?? "").trim(),
    encounter_id: String(input.encounterId ?? "").trim(),
    actor_player_id: String(input.actorPlayerId ?? "").trim(),
    actor_is_gm: !!input.actorIsGm,
    intent: {
      character_ability_id: String(input.abilityId ?? "").trim(),
    },
  };
  // Phase 3E.0 optimistic-concurrency check — only ever set when the caller
  // supplies a real number (active session); never fabricated. Mirrors
  // buildAttackPayload's identical convention.
  if (input.expectedEncounterVersion !== null
      && input.expectedEncounterVersion !== undefined
      && Number.isFinite(Number(input.expectedEncounterVersion))) {
    payload.expected_encounter_version = Number(input.expectedEncounterVersion);
  }
  return payload;
}

/* ----- safe getters for tolerant result rendering ----- */
function asObject(v) {
  return v && typeof v === "object" ? v : {};
}

/**
 * Normalize combat_execute_action's response into a flat, render-friendly
 * summary. Every field may be null — the UI shows a neutral fallback for
 * nulls. Tolerant of a missing/malformed nested `result` (use_ability's own
 * response) — never throws.
 */
export function normalizeInstantAbilityResult(raw) {
  const r = asObject(raw);
  const spent = asObject(r.spent);
  const result = asObject(r.result);
  const ability = asObject(result.ability);
  const resource = asObject(result.resource);
  return {
    ok: r.ok !== false,
    actionCost: spent.action_cost ?? null,
    moveCost: spent.move_cost ?? null,
    usedReaction: spent.used_reaction ?? null,
    abilityCode: ability.code ?? null,
    abilityName: ability.name ?? null,
    effectMode: ability.effect_mode ?? null,
    resourceSpent: resource.spent ?? resource.cost ?? resource.amount_spent ?? null,
    resourceRemaining: resource.remaining ?? resource.current_value ?? null,
    narrativeOnly: result.result?.narrative_only === true,
    encounterStateVersion: r.encounter_state_version ?? null,
    characterStateVersion: r.character_state_version ?? null,
  };
}

/**
 * Run the instant-ability execution RPC. deps: { executeAction(payload) ->
 * Promise<rawResult> }. Returns { ok, payload, raw, normalized, error, code }.
 * Network errors are caught, never thrown to the caller.
 */
export async function resolveInstantAbilityExecution(ctx, deps) {
  const payload = buildInstantAbilityExecutionPayload(ctx);

  let raw;
  try {
    raw = await deps.executeAction(payload);
  } catch (error) {
    return {
      ok: false,
      payload,
      raw: error?.details ?? null,
      normalized: null,
      code: error?.code ?? null,
      error: error?.message || "Network or RPC error.",
    };
  }

  if (!raw || raw.ok === false) {
    const code = raw?.error ?? null;
    return {
      ok: false,
      payload,
      raw: raw ?? null,
      normalized: raw ? normalizeInstantAbilityResult(raw) : null,
      code,
      error: raw?.message || describeError(code, "The ability could not be executed."),
    };
  }

  return { ok: true, payload, raw, normalized: normalizeInstantAbilityResult(raw), code: null, error: null };
}
