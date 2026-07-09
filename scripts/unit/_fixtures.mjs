function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export const characters = {
  testAttacker: {
    id: "char-attacker",
    character_key: "test_attacker",
    name: "Test Attacker",
    owner_player_id: "player-1",
    bucket: "player",
  },
  testTarget: {
    id: "char-target",
    character_key: "test_target",
    name: "Test Target",
    owner_player_id: "player-2",
    bucket: "player",
  },
  testGmControlledNpc: {
    id: "char-npc",
    character_key: "test_npc",
    name: "GM NPC",
    owner_player_id: "",
    bucket: "npc_active",
  },
};

export const skillDefs = {
  ethericCoating: {
    id: "skill-etheric-coating",
    code: "etheric_coating",
    name: "Etheric Coating",
    category: "psionic",
  },
  ethericStrike: {
    id: "skill-etheric-strike",
    code: "etheric_strike",
    name: "Etheric Strike",
    category: "psionic",
  },
};

export const abilities = {
  ethericCoating: {
    id: "ability-etheric-coating",
    code: "etheric_coating",
    name: "Etheric Coating",
    source_type: "psionic",
    linked_skill_id: "skill-etheric-coating",
    activation_type: "manual",
    target_type: "self",
    effect_mode: "grant_special",
    ability_kind: "defense",
  },
  ethericStrike: {
    id: "ability-etheric-strike",
    code: "etheric_strike",
    name: "Etheric Strike",
    source_type: "psionic",
    linked_skill_id: "skill-etheric-strike",
    activation_type: "manual",
    target_type: "character",
    effect_mode: "attack",
    ability_kind: "attack",
  },
  plasmaEdge: {
    id: "ability-plasma-edge",
    code: "plasma_edge",
    name: "Plasma Edge",
    source_type: "weapon",
    linked_skill_id: null,
    activation_type: "manual",
    target_type: "self",
    effect_mode: "activate_weapon_feature",
    ability_kind: "support",
  },
  laserShot: {
    id: "ability-laser-shot",
    code: "laser_shot",
    name: "Laser Shot",
    source_type: "weapon",
    linked_skill_id: null,
    activation_type: "manual",
    target_type: "body_part",
    effect_mode: "attack",
    ability_kind: "attack",
  },
  neuralOverload: {
    id: "ability-neural-overload",
    code: "neural_overload",
    name: "Neural Overload",
    source_type: "implant",
    linked_skill_id: null,
    activation_type: "manual",
    target_type: "character",
    effect_mode: "apply_effect",
    ability_kind: "support",
  },
  firstAid: {
    id: "ability-first-aid",
    code: "first_aid",
    name: "First Aid",
    source_type: "item",
    linked_skill_id: null,
    activation_type: "manual",
    target_type: "character",
    effect_mode: "heal",
    ability_kind: "support",
  },
  shieldPulse: {
    id: "ability-shield-pulse",
    code: "shield_pulse",
    name: "Shield Pulse",
    source_type: "equipment",
    linked_skill_id: null,
    activation_type: "manual",
    target_type: "self",
    effect_mode: "grant_special",
    ability_kind: "defense",
  },
  battleFocus: {
    id: "ability-battle-focus",
    code: "battle_focus",
    name: "Battle Focus",
    source_type: "perk",
    linked_skill_id: null,
    activation_type: "manual",
    target_type: "self",
    effect_mode: "buff",
    ability_kind: "support",
  },
  passiveFocus: {
    id: "ability-passive-focus",
    code: "passive_focus",
    name: "Passive Focus",
    source_type: "perk",
    linked_skill_id: null,
    activation_type: "passive",
    target_type: "self",
    effect_mode: "buff",
    ability_kind: "passive",
  },
  aimedShot: {
    id: "ability-aimed-shot",
    code: "aimed_shot",
    name: "Aimed Shot",
    source_type: "weapon",
    linked_skill_id: null,
    activation_type: "manual",
    target_type: "body_part",
    effect_mode: "attack",
    ability_kind: "attack_technique",
  },
};

export const perks = {
  quickDraw: {
    id: "perk-quick-draw",
    code: "quick_draw",
    name: "Quick Draw",
  },
  battleFocus: {
    id: "perk-battle-focus",
    code: "battle_focus",
    name: "Battle Focus",
  },
};

export const weaponModels = {
  katana: {
    id: "weapon-model-katana",
    code: "katana",
    name: "Katana",
    attack_type: "melee",
  },
  pistol: {
    id: "weapon-model-pistol",
    code: "frontier_pistol",
    name: "Frontier Pistol",
    attack_type: "ranged",
  },
};

export const characterWeapons = {
  katanaEquipped: {
    id: "weapon-char-katana-1",
    weapon_model_id: "weapon-model-katana",
    name: "Katana #1",
    is_equipped: true,
  },
  katanaSpare: {
    id: "weapon-char-katana-2",
    weapon_model_id: "weapon-model-katana",
    name: "Katana #2",
    is_equipped: true,
  },
  katanaHolstered: {
    id: "weapon-char-katana-3",
    weapon_model_id: "weapon-model-katana",
    name: "Katana #3",
    is_equipped: false,
  },
  pistolLoaded: {
    id: "weapon-char-pistol-1",
    weapon_model_id: "weapon-model-pistol",
    name: "Frontier Pistol",
    is_equipped: true,
    active_magazine_id: "mag-1",
  },
};

