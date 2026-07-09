// Combat HUD — Toggle / Stance / Maintained Ability Execution (Phase 4.1B.3)
// payload adapter (PURE). Builds the public.combat_execute_action(jsonb)
// payload for kind:"ability" — the SAME RPC every other ability class already
// uses; see docs/PHASE_4_1B_3_TOGGLE_STANCE_MAINTAINED_AUDIT.md §6/§8 for why
// combat_execute_action itself now routes a toggle ability to the new
// toggle_character_ability RPC server-side, with no client-visible payload
// difference at all.
//
// No target_character_id/target_body_part_id/weapon_id/ammo/magazine/
// fire_mode field is ever built — this ability class has none of those
// concepts by design (spec's own "Do not use" list). No `toggle`/
// `desired_state` field is invented either: the server decides ON vs OFF
// itself, by checking for an existing active effect — the client never tells
// it which direction to go.

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
export function buildToggleAbilityExecutionPayload(input = {}) {
  const payload = {
    kind: "ability",
    include_runtime: false,
    character_id: String(input.sourceCharacterId ?? "").trim(),
    encounter_id: String(input.encounterId ?? "").trim(),
    actor_player_id: String(input.actorPlayerId ?? "").trim(),
    actor_is_gm: !!input.actorIsGm,
    intent: {
      character_ability_id: String(input.abilityId ?? "").trim(),
    },
  };
  // Phase 3E.0 optimistic-concurrency check — only ever set when the caller
  // supplies a real number (active session); never fabricated.
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
 * summary — same shape as instantAbilityPayload's normalizeInstantAbilityResult,
 * plus the server-authoritative `active` (true = just turned ON, false = just
 * turned OFF). Never fabricates a value the server didn't return; `active` is
 * `null` only if the server response itself is malformed/missing it.
 */
export function normalizeToggleAbilityResult(raw) {
  const r = asObject(raw);
  const spent = asObject(r.spent);
  const result = asObject(r.result);
  const ability = asObject(result.ability);
  const resource = asObject(result.resource);
  return {
    ok: r.ok !== false,
    active: typeof result.active === "boolean" ? result.active : null,
    actionCost: spent.action_cost ?? null,
    moveCost: spent.move_cost ?? null,
    usedReaction: spent.used_reaction ?? null,
    abilityCode: ability.code ?? null,
    abilityName: ability.name ?? null,
    resourceSpent: resource.spent ?? resource.cost ?? resource.amount_spent ?? null,
    resourceRemaining: resource.remaining ?? resource.current_value ?? null,
    encounterStateVersion: r.encounter_state_version ?? null,
    characterStateVersion: r.character_state_version ?? null,
  };
}

/**
 * Run the toggle-ability execution RPC. deps: { executeAction(payload) ->
 * Promise<rawResult> }. Returns { ok, payload, raw, normalized, error, code }.
 * Network errors are caught, never thrown to the caller.
 */
export async function resolveToggleAbilityExecution(ctx, deps) {
  const payload = buildToggleAbilityExecutionPayload(ctx);

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
      normalized: raw ? normalizeToggleAbilityResult(raw) : null,
      code,
      error: raw?.message || describeError(code, "The ability could not be toggled."),
    };
  }

  return { ok: true, payload, raw, normalized: normalizeToggleAbilityResult(raw), code: null, error: null };
}
