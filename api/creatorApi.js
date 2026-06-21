import { CREATOR_RPC_NAMES } from "../constants/rpcNames.js";
import { callSupabaseRpc } from "../bridge/supabaseBridge.js";

export function getCreatorReferenceData(settings) {
  return callSupabaseRpc(
    CREATOR_RPC_NAMES.getCreatorReferenceData,
    {},
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
