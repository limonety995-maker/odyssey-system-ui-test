// HUD Abilities — Phase 4.0: API adapter for quick-actions runtime + quickbar
// layout persistence (thin, no state).
//
// Wraps the migration-92 RPC suite through the shared supabase bridge, matching
// the exact convention of api/combatApi.js (callSupabaseRpc + centralized RPC
// names). No new transport, no raw client handling here.

import { ABILITY_RPC_NAMES } from "../../constants/rpcNames.js";
import { callSupabaseRpc } from "../../bridge/supabaseBridge.js";

// The pure payload builder lives in the policy module (unit-testable without the
// OBR-coupled bridge). Re-exported here so API callers have one import surface.
export { buildSlotPayload } from "./quickbarLayoutPolicy.js";

/**
 * Fetch the full quick-actions runtime (library + persisted quickbar layout).
 * @returns {Promise<object>} raw odyssey_get_character_quick_actions_runtime response
 */
export function fetchQuickActionsRuntime(characterId, settings) {
  return callSupabaseRpc(
    ABILITY_RPC_NAMES.getQuickActionsRuntime,
    { p_character_id: characterId ?? "" },
    settings,
  );
}

/**
 * Fetch only the persisted quickbar layout (utility; the runtime already
 * embeds it, but this is handy for a lightweight post-save re-read).
 * @returns {Promise<object>} raw layout jsonb
 */
export function fetchQuickbarLayout(characterId, settings) {
  return callSupabaseRpc(
    ABILITY_RPC_NAMES.getQuickbarLayout,
    { p_character_id: characterId ?? "" },
    settings,
  );
}

/**
 * Save a quickbar layout with optimistic version control.
 * @param {string} characterId
 * @param {number|null} expectedVersion current layout version; null skips the check
 * @param {object[]} slots [{ slotIndex, characterActionId|null }]
 * @param {object} settings
 * @returns {Promise<object>} { ok, error, layout, version }
 */
export function saveQuickbarLayout(characterId, expectedVersion, slots, settings) {
  return callSupabaseRpc(
    ABILITY_RPC_NAMES.saveQuickbarLayout,
    {
      p_character_id: characterId ?? "",
      p_expected_version: Number.isFinite(Number(expectedVersion)) ? Number(expectedVersion) : null,
      p_slots: Array.isArray(slots) ? slots : [],
    },
    settings,
  );
}
