import { COMBAT_RPC_NAMES } from "../constants/rpcNames.js";
import { callSupabaseRpc } from "../bridge/supabaseBridge.js";

export function performAttack(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.performAttack,
    { p_payload: payload },
    settings,
  );
}

export function startEncounter(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.startEncounter,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function addParticipant(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.addParticipant,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function removeParticipant(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.removeParticipant,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function reorderInitiative(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.reorderInitiative,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function endTurn(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.endTurn,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function skipTurn(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.skipTurn,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function forceNextTurn(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.forceNextTurn,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function endEncounter(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.endEncounter,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function getActiveRuntime(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.getActiveRuntime,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function markCharacterDead(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.markCharacterDead,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function convertActionToMove(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.convertActionToMove,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function spendMove(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.spendMove,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function executeAction(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.executeAction,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function getCombatLog(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.getCombatLog,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function grantReactionAction(payload, settings) {
  return callSupabaseRpc(
    COMBAT_RPC_NAMES.grantReactionAction,
    { p_payload: payload ?? {} },
    settings,
  );
}
