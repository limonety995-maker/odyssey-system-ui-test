// Combat HUD — Phase 3A.1: runtime bundle mapper (PURE, no OBR/Supabase/DOM).
//
// Maps the raw `get_character_runtime_bundle` Supabase RPC response to the
// CombatHudSnapshot shape that the existing block renderers consume. Every field
// access is defensive (optional chaining / null-coalescing) so a missing section
// produces an honest empty/null value and never throws.
//
// ─── Expected bundle top-level shape ────────────────────────────────────────
//
//  bundle.character   { id, display_name, character_key,
//                       owner_player_id, owner_player_name }
//
//  bundle.state       { is_alive, is_conscious, status_summary,
//                       combat_flags?: { main_action_spent, move_action_spent },
//                       shield_current?, shield_max?,
//                       psi_current?,   psi_max? }
//
//  bundle.combat      { body_parts: [{ zone_id, minor, serious, critical,
//                                      disabled, destroyed,
//                                      armor_value, armor_critical }],
//                       armor_summary: [...],
//                       combat_flags:  { main_action_spent, move_action_spent },
//                       shield_current?, shield_max?,
//                       psi_current?,   psi_max?,
//                       is_alive, is_conscious, state_version, status_summary }
//
//  bundle.armory      { equipped_weapon: {
//                         id, weapon_name, weapon_type_key,
//                         fire_modes: string[],
//                         current_fire_mode,
//                         uses_magazine, uses_consumable, requires_ammo,
//                         loaded_magazine: { id, ammo_type_key, ammo_type_name,
//                                           current_rounds, max_rounds, caliber },
//                         reserve_magazines: [...same shape],
//                         can_reload, disabled_reason
//                       } | null }
//
//  bundle.abilities   { quick_actions: [{
//                         id, ability_name, ability_type, source_type,
//                         icon_key, color_key, action_cost,
//                         cooldown_remaining_turns, is_toggled,
//                         disabled_reason, tooltip,
//                         targeting_mode?, allows_multiple_targets?,
//                         uses_point?, radius?,
//                         weapon_requirements?: string[]
//                       }],
//                       quickbar_slots: [{ slot_index, ability_id }] }
//
//  bundle.effects     [{ id, effect_name, polarity,
//                        remaining_turns, description }]
//
// IMPORTANT: These field names are inferred from DB/RPC conventions and the
// characterPlacementApi.js section list. Verify against the actual RPC
// implementation before assuming they are correct. The mapper degrades
// gracefully if any field is absent.
// ────────────────────────────────────────────────────────────────────────────

import {
  ZONE_STATES,
  MODIFIER_POLARITY,
  SKILL_TYPES,
  SKILL_SOURCES,
  COLOR_SEMANTICS,
  TARGETING_MODES,
  ACTION_COSTS,
  createInactiveCombatSession,
} from "../models/combatHudContracts.js";

// ─── Tiny coerce helpers ────────────────────────────────────────────────────

function str(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v, fallback = false) {
  return v === null || v === undefined ? fallback : Boolean(v);
}

// ─── Zone state ─────────────────────────────────────────────────────────────
// body_part columns: minor, serious, critical, disabled, destroyed.
// Map to the internal ZONE_STATES enum (worsening severity).

function zoneStateFromBodyPart(bp) {
  if (bool(bp?.destroyed) || bool(bp?.disabled)) return ZONE_STATES.disabled;
  if (num(bp?.critical) > 0) return ZONE_STATES.critical;
  if (num(bp?.serious) > 0) return ZONE_STATES.serious;
  if (num(bp?.minor) > 0) return ZONE_STATES.wounded;
  return ZONE_STATES.healthy;
}

const ZONE_LABELS = Object.freeze({
  head: "Head", torso: "Torso",
  l_arm: "Left Arm", r_arm: "Right Arm",
  l_leg: "Left Leg", r_leg: "Right Leg",
});

function mapZones(bodyParts) {
  if (!Array.isArray(bodyParts) || bodyParts.length === 0) return [];
  return bodyParts.map((bp) => {
    const id = str(bp?.zone_id) ?? "unknown";
    return {
      id,
      label: ZONE_LABELS[id] ?? id,
      state: zoneStateFromBodyPart(bp),
      canBeTargeted: !bool(bp?.disabled) && !bool(bp?.destroyed),
    };
  });
}

// ─── Effects / statuses ──────────────────────────────────────────────────────

function normalizePolarity(p) {
  const v = String(p ?? "").toLowerCase();
  if (v === "positive") return MODIFIER_POLARITY.positive;
  if (v === "negative") return MODIFIER_POLARITY.negative;
  return MODIFIER_POLARITY.neutral;
}

function mapEffect(ef) {
  return {
    id: str(ef?.id) ?? `ef-${Math.random().toString(36).slice(2)}`,
    name: str(ef?.effect_name) ?? str(ef?.name) ?? "Unknown effect",
    polarity: normalizePolarity(ef?.polarity),
    durationTurns: ef?.remaining_turns != null ? num(ef.remaining_turns) : null,
    description: str(ef?.description) ?? "",
  };
}

