import { COMBAT_RPC_NAMES } from "../constants/rpcNames.js";
import { callSupabaseRpc } from "../bridge/supabaseBridge.js";

export function getCombatLogEntries(
  {
    roomId = "",
    encounterId = "",
    actor_player_id = "",
    actor_is_gm = false,
    limit = 50,
  } = {},
  settings,
) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.getCombatLog,
    {
      p_payload: {
        room_id: roomId,
        encounter_id: encounterId,
        actor_player_id,
        actor_is_gm,
        limit,
      },
    },
    settings,
  );
}

export function getCombatLogRows(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.getCombatLog,
    { p_payload: payload ?? {} },
    settings,
  );
}
