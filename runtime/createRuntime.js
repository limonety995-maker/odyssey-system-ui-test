import * as metadataKeys from "../constants/metadataKeys.js";
import {
  CHARACTER_RPC_NAMES,
  CHECK_RPC_NAMES,
  ABILITY_RPC_NAMES,
  FEATURE_RPC_NAMES,
  WEAPON_RPC_NAMES,
  COMBAT_RPC_NAMES,
  GM_RPC_NAMES,
  EFFECT_RPC_NAMES,
  PERK_RPC_NAMES,
  EQUIPMENT_RPC_NAMES,
  INVENTORY_RPC_NAMES,
  CHARACTER_PLACEMENT_RPC_NAMES,
  CREATOR_RPC_NAMES,
} from "../constants/rpcNames.js";
import * as obrBridge from "../bridge/obrBridge.js";
import * as settingsBridge from "../bridge/settingsBridge.js";
import * as supabaseBridge from "../bridge/supabaseBridge.js";
import * as tokenBridge from "../bridge/tokenBridge.js";
import * as abilityApi from "../api/abilityApi.js";
import * as characterApi from "../api/characterApi.js";
import * as checksApi from "../api/checksApi.js";
import * as featureApi from "../api/featureApi.js";
import * as weaponApi from "../api/weaponApi.js";
import * as combatApi from "../api/combatApi.js";
import * as gmApi from "../api/gmApi.js";
import * as effectsApi from "../api/effectsApi.js";
import * as perkApi from "../api/perkApi.js";
import * as equipmentApi from "../api/equipmentApi.js";
import * as inventoryApi from "../api/inventoryApi.js";
import * as logApi from "../api/logApi.js";
import * as placementApi from "../api/characterPlacementApi.js";
import * as creatorApi from "../api/creatorApi.js";

export function createOdysseyRuntime() {
  return {
    constants: {
      ...metadataKeys,
      CHARACTER_RPC_NAMES,
      CHECK_RPC_NAMES,
      ABILITY_RPC_NAMES,
      FEATURE_RPC_NAMES,
      WEAPON_RPC_NAMES,
      COMBAT_RPC_NAMES,
      GM_RPC_NAMES,
      EFFECT_RPC_NAMES,
      PERK_RPC_NAMES,
      EQUIPMENT_RPC_NAMES,
      INVENTORY_RPC_NAMES,
      CHARACTER_PLACEMENT_RPC_NAMES,
      CREATOR_RPC_NAMES,
    },
    bridges: {
      obr: obrBridge,
      settings: settingsBridge,
      supabase: supabaseBridge,
      token: tokenBridge,
    },
    api: {
      ability: abilityApi,
      character: characterApi,
      checks: checksApi,
      feature: featureApi,
      weapon: weaponApi,
      combat: combatApi,
      gm: gmApi,
      effects: effectsApi,
      perk: perkApi,
      equipment: equipmentApi,
      inventory: inventoryApi,
      log: logApi,
      placement: placementApi,
      creator: creatorApi,
    },
  };
}