// ─── Entity ─────────────────────────────────────────────────────────────────

export function mapEntity(bundle) {
  const char    = bundle?.character ?? {};
  const state   = bundle?.state ?? {};
  const combat  = bundle?.combat ?? {};

  // Action economy flags: prefer combat section (combat's flags are turn-specific),
  // fall back to state section.
  const flags = combat?.combat_flags ?? state?.combat_flags ?? {};

  // Resources: combat section is authoritative when present.
  const shieldCur = num(combat.shield_current ?? state.shield_current, 0);
  const shieldMax = num(combat.shield_max ?? state.shield_max, 0);
  const psiCur    = num(combat.psi_current ?? state.psi_current, 0);
  const psiMax    = num(combat.psi_max ?? state.psi_max, 0);

  const zones    = mapZones(combat.body_parts ?? []);
  const effects  = Array.isArray(bundle?.effects) ? bundle.effects.map(mapEffect) : [];

  return {
    summary: {
      id:              str(char.id) ?? str(char.character_key) ?? "unknown",
      name:            str(char.display_name) ?? str(char.character_key) ?? "Unknown",
      icon:            null,
      characterType:   "player",
      ownerPlayerId:   str(char.owner_player_id),
      svgRef:          "humanoid",
    },
    zones,
    shield:     { current: shieldCur, max: shieldMax },
    armorByZone: [],
    psi:        { current: psiCur, max: psiMax },
    actions: {
      main: !bool(flags?.main_action_spent, false),
      move: !bool(flags?.move_action_spent, false),
    },
    // All DB effects shown as status chips in the Player block.
    statuses: effects,
    effects:  [],
    flags: {
      alive:     bool(state.is_alive ?? combat.is_alive, true),
      conscious: bool(state.is_conscious ?? combat.is_conscious, true),
    },
    mech:  null,
    pilot: null,
  };
}

// ─── Weapon ─────────────────────────────────────────────────────────────────

function mapMagazine(mag) {
  if (!mag) return null;
  return {
    id:          str(mag.id) ?? `mag-${Math.random().toString(36).slice(2)}`,
    ammoType:    str(mag.ammo_type_key) ?? str(mag.ammo_type_name) ?? "—",
    description: str(mag.ammo_type_name) ?? "",
    current:     num(mag.current_rounds, 0),
    max:         num(mag.max_rounds, 0),
    caliber:     str(mag.caliber) ?? "",
  };
}

export function mapWeapon(armory) {
  const ew = armory?.equipped_weapon ?? null;
  if (!ew) return null;

  const rawModes  = Array.isArray(ew.fire_modes) ? ew.fire_modes : [];
  const fireModes = rawModes.map((m) => str(m)).filter(Boolean);
  const loadedMag = mapMagazine(ew.loaded_magazine);
  const reserve   = Array.isArray(ew.reserve_magazines)
    ? ew.reserve_magazines.map(mapMagazine).filter(Boolean)
    : [];

  return {
    id:             str(ew.id) ?? "wpn-unknown",
    name:           str(ew.weapon_name) ?? str(ew.name) ?? "Unknown Weapon",
    svgRef:         str(ew.weapon_type_key) ?? str(ew.weapon_type) ?? "rifle",
    fireModes,
    currentFireMode: str(ew.current_fire_mode) ?? fireModes[0] ?? null,
    usesMagazine:   bool(ew.uses_magazine, true),
    usesConsumable: bool(ew.uses_consumable, false),
    requiresAmmo:   bool(ew.requires_ammo, true),
    loadedMagazine: loadedMag,
    reserveMagazines: reserve,
    ammo: {
      current: loadedMag ? loadedMag.current : num(ew.ammo_current, 0),
      max:     loadedMag ? loadedMag.max     : num(ew.ammo_max,     0),
    },
    reloadCandidateId: reserve[0]?.id ?? null,
    canReload:      bool(ew.can_reload, false),
    disabledReason: str(ew.disabled_reason),
  };
}

// ─── Skills ─────────────────────────────────────────────────────────────────

function normalizeEnum(v, validSet, fallback) {
  const s = String(v ?? "");
  return validSet.has(s) ? s : fallback;
}

const VALID_SKILL_TYPES   = new Set(Object.values(SKILL_TYPES));
const VALID_SKILL_SOURCES = new Set(Object.values(SKILL_SOURCES));
const VALID_COLORS        = new Set(Object.values(COLOR_SEMANTICS));
const VALID_TARGETING     = new Set(Object.values(TARGETING_MODES));
const VALID_COSTS         = new Set(Object.values(ACTION_COSTS));

