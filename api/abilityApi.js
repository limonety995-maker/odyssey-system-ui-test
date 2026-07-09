import { ABILITY_RPC_NAMES } from "../constants/rpcNames.js";
import { callSupabaseRpc } from "../bridge/supabaseBridge.js";

export function getCharacterAbilities(characterId, settings) {
  return callSupabaseRpc(
    ABILITY_RPC_NAMES.getCharacterAbilities,
    { p_character_id: characterId },
    settings,
  );
}

export function syncCharacterResourcePools(characterId, settings) {
  return callSupabaseRpc(
    ABILITY_RPC_NAMES.syncCharacterResourcePools,
    { p_character_id: characterId },
    settings,
  );
}

export function useAbility(payload, settings) {
  return callSupabaseRpc(
    ABILITY_RPC_NAMES.useAbility,
    { p_payload: payload },
    settings,
  );
}

export function reloadCharacterAbility(payload, settings) {
  return callSupabaseRpc(
    ABILITY_RPC_NAMES.reloadCharacterAbility,
    { p_payload: payload },
    settings,
  );
}

export function advanceCharacterAbilityStates(characterId, settings) {
  return callSupabaseRpc(
    ABILITY_RPC_NAMES.advanceCharacterAbilityStates,
    { p_character_id: characterId },
    settings,
  );
}
