export const CHARACTER_RPC_NAMES = Object.freeze({
  getCharacterRuleSheet: "get_character_rule_sheet",
  initializeCharacterRuleDefaults: "initialize_character_rule_defaults",
  initializeCharacterCombatDefaults: "initialize_character_combat_defaults",
  getCharacterSpawnCatalog: "get_character_spawn_catalog",
  getRoomTokenLinks: "get_room_token_links",
  deactivateTokenLink: "deactivate_token_link",
  loadCharacterToToken: "load_character_to_token",
});

export const CHECK_RPC_NAMES = Object.freeze({
  rollCharacteristic: "roll_characteristic",
  rollSkill: "roll_skill",
  rollDice: "roll_dice",
});

export const ABILITY_RPC_NAMES = Object.freeze({
  getCharacterAbilities: "get_character_abilities",
  syncCharacterResourcePools: "odyssey_sync_character_resource_pools",
  useAbility: "use_ability",
  advanceCharacterAbilityStates: "advance_character_ability_states",
});

export const FEATURE_RPC_NAMES = Object.freeze({
  reloadFeatureResource: "reload_feature_resource",
});

export const WEAPON_RPC_NAMES = Object.freeze({
  getCharacterArmory: "get_character_armory",
  switchWeaponProfile: "switch_weapon_profile",
  switchWeaponFireMode: "switch_weapon_fire_mode",
  loadWeaponProfileMagazine: "load_weapon_profile_magazine",
  activateWeaponFeature: "activate_weapon_feature",
  deactivateWeaponFeature: "deactivate_weapon_feature",
  getCharacterWeaponFeatures: "get_character_weapon_features",
});

export const COMBAT_RPC_NAMES = Object.freeze({
  performAttack: "perform_attack",
});

export const GM_RPC_NAMES = Object.freeze({
  healCharacter: "gm_heal_character",
  repairCharacterArmor: "gm_repair_character_armor",
  updateCharacterAttribute: "gm_update_character_attribute",
});

export const EFFECT_RPC_NAMES = Object.freeze({
  getCharacterEffectSummary: "get_character_effect_summary",
  getEffectiveCharacterStats: "get_effective_character_stats",
  addCharacterEffect: "add_character_effect",
  removeCharacterEffect: "remove_character_effect",
  advanceCharacterEffects: "advance_character_effects",
});

export const EQUIPMENT_RPC_NAMES = Object.freeze({
  getCharacterArmorSummary: "get_character_armor_summary",
  getCharacterEquipment: "get_character_equipment",
  recomputeCharacterArmor: "recompute_character_armor",
  createCharacterEquipmentItem: "create_character_equipment_item",
  equipCharacterEquipmentItem: "equip_character_equipment_item",
  unequipCharacterEquipmentItem: "unequip_character_equipment_item",
  updateCharacterEquipmentItem: "update_character_equipment_item",
});

export const INVENTORY_RPC_NAMES = Object.freeze({
  getCharacterInventory: "get_character_inventory",
  addCharacterItem: "add_character_item",
  removeCharacterItemQuantity: "remove_character_item_quantity",
  getCharacterItemQuantity: "get_character_item_quantity",
  addCharacterAmmoStock: "add_character_ammo_stock",
  removeCharacterAmmoStock: "remove_character_ammo_stock",
  loadRoundsToMagazine: "load_rounds_to_magazine",
  unloadRoundsFromMagazine: "unload_rounds_from_magazine",
  useCharacterItem: "use_character_item",
});

export const CHARACTER_PLACEMENT_RPC_NAMES = Object.freeze({
  getCharacterSpawnCatalog: "get_character_spawn_catalog",
  getCharacterRuntimeBundle: "get_character_runtime_bundle",
  getSceneTokenLinks: "get_scene_token_links",
  loadCharacterToToken: "load_character_to_token",
  unbindTokenCharacter: "unbind_token_character",
  purgeActiveNpcs: "purge_active_npcs",
});

export const CREATOR_RPC_NAMES = Object.freeze({
  getCreatorReferenceData: "get_creator_reference_data",
  listWeapons: "creator_list_weapons",
  getWeapon: "creator_get_weapon",
  upsertWeapon: "creator_upsert_weapon",
  deleteWeapon: "creator_delete_weapon",
  listItemDefs: "creator_list_item_defs",
  getItemDef: "creator_get_item_def",
  upsertItemDef: "creator_upsert_item_def",
  deleteItemDef: "creator_delete_item_def",
  listCalibers: "creator_list_calibers",
  getCaliber: "creator_get_caliber",
  upsertCaliber: "creator_upsert_caliber",
  deleteCaliber: "creator_delete_caliber",
  listAmmoTypes: "creator_list_ammo_types",
  getAmmoType: "creator_get_ammo_type",
  upsertAmmoType: "creator_upsert_ammo_type",
  deleteAmmoType: "creator_delete_ammo_type",
  listMagazineDefs: "creator_list_magazine_defs",
  getMagazineDef: "creator_get_magazine_def",
  upsertMagazineDef: "creator_upsert_magazine_def",
  deleteMagazineDef: "creator_delete_magazine_def",
  listSkills: "creator_list_skills",
  getSkill: "creator_get_skill",
  upsertSkill: "creator_upsert_skill",
  deleteSkill: "creator_delete_skill",
  listEffects: "creator_list_effects",
  getEffect: "creator_get_effect",
  upsertEffect: "creator_upsert_effect",
  deleteEffect: "creator_delete_effect",
  listAbilities: "creator_list_abilities",
  getAbility: "creator_get_ability",
  upsertAbility: "creator_upsert_ability",
  deleteAbility: "creator_delete_ability",
  listEquipmentModels: "creator_list_equipment_models",
  getEquipmentModel: "creator_get_equipment_model",
  upsertEquipmentModel: "creator_upsert_equipment_model",
  deleteEquipmentModel: "creator_delete_equipment_model",
});