function mapSkillAction(qa) {
  const rawCost = String(qa?.action_cost ?? "MAIN").toUpperCase();
  return {
    id:          str(qa?.id) ?? `sk-${Math.random().toString(36).slice(2)}`,
    name:        str(qa?.ability_name) ?? str(qa?.name) ?? "Unknown",
    type:        normalizeEnum(qa?.ability_type ?? qa?.type, VALID_SKILL_TYPES, SKILL_TYPES.instantAbility),
    source:      normalizeEnum(qa?.source_type ?? qa?.source, VALID_SKILL_SOURCES, SKILL_SOURCES.perk),
    icon:        str(qa?.icon_key) ?? str(qa?.icon) ?? "bolt",
    color:       normalizeEnum(qa?.color_key ?? qa?.color, VALID_COLORS, COLOR_SEMANTICS.neutral),
    actionCost:  normalizeEnum(rawCost, VALID_COSTS, ACTION_COSTS.main),
    resourceCost: null,
    cooldownTurns: num(qa?.cooldown_remaining_turns ?? qa?.cooldown_remaining, 0),
    weaponRequirements: Array.isArray(qa?.weapon_requirements) ? qa.weapon_requirements.map(String) : [],
    targeting:   normalizeEnum(qa?.targeting_mode ?? qa?.targeting, VALID_TARGETING, TARGETING_MODES.none),
    allowsMultipleTargets: bool(qa?.allows_multiple_targets, false),
    usesPoint:   bool(qa?.uses_point, false),
    radius:      qa?.radius != null ? num(qa.radius) : null,
    isToggled:   bool(qa?.is_toggled, false),
    disabledReason: str(qa?.disabled_reason),
    tooltip:     str(qa?.tooltip) ?? "",
  };
}

export function mapSkills(abilitiesSection) {
  if (!abilitiesSection || typeof abilitiesSection !== "object") {
    return { library: [], quickSlots: [] };
  }

  const rawActions = Array.isArray(abilitiesSection.quick_actions) ? abilitiesSection.quick_actions : [];
  const rawSlots   = Array.isArray(abilitiesSection.quickbar_slots ?? abilitiesSection.quickbar)
    ? (abilitiesSection.quickbar_slots ?? abilitiesSection.quickbar)
    : [];

  const library = rawActions.map(mapSkillAction);
  const idSet   = new Set(library.map((sk) => sk.id));

  const quickSlots = rawSlots
    .map((s) => {
      const sid = str(s?.ability_id ?? s?.skill_id);
      return {
        index:   num(s?.slot_index ?? s?.index, 0),
        skillId: (sid && idSet.has(sid)) ? sid : null,
      };
    })
    .sort((a, b) => a.index - b.index);

  return { library, quickSlots };
}

// ─── Modifiers ───────────────────────────────────────────────────────────────
// The runtime bundle currently has no dedicated "modifiers" section (it is not
// listed in the characterPlacementApi.js sections). If the backend adds
// bundle.modifiers in the future, wire it here. For now: empty groups → neutral
// "no active modifiers" display in the Combat Control block.
export function mapModifiers(_bundle) {
  return { passive: [], active: [], narrative: [] };
}

// ─── Combat session ──────────────────────────────────────────────────────────
// A full session requires combat_get_active_runtime (a separate RPC call not
// performed in Phase 3A). The inactive session ensures the Action button is
// always enabled (no "not your turn" block) when outside an active encounter.
function mapCombatSession() {
  return createInactiveCombatSession();
}

// ─── Public ─────────────────────────────────────────────────────────────────

/**
 * Map a raw `get_character_runtime_bundle` result to a CombatHudSnapshot.
 * Missing or malformed sections produce safe empty/null values rather than errors.
 *
 * @param {object} bundle  Raw Supabase RPC response object.
 * @returns {import("../models/combatHudContracts.js").CombatHudSnapshot}
 */
export function mapBundleToHudSnapshot(bundle) {
  const empty = {
    entity:       null,
    weapon:       { primary: null, secondary: null },
    skills:       { library: [], quickSlots: [] },
    combatSession: createInactiveCombatSession(),
    modifiers:    { passive: [], active: [], narrative: [] },
    battleLog:    { entries: [] },
  };

  if (!bundle || typeof bundle !== "object") return empty;

  let entity = null;
  try { entity = mapEntity(bundle); } catch (_e) { entity = null; }

  let weaponPrimary = null;
  try { weaponPrimary = bundle.armory ? mapWeapon(bundle.armory) : null; } catch (_e) { weaponPrimary = null; }

  let skills = { library: [], quickSlots: [] };
  try { skills = mapSkills(bundle.abilities); } catch (_e) { skills = { library: [], quickSlots: [] }; }

  let modifiers = { passive: [], active: [], narrative: [] };
  try { modifiers = mapModifiers(bundle); } catch (_e) { modifiers = { passive: [], active: [], narrative: [] }; }

  return {
    entity,
    weapon:       { primary: weaponPrimary, secondary: null },
    skills,
    combatSession: mapCombatSession(),
    modifiers,
    battleLog:    { entries: [] },
  };
}
