import { CHARACTER_PLACEMENT_RPC_NAMES } from "../constants/rpcNames.js";
import { callSupabaseRpc } from "../bridge/supabaseBridge.js";

// Returns a compact catalog of Player / NPC_Template / NPC_Active characters for the GM UI.
// payload: { campaign_id, room_id, scene_id, search?, buckets?, include_active_npcs?, limit?, offset? }
export function getCharacterSpawnCatalog(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.getCharacterSpawnCatalog,
    { p_payload: payload ?? {} },
    settings,
  );
}

// Central read RPC — returns all data needed to render a character without extra requests.
// payload: { character_id, sections?: string[] }
// sections: "summary" | "combat" | "attributes" | "skills" | "perks" |
//           "equipment" | "inventory" | "armory" | "abilities" | "effects" | "token_link"
// combat section returns body_parts (minor/serious/critical/disabled/destroyed/armor_value/armor_critical),
// armor_summary, is_alive, is_conscious, state_version, status_summary, combat_flags.
export function getCharacterRuntimeBundle(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.getCharacterRuntimeBundle,
    { p_payload: payload ?? {} },
    settings,
  );
}

// Returns authoritative token→character bindings for the current OBR room/scene.
// payload: { room_id, scene_id, campaign_id?, token_id? }
export function getSceneTokenLinks(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.getSceneTokenLinks,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function assignCharacterOwner(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.assignCharacterOwner,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function clearCharacterOwner(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.clearCharacterOwner,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function getCharacterQuickbar(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.getCharacterQuickbar,
    { p_payload: payload ?? {} },
    settings,
  );
}

export function saveCharacterQuickbar(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.saveCharacterQuickbar,
    { p_payload: payload ?? {} },
    settings,
  );
}

// GM action: bind a Player or spawn an NPC_Active from template into a token.
// payload: { source_character_id, token_id, token_name, token_layer, campaign_id,
//            room_id, scene_id, instance_name?, replace_existing_token_link?, allow_rebind_active_npc? }
export function loadCharacterToToken(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.loadCharacterToToken,
    { p_payload: payload ?? {} },
    settings,
  );
}

// GM action: deactivate the token→character link (does NOT delete the character).
// payload: { room_id, scene_id, token_id }
export function unbindTokenCharacter(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.unbindTokenCharacter,
    { p_payload: payload ?? {} },
    settings,
  );
}

// GM action: remove NPC_Active from the scene.
// mode "archive" → safely hides NPC, preserves history
// mode "hard_delete" → permanently removes NPC and all related logs/links/initiative
// payload: { character_id, mode: "archive" | "hard_delete" }
export function purgeActiveNpcs(payload, settings) {
  return callSupabaseRpc(
    CHARACTER_PLACEMENT_RPC_NAMES.purgeActiveNpcs,
    { p_payload: payload ?? {} },
    settings,
  );
}
