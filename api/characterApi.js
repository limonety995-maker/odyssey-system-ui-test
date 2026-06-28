import {
  CHARACTER_RPC_NAMES,
  CHARACTER_PLACEMENT_RPC_NAMES,
} from "../constants/rpcNames.js";
import { callSupabaseRpc, fetchSupabaseRows } from "../bridge/supabaseBridge.js";

export function getCharacterRuleSheet(characterId, settings) {
  return callSupabaseRpc(
    CHARACTER_RPC_NAMES.getCharacterRuleSheet,
    { p_character_id: characterId },
    settings,
  );
}

export function initializeCharacterRuleDefaults(characterId, settings) {
  return callSupabaseRpc(
    CHARACTER_RPC_NAMES.initializeCharacterRuleDefaults,
    { p_character_id: characterId },
    settings,
  );
}

export function initializeCharacterCombatDefaults(characterId, settings) {
  return callSupabaseRpc(
    CHARACTER_RPC_NAMES.initializeCharacterCombatDefaults,
    { p_character_id: characterId },
    settings,
  );
}

export function listCharacters(settings, { includeDeleted = false } = {}) {
  const query = [
    "select=id,character_key,character_bucket,source_template_key,enabled,owner_player_id,owner_player_name,is_deleted",
    "order=character_bucket.asc,character_key.asc",
  ];
  if (!includeDeleted) {
    query.push("is_deleted=eq.false");
  }
  return fetchSupabaseRows(
    `odyssey_characters?${query.join("&")}`,
    settings,
    "Unable to load character catalog.",
  );
}

export function getRoomTokenLinks(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_RPC_NAMES.getRoomTokenLinks,
    payload ?? {},
    settings,
  );
}

export function deactivateTokenLink(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_RPC_NAMES.deactivateTokenLink,
    payload ?? {},
    settings,
  );
}

// Deprecated compatibility wrapper. New placement flows should import
// api/characterPlacementApi.js instead of characterApi.js.
export function loadCharacterToToken(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.loadCharacterToToken,
    payload ?? {},
    settings,
  );
}
