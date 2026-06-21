import { CREATOR_RPC_NAMES } from "../constants/rpcNames.js";
import { callSupabaseRpc } from "../bridge/supabaseBridge.js";

export function getCreatorReferenceData(settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getCreatorReferenceData,
    {},
    settings,
  );
}

export function listWeapons({ search = null } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listWeapons,
    {
      p_search: search || null,
    },
    settings,
  );
}

export function getWeapon(weaponModelId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getWeapon,
    { p_weapon_model_id: weaponModelId },
    settings,
  );
}

export function upsertWeapon(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertWeapon,
    { p_payload: payload },
    settings,
  );
}

export function deleteWeapon(weaponModelId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteWeapon,
    { p_weapon_model_id: weaponModelId },
    settings,
  );
}

export function listItemDefs({ search = null } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listItemDefs,
    {
      p_search: search || null,
    },
    settings,
  );
}

export function getItemDef(itemDefId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getItemDef,
    { p_item_def_id: itemDefId },
    settings,
  );
}

export function upsertItemDef(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertItemDef,
    { p_payload: payload },
    settings,
  );
}

export function deleteItemDef(itemDefId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteItemDef,
    { p_item_def_id: itemDefId },
    settings,
  );
}

export function listCalibers({ search = null } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listCalibers,
    {
      p_search: search || null,
    },
    settings,
  );
}

export function getCaliber(caliberId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getCaliber,
    { p_caliber_id: caliberId },
    settings,
  );
}

export function upsertCaliber(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertCaliber,
    { p_payload: payload },
    settings,
  );
}

export function deleteCaliber(caliberId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteCaliber,
    { p_caliber_id: caliberId },
    settings,
  );
}

export function listAmmoTypes({ search = null } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listAmmoTypes,
    {
      p_search: search || null,
    },
    settings,
  );
}

export function getAmmoType(ammoTypeId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getAmmoType,
    { p_ammo_type_id: ammoTypeId },
    settings,
  );
}

export function upsertAmmoType(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertAmmoType,
    { p_payload: payload },
    settings,
  );
}

export function deleteAmmoType(ammoTypeId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteAmmoType,
    { p_ammo_type_id: ammoTypeId },
    settings,
  );
}

export function listMagazineDefs({ search = null } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listMagazineDefs,
    {
      p_search: search || null,
    },
    settings,
  );
}

export function getMagazineDef(magazineDefId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getMagazineDef,
    { p_magazine_def_id: magazineDefId },
    settings,
  );
}

export function upsertMagazineDef(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertMagazineDef,
    { p_payload: payload },
    settings,
  );
}

export function deleteMagazineDef(magazineDefId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteMagazineDef,
    { p_magazine_def_id: magazineDefId },
    settings,
  );
}

export function listSkills({ search = null, categories = [] } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listSkills,
    {
      p_search: search || null,
      p_categories: Array.isArray(categories) ? categories : [],
    },
    settings,
  );
}

export function getSkill(skillId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getSkill,
    { p_skill_def_id: skillId },
    settings,
  );
}

export function upsertSkill(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertSkill,
    { p_payload: payload },
    settings,
  );
}

export function deleteSkill(skillId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteSkill,
    { p_skill_def_id: skillId },
    settings,
  );
}

export function listEffects({ search = null, categories = [] } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listEffects,
    {
      p_search: search || null,
      p_categories: Array.isArray(categories) ? categories : [],
    },
    settings,
  );
}

export function getEffect(effectId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getEffect,
    { p_effect_def_id: effectId },
    settings,
  );
}

export function upsertEffect(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertEffect,
    { p_payload: payload },
    settings,
  );
}

export function deleteEffect(effectId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteEffect,
    { p_effect_def_id: effectId },
    settings,
  );
}

export function listAbilities({ search = null } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listAbilities,
    {
      p_search: search || null,
    },
    settings,
  );
}

export function getAbility(abilityId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getAbility,
    { p_ability_def_id: abilityId },
    settings,
  );
}

export function upsertAbility(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertAbility,
    { p_payload: payload },
    settings,
  );
}

export function deleteAbility(abilityId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteAbility,
    { p_ability_def_id: abilityId },
    settings,
  );
}

export function listEquipmentModels({ search = null, itemTypes = [] } = {}, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.listEquipmentModels,
    {
      p_search: search || null,
      p_item_types: Array.isArray(itemTypes) ? itemTypes : [],
    },
    settings,
  );
}

export function getEquipmentModel(equipmentModelId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getEquipmentModel,
    { p_equipment_model_id: equipmentModelId },
    settings,
  );
}

export function upsertEquipmentModel(payload, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.upsertEquipmentModel,
    { p_payload: payload },
    settings,
  );
}

export function deleteEquipmentModel(equipmentModelId, settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.deleteEquipmentModel,
    { p_equipment_model_id: equipmentModelId },
    settings,
  );
}