export const items = {
  grenade: {
    id: "item-grenade",
    item_def_id: "item-def-grenade",
    name: "Grenade",
    is_equipped: false,
    type: "item",
  },
  medkit: {
    id: "item-medkit",
    item_def_id: "item-def-medkit",
    name: "Medkit",
    is_equipped: false,
    type: "item",
  },
  shieldEmitter: {
    id: "item-shield-emitter",
    item_def_id: "item-def-shield-emitter",
    name: "Shield Emitter",
    is_equipped: true,
    type: "equipment",
  },
  prototypeEyeInstalled: {
    id: "equip-eye-installed",
    item_def_id: "equip-model-eye",
    equipment_model_id: "equip-model-eye",
    name: "Prototype Eye Implant",
    custom_name: "Prototype Eye Implant",
    is_equipped: true,
    equipped_body_part_id: "bp-head",
    item_type: "implant",
    type: "equipment",
  },
  prototypeEyeLoose: {
    id: "equip-eye-loose",
    item_def_id: "equip-model-eye",
    equipment_model_id: "equip-model-eye",
    name: "Prototype Eye Implant",
    custom_name: "Prototype Eye Implant",
    is_equipped: false,
    equipped_body_part_id: null,
    item_type: "implant",
    type: "equipment",
  },
};

export const abilityGrants = {
  battleFocusPerk: {
    source_type: "perk",
    source_def_id: "perk-battle-focus",
    ability_def_id: "ability-battle-focus",
  },
  passiveFocusPerk: {
    source_type: "perk",
    source_def_id: "perk-quick-draw",
    ability_def_id: "ability-passive-focus",
  },
  plasmaEdgeWeapon: {
    source_type: "weapon",
    source_def_id: "weapon-model-katana",
    ability_def_id: "ability-plasma-edge",
    requires_selected_source: true,
    grant_mode: "activated",
  },
  laserShotWeapon: {
    source_type: "weapon",
    source_def_id: "weapon-model-pistol",
    ability_def_id: "ability-laser-shot",
    requires_selected_source: true,
    default_current_charges: 1,
    default_max_charges: 1,
    reload_item_code: "small_energy_cell",
    reload_item_cost: 1,
    grant_mode: "activated",
  },
  firstAidItem: {
    source_type: "item",
    source_def_id: "item-def-medkit",
    ability_def_id: "ability-first-aid",
  },
  shieldPulseEquipment: {
    source_type: "equipment",
    source_def_id: "item-def-shield-emitter",
    ability_def_id: "ability-shield-pulse",
    requires_equipped: true,
  },
  neuralOverloadImplant: {
    source_type: "implant",
    source_def_id: "equip-model-eye",
    ability_def_id: "ability-neural-overload",
    requires_installed: true,
    grant_mode: "activated",
  },
};

export const encounters = {
  activeEncounter: {
    id: "enc-1",
    status: "active",
    round: 1,
  },
  inactiveEncounter: {
    id: "enc-2",
    status: "ended",
    round: 1,
  },
};

export const initiativeEntries = {
  currentTurn: {
    character_id: "char-attacker",
    initiative: 18,
    move_current: 10,
    move_max: 10,
    is_current_turn: true,
  },
  notCurrentTurn: {
    character_id: "char-target",
    initiative: 12,
    move_current: 10,
    move_max: 10,
    is_current_turn: false,
  },
};

export const bodyParts = {
  healthy: [
    { key: "head", current_hp: 3, max_hp: 3, minor: 0, serious: 0, conditions: [] },
    { key: "r_arm", current_hp: 4, max_hp: 4, minor: 0, serious: 0, conditions: [] },
    { key: "torso", current_hp: 5, max_hp: 5, minor: 0, serious: 0, conditions: [] },
  ],
};

export const walls = {
  emptyWallMap: [],
  singleVerticalWall: [
    { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, type: "wall" },
  ],
  cornerWalls: [
    { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, type: "wall" },
    { from: { x: 0, y: 0 }, to: { x: 0, y: 1 }, type: "wall" },
  ],
  doorOpenWallSet: [
    { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, type: "door", state: "open" },
  ],
  doorClosedWallSet: [
    { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, type: "door", state: "closed" },
  ],
};

export const magazines = {
  activePistolMagazine: { id: "mag-1", current: 6, max: 6, ammo_code: "standard_small" },
  reservePistolMagazine: { id: "mag-2", current: 6, max: 6, ammo_code: "standard_small" },
  emptyPistolMagazine: { id: "mag-3", current: 0, max: 6, ammo_code: "standard_small" },
};

export function fixtureSet() {
  return clone({
    characters,
    skillDefs,
    abilities,
    perks,
    weaponModels,
    characterWeapons,
    items,
    abilityGrants,
    encounters,
    initiativeEntries,
    bodyParts,
    walls,
    magazines,
  });
}
