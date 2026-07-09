import { WEAPON_RPC_NAMES } from "../constants/rpcNames.js";
import { callSupabaseRpc } from "../bridge/supabaseBridge.js";

export function getCharacterArmory(characterId, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.getCharacterArmory,
    { p_character_id: characterId },
    settings,
  );
}

export function switchWeaponProfile(characterWeaponId, profileId, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.switchWeaponProfile,
    {
      p_character_weapon_id: characterWeaponId,
      p_profile_id: profileId,
    },
    settings,
  );
}

export function switchWeaponFireMode(characterId, weaponId, fireModeId, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.switchWeaponFireMode,
    {
      p_character_id: characterId,
      p_weapon_id: weaponId,
      p_fire_mode_id: fireModeId,
    },
    settings,
  );
}

// Insert / replace the loaded magazine in a weapon profile.
// payload: { character_weapon_id, profile_id, character_magazine_id }.
// Note: backend may raise SQL exceptions (not { ok:false }) for invalid
// weapon/profile/magazine — callers should catch and surface a readable error.
export function loadWeaponProfileMagazine(payload, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.loadWeaponProfileMagazine,
    { p_payload: payload },
    settings,
  );
}

export function unloadWeaponMagazine(payload, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.unloadWeaponMagazine,
    { p_payload: payload },
    settings,
  );
}

export function loadWeaponInternalRounds(payload, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.loadWeaponInternalRounds,
    { p_payload: payload },
    settings,
  );
}

export function unloadWeaponInternalRounds(payload, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.unloadWeaponInternalRounds,
    { p_payload: payload },
    settings,
  );
}

export function activateWeaponFeature(payload, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.activateWeaponFeature,
    { p_payload: payload },
    settings,
  );
}

export function deactivateWeaponFeature(featureStateId, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.deactivateWeaponFeature,
    { p_state_id: featureStateId },
    settings,
  );
}

export function getCharacterWeaponFeatures(characterWeaponId, settings) {
  return callSupabaseRpc(
    WEAPON_RPC_NAMES.getCharacterWeaponFeatures,
    { p_character_weapon_id: characterWeaponId },
    settings,
  );
}
