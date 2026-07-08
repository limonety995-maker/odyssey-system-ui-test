// Combat HUD — Directed Target Ability Execution (Phase 4.1B.2) payload
// adapter (PURE). Builds the public.combat_execute_action(jsonb) payload for
// kind:"ability" — the SAME RPC Phase 4.1B.1 already wired up for
// instant/self abilities. See
// docs/PHASE_4_1B_2_DIRECTED_TARGET_ABILITIES_AUDIT.md §5-7: use_ability
// already reads intent.target_character_id (or the top-level equivalent)
// and resolves it verbatim when the ability's own target_type isn't 'self'
// — no server change needed for this ability class either.
//
// No target_body_part_id/weapon_id/ammo/magazine/fire_mode field is ever
// built — this ability class needs a target CHARACTER only, never a body
// zone/part, and has no weapon concept at all.

import { describeError, ERROR_MESSAGES } from "../../screens/resolveAttack/resolveAttackService.js";

export { describeError, ERROR_MESSAGES };

/**
 * @param {{
 *   sourceCharacterId: string,
 *   abilityId: string,
 *   targetCharacterId: string,
 *   encounterId: string,
 *   expectedEncounterVersion?: (number|null),
 *   actorPlayerId?: (string|null),
 *   actorIsGm?: boolean,
 * }} input
 * @returns {object} the exact combat_execute_action(jsonb) payload
 */
export function buildDirectedAbilityExecutionPayload(input = {}) {
  const payload = {
    kind: "ability",
    character_id: String(input.sourceCharacterId ?? "").trim(),
    encounter_id: String(input.encounterId ?? "").trim(),
    actor_player_id: String(input.actorPlayerId ?? "").trim(),
    actor_is_gm: !!input.actorIsGm,
    intent: {
      character_ability_id: String(input.abilityId ?? "").trim(),
      target_character_id: String(input.targetCharacterId ?? "").trim(),
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
 * plus the resolved targetCharacterId. Never throws.
 */
export function normalizeDirectedAbilityResult(raw) {
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
    targetCharacterId: result.target_character_id ?? null,
    resourceSpent: resource.spent ?? resource.cost ?? resource.amount_spent ?? null,
    resourceRemaining: resource.remaining ?? resource.current_value ?? null,
    narrativeOnly: result.result?.narrative_only === true,
    encounterStateVersion: r.encounter_state_version ?? null,
    characterStateVersion: r.character_state_version ?? null,
  };
}

/**
 * Run the directed-ability execution RPC. deps: { executeAction(payload) ->
 * Promise<rawResult> }. Returns { ok, payload, raw, normalized, error, code }.
 * Network errors are caught, never thrown to the caller.
 */
export async function resolveDirectedAbilityExecution(ctx, deps) {
  const payload = buildDirectedAbilityExecutionPayload(ctx);

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
      normalized: raw ? normalizeDirectedAbilityResult(raw) : null,
      code,
      error: raw?.message || describeError(code, "The ability could not be executed."),
    };
  }

  return { ok: true, payload, raw, normalized: normalizeDirectedAbilityResult(raw), code: null, error: null };
}
