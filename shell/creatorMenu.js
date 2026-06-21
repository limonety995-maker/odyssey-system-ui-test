import { hasSupabaseSettings } from "../bridge/settingsBridge.js";
import { toErrorMessage } from "../utils/errors.js";
import { escapeHtml, prettyJson, safeJsonParse } from "../utils/json.js";

const CREATOR_TABS = Object.freeze([
  { id: "skills", label: "Skills" },
  { id: "effects", label: "Effects" },
  { id: "abilities", label: "Abilities" },
  { id: "equipment", label: "Equipment Models" },
]);

const RELOAD_MODES = Object.freeze([
  { value: "", label: "No reload item" },
  { value: "reset", label: "Reset" },
  { value: "per_charge", label: "Per Charge" },
]);

const MODIFIER_TARGET_OPTIONS = Object.freeze([
  { value: "attack_accuracy", label: "Attack Accuracy" },
  { value: "defense", label: "Defense" },
  { value: "damage", label: "Damage" },
  { value: "armor", label: "Armor" },
  { value: "action_count", label: "Action Count" },
  { value: "concentration_slots", label: "Concentration Slots" },
  { value: "movement_m", label: "Movement (m)" },
  { value: "aim_difficulty", label: "Aim Difficulty" },
  { value: "range", label: "Range" },
  { value: "attribute", label: "Attribute" },
  { value: "skill", label: "Skill" },
  { value: "custom", label: "Custom Target" },
]);

const SKILL_UI_GROUPS = Object.freeze({
  combat: Object.freeze({
    label: "Combat",
    subcategories: Object.freeze([
      { value: "melee", label: "Melee", backendCategory: "combat", maxLevel: 5 },
      { value: "ranged", label: "Ranged", backendCategory: "combat", maxLevel: 5 },
    ]),
  }),
  applied: Object.freeze({
    label: "Applied",
    subcategories: Object.freeze([
      { value: "applied", label: "Applied", backendCategory: "applied", maxLevel: 5 },
      { value: "survival", label: "Survival", backendCategory: "survival", maxLevel: 5 },
      { value: "vehicle", label: "Vehicle", backendCategory: "vehicle", maxLevel: 3 },
      { value: "social", label: "Social", backendCategory: "social", maxLevel: 3 },
    ]),
  }),
  passive: Object.freeze({
    label: "Passive",
    subcategories: Object.freeze([
      { value: "passive", label: "Passive", backendCategory: "passive", maxLevel: 1 },
    ]),
  }),
});

const SKILL_UI_GROUP_OPTIONS = Object.freeze([
  { value: "combat", label: "Combat" },
  { value: "applied", label: "Applied" },
  { value: "passive", label: "Passive" },
]);

const EFFECT_UI_CATEGORY_OPTIONS = Object.freeze([
  { value: "buff", label: "Buff" },
  { value: "debuff", label: "Debuff" },
  { value: "condition", label: "Condition" },
  { value: "recovery", label: "Recovery" },
  { value: "damage", label: "Damage" },
  { value: "utility", label: "Utility" },
]);

const EFFECT_TYPE_OPTIONS = Object.freeze([
  { value: "modifiers_flags", label: "Modifiers / Flags" },
  { value: "periodic_damage", label: "Periodic Damage" },
  { value: "periodic_heal", label: "Periodic Heal" },
  { value: "body_part_heal", label: "Body Part Heal" },
  { value: "armor_repair", label: "Armor Repair" },
  { value: "resource_restore", label: "Resource Restore" },
  { value: "custom", label: "Custom Payload" },
]);

const EFFECT_DURATION_TYPE_OPTIONS = Object.freeze([
  { value: "manual", label: "Manual" },
  { value: "rounds", label: "Rounds" },
  { value: "until_turn_start", label: "Until Turn Start" },
  { value: "until_turn_end", label: "Until Turn End" },
  { value: "scene", label: "Scene" },
  { value: "until_used", label: "Until Used" },
]);

const EFFECT_STACKING_MODE_OPTIONS = Object.freeze([
  { value: "replace", label: "Replace" },
  { value: "stack", label: "Stack" },
  { value: "highest", label: "Highest Only" },
  { value: "lowest", label: "Lowest Only" },
  { value: "unique", label: "Unique" },
]);

const EFFECT_TARGET_SCOPE_OPTIONS = Object.freeze([
  { value: "character", label: "Character" },
  { value: "selected_body_part", label: "Selected Body Part" },
  { value: "selected_armor_item", label: "Selected Armor Item" },
]);

const EFFECT_TICK_PHASE_OPTIONS = Object.freeze([
  { value: "turn_start", label: "Turn Start" },
  { value: "turn_end", label: "Turn End" },
]);

const EFFECT_AMOUNT_METRIC_OPTIONS = Object.freeze([
  { value: "points", label: "Points" },
  { value: "hp", label: "HP" },
  { value: "minor", label: "Minor" },
  { value: "serious", label: "Serious" },
  { value: "critical", label: "Critical" },
]);

const EFFECT_FLAG_OPTIONS = Object.freeze([
  { value: "helpless", label: "Helpless" },
  { value: "skip_main_action", label: "Skip Main Action" },
  { value: "skip_movement", label: "Skip Movement" },
  { value: "consumes_full_turn", label: "Consumes Full Turn" },
  { value: "suppress_movement", label: "Suppress Movement" },
  { value: "cannot_leave_cover", label: "Cannot Leave Cover" },
  { value: "requires_concentration", label: "Requires Concentration" },
  { value: "expires_after_attack", label: "Expires After Attack" },
  { value: "expires_after_turn", label: "Expires After Turn" },
  { value: "fatal_on_any_damage_if_unprotected", label: "Fatal If Unprotected" },
  { value: "custom", label: "Custom Flag" },
]);

const ABILITY_UI_KIND_OPTIONS = Object.freeze([
  { value: "attack", label: "Attack" },
  { value: "support", label: "Support" },
  { value: "defense", label: "Defense" },
  { value: "passive", label: "Passive" },
  { value: "utility", label: "Utility" },
]);

const ABILITY_SOURCE_LABEL_OPTIONS = Object.freeze([
  { value: "psionic", label: "Psionic" },
  { value: "technical", label: "Technical" },
]);

const ABILITY_RESOLUTION_OPTIONS = Object.freeze([
  { value: "attack", label: "Attack Roll" },
  { value: "apply_effect", label: "Apply Effects" },
  { value: "grant_special", label: "Grant Special" },
  { value: "narrative", label: "Narrative / Utility" },
]);

const ABILITY_TARGET_OPTIONS = Object.freeze([
  { value: "self", label: "Self" },
  { value: "character", label: "Character" },
  { value: "body_part", label: "Body Part" },
  { value: "none", label: "No Target" },
]);

const ABILITY_ATTACK_TYPE_OPTIONS = Object.freeze([
  { value: "ranged", label: "Ranged" },
  { value: "melee", label: "Melee" },
]);

const ABILITY_RANGE_MODE_OPTIONS = Object.freeze([
  { value: "none", label: "No limit in backend" },
  { value: "limited", label: "Limited distance" },
]);

function createEmptySkillDraft() {
  return {
    id: "",
    name: "",
    skillGroup: "combat",
    skillSubcategory: "melee",
    category: "combat",
    maxLevel: "5",
    mainAttributeId: "",
    secondaryAttributeId: "",
    description: "",
  };
}

function createEmptyEffectDraft() {
  return {
    id: "",
    name: "",
    uiCategory: "buff",
    description: "",
    defaultDurationType: "manual",
    defaultRounds: "",
    stackingMode: "replace",
    isNegative: false,
    isNarrative: false,
    effectType: "modifiers_flags",
    targetScope: "character",
    amountMetric: "minor",
    scaleBase: "0",
    scalePerLevel: "0",
    tickPhase: "turn_end",
    resourcePoolId: "",
    restoreDisabled: false,
    modifiers: [],
    flags: [],
    dataExtraData: {},
    payloadExtraData: {},
  };
}

function createEmptyAbilityEffectLinkDraft() {
  return {
    effectDefId: "",
  };
}

function createEmptyAbilityLevelDraft(level = 1) {
  return {
    id: "",
    abilityLevel: String(level),
    resourceCost: "0",
    cooldownRounds: "",
    durationRounds: "",
    attackAccuracyBonus: "0",
    attackDamageBonus: "0",
    attackArmorPierce: "0",
    ignoreArmor: false,
    specialArmorValue: "",
    specialMaxCritical: "",
    dataExtraData: {},
    effectDataExtraData: {},
  };
}

function createEmptyAbilityDraft() {
  return normalizeAbilityEditorDraft({
    id: "",
    name: "",
    uiKind: "attack",
    sourceLabel: "psionic",
    resolutionMode: getDefaultResolutionForAbilityKind("attack"),
    targetType: getDefaultTargetTypeForAbilityKind("attack", "attack"),
    attackType: "ranged",
    rangeMode: "none",
    maxDistanceM: "",
    description: "",
    effectLinks: [],
    levels: [createEmptyAbilityLevelDraft(1)],
    dataExtraData: {},
    effectDataExtraData: {},
  });
}

function createEmptyAbilityLinkDraft() {
  return {
    abilityDefId: "",
    grantMode: "activated",
    durationRoundsMode: "none",
    durationRounds: "",
    chargesMode: "none",
    charges: "",
    cooldownRoundsMode: "none",
    cooldownRounds: "",
    reloadMode: "",
    reloadItemCode: "",
  };
}

function createEmptyEquipmentDraft() {
  return {
    id: "",
    name: "",
    itemType: "armor",
    description: "",
    armorValue: "0",
    armorMaxCritical: "0",
    defaultBodyPartCode: "",
    allowedBodyPartCodes: [],
    reservedForFuture: false,
    notes: "",
    modifiers: [],
    flagsExtraData: {},
    effectDataExtraData: {},
    abilityLinks: [],
  };
}

function createEmptyModifierDraft() {
  return {
    target: "attack_accuracy",
    customTarget: "",
    attributeCode: "",
    skillCode: "",
    value: "0",
  };
}

function createEmptyFlagDraft() {
  return {
    key: "helpless",
    customKey: "",
    enabled: true,
  };
}

function createInitialState() {
  return {
    activeTab: "skills",
    loading: false,
    loadingLabel: "",
    error: "",
    info: "",
    lastLoadedSettingsKey: "",
    references: null,
    loadedTabs: {
      skills: false,
      effects: false,
      abilities: false,
      equipment: false,
    },
    filters: {
      skills: {
        search: "",
        category: "",
      },
      effects: {
        search: "",
        category: "",
      },
      abilities: {
        search: "",
      },
      equipment: {
        search: "",
        itemType: "",
      },
    },
    lists: {
      skills: [],
      effects: [],
      abilities: [],
      equipment: [],
    },
    selectedIds: {
      skills: "",
      effects: "",
      abilities: "",
      equipment: "",
    },
    bundles: {
      skills: null,
      effects: null,
      abilities: null,
      equipment: null,
    },
    drafts: {
      skills: createEmptySkillDraft(),
      effects: createEmptyEffectDraft(),
      abilities: createEmptyAbilityDraft(),
      equipment: createEmptyEquipmentDraft(),
    },
    dirty: {
      skills: false,
      effects: false,
      abilities: false,
      equipment: false,
    },
    collapsed: {
      skillsCatalog: true,
      effectsCatalog: true,
      abilitiesCatalog: true,
      equipmentCatalog: true,
      skillsPayload: true,
      effectsPayload: true,
      effectsBehavior: true,
      abilitiesPayload: true,
      abilitiesLevels: false,
      equipmentPayload: true,
      equipmentDataModifiers: true,
    },
    requestNonce: 0,
  };
}

function cloneJson(value) {
  return safeJsonParse(JSON.stringify(value), value);
}

function coerceInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJsonField(text, label, expectedType) {
  const parsed = safeJsonParse(String(text ?? "").trim(), undefined);
  if (parsed === undefined) {
    throw new Error(`${label} must contain valid JSON.`);
  }
  if (expectedType === "array" && !Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array.`);
  }
  if (
    expectedType === "object"
    && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
  ) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

function formatCreatorError(result, fallback) {
  if (!result || result.ok !== false) {
    return fallback;
  }
  const details = Array.isArray(result.details)
    ? result.details
        .map((entry) => String(entry?.message ?? entry?.field ?? "").trim())
        .filter(Boolean)
    : [];
  const message = String(result.message ?? result.error ?? fallback).trim() || fallback;
  return details.length ? `${message} ${details.join(" | ")}` : message;
}

function slugifyName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
}

function uniqueGeneratedCode(baseCode, existingCodes) {
  const safeBase = baseCode || "entity";
  const used = new Set((existingCodes ?? []).map((value) => String(value ?? "").trim()).filter(Boolean));
  if (!used.has(safeBase)) {
    return safeBase;
  }
  let index = 2;
  while (used.has(`${safeBase}_${index}`)) {
    index += 1;
  }
  return `${safeBase}_${index}`;
}

function nextFreeSortOrder(items) {
  const used = new Set(
    (items ?? [])
      .map((item) => Number.parseInt(String(item?.sort_order ?? item?.sortOrder ?? ""), 10))
      .filter((value) => Number.isFinite(value) && value >= 0),
  );
  let value = 0;
  while (used.has(value)) {
    value += 1;
  }
  return value;
}

function getAllowedSkillBackendCategories() {
  return ["combat", "applied", "survival", "vehicle", "social", "passive"];
}

function getSkillBackendCategoriesForFilter(skillGroup) {
  switch (String(skillGroup ?? "").trim()) {
    case "combat":
      return ["combat"];
    case "applied":
      return ["applied", "survival", "vehicle", "social"];
    case "passive":
      return ["passive"];
    default:
      return getAllowedSkillBackendCategories();
  }
}

function getSkillSubcategoryConfig(skillGroup, skillSubcategory) {
  const groupConfig = SKILL_UI_GROUPS[String(skillGroup ?? "").trim()] ?? SKILL_UI_GROUPS.combat;
  return groupConfig.subcategories.find((entry) => entry.value === skillSubcategory) ?? groupConfig.subcategories[0];
}

function deriveSkillUiState(category, tags = []) {
  const normalizedCategory = String(category ?? "").trim();
  const tagList = Array.isArray(tags) ? tags.map((entry) => String(entry ?? "").trim()) : [];
  const subcategoryTag = tagList.find((entry) => entry.startsWith("skill_subcategory:"));
  const taggedSubcategory = subcategoryTag ? subcategoryTag.split(":").slice(1).join(":") : "";

  if (normalizedCategory === "combat") {
    const subcategory = taggedSubcategory === "ranged" ? "ranged" : "melee";
    return { skillGroup: "combat", skillSubcategory: subcategory };
  }
  if (["applied", "survival", "vehicle", "social"].includes(normalizedCategory)) {
    return { skillGroup: "applied", skillSubcategory: normalizedCategory };
  }
  if (normalizedCategory === "passive") {
    return { skillGroup: "passive", skillSubcategory: "passive" };
  }
  return { skillGroup: "combat", skillSubcategory: "melee" };
}

function buildSkillAutoTags(draft, references) {
  const tags = new Set();
  const skillConfig = getSkillSubcategoryConfig(draft.skillGroup, draft.skillSubcategory);
  if (draft.skillGroup) tags.add(`skill_group:${String(draft.skillGroup).trim()}`);
  if (draft.skillSubcategory) tags.add(`skill_subcategory:${String(draft.skillSubcategory).trim()}`);
  if (skillConfig?.backendCategory) tags.add(String(skillConfig.backendCategory).trim());
  const attributes = Array.isArray(references?.attributes) ? references.attributes : [];
  const main = attributes.find((entry) => entry.id === draft.mainAttributeId);
  const secondary = attributes.find((entry) => entry.id === draft.secondaryAttributeId);
  if (main?.code) tags.add(String(main.code));
  if (secondary?.code) tags.add(String(secondary.code));
  return Array.from(tags);
}

function buildEquipmentAutoTags(draft) {
  const tags = new Set();
  const allowedCodes = getEffectiveAllowedBodyPartCodes(draft);
  const primaryBodyPartCode = getPrimaryBodyPartCode(allowedCodes, draft.defaultBodyPartCode);
  if (draft.itemType) tags.add(String(draft.itemType).trim());
  if (primaryBodyPartCode) tags.add(primaryBodyPartCode);
  tags.add("equipable");
  if (shouldEquipToBodyPart(draft.itemType, allowedCodes, draft.defaultBodyPartCode)) tags.add("body_part");
  return Array.from(tags);
}

function deriveEffectUiCategory(category) {
  const normalized = String(category ?? "").trim().toLowerCase();
  if (EFFECT_UI_CATEGORY_OPTIONS.some((entry) => entry.value === normalized)) {
    return normalized;
  }
  switch (normalized) {
    case "combat":
    case "psionic":
    case "equipment":
    case "weapon":
    case "armor":
    case "narrative":
    case "custom":
      return "utility";
    default:
      return "utility";
  }
}

function effectCategoryIsNegative(category) {
  return ["debuff", "condition", "damage"].includes(String(category ?? "").trim().toLowerCase());
}

function getDefaultTargetScopeForEffectType(effectType) {
  switch (String(effectType ?? "").trim()) {
    case "body_part_heal":
      return "selected_body_part";
    case "armor_repair":
      return "selected_armor_item";
    default:
      return "character";
  }
}

function getDefaultMetricForEffectType(effectType) {
  switch (String(effectType ?? "").trim()) {
    case "resource_restore":
      return "points";
    case "body_part_heal":
      return "hp";
    case "armor_repair":
      return "critical";
    case "periodic_heal":
      return "hp";
    case "periodic_damage":
      return "minor";
    default:
      return "minor";
  }
}

function effectTypeUsesScale(effectType) {
  return [
    "periodic_damage",
    "periodic_heal",
    "body_part_heal",
    "armor_repair",
    "resource_restore",
  ].includes(String(effectType ?? "").trim());
}

function effectTypeUsesTickPhase(effectType) {
  return ["periodic_damage", "periodic_heal"].includes(String(effectType ?? "").trim());
}

function effectTypeUsesResourcePool(effectType) {
  return String(effectType ?? "").trim() === "resource_restore";
}

function effectTypeUsesRestoreDisabled(effectType) {
  return String(effectType ?? "").trim() === "body_part_heal";
}

function getEffectMetricOptions(effectType) {
  switch (String(effectType ?? "").trim()) {
    case "resource_restore":
      return EFFECT_AMOUNT_METRIC_OPTIONS.filter((entry) => entry.value === "points");
    case "periodic_heal":
    case "body_part_heal":
      return EFFECT_AMOUNT_METRIC_OPTIONS.filter((entry) => ["hp", "minor", "serious", "critical"].includes(entry.value));
    case "armor_repair":
      return EFFECT_AMOUNT_METRIC_OPTIONS.filter((entry) => ["minor", "serious", "critical"].includes(entry.value));
    case "periodic_damage":
      return EFFECT_AMOUNT_METRIC_OPTIONS.filter((entry) => ["minor", "serious", "critical"].includes(entry.value));
    default:
      return EFFECT_AMOUNT_METRIC_OPTIONS;
  }
}

function buildEffectAutoTags(draft) {
  const tags = new Set();
  if (draft.uiCategory) tags.add(String(draft.uiCategory).trim());
  if (draft.effectType) tags.add(`effect_type:${String(draft.effectType).trim()}`);
  if (draft.targetScope) tags.add(`target_scope:${String(draft.targetScope).trim()}`);
  if (effectCategoryIsNegative(draft.uiCategory)) tags.add("negative");
  return Array.from(tags);
}

function abilityUsesAttackFields(uiKind, resolutionMode) {
  return String(uiKind ?? "").trim() === "attack" || String(resolutionMode ?? "").trim() === "attack";
}

function abilityUsesEffectLinks(resolutionMode) {
  return String(resolutionMode ?? "").trim() === "apply_effect";
}

function abilityUsesSpecialFields(resolutionMode) {
  return String(resolutionMode ?? "").trim() === "grant_special";
}

function abilityIsPassive(uiKind) {
  return String(uiKind ?? "").trim() === "passive";
}

function abilityIsTechnical(sourceLabel) {
  return String(sourceLabel ?? "").trim() === "technical";
}

function getDefaultResolutionForAbilityKind(uiKind) {
  switch (String(uiKind ?? "").trim()) {
    case "attack":
      return "attack";
    case "defense":
      return "grant_special";
    case "passive":
    case "support":
      return "apply_effect";
    case "utility":
    default:
      return "narrative";
  }
}

function getDefaultTargetTypeForAbilityKind(uiKind, resolutionMode) {
  if (abilityUsesAttackFields(uiKind, resolutionMode)) {
    return "body_part";
  }
  if (abilityIsPassive(uiKind)) {
    return "self";
  }
  if (String(resolutionMode ?? "").trim() === "grant_special") {
    return "self";
  }
  if (String(resolutionMode ?? "").trim() === "narrative") {
    return "none";
  }
  return "character";
}

function getDefaultAttackTypeForAbilityKind(uiKind) {
  return String(uiKind ?? "").trim() === "attack" ? "ranged" : "melee";
}

function getAbilityOptionLabel(options, value, fallback = "") {
  const normalized = String(value ?? "").trim();
  const match = Array.isArray(options)
    ? options.find((entry) => String(entry?.value ?? "").trim() === normalized)
    : null;
  if (match?.label) {
    return String(match.label);
  }
  return fallback || normalized;
}

function getAllowedTargetTypesForAbility(uiKind, resolutionMode) {
  if (abilityUsesAttackFields(uiKind, resolutionMode)) {
    return ["body_part"];
  }
  if (abilityUsesSpecialFields(resolutionMode)) {
    return ["self"];
  }
  if (abilityIsPassive(uiKind)) {
    return ["self"];
  }
  if (String(resolutionMode ?? "").trim() === "apply_effect") {
    return ["self", "character"];
  }
  if (String(resolutionMode ?? "").trim() === "narrative") {
    return ["none"];
  }
  return [getDefaultTargetTypeForAbilityKind(uiKind, resolutionMode)];
}

function normalizeAbilityLevels(levels, { technical = false } = {}) {
  const sourceLevels = Array.isArray(levels) && levels.length
    ? levels.map((entry) => ({ ...cloneJson(entry) }))
    : [createEmptyAbilityLevelDraft(1)];
  const effectiveLevels = technical ? [sourceLevels[0] ?? createEmptyAbilityLevelDraft(1)] : sourceLevels;
  return effectiveLevels.map((entry, index) => ({
    ...createEmptyAbilityLevelDraft(index + 1),
    ...entry,
    id: String(entry?.id ?? ""),
    abilityLevel: String(index + 1),
  }));
}

function normalizeAbilityEditorDraft(draft) {
  const uiKind = ABILITY_UI_KIND_OPTIONS.some((entry) => entry.value === String(draft?.uiKind ?? "").trim())
    ? String(draft.uiKind).trim()
    : "utility";
  const sourceLabel = ABILITY_SOURCE_LABEL_OPTIONS.some((entry) => entry.value === String(draft?.sourceLabel ?? "").trim())
    ? String(draft.sourceLabel).trim()
    : "technical";
  const resolutionMode = getDefaultResolutionForAbilityKind(uiKind);
  const showAttackFields = abilityUsesAttackFields(uiKind, resolutionMode);
  const attackType = showAttackFields
    ? (
        ABILITY_ATTACK_TYPE_OPTIONS.some((entry) => entry.value === String(draft?.attackType ?? "").trim())
          ? String(draft.attackType).trim()
          : getDefaultAttackTypeForAbilityKind(uiKind)
      )
    : getDefaultAttackTypeForAbilityKind(uiKind);
  const allowedTargets = getAllowedTargetTypesForAbility(uiKind, resolutionMode);
  const targetType = allowedTargets.includes(String(draft?.targetType ?? "").trim())
    ? String(draft.targetType).trim()
    : allowedTargets[0];
  const rangeMode = showAttackFields && attackType === "melee"
    ? "limited"
    : String(draft?.rangeMode ?? "").trim() === "limited"
    ? "limited"
    : "none";
  const maxDistanceM = showAttackFields && attackType === "melee"
    ? "2"
    : String(draft?.maxDistanceM ?? "").trim();
  const technical = abilityIsTechnical(sourceLabel);
  return {
    ...cloneJson(draft ?? {}),
    uiKind,
    sourceLabel,
    resolutionMode,
    targetType,
    attackType,
    rangeMode,
    maxDistanceM,
    effectLinks: Array.isArray(draft?.effectLinks)
      ? draft.effectLinks.map((entry) => ({ ...cloneJson(entry) }))
      : [],
    levels: normalizeAbilityLevels(draft?.levels, { technical }),
    dataExtraData: cloneJson(draft?.dataExtraData ?? {}),
    effectDataExtraData: cloneJson(draft?.effectDataExtraData ?? {}),
  };
}

function getAbilityPayloadSummary(draft) {
  const normalized = normalizeAbilityEditorDraft(draft);
  const sourceLabel = getAbilityOptionLabel(ABILITY_SOURCE_LABEL_OPTIONS, normalized.sourceLabel, "Technical");
  const resolutionLabel = getAbilityOptionLabel(ABILITY_RESOLUTION_OPTIONS, normalized.resolutionMode, "Narrative / Utility");
  const targetLabel = getAbilityOptionLabel(ABILITY_TARGET_OPTIONS, normalized.targetType, "No Target");
  const attackTypeLabel = abilityUsesAttackFields(normalized.uiKind, normalized.resolutionMode)
    ? getAbilityOptionLabel(ABILITY_ATTACK_TYPE_OPTIONS, normalized.attackType, "Ranged")
    : "n/a";
  const levelsLabel = abilityIsTechnical(normalized.sourceLabel)
    ? "internal Level 1"
    : `${Array.isArray(normalized.levels) ? normalized.levels.length : 0} level(s)`;
  return [
    { label: "Source", value: sourceLabel },
    { label: "Resolution", value: resolutionLabel },
    { label: "Target", value: targetLabel },
    { label: "Attack Type", value: attackTypeLabel },
    { label: "Levels", value: levelsLabel },
  ];
}

function findEffectReferenceById(references, effectDefId) {
  const normalizedId = String(effectDefId ?? "").trim();
  if (!normalizedId) {
    return null;
  }
  const list = Array.isArray(references?.effects) ? references.effects : [];
  return list.find((entry) => String(entry?.id ?? "").trim() === normalizedId) ?? null;
}

function buildEffectReferenceSummary(effectReference) {
  if (!effectReference) {
    return "No effect selected yet.";
  }
  const category = String(effectReference.ui_category ?? effectReference.category ?? "").trim();
  const effectType = String(effectReference.effect_type ?? effectReference.effectType ?? "").trim();
  const targetScope = String(effectReference.target_scope ?? effectReference.targetScope ?? "").trim();
  const durationType = String(effectReference.default_duration_type ?? effectReference.defaultDurationType ?? "").trim();
  const parts = [category, effectType, targetScope, durationType].filter(Boolean);
  return parts.length ? parts.join(" / ") : "Saved effect template";
}

function buildAbilityAutoTags(draft) {
  const normalized = normalizeAbilityEditorDraft(draft);
  const tags = new Set();
  if (normalized.uiKind) tags.add(`ability_kind:${String(normalized.uiKind).trim()}`);
  if (normalized.sourceLabel) tags.add(`ability_source:${String(normalized.sourceLabel).trim()}`);
  if (normalized.resolutionMode) tags.add(`ability_resolution:${String(normalized.resolutionMode).trim()}`);
  if (normalized.rangeMode) tags.add(`ability_range:${String(normalized.rangeMode).trim()}`);
  return Array.from(tags);
}

function toPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeBodyPartCodeArray(value) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((entry) => String(entry ?? "").trim()).filter(Boolean)))
    : [];
}

function suggestAllowedBodyPartCodes(defaultBodyPartCode) {
  const code = String(defaultBodyPartCode ?? "").trim().toLowerCase();
  switch (code) {
    case "head":
    case "torso":
    case "special":
      return code ? [code] : [];
    case "l_arm":
    case "r_arm":
      return ["l_arm", "r_arm", "extra_l_arm", "extra_r_arm"];
    case "l_leg":
    case "r_leg":
      return ["l_leg", "r_leg"];
    default:
      return code ? [code] : [];
  }
}

function getPrimaryBodyPartCode(allowedBodyPartCodes, fallbackCode = "") {
  const normalized = normalizeBodyPartCodeArray(allowedBodyPartCodes);
  const fallback = String(fallbackCode ?? "").trim().toLowerCase();
  if (fallback && normalized.includes(fallback)) {
    return fallback;
  }
  const preferredOrder = ["head", "torso", "l_arm", "r_arm", "l_leg", "r_leg", "special", "extra_l_arm", "extra_r_arm"];
  for (const code of preferredOrder) {
    if (normalized.includes(code)) {
      return code;
    }
  }
  return normalized[0] ?? "";
}

function getEffectiveAllowedBodyPartCodes(draft) {
  const selectedCodes = normalizeBodyPartCodeArray(draft?.allowedBodyPartCodes);
  return selectedCodes.length
    ? selectedCodes
    : suggestAllowedBodyPartCodes(draft?.defaultBodyPartCode);
}

function shouldShowProtectionSlots(itemType) {
  const type = String(itemType ?? "").trim();
  return type !== "exoskeleton" && type !== "closed_suit";
}

function shouldEquipToBodyPart(itemType, allowedBodyPartCodes = [], defaultBodyPartCode = "") {
  const type = String(itemType ?? "").trim();
  if (type === "armor" || type === "shield") {
    return true;
  }
  if (type === "implant" || type === "prosthetic") {
    return normalizeBodyPartCodeArray(allowedBodyPartCodes).length > 0 || Boolean(String(defaultBodyPartCode ?? "").trim());
  }
  return false;
}

function getEquipmentUiTypes(references) {
  return (Array.isArray(references?.equipment_item_types) ? references.equipment_item_types : [])
    .filter((itemType) => String(itemType ?? "") !== "device");
}

function normalizeSkillDraft(bundle) {
  const skill = bundle?.skill ?? {};
  const uiState = deriveSkillUiState(skill.category, skill.tags);
  const config = getSkillSubcategoryConfig(uiState.skillGroup, uiState.skillSubcategory);
  return {
    id: String(skill.id ?? ""),
    name: String(skill.name ?? ""),
    skillGroup: uiState.skillGroup,
    skillSubcategory: uiState.skillSubcategory,
    category: String(config?.backendCategory ?? skill.category ?? "combat"),
    maxLevel: String(config?.maxLevel ?? skill.max_level ?? 5),
    mainAttributeId: String(skill.main_attribute_id ?? ""),
    secondaryAttributeId: String(skill.secondary_attribute_id ?? ""),
    description: String(skill.description ?? ""),
  };
}

function normalizeFlagDraft(entry) {
  const rawKey = String(entry?.key ?? "").trim();
  const known = EFFECT_FLAG_OPTIONS.some((option) => option.value === rawKey && option.value !== "custom")
    ? rawKey
    : "custom";
  return {
    key: known,
    customKey: known === "custom" ? rawKey : "",
    enabled: Boolean(entry?.enabled ?? entry?.value ?? true),
  };
}

function normalizeEffectDraft(bundle) {
  const effect = bundle?.effect ?? {};
  const data = toPlainObject(effect.data);
  const payload = toPlainObject(data.payload);
  const {
    modifiers: modifiersRaw,
    flags: flagsRaw,
    payload: payloadRaw,
    ...dataExtraData
  } = data;
  const {
    type: payloadTypeRaw,
    target_scope: targetScopeRaw,
    scale: scaleRaw,
    tick_phase: tickPhaseRaw,
    resource_pool_id: resourcePoolIdRaw,
    restore_disabled: restoreDisabledRaw,
    ...payloadExtraData
  } = payload;
  const scale = toPlainObject(scaleRaw);
  const effectType = EFFECT_TYPE_OPTIONS.some((entry) => entry.value === String(payloadTypeRaw ?? "").trim())
    ? String(payloadTypeRaw ?? "").trim()
    : "modifiers_flags";
  const targetScope = EFFECT_TARGET_SCOPE_OPTIONS.some((entry) => entry.value === String(targetScopeRaw ?? "").trim())
    ? String(targetScopeRaw ?? "").trim()
    : getDefaultTargetScopeForEffectType(effectType);
  const metricOptions = getEffectMetricOptions(effectType);
  const amountMetric = metricOptions.some((entry) => entry.value === String(scale.metric ?? "").trim())
    ? String(scale.metric ?? "").trim()
    : getDefaultMetricForEffectType(effectType);
  return {
    id: String(effect.id ?? ""),
    name: String(effect.name ?? ""),
    uiCategory: deriveEffectUiCategory(effect.category),
    description: String(effect.description ?? ""),
    defaultDurationType: String(effect.default_duration_type ?? "manual"),
    defaultRounds: effect.default_rounds === null || effect.default_rounds === undefined ? "" : String(effect.default_rounds),
    stackingMode: String(effect.stacking_mode ?? "replace"),
    isNegative: effectCategoryIsNegative(effect.category),
    isNarrative: false,
    effectType,
    targetScope,
    amountMetric,
    scaleBase: scale.base === null || scale.base === undefined ? "0" : String(scale.base),
    scalePerLevel: scale.per_level === null || scale.per_level === undefined ? "0" : String(scale.per_level),
    tickPhase: String(tickPhaseRaw ?? "turn_end"),
    resourcePoolId: String(resourcePoolIdRaw ?? ""),
    restoreDisabled: Boolean(restoreDisabledRaw),
    modifiers: Array.isArray(modifiersRaw)
      ? modifiersRaw.map(normalizeModifierDraft)
      : [],
    flags: Object.entries(toPlainObject(flagsRaw)).map(([key, value]) => normalizeFlagDraft({ key, value })),
    dataExtraData,
    payloadExtraData,
  };
}

function normalizeAbilityEffectLinkDraft(entry) {
  return {
    effectDefId: String(entry?.effect_def_id ?? entry?.id ?? ""),
  };
}

function normalizeAbilityLevelDraft(entry, fallbackLevel = 1) {
  const dataExtraData = toPlainObject(entry?.data);
  const effectDataExtraData = toPlainObject(entry?.effect_data);
  return {
    id: String(entry?.id ?? ""),
    abilityLevel: String(entry?.ability_level ?? fallbackLevel),
    resourceCost: String(entry?.resource_cost ?? 0),
    cooldownRounds: entry?.cooldown_rounds === null || entry?.cooldown_rounds === undefined ? "" : String(entry.cooldown_rounds),
    durationRounds: entry?.duration_rounds === null || entry?.duration_rounds === undefined ? "" : String(entry.duration_rounds),
    attackAccuracyBonus: String(entry?.attack_accuracy_bonus ?? 0),
    attackDamageBonus: String(entry?.attack_damage_bonus ?? 0),
    attackArmorPierce: String(entry?.attack_armor_pierce ?? 0),
    ignoreArmor: Boolean(entry?.ignore_armor),
    specialArmorValue: entry?.special_armor_value === null || entry?.special_armor_value === undefined ? "" : String(entry.special_armor_value),
    specialMaxCritical: entry?.special_max_critical === null || entry?.special_max_critical === undefined ? "" : String(entry.special_max_critical),
    dataExtraData,
    effectDataExtraData,
  };
}

function normalizeAbilityDraft(bundle) {
  const ability = bundle?.ability ?? {};
  const abilityData = toPlainObject(ability.data);
  const rangeData = toPlainObject(abilityData.range);
  const effectLinksRaw = Array.isArray(bundle?.effect_links)
    ? bundle.effect_links
    : Array.isArray(abilityData.effect_links)
    ? abilityData.effect_links
    : [];
  const sourceLabel = String(ability.source_type ?? "").trim() === "psionic" ? "psionic" : "technical";
  const uiKind = ABILITY_UI_KIND_OPTIONS.some((entry) => entry.value === String(ability.ability_kind ?? "").trim())
    ? String(ability.ability_kind ?? "").trim()
    : String(ability.ability_kind ?? "").trim() === "buff"
    ? "support"
    : "utility";
  const resolutionMode = ABILITY_RESOLUTION_OPTIONS.some((entry) => entry.value === String(ability.effect_mode ?? "").trim())
    ? String(ability.effect_mode ?? "").trim()
    : getDefaultResolutionForAbilityKind(uiKind);
  const levelsRaw = Array.isArray(bundle?.levels) ? bundle.levels : [];
  const normalizedLevels = levelsRaw.length
    ? levelsRaw.map((entry, index) => normalizeAbilityLevelDraft(entry, index + 1))
    : [createEmptyAbilityLevelDraft(1)];
  const {
    effect_links: ignoredEffectLinks,
    range: ignoredRange,
    ...dataExtraData
  } = abilityData;
  return normalizeAbilityEditorDraft({
    id: String(ability.id ?? ""),
    name: String(ability.name ?? ""),
    uiKind,
    sourceLabel,
    resolutionMode,
    targetType: ABILITY_TARGET_OPTIONS.some((entry) => entry.value === String(ability.target_type ?? "").trim())
      ? String(ability.target_type ?? "").trim()
      : getDefaultTargetTypeForAbilityKind(uiKind, resolutionMode),
    attackType: ABILITY_ATTACK_TYPE_OPTIONS.some((entry) => entry.value === String(ability.attack_type ?? "").trim())
      ? String(ability.attack_type ?? "").trim()
      : getDefaultAttackTypeForAbilityKind(uiKind),
    rangeMode: String(rangeData.mode ?? "").trim() === "limited" ? "limited" : "none",
    maxDistanceM: rangeData.max_distance_m === null || rangeData.max_distance_m === undefined ? "" : String(rangeData.max_distance_m),
    description: String(ability.description ?? ""),
    effectLinks: effectLinksRaw.map(normalizeAbilityEffectLinkDraft),
    levels: normalizedLevels,
    dataExtraData,
    effectDataExtraData: toPlainObject(ability.effect_data),
  });
}

function normalizeAbilityLinkDraft(entry) {
  const data = entry?.data && typeof entry.data === "object" && !Array.isArray(entry.data)
    ? entry.data
    : {};
  const reload = data?.reload && typeof data.reload === "object" && !Array.isArray(data.reload)
    ? data.reload
    : {};
  const charges = data.default_max_charges ?? data.default_current_charges ?? data.max_charges ?? data.current_charges ?? "";
  const durationValue = data.duration_rounds;
  const cooldownValue = data.cooldown_rounds ?? data.default_cooldown_rounds;
  return {
    abilityDefId: String(entry?.ability_def_id ?? ""),
    grantMode: String(entry?.grant_mode ?? "activated"),
    durationRoundsMode: durationValue === null || durationValue === undefined || durationValue === "" ? "none" : "set",
    durationRounds: String(durationValue ?? ""),
    chargesMode: charges === null || charges === undefined || charges === "" ? "none" : "set",
    charges: charges === null || charges === undefined ? "" : String(charges),
    cooldownRoundsMode: cooldownValue === null || cooldownValue === undefined || cooldownValue === "" ? "none" : "set",
    cooldownRounds: String(cooldownValue ?? ""),
    reloadMode: String(reload.mode ?? data.reload_mode ?? ""),
    reloadItemCode: String(reload.item_code ?? data.reload_item_code ?? data.requires_reload_item_code ?? ""),
  };
}

function normalizeEquipmentDraft(bundle) {
  const model = bundle?.equipment_model ?? {};
  const flags = toPlainObject(model.flags);
  const effectData = toPlainObject(model.effect_data);
  const {
    allowed_body_part_codes: allowedBodyPartCodesRaw,
    ...flagsExtraData
  } = flags;
  const {
    reserved_for_future: reservedForFutureRaw,
    notes: notesRaw,
    modifiers: modifiersRaw,
    ...effectDataExtraData
  } = effectData;
  const normalizedAllowedBodyPartCodes = normalizeBodyPartCodeArray(allowedBodyPartCodesRaw);
  return {
    id: String(model.id ?? ""),
    name: String(model.name ?? ""),
    itemType: String(model.item_type ?? "armor"),
    description: String(model.description ?? ""),
    armorValue: String(model.armor_value ?? 0),
    armorMaxCritical: String(model.armor_max_critical ?? 0),
    defaultBodyPartCode: String(model.default_body_part_code ?? ""),
    allowedBodyPartCodes: normalizedAllowedBodyPartCodes.length
      ? normalizedAllowedBodyPartCodes
      : suggestAllowedBodyPartCodes(model.default_body_part_code),
    reservedForFuture: Boolean(reservedForFutureRaw),
    notes: String(notesRaw ?? ""),
    modifiers: Array.isArray(modifiersRaw)
      ? modifiersRaw.map(normalizeModifierDraft)
      : [],
    flagsExtraData,
    effectDataExtraData,
    abilityLinks: Array.isArray(bundle?.ability_links)
      ? bundle.ability_links.map(normalizeAbilityLinkDraft)
      : [],
  };
}

function normalizeModifierDraft(entry) {
  const rawTarget = String(entry?.target ?? "").trim();
  const knownTarget = MODIFIER_TARGET_OPTIONS.some((option) => option.value === rawTarget && option.value !== "custom")
    ? rawTarget
    : "custom";
  return {
    target: knownTarget,
    customTarget: knownTarget === "custom" ? rawTarget : "",
    attributeCode: String(entry?.attribute ?? ""),
    skillCode: String(entry?.skill_code ?? ""),
    value: String(entry?.value ?? 0),
  };
}

function makeSkillDuplicateDraft(source) {
  const name = String(source.name ?? "").trim();
  return {
    ...cloneJson(source),
    id: "",
    name: name ? `${name} Copy` : "",
  };
}

function makeEffectDuplicateDraft(source) {
  const name = String(source.name ?? "").trim();
  return {
    ...cloneJson(source),
    id: "",
    name: name ? `${name} Copy` : "",
    modifiers: Array.isArray(source.modifiers)
      ? source.modifiers.map((entry) => ({
          ...cloneJson(entry),
        }))
      : [],
    flags: Array.isArray(source.flags)
      ? source.flags.map((entry) => ({
          ...cloneJson(entry),
        }))
      : [],
    dataExtraData: cloneJson(source.dataExtraData ?? {}),
    payloadExtraData: cloneJson(source.payloadExtraData ?? {}),
  };
}

function makeAbilityDuplicateDraft(source) {
  const name = String(source.name ?? "").trim();
  return normalizeAbilityEditorDraft({
    ...cloneJson(source),
    id: "",
    name: name ? `${name} Copy` : "",
    effectLinks: Array.isArray(source.effectLinks)
      ? source.effectLinks.map((entry) => ({ ...cloneJson(entry) }))
      : [],
    levels: Array.isArray(source.levels)
      ? source.levels.map((entry, index) => ({
          ...cloneJson(entry),
          id: "",
          abilityLevel: String(index + 1),
        }))
      : [createEmptyAbilityLevelDraft(1)],
    dataExtraData: cloneJson(source.dataExtraData ?? {}),
    effectDataExtraData: cloneJson(source.effectDataExtraData ?? {}),
  });
}

function makeEquipmentDuplicateDraft(source) {
  const name = String(source.name ?? "").trim();
  return {
    ...cloneJson(source),
    id: "",
    name: name ? `${name} Copy` : "",
    flagsExtraData: cloneJson(source.flagsExtraData ?? {}),
    effectDataExtraData: cloneJson(source.effectDataExtraData ?? {}),
    modifiers: Array.isArray(source.modifiers)
      ? source.modifiers.map((entry) => ({
          ...cloneJson(entry),
        }))
      : [],
    abilityLinks: Array.isArray(source.abilityLinks)
      ? source.abilityLinks.map((entry) => ({
          ...cloneJson(entry),
        }))
      : [],
  };
}

function generatedSkillPreview(draft, references, state) {
  const list = Array.isArray(state?.lists?.skills) ? state.lists.skills : [];
  const existingCodes = list.map((item) => item?.code);
  const code = uniqueGeneratedCode(slugifyName(draft.name), existingCodes);
  const tags = buildSkillAutoTags(draft, references);
  const sortOrder = draft.id
    ? Number.parseInt(String(state?.bundles?.skills?.skill?.sort_order ?? 0), 10) || 0
    : nextFreeSortOrder(list);
  return { code, tags, sortOrder };
}

function generatedEffectPreview(draft, state) {
  const list = Array.isArray(state?.lists?.effects) ? state.lists.effects : [];
  const existingCodes = list.map((item) => item?.code);
  const code = uniqueGeneratedCode(slugifyName(draft.name), existingCodes);
  const tags = buildEffectAutoTags(draft);
  const sortOrder = draft.id
    ? Number.parseInt(String(state?.bundles?.effects?.effect?.sort_order ?? 0), 10) || 0
    : nextFreeSortOrder(list);
  return { code, tags, sortOrder };
}

function generatedAbilityPreview(draft, state) {
  const list = Array.isArray(state?.lists?.abilities) ? state.lists.abilities : [];
  const existingCodes = list.map((item) => item?.code);
  const code = uniqueGeneratedCode(slugifyName(draft.name), existingCodes);
  const tags = buildAbilityAutoTags(draft);
  const sortOrder = draft.id
    ? Number.parseInt(String(state?.bundles?.abilities?.ability?.sort_order ?? 0), 10) || 0
    : nextFreeSortOrder(list);
  return { code, tags, sortOrder };
}

function generatedEquipmentPreview(draft, state) {
  const list = Array.isArray(state?.lists?.equipment) ? state.lists.equipment : [];
  const existingCodes = list.map((item) => item?.code);
  const code = uniqueGeneratedCode(slugifyName(draft.name), existingCodes);
  const tags = buildEquipmentAutoTags(draft);
  const sortOrder = draft.id
    ? Number.parseInt(String(state?.bundles?.equipment?.equipment_model?.sort_order ?? 0), 10) || 0
    : nextFreeSortOrder(list);
  return { code, tags, sortOrder };
}

function buildAbilityLinkPayload(link, index) {
  const grantMode = String(link.grantMode ?? "activated").trim() || "activated";
  const isPassive = grantMode === "passive";
  const durationMode = String(link.durationRoundsMode ?? "").trim() || "none";
  const chargesMode = String(link.chargesMode ?? "").trim() || "none";
  const cooldownMode = String(link.cooldownRoundsMode ?? "").trim() || "none";
  const charges = String(link.charges ?? "").trim();
  const cooldown = String(link.cooldownRounds ?? "").trim();
  const duration = String(link.durationRounds ?? "").trim();
  const reloadMode = String(link.reloadMode ?? "").trim();
  const reloadItemCode = String(link.reloadItemCode ?? "").trim();
  const data = {};
  if (durationMode === "set" && duration !== "") {
    data.duration_rounds = coerceInteger(duration, 0);
  }
  if (chargesMode === "set" && charges !== "") {
    const value = coerceInteger(charges, 0);
    data.default_current_charges = value;
    data.default_max_charges = value;
  }
  if (cooldownMode === "set" && cooldown !== "") {
    data.cooldown_rounds = coerceInteger(cooldown, 0);
  }
  if (reloadMode) {
    data.reload = { mode: reloadMode };
    if (reloadItemCode) {
      data.reload.item_code = reloadItemCode;
    }
  }
  return {
    ability_def_id: String(link.abilityDefId ?? "").trim(),
    grant_mode: grantMode,
    is_enabled: isPassive,
    sort_order: index,
    data,
  };
}

function buildFlagPayload(entry) {
  const key = String(entry?.key ?? "").trim() === "custom"
    ? String(entry?.customKey ?? "").trim()
    : String(entry?.key ?? "").trim();
  if (!key) {
    return null;
  }
  return [key, Boolean(entry?.enabled)];
}

function buildSkillPayload(draft, auto) {
  const skillConfig = getSkillSubcategoryConfig(draft.skillGroup, draft.skillSubcategory);
  return {
    id: draft.id || undefined,
    code: String(auto.code ?? "").trim(),
    name: String(draft.name ?? "").trim(),
    category: String(skillConfig?.backendCategory ?? draft.category ?? "combat").trim() || "combat",
    max_level: coerceInteger(skillConfig?.maxLevel ?? draft.maxLevel, 5),
    main_attribute_id: String(draft.mainAttributeId ?? "").trim() || null,
    secondary_attribute_id: String(draft.secondaryAttributeId ?? "").trim() || null,
    sort_order: auto.sortOrder,
    description: String(draft.description ?? ""),
    tags: auto.tags,
  };
}

function buildEffectPayload(draft, auto) {
  const data = toPlainObject(cloneJson(draft.dataExtraData));
  const payload = toPlainObject(cloneJson(draft.payloadExtraData));
  const modifiers = (Array.isArray(draft.modifiers) ? draft.modifiers : [])
    .map(buildModifierPayload)
    .filter(Boolean);
  const flags = Object.fromEntries(
    (Array.isArray(draft.flags) ? draft.flags : [])
      .map(buildFlagPayload)
      .filter(Boolean),
  );

  if (modifiers.length) {
    data.modifiers = modifiers;
  } else {
    delete data.modifiers;
  }

  if (Object.keys(flags).length) {
    data.flags = flags;
  } else {
    delete data.flags;
  }

  const effectType = String(draft.effectType ?? "modifiers_flags").trim() || "modifiers_flags";
  if (effectType === "modifiers_flags") {
    delete data.payload;
  } else {
    payload.type = effectType;
    payload.target_scope = String(draft.targetScope ?? getDefaultTargetScopeForEffectType(effectType)).trim() || getDefaultTargetScopeForEffectType(effectType);
    if (effectTypeUsesScale(effectType)) {
      payload.scale = {
        base: coerceInteger(draft.scaleBase, 0),
        per_level: coerceInteger(draft.scalePerLevel, 0),
        metric: String(draft.amountMetric ?? getDefaultMetricForEffectType(effectType)).trim() || getDefaultMetricForEffectType(effectType),
      };
    } else {
      delete payload.scale;
    }
    if (effectTypeUsesTickPhase(effectType)) {
      payload.tick_phase = String(draft.tickPhase ?? "turn_end").trim() || "turn_end";
    } else {
      delete payload.tick_phase;
    }
    if (effectTypeUsesResourcePool(effectType)) {
      payload.resource_pool_id = String(draft.resourcePoolId ?? "").trim() || null;
    } else {
      delete payload.resource_pool_id;
    }
    if (effectTypeUsesRestoreDisabled(effectType)) {
      payload.restore_disabled = Boolean(draft.restoreDisabled);
    } else {
      delete payload.restore_disabled;
    }
    data.payload = payload;
  }

  return {
    id: draft.id || undefined,
    code: String(auto.code ?? "").trim(),
    name: String(draft.name ?? "").trim(),
    category: String(draft.uiCategory ?? "utility").trim() || "utility",
    description: String(draft.description ?? ""),
    default_duration_type: String(draft.defaultDurationType ?? "manual").trim() || "manual",
    default_rounds: String(draft.defaultDurationType ?? "manual") === "rounds"
      ? coerceInteger(draft.defaultRounds, 1)
      : null,
    stacking_mode: String(draft.stackingMode ?? "replace").trim() || "replace",
    is_negative: effectCategoryIsNegative(draft.uiCategory),
    is_narrative: false,
    sort_order: auto.sortOrder,
    tags: auto.tags,
    data,
  };
}

function buildAbilityLevelPayload(levelDraft, fallbackLevel) {
  const options = arguments[2] ?? {};
  const showResourceCost = Boolean(options.showResourceCost);
  const showDuration = Boolean(options.showDuration);
  const showAttackFields = Boolean(options.showAttackFields);
  const showSpecialFields = Boolean(options.showSpecialFields);
  return {
    id: levelDraft.id || undefined,
    ability_level: coerceInteger(levelDraft.abilityLevel, fallbackLevel),
    resource_cost: showResourceCost ? coerceInteger(levelDraft.resourceCost, 0) : 0,
    cooldown_rounds: null,
    range_profile_id: null,
    attack_accuracy_bonus: showAttackFields ? coerceInteger(levelDraft.attackAccuracyBonus, 0) : 0,
    attack_damage_bonus: showAttackFields ? coerceInteger(levelDraft.attackDamageBonus, 0) : 0,
    attack_armor_pierce: showAttackFields ? coerceInteger(levelDraft.attackArmorPierce, 0) : 0,
    ignore_armor: false,
    special_armor_value: showSpecialFields && String(levelDraft.specialArmorValue ?? "").trim() !== ""
      ? coerceInteger(levelDraft.specialArmorValue, 0)
      : null,
    special_max_critical: showSpecialFields && String(levelDraft.specialMaxCritical ?? "").trim() !== ""
      ? coerceInteger(levelDraft.specialMaxCritical, 0)
      : null,
    duration_rounds: showDuration && String(levelDraft.durationRounds ?? "").trim() !== ""
      ? coerceInteger(levelDraft.durationRounds, 0)
      : null,
    data: toPlainObject(cloneJson(levelDraft.dataExtraData)),
    effect_data: toPlainObject(cloneJson(levelDraft.effectDataExtraData)),
  };
}

function buildAbilityPayload(draft, auto) {
  const normalizedDraft = normalizeAbilityEditorDraft(draft);
  const uiKind = String(normalizedDraft.uiKind ?? "utility").trim() || "utility";
  const sourceLabel = String(normalizedDraft.sourceLabel ?? "technical").trim() || "technical";
  const resolutionMode = String(normalizedDraft.resolutionMode ?? getDefaultResolutionForAbilityKind(uiKind)).trim() || getDefaultResolutionForAbilityKind(uiKind);
  const targetType = String(normalizedDraft.targetType ?? getDefaultTargetTypeForAbilityKind(uiKind, resolutionMode)).trim() || getDefaultTargetTypeForAbilityKind(uiKind, resolutionMode);
  const attackType = abilityUsesAttackFields(uiKind, resolutionMode)
    ? String(normalizedDraft.attackType ?? getDefaultAttackTypeForAbilityKind(uiKind)).trim() || getDefaultAttackTypeForAbilityKind(uiKind)
    : null;
  const sourceType = sourceLabel === "psionic" ? "psionic" : "equipment";
  const abilityKind = uiKind === "support" ? "support" : uiKind;
  const activationType = abilityIsPassive(uiKind) ? "passive" : "manual";
  const data = toPlainObject(cloneJson(normalizedDraft.dataExtraData));
  const effectData = toPlainObject(cloneJson(normalizedDraft.effectDataExtraData));
  const showSpecialFields = abilityUsesSpecialFields(resolutionMode);
  const showAttackFields = abilityUsesAttackFields(uiKind, resolutionMode) && !showSpecialFields;
  const showResourceCost = !abilityIsTechnical(sourceLabel);
  const showDuration = !abilityIsTechnical(sourceLabel) && !showSpecialFields;
  if (attackType === "melee") {
    data.range = {
      mode: "limited",
      max_distance_m: 2,
    };
  } else if (String(normalizedDraft.rangeMode ?? "").trim() === "limited" && String(normalizedDraft.maxDistanceM ?? "").trim() !== "") {
    data.range = {
      mode: "limited",
      max_distance_m: coerceInteger(normalizedDraft.maxDistanceM, 0),
    };
  } else {
    delete data.range;
  }
  if (abilityUsesEffectLinks(resolutionMode)) {
    data.effect_links = (Array.isArray(normalizedDraft.effectLinks) ? normalizedDraft.effectLinks : [])
      .map((entry) => String(entry?.effectDefId ?? "").trim())
      .filter(Boolean)
      .map((effectDefId, index) => ({
        effect_def_id: effectDefId,
        sort_order: index,
      }));
  } else {
    delete data.effect_links;
  }
  data.creator_source_label = sourceLabel;
  const levels = abilityIsTechnical(sourceLabel)
    ? [buildAbilityLevelPayload(
        (Array.isArray(normalizedDraft.levels) && normalizedDraft.levels[0]) ? normalizedDraft.levels[0] : createEmptyAbilityLevelDraft(1),
        1,
        { showResourceCost, showDuration, showAttackFields, showSpecialFields },
      )]
    : (Array.isArray(normalizedDraft.levels) ? normalizedDraft.levels : [])
        .map((entry, index) => buildAbilityLevelPayload(
          entry,
          index + 1,
          { showResourceCost, showDuration, showAttackFields, showSpecialFields },
        ))
        .sort((left, right) => coerceInteger(left.ability_level, 0) - coerceInteger(right.ability_level, 0));
  return {
    id: normalizedDraft.id || undefined,
    code: String(auto.code ?? "").trim(),
    name: String(normalizedDraft.name ?? "").trim(),
    ability_kind: abilityKind,
    source_type: sourceType,
    activation_type: activationType,
    target_type: targetType,
    effect_mode: resolutionMode,
    attack_type: attackType,
    linked_skill_id: null,
    resource_mode: sourceLabel === "psionic" ? "pool" : "none",
    resource_pool_code: sourceLabel === "psionic" ? "psionic_energy" : null,
    resource_item_code: null,
    description: String(normalizedDraft.description ?? ""),
    data,
    effect_data: effectData,
    tags: auto.tags,
    sort_order: auto.sortOrder,
    levels,
    effect_links: abilityUsesEffectLinks(resolutionMode)
      ? (Array.isArray(data.effect_links) ? data.effect_links : [])
      : [],
  };
}

function buildEquipmentPayload(draft, auto) {
  const showProtectionSlots = shouldShowProtectionSlots(draft.itemType);
  const selectedAllowedCodes = normalizeBodyPartCodeArray(draft.allowedBodyPartCodes);
  const suggestedAllowedCodes = suggestAllowedBodyPartCodes(draft.defaultBodyPartCode);
  const effectiveAllowedCodes = selectedAllowedCodes.length ? selectedAllowedCodes : suggestedAllowedCodes;
  const canEquipToBodyPart = shouldEquipToBodyPart(draft.itemType, effectiveAllowedCodes, draft.defaultBodyPartCode);
  const primaryBodyPartCode = showProtectionSlots ? getPrimaryBodyPartCode(effectiveAllowedCodes, draft.defaultBodyPartCode) : "";
  const flags = toPlainObject(cloneJson(draft.flagsExtraData));
  const effectData = toPlainObject(cloneJson(draft.effectDataExtraData));
  const finalAllowedCodes = canEquipToBodyPart
    ? effectiveAllowedCodes
    : [];
  if (canEquipToBodyPart && finalAllowedCodes.length) {
    flags.allowed_body_part_codes = finalAllowedCodes;
  } else {
    delete flags.allowed_body_part_codes;
  }
  delete flags.protects_helpless_execution;
  if (draft.reservedForFuture) {
    effectData.reserved_for_future = true;
  } else {
    delete effectData.reserved_for_future;
  }
  if (String(draft.notes ?? "").trim()) {
    effectData.notes = String(draft.notes ?? "").trim();
  } else {
    delete effectData.notes;
  }
  const modifiers = (Array.isArray(draft.modifiers) ? draft.modifiers : [])
    .map(buildModifierPayload)
    .filter(Boolean);
  if (modifiers.length) {
    effectData.modifiers = modifiers;
  } else {
    delete effectData.modifiers;
  }
  return {
    id: draft.id || undefined,
    code: String(auto.code ?? "").trim(),
    name: String(draft.name ?? "").trim(),
    item_type: String(draft.itemType ?? "armor").trim() || "armor",
    description: String(draft.description ?? ""),
    armor_value: coerceInteger(draft.armorValue, 0),
    armor_max_minor: 0,
    armor_max_serious: 0,
    armor_max_critical: coerceInteger(draft.armorMaxCritical, 0),
    default_body_part_code: primaryBodyPartCode || null,
    can_equip: true,
    can_equip_to_body_part: canEquipToBodyPart,
    sort_order: auto.sortOrder,
    tags: auto.tags,
    flags,
    effect_data: effectData,
    ability_links: (Array.isArray(draft.abilityLinks) ? draft.abilityLinks : [])
      .filter((entry) => String(entry?.abilityDefId ?? "").trim())
      .map((entry, index) => buildAbilityLinkPayload(entry, index)),
  };
}

function buildModifierPayload(entry) {
  const target = String(entry?.target ?? "").trim() || "attack_accuracy";
  const resolvedTarget = target === "custom"
    ? String(entry?.customTarget ?? "").trim()
    : target;
  if (!resolvedTarget) {
    return null;
  }
  const payload = {
    target: resolvedTarget,
    value: coerceInteger(entry?.value, 0),
  };
  if (resolvedTarget === "attribute") {
    const attributeCode = String(entry?.attributeCode ?? "").trim();
    if (!attributeCode) {
      return null;
    }
    payload.attribute = attributeCode;
  }
  if (resolvedTarget === "skill") {
    const skillCode = String(entry?.skillCode ?? "").trim();
    if (!skillCode) {
      return null;
    }
    payload.skill_code = skillCode;
  }
  return payload;
}

function extractEntityBundle(result) {
  if (result?.entity?.ok) {
    return result.entity;
  }
  if (result?.ok) {
    return result;
  }
  return null;
}

function buildTabButtons(activeTab) {
  return CREATOR_TABS
    .map(
      (tab) => `
        <button
          type="button"
          class="creator-tab${activeTab === tab.id ? " active" : ""}"
          data-creator-tab="${tab.id}"
        >${escapeHtml(tab.label)}</button>
      `,
    )
    .join("");
}

function buildSkillFilterMarkup(state, references) {
  const selected = state.filters.skills.category;
  const options = [
    '<option value="">All groups</option>',
    ...SKILL_UI_GROUP_OPTIONS.map(
      (group) => `<option value="${escapeHtml(group.value)}"${selected === group.value ? " selected" : ""}>${escapeHtml(group.label)}</option>`,
    ),
  ];
  return `
    <div class="creator-toolbar">
      <label class="field-stack">
        <span>Search</span>
        <input data-creator-filter-search="skills" type="text" value="${escapeHtml(state.filters.skills.search)}" placeholder="code, name, tags">
      </label>
      <label class="field-stack">
        <span>Group</span>
        <select data-creator-filter-category="skills">
          ${options.join("")}
        </select>
      </label>
      <div class="creator-filter-actions">
        <button type="button" class="secondary" data-creator-action="applyFilters">Apply Filters</button>
        <button type="button" class="secondary" data-creator-action="refreshList">Refresh</button>
      </div>
    </div>
  `;
}

function buildEffectFilterMarkup(state) {
  const selected = state.filters.effects.category;
  const options = [
    '<option value="">All categories</option>',
    ...EFFECT_UI_CATEGORY_OPTIONS.map(
      (category) => `<option value="${escapeHtml(category.value)}"${selected === category.value ? " selected" : ""}>${escapeHtml(category.label)}</option>`,
    ),
  ];
  return `
    <div class="creator-toolbar">
      <label class="field-stack">
        <span>Search</span>
        <input data-creator-filter-search="effects" type="text" value="${escapeHtml(state.filters.effects.search)}" placeholder="code, name, tags">
      </label>
      <label class="field-stack">
        <span>Category</span>
        <select data-creator-filter-category="effects">
          ${options.join("")}
        </select>
      </label>
      <div class="creator-filter-actions">
        <button type="button" class="secondary" data-creator-action="applyFilters">Apply Filters</button>
        <button type="button" class="secondary" data-creator-action="refreshList">Refresh</button>
      </div>
    </div>
  `;
}

function buildAbilityFilterMarkup(state) {
  return `
    <div class="creator-toolbar">
      <label class="field-stack">
        <span>Search</span>
        <input data-creator-filter-search="abilities" type="text" value="${escapeHtml(state.filters.abilities.search)}" placeholder="code, name, tags">
      </label>
      <div class="creator-filter-actions">
        <button type="button" class="secondary" data-creator-action="applyFilters">Apply Filters</button>
        <button type="button" class="secondary" data-creator-action="refreshList">Refresh</button>
      </div>
    </div>
  `;
}

function buildEquipmentFilterMarkup(state, references) {
  const selected = state.filters.equipment.itemType;
  const types = getEquipmentUiTypes(references);
  const options = [
    '<option value="">All item types</option>',
    ...types.map(
      (itemType) => `<option value="${escapeHtml(itemType)}"${selected === itemType ? " selected" : ""}>${escapeHtml(itemType)}</option>`,
    ),
  ];
  return `
    <div class="creator-toolbar">
      <label class="field-stack">
        <span>Search</span>
        <input data-creator-filter-search="equipment" type="text" value="${escapeHtml(state.filters.equipment.search)}" placeholder="code, name, tags">
      </label>
      <label class="field-stack">
        <span>Item Type</span>
        <select data-creator-filter-item-type="equipment">
          ${options.join("")}
        </select>
      </label>
      <div class="creator-filter-actions">
        <button type="button" class="secondary" data-creator-action="applyFilters">Apply Filters</button>
        <button type="button" class="secondary" data-creator-action="refreshList">Refresh</button>
      </div>
    </div>
  `;
}

function buildListMarkup(kind, items, selectedId) {
  if (!items.length) {
    return `<div class="creator-empty">No ${
      kind === "skills"
        ? "skills"
        : kind === "effects"
        ? "effects"
        : kind === "abilities"
        ? "abilities"
        : "equipment models"
    } found for the current filter.</div>`;
  }
  return items
    .map((item) => {
      const isActive = selectedId && selectedId === item.id;
      const meta = kind === "skills"
        ? (() => {
            const uiState = deriveSkillUiState(item.category, item.tags);
            return [
              `${uiState.skillGroup} / ${uiState.skillSubcategory}`,
              item.main_attribute_name || item.main_attribute_code || "no main attribute",
              item.secondary_attribute_name || item.secondary_attribute_code || "no secondary attribute",
            ];
          })()
        : kind === "effects"
        ? [
            deriveEffectUiCategory(item.category),
            item.default_duration_type || "manual",
            item.stacking_mode || "replace",
          ]
        : kind === "abilities"
        ? [
            item.ability_kind || "utility",
            item.source_type === "psionic" ? "psionic" : "technical",
            item.effect_mode || "narrative",
          ]
        : [
            item.item_type || "unknown",
            item.default_body_part_code || "no body part",
            `armor ${item.armor_value ?? 0}`,
          ];
      return `
        <button
          type="button"
          class="creator-list-item${isActive ? " active" : ""}"
          data-creator-open="${escapeHtml(kind)}:${escapeHtml(item.id)}"
        >
          <span class="creator-list-title">${escapeHtml(item.name || item.code || "Unnamed")}</span>
          <span class="creator-list-code">${escapeHtml(item.code || "")}</span>
          <span class="creator-list-meta">${escapeHtml(meta.join(" | "))}</span>
        </button>
      `;
    })
    .join("");
}

function buildAttributeOptions(references, selectedValue) {
  const attributes = Array.isArray(references?.attributes) ? references.attributes : [];
  const options = ['<option value="">None</option>'];
  for (const attribute of attributes) {
    options.push(
      `<option value="${escapeHtml(attribute.id)}"${selectedValue === attribute.id ? " selected" : ""}>${escapeHtml(attribute.name || attribute.code || attribute.id)}</option>`,
    );
  }
  return options.join("");
}

function buildResourcePoolOptions(references, selectedValue) {
  const pools = Array.isArray(references?.resource_pools) ? references.resource_pools : [];
  const options = ['<option value="">Select resource</option>'];
  for (const pool of pools) {
    options.push(
      `<option value="${escapeHtml(pool.id)}"${selectedValue === pool.id ? " selected" : ""}>${escapeHtml(pool.name || pool.code || pool.id)}</option>`,
    );
  }
  return options.join("");
}

function buildBodyPartCheckboxMarkup(references, selectedCodes) {
  const selectedSet = new Set(normalizeBodyPartCodeArray(selectedCodes));
  const bodyParts = Array.isArray(references?.body_part_definitions) ? references.body_part_definitions : [];
  if (!bodyParts.length) {
    return `<div class="creator-empty">No body part definitions found.</div>`;
  }
  return bodyParts
    .map((part) => `
      <label class="creator-check-pill">
        <input data-creator-body-part-code="${escapeHtml(part.code)}" type="checkbox"${selectedSet.has(part.code) ? " checked" : ""}>
        <span>${escapeHtml(part.name || part.code)}</span>
      </label>
    `)
    .join("");
}

function buildAbilityOptions(references, selectedValue, selectedIds = []) {
  const abilities = Array.isArray(references?.abilities) ? references.abilities : [];
  const selectedSet = new Set((selectedIds ?? []).filter(Boolean));
  const options = ['<option value="">Select ability</option>'];
  for (const ability of abilities) {
    const disabled = selectedSet.has(ability.id) && selectedValue !== ability.id;
    options.push(
      `<option value="${escapeHtml(ability.id)}"${selectedValue === ability.id ? " selected" : ""}${disabled ? " disabled" : ""}>${escapeHtml(ability.name || ability.code)}${ability.ability_kind ? ` | ${escapeHtml(ability.ability_kind)}` : ""}</option>`,
    );
  }
  return options.join("");
}

function buildItemOptions(references, selectedValue) {
  const items = Array.isArray(references?.itemDefinitions) ? references.itemDefinitions : [];
  const options = ['<option value="">No reload item</option>'];
  for (const item of items) {
    options.push(
      `<option value="${escapeHtml(item.code)}"${selectedValue === item.code ? " selected" : ""}>${escapeHtml(item.name || item.code)}${item.item_type ? ` | ${escapeHtml(item.item_type)}` : ""}</option>`,
    );
  }
  return options.join("");
}

function buildEffectOptions(references, selectedValue, selectedIds = []) {
  const effects = Array.isArray(references?.effects) ? references.effects : [];
  const selectedSet = new Set((selectedIds ?? []).filter(Boolean));
  const options = ['<option value="">Select effect</option>'];
  for (const effect of effects) {
    const disabled = selectedSet.has(effect.id) && selectedValue !== effect.id;
    options.push(
      `<option value="${escapeHtml(effect.id)}"${selectedValue === effect.id ? " selected" : ""}${disabled ? " disabled" : ""}>${escapeHtml(effect.name || effect.code)}${effect.category ? ` | ${escapeHtml(effect.category)}` : ""}</option>`,
    );
  }
  return options.join("");
}

function buildModifierTargetOptions(selectedValue) {
  return MODIFIER_TARGET_OPTIONS
    .map((option) => `<option value="${escapeHtml(option.value)}"${selectedValue === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
}

function buildSkillCodeOptions(references, selectedValue) {
  const skills = Array.isArray(references?.skills) ? references.skills : [];
  const options = ['<option value="">Select skill</option>'];
  for (const skill of skills) {
    options.push(
      `<option value="${escapeHtml(skill.code)}"${selectedValue === skill.code ? " selected" : ""}>${escapeHtml(skill.name || skill.code)}${skill.category ? ` | ${escapeHtml(skill.category)}` : ""}</option>`,
    );
  }
  return options.join("");
}

function buildCatalogSection({
  title,
  count,
  collapsed,
  action,
  bodyMarkup,
}) {
  return `
    <aside class="creator-sidebar">
      <button type="button" class="creator-collapse-toggle" data-creator-action="${escapeHtml(action)}" aria-expanded="${collapsed ? "false" : "true"}">
        <span>${escapeHtml(title)}</span>
        <span class="creator-inline-compact">
          <span class="creator-count">${escapeHtml(String(count))}</span>
          <span class="creator-collapse-icon">${collapsed ? "+" : "-"}</span>
        </span>
      </button>
      ${collapsed ? "" : `<div class="creator-list">${bodyMarkup}</div>`}
    </aside>
  `;
}

function buildDisclosureSection({
  title,
  collapsed,
  action,
  summary = "",
  actionsMarkup = "",
  bodyMarkup = "",
}) {
  return `
    <div class="creator-section-card">
      <div class="creator-section-head">
        <button type="button" class="creator-section-toggle" data-creator-action="${escapeHtml(action)}" aria-expanded="${collapsed ? "false" : "true"}">
          <span>${escapeHtml(title)}</span>
          ${summary ? `<span class="muted">${escapeHtml(summary)}</span>` : ""}
          <span class="creator-collapse-icon">${collapsed ? "+" : "-"}</span>
        </button>
        ${actionsMarkup}
      </div>
      ${collapsed ? "" : bodyMarkup}
    </div>
  `;
}

function buildOptionalNumberField({
  label,
  field,
  index,
  value,
  mode,
}) {
  const selectedMode = String(mode ?? "").trim() || "none";
  return `
    <div class="creator-small-stack">
      <span>${escapeHtml(label)}</span>
      <div class="creator-mini-grid">
        <select data-creator-link-input="${field}Mode" data-link-index="${index}">
          <option value="none"${selectedMode === "none" ? " selected" : ""}>None</option>
          <option value="set"${selectedMode === "set" ? " selected" : ""}>Set</option>
        </select>
        <input data-creator-link-input="${field}" data-link-index="${index}" type="number" min="0" value="${escapeHtml(value)}"${selectedMode === "set" ? "" : " disabled"}>
      </div>
    </div>
  `;
}

function buildModifierEditorMarkup(draft, references) {
  const modifiers = Array.isArray(draft.modifiers) ? draft.modifiers : [];
  if (!modifiers.length) {
    return `<div class="creator-empty">No modifiers yet. Add one if this model should grant a passive or active numeric effect.</div>`;
  }
  return modifiers
    .map((modifier, index) => {
      const resolvedTarget = String(modifier.target ?? "attack_accuracy");
      return `
        <div class="creator-link-card" data-creator-modifier-row="${index}">
          <div class="creator-link-head">
            <strong>Modifier ${index + 1}</strong>
            <button type="button" class="secondary" data-creator-modifier-remove="${index}">Remove</button>
          </div>
          <div class="field-grid creator-grid-3">
            <label class="field-stack">
              <span>Target</span>
              <select data-creator-modifier-input="target" data-modifier-index="${index}">
                ${buildModifierTargetOptions(resolvedTarget)}
              </select>
            </label>
            ${resolvedTarget === "attribute" ? `
              <label class="field-stack">
                <span>Attribute</span>
                <select data-creator-modifier-input="attributeCode" data-modifier-index="${index}">
                  ${buildAttributeOptions(references, modifier.attributeCode)}
                </select>
              </label>
            ` : resolvedTarget === "skill" ? `
              <label class="field-stack">
                <span>Skill</span>
                <select data-creator-modifier-input="skillCode" data-modifier-index="${index}">
                  ${buildSkillCodeOptions(references, modifier.skillCode)}
                </select>
              </label>
            ` : resolvedTarget === "custom" ? `
              <label class="field-stack">
                <span>Custom Target</span>
                <input data-creator-modifier-input="customTarget" data-modifier-index="${index}" type="text" value="${escapeHtml(modifier.customTarget)}" placeholder="custom_target">
              </label>
            ` : `
              <div class="creator-auto-meta creator-small-meta">
                <div><strong>Resolved Target:</strong> ${escapeHtml(resolvedTarget)}</div>
              </div>
            `}
            <label class="field-stack">
              <span>Value</span>
              <input data-creator-modifier-input="value" data-modifier-index="${index}" type="number" value="${escapeHtml(modifier.value)}">
            </label>
          </div>
        </div>
      `;
    })
    .join("");
}

function buildFlagOptions(selectedValue) {
  return EFFECT_FLAG_OPTIONS
    .map((option) => `<option value="${escapeHtml(option.value)}"${selectedValue === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
}

function buildFlagEditorMarkup(draft) {
  const flags = Array.isArray(draft.flags) ? draft.flags : [];
  if (!flags.length) {
    return `<div class="creator-empty">No flags yet. Add one if this effect should set a combat or control state.</div>`;
  }
  return flags
    .map((flag, index) => {
      const resolvedKey = String(flag.key ?? "helpless");
      return `
        <div class="creator-link-card" data-creator-flag-row="${index}">
          <div class="creator-link-head">
            <strong>Flag ${index + 1}</strong>
            <button type="button" class="secondary" data-creator-flag-remove="${index}">Remove</button>
          </div>
          <div class="field-grid creator-grid-3">
            <label class="field-stack">
              <span>Flag</span>
              <select data-creator-flag-input="key" data-flag-index="${index}">
                ${buildFlagOptions(resolvedKey)}
              </select>
            </label>
            ${resolvedKey === "custom" ? `
              <label class="field-stack">
                <span>Custom Key</span>
                <input data-creator-flag-input="customKey" data-flag-index="${index}" type="text" value="${escapeHtml(flag.customKey)}" placeholder="custom_flag">
              </label>
            ` : `
              <div class="creator-auto-meta creator-small-meta">
                <div><strong>Resolved Key:</strong> ${escapeHtml(resolvedKey)}</div>
              </div>
            `}
            <label class="field-stack">
              <span>Enabled</span>
              <input data-creator-flag-input="enabled" data-flag-index="${index}" type="checkbox"${flag.enabled ? " checked" : ""}>
            </label>
          </div>
        </div>
      `;
    })
    .join("");
}

function buildSkillEditorMarkup(state, references) {
  const draft = state.drafts.skills;
  const auto = generatedSkillPreview(draft, references, state);
  const groupOptions = SKILL_UI_GROUP_OPTIONS
    .map((group) => `<option value="${escapeHtml(group.value)}"${draft.skillGroup === group.value ? " selected" : ""}>${escapeHtml(group.label)}</option>`)
    .join("");
  const subcategoryOptions = SKILL_UI_GROUPS[draft.skillGroup]?.subcategories ?? SKILL_UI_GROUPS.combat.subcategories;
  const subcategoryMarkup = subcategoryOptions
    .map((subcategory) => `<option value="${escapeHtml(subcategory.value)}"${draft.skillSubcategory === subcategory.value ? " selected" : ""}>${escapeHtml(`${subcategory.label} | max ${subcategory.maxLevel}`)}</option>`)
    .join("");

  return `
    <div class="creator-editor-head">
      <div>
        <div class="creator-editor-title">${escapeHtml(draft.name || "New Skill Draft")}</div>
        <div class="muted">${draft.id ? "Editing saved definition." : "Draft is local until Save."}</div>
      </div>
      <div class="creator-pill${state.dirty.skills ? " dirty" : ""}" data-creator-dirty-pill="skills">${state.dirty.skills ? "Unsaved" : "Saved / clean"}</div>
    </div>
    <div class="button-row">
      <button type="button" data-creator-action="newDraft">Create New</button>
      <button type="button" class="secondary" data-creator-action="duplicateDraft">Duplicate</button>
      <button type="button" data-creator-action="saveDraft">Save</button>
      <button type="button" class="secondary" data-creator-action="reloadSelected"${draft.id ? "" : " disabled"}>Reload</button>
      <button type="button" class="secondary" data-creator-action="deleteSelected"${draft.id ? "" : " disabled"}>Delete</button>
    </div>
    <form class="creator-form" data-creator-form="skills">
      <label class="field-stack">
        <span>Name</span>
        <input data-creator-input="name" type="text" value="${escapeHtml(draft.name)}" placeholder="Frontier Melee">
      </label>
      <div class="field-grid creator-grid-4">
        <label class="field-stack">
          <span>Group</span>
          <select data-creator-input="skillGroup">${groupOptions}</select>
        </label>
        <label class="field-stack">
          <span>Subcategory</span>
          <select data-creator-input="skillSubcategory">${subcategoryMarkup}</select>
        </label>
        <label class="field-stack">
          <span>Main Attribute</span>
          <select data-creator-input="mainAttributeId">${buildAttributeOptions(references, draft.mainAttributeId)}</select>
        </label>
        <label class="field-stack">
          <span>Secondary Attribute</span>
          <select data-creator-input="secondaryAttributeId">${buildAttributeOptions(references, draft.secondaryAttributeId)}</select>
        </label>
      </div>
      <label class="field-stack">
        <span>Description</span>
        <textarea data-creator-input="description" rows="4" placeholder="Short GM-facing description">${escapeHtml(draft.description)}</textarea>
      </label>
      ${buildDisclosureSection({
        title: "Payload Preview",
        collapsed: Boolean(state.collapsed.skillsPayload),
        action: "toggleSkillsPayload",
        bodyMarkup: `
          <label class="field-stack">
            <textarea rows="10" readonly>${escapeHtml(prettyJson(buildSkillPayload(draft, auto)))}</textarea>
          </label>
        `,
      })}
    </form>
  `;
}

function buildEffectEditorMarkup(state, references) {
  const draft = state.drafts.effects;
  const auto = generatedEffectPreview(draft, state);
  const categoryOptions = EFFECT_UI_CATEGORY_OPTIONS
    .map((option) => `<option value="${escapeHtml(option.value)}"${draft.uiCategory === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  const effectTypeOptions = EFFECT_TYPE_OPTIONS
    .map((option) => `<option value="${escapeHtml(option.value)}"${draft.effectType === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  const durationOptions = EFFECT_DURATION_TYPE_OPTIONS
    .map((option) => `<option value="${escapeHtml(option.value)}"${draft.defaultDurationType === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  const stackingOptions = EFFECT_STACKING_MODE_OPTIONS
    .map((option) => `<option value="${escapeHtml(option.value)}"${draft.stackingMode === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  const targetScopeOptions = EFFECT_TARGET_SCOPE_OPTIONS
    .map((option) => `<option value="${escapeHtml(option.value)}"${draft.targetScope === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  const metricOptions = getEffectMetricOptions(draft.effectType)
    .map((option) => `<option value="${escapeHtml(option.value)}"${draft.amountMetric === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  const tickPhaseOptions = EFFECT_TICK_PHASE_OPTIONS
    .map((option) => `<option value="${escapeHtml(option.value)}"${draft.tickPhase === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  const behaviorCollapsed = Boolean(state.collapsed.effectsBehavior);
  const payloadCollapsed = Boolean(state.collapsed.effectsPayload);

  return `
    <div class="creator-editor-head">
      <div>
        <div class="creator-editor-title">${escapeHtml(draft.name || "New Effect Draft")}</div>
        <div class="muted">${draft.id ? "Editing saved definition." : "Draft is local until Save."}</div>
      </div>
      <div class="creator-pill${state.dirty.effects ? " dirty" : ""}" data-creator-dirty-pill="effects">${state.dirty.effects ? "Unsaved" : "Saved / clean"}</div>
    </div>
    <div class="button-row">
      <button type="button" data-creator-action="newDraft">Create New</button>
      <button type="button" class="secondary" data-creator-action="duplicateDraft">Duplicate</button>
      <button type="button" data-creator-action="saveDraft">Save</button>
      <button type="button" class="secondary" data-creator-action="reloadSelected"${draft.id ? "" : " disabled"}>Reload</button>
      <button type="button" class="secondary" data-creator-action="deleteSelected"${draft.id ? "" : " disabled"}>Delete</button>
    </div>
    <form class="creator-form" data-creator-form="effects">
      <label class="field-stack">
        <span>Name</span>
        <input data-creator-input="name" type="text" value="${escapeHtml(draft.name)}" placeholder="Hemostatic Surge">
      </label>
      <div class="field-grid creator-grid-4">
        <label class="field-stack">
          <span>Category</span>
          <select data-creator-input="uiCategory">${categoryOptions}</select>
        </label>
        <label class="field-stack">
          <span>Effect Type</span>
          <select data-creator-input="effectType">${effectTypeOptions}</select>
        </label>
        <label class="field-stack">
          <span>Duration</span>
          <select data-creator-input="defaultDurationType">${durationOptions}</select>
        </label>
        <label class="field-stack">
          <span>Stacking Mode</span>
          <select data-creator-input="stackingMode">${stackingOptions}</select>
        </label>
      </div>
      <div class="field-grid creator-grid-1">
        <label class="field-stack">
          <span>Default Rounds</span>
          <input data-creator-input="defaultRounds" type="number" min="0" value="${escapeHtml(draft.defaultRounds)}"${draft.defaultDurationType === "rounds" ? "" : " disabled"}>
        </label>
      </div>
      <label class="field-stack">
        <span>Description</span>
        <textarea data-creator-input="description" rows="4" placeholder="Short GM-facing description">${escapeHtml(draft.description)}</textarea>
      </label>
      ${buildDisclosureSection({
        title: "Behavior",
        collapsed: behaviorCollapsed,
        action: "toggleEffectsBehavior",
        actionsMarkup: `
          <div class="button-row compact">
            <button type="button" class="secondary" data-creator-action="addModifier">Add Modifier</button>
            <button type="button" class="secondary" data-creator-action="addFlag">Add Flag</button>
          </div>
        `,
        bodyMarkup: `
          <div class="field-grid creator-grid-2">
            <label class="field-stack">
              <span>Target Scope</span>
              <select data-creator-input="targetScope">${targetScopeOptions}</select>
            </label>
            ${effectTypeUsesTickPhase(draft.effectType) ? `
              <label class="field-stack">
                <span>Tick Phase</span>
                <select data-creator-input="tickPhase">${tickPhaseOptions}</select>
              </label>
            ` : `
              <div class="creator-auto-meta creator-small-meta">
                <div><strong>Tick Phase:</strong> not used by this effect type.</div>
              </div>
            `}
          </div>
          ${effectTypeUsesScale(draft.effectType) ? `
            <div class="field-grid creator-grid-4">
              <label class="field-stack">
                <span>Base</span>
                <input data-creator-input="scaleBase" type="number" value="${escapeHtml(draft.scaleBase)}">
              </label>
              <label class="field-stack">
                <span>Per Level</span>
                <input data-creator-input="scalePerLevel" type="number" value="${escapeHtml(draft.scalePerLevel)}">
              </label>
              <label class="field-stack">
                <span>Metric</span>
                <select data-creator-input="amountMetric">${metricOptions}</select>
              </label>
              ${effectTypeUsesResourcePool(draft.effectType) ? `
                <label class="field-stack">
                  <span>Resource Pool</span>
                  <select data-creator-input="resourcePoolId">${buildResourcePoolOptions(references, draft.resourcePoolId)}</select>
                </label>
              ` : effectTypeUsesRestoreDisabled(draft.effectType) ? `
                <label class="field-stack">
                  <span>Restore Disabled</span>
                  <input data-creator-input="restoreDisabled" type="checkbox"${draft.restoreDisabled ? " checked" : ""}>
                </label>
              ` : `
                <div class="creator-auto-meta creator-small-meta">
                  <div><strong>Scale:</strong> base + per_level</div>
                </div>
              `}
            </div>
          ` : `
            <div class="creator-auto-meta creator-small-meta">
              <div><strong>Scale:</strong> not used by this effect type.</div>
            </div>
          `}
          <div class="field-grid creator-grid-2">
            <div>
              <strong>Modifiers</strong>
              ${buildModifierEditorMarkup(draft, references)}
            </div>
            <div>
              <strong>Flags</strong>
              ${buildFlagEditorMarkup(draft)}
            </div>
          </div>
        `,
      })}
      ${buildDisclosureSection({
        title: "Payload Preview",
        collapsed: payloadCollapsed,
        action: "toggleEffectsPayload",
        bodyMarkup: `
          <label class="field-stack">
            <textarea rows="14" readonly>${escapeHtml(prettyJson(buildEffectPayload(draft, auto)))}</textarea>
          </label>
        `,
      })}
    </form>
  `;
}

function buildAbilityEffectLinksEditorMarkup(draft, references) {
  const links = Array.isArray(draft.effectLinks) ? draft.effectLinks : [];
  const selectedIds = links.map((entry) => entry.effectDefId).filter(Boolean);
  if (!links.length) {
    return `<div class="creator-empty">No effect links yet. Add one if this ability should apply saved effect templates.</div>`;
  }
  return links
    .map((link, index) => `
      <div class="creator-link-card" data-creator-ability-effect-row="${index}">
        <div class="creator-link-head">
          <strong>Effect Link ${index + 1}</strong>
          <button type="button" class="secondary" data-creator-ability-effect-remove="${index}">Remove</button>
        </div>
        <label class="field-stack">
          <span>Effect Template</span>
          <select data-creator-ability-effect-input="effectDefId" data-ability-effect-index="${index}">
            ${buildEffectOptions(references, link.effectDefId, selectedIds)}
          </select>
        </label>
        <div class="creator-auto-meta creator-small-meta">
          <div><strong>Summary:</strong> ${escapeHtml(buildEffectReferenceSummary(findEffectReferenceById(references, link.effectDefId)))}</div>
        </div>
      </div>
    `)
    .join("");
}

function buildAbilitySingleLevelFields(level, index, {
  isTechnical = false,
  showResourceCost = true,
  showDuration = true,
  showAttackFields = false,
  showSpecialFields = false,
} = {}) {
  return `
    <div class="field-grid creator-grid-4">
      ${!isTechnical ? `
        <label class="field-stack">
          <span>Level</span>
          <input data-creator-ability-level-input="abilityLevel" data-ability-level-index="${index}" type="number" min="1" max="5" value="${escapeHtml(level.abilityLevel)}">
        </label>
      ` : `
        <div class="creator-auto-meta creator-small-meta">
          <div><strong>Level:</strong> internal Level 1 only</div>
        </div>
      `}
      ${showResourceCost ? `
        <label class="field-stack">
          <span>Resource Cost</span>
          <input data-creator-ability-level-input="resourceCost" data-ability-level-index="${index}" type="number" min="0" value="${escapeHtml(level.resourceCost)}">
        </label>
      ` : ""}
      ${showDuration ? `
        <label class="field-stack">
          <span>Duration</span>
          <input data-creator-ability-level-input="durationRounds" data-ability-level-index="${index}" type="number" min="0" value="${escapeHtml(level.durationRounds)}" placeholder="blank = none">
        </label>
      ` : ""}
    </div>
    ${showAttackFields ? `
      <div class="field-grid creator-grid-3">
        <label class="field-stack">
          <span>Attack Accuracy</span>
          <input data-creator-ability-level-input="attackAccuracyBonus" data-ability-level-index="${index}" type="number" value="${escapeHtml(level.attackAccuracyBonus)}">
        </label>
        <label class="field-stack">
          <span>Attack Damage</span>
          <input data-creator-ability-level-input="attackDamageBonus" data-ability-level-index="${index}" type="number" value="${escapeHtml(level.attackDamageBonus)}">
        </label>
        <label class="field-stack">
          <span>Armor Pierce</span>
          <input data-creator-ability-level-input="attackArmorPierce" data-ability-level-index="${index}" type="number" value="${escapeHtml(level.attackArmorPierce)}">
        </label>
      </div>
    ` : ""}
    ${showSpecialFields ? `
      <div class="field-grid creator-grid-2">
        <label class="field-stack">
          <span>Special Armor</span>
          <input data-creator-ability-level-input="specialArmorValue" data-ability-level-index="${index}" type="number" min="0" value="${escapeHtml(level.specialArmorValue)}" placeholder="blank = none">
        </label>
        <label class="field-stack">
          <span>Special Max Critical</span>
          <input data-creator-ability-level-input="specialMaxCritical" data-ability-level-index="${index}" type="number" min="0" value="${escapeHtml(level.specialMaxCritical)}" placeholder="blank = none">
        </label>
      </div>
    ` : ""}
  `;
}

function buildAbilityLevelsEditorMarkup(draft) {
  const normalizedDraft = normalizeAbilityEditorDraft(draft);
  const levels = Array.isArray(normalizedDraft.levels) ? normalizedDraft.levels : [createEmptyAbilityLevelDraft(1)];
  const isTechnical = abilityIsTechnical(normalizedDraft.sourceLabel);
  const showSpecialFields = abilityUsesSpecialFields(normalizedDraft.resolutionMode);
  const showAttackFields = abilityUsesAttackFields(normalizedDraft.uiKind, normalizedDraft.resolutionMode) && !showSpecialFields;
  const showResourceCost = !isTechnical;
  const showDuration = !isTechnical && !showSpecialFields;
  if (isTechnical) {
    const level = levels[0] ?? createEmptyAbilityLevelDraft(1);
    return `
      <div class="creator-link-card" data-creator-ability-level-row="0">
        <div class="creator-link-head">
          <strong>Technical Settings</strong>
        </div>
        ${buildAbilitySingleLevelFields(level, 0, { isTechnical: true, showResourceCost, showDuration, showAttackFields, showSpecialFields })}
      </div>
    `;
  }
  return levels
    .map((level, index) => `
      <div class="creator-link-card" data-creator-ability-level-row="${index}">
        <div class="creator-link-head">
          <strong>Level ${escapeHtml(level.abilityLevel || String(index + 1))}</strong>
          <button type="button" class="secondary" data-creator-ability-level-remove="${index}"${levels.length > 1 ? "" : " disabled"}>Remove</button>
        </div>
        ${buildAbilitySingleLevelFields(level, index, { showResourceCost, showDuration, showAttackFields, showSpecialFields })}
      </div>
    `)
    .join("");
}

function buildAbilityEditorMarkup(state, references) {
  const draft = normalizeAbilityEditorDraft(state.drafts.abilities);
  const auto = generatedAbilityPreview(draft, state);
  const kindOptions = ABILITY_UI_KIND_OPTIONS
    .map((option) => `<option value="${escapeHtml(option.value)}"${draft.uiKind === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  const sourceOptions = ABILITY_SOURCE_LABEL_OPTIONS
    .map((option) => `<option value="${escapeHtml(option.value)}"${draft.sourceLabel === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  const allowedTargetTypes = getAllowedTargetTypesForAbility(draft.uiKind, draft.resolutionMode);
  const targetOptions = ABILITY_TARGET_OPTIONS
    .filter((option) => allowedTargetTypes.includes(option.value))
    .map((option) => `<option value="${escapeHtml(option.value)}"${draft.targetType === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  const attackTypeOptions = ABILITY_ATTACK_TYPE_OPTIONS
    .map((option) => `<option value="${escapeHtml(option.value)}"${draft.attackType === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  const rangeModeOptions = ABILITY_RANGE_MODE_OPTIONS
    .map((option) => `<option value="${escapeHtml(option.value)}"${draft.rangeMode === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  const payloadCollapsed = Boolean(state.collapsed.abilitiesPayload);
  const levelsCollapsed = Boolean(state.collapsed.abilitiesLevels);
  const showSpecialFields = abilityUsesSpecialFields(draft.resolutionMode);
  const showAttackFields = abilityUsesAttackFields(draft.uiKind, draft.resolutionMode) && !showSpecialFields;
  const showEffectLinks = abilityUsesEffectLinks(draft.resolutionMode);
  const hideRangeForMelee = showAttackFields && String(draft.attackType ?? "").trim() === "melee";
  const summaryItems = getAbilityPayloadSummary(draft);

  return `
    <div class="creator-editor-head">
      <div>
        <div class="creator-editor-title">${escapeHtml(draft.name || "New Ability Draft")}</div>
        <div class="muted">${draft.id ? "Editing saved definition." : "Draft is local until Save."}</div>
      </div>
      <div class="creator-pill${state.dirty.abilities ? " dirty" : ""}" data-creator-dirty-pill="abilities">${state.dirty.abilities ? "Unsaved" : "Saved / clean"}</div>
    </div>
    <div class="button-row">
      <button type="button" data-creator-action="newDraft">Create New</button>
      <button type="button" class="secondary" data-creator-action="duplicateDraft">Duplicate</button>
      <button type="button" data-creator-action="saveDraft">Save</button>
      <button type="button" class="secondary" data-creator-action="reloadSelected"${draft.id ? "" : " disabled"}>Reload</button>
      <button type="button" class="secondary" data-creator-action="deleteSelected"${draft.id ? "" : " disabled"}>Delete</button>
    </div>
    <form class="creator-form" data-creator-form="abilities">
      <label class="field-stack">
        <span>Name</span>
        <input data-creator-input="name" type="text" value="${escapeHtml(draft.name)}" placeholder="Etheric Lattice">
      </label>
      <div class="field-grid creator-grid-4">
        <label class="field-stack">
          <span>Category</span>
          <select data-creator-input="uiKind">${kindOptions}</select>
        </label>
        <label class="field-stack">
          <span>Source</span>
          <select data-creator-input="sourceLabel">${sourceOptions}</select>
        </label>
        <div class="field-stack">
          <span>Resolution</span>
          <div class="creator-auto-meta creator-small-meta">
            <div><strong>Auto:</strong> ${escapeHtml(getAbilityOptionLabel(ABILITY_RESOLUTION_OPTIONS, draft.resolutionMode, "Narrative / Utility"))}</div>
          </div>
        </div>
        ${allowedTargetTypes.length <= 1 ? `
          <div class="field-stack">
            <span>Target</span>
            <div class="creator-auto-meta creator-small-meta">
            <div><strong>Target:</strong> ${escapeHtml(getAbilityOptionLabel(ABILITY_TARGET_OPTIONS, draft.targetType, "No Target"))}</div>
            </div>
          </div>
        ` : `
          <label class="field-stack">
            <span>Target</span>
            <select data-creator-input="targetType">${targetOptions}</select>
          </label>
        `}
      </div>
      <div class="creator-auto-meta">
        ${summaryItems.map((item) => `<div><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</div>`).join("")}
      </div>
      <div class="field-grid creator-grid-3">
        ${showAttackFields ? `
          <label class="field-stack">
            <span>Attack Type</span>
            <select data-creator-input="attackType">${attackTypeOptions}</select>
          </label>
        ` : `
            <div class="creator-auto-meta creator-small-meta">
              <div><strong>Attack Type:</strong> not used by this ability.</div>
            </div>
        `}
        ${hideRangeForMelee ? `
          <div class="creator-auto-meta creator-small-meta">
            <div><strong>Range:</strong> melee uses fixed 2m.</div>
          </div>
        ` : `
          <label class="field-stack">
            <span>Range</span>
            <select data-creator-input="rangeMode">${rangeModeOptions}</select>
          </label>
        `}
        ${hideRangeForMelee ? `
          <div class="creator-auto-meta creator-small-meta">
            <div><strong>Max Distance:</strong> 2m fixed.</div>
          </div>
        ` : `
          <label class="field-stack">
            <span>Max Distance (m)</span>
            <input data-creator-input="maxDistanceM" type="number" min="0" value="${escapeHtml(draft.maxDistanceM)}"${draft.rangeMode === "limited" ? "" : " disabled"} placeholder="blank = no limit">
          </label>
        `}
      </div>
      <label class="field-stack">
        <span>Description</span>
        <textarea data-creator-input="description" rows="4" placeholder="Short GM-facing description">${escapeHtml(draft.description)}</textarea>
      </label>
      ${showEffectLinks ? `
        <div class="creator-links-block">
          <div class="creator-links-head">
            <span>Effect Links</span>
            <button type="button" data-creator-action="addAbilityEffectLink">Add Effect</button>
          </div>
          ${buildAbilityEffectLinksEditorMarkup(draft, references)}
        </div>
      ` : `
        <div class="creator-auto-meta creator-small-meta">
          <div><strong>Effect Links:</strong> this resolution mode does not apply effect templates.</div>
        </div>
      `}
      ${buildDisclosureSection({
        title: abilityIsTechnical(draft.sourceLabel) ? "Technical Settings" : "Levels",
        collapsed: levelsCollapsed,
        action: "toggleAbilitiesLevels",
        summary: abilityIsTechnical(draft.sourceLabel) ? "single internal runtime block" : `${Array.isArray(draft.levels) ? draft.levels.length : 0} level(s)`,
        actionsMarkup: abilityIsTechnical(draft.sourceLabel)
          ? ""
          : `
            <div class="button-row compact">
              <button type="button" class="secondary" data-creator-action="addAbilityLevel">Add Level</button>
              <button type="button" class="secondary" data-creator-action="fillAbilityLevels">Fill 1-5</button>
              <button type="button" class="secondary" data-creator-action="copyAbilityLevelsDown">Copy Level Down</button>
              <button type="button" class="secondary" data-creator-action="clearAbilityLevels">Clear Levels</button>
            </div>
          `,
        bodyMarkup: buildAbilityLevelsEditorMarkup(draft),
      })}
      ${buildDisclosureSection({
        title: "Payload Preview",
        collapsed: payloadCollapsed,
        action: "toggleAbilitiesPayload",
        bodyMarkup: `
          <div class="creator-auto-meta">
            ${summaryItems.map((item) => `<div><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</div>`).join("")}
          </div>
          <label class="field-stack">
            <textarea rows="16" readonly>${escapeHtml(prettyJson(buildAbilityPayload(draft, auto)))}</textarea>
          </label>
        `,
      })}
    </form>
  `;
}

function buildAbilityLinksEditorMarkup(draft, references) {
  const links = Array.isArray(draft.abilityLinks) ? draft.abilityLinks : [];
  const selectedIds = links.map((entry) => entry.abilityDefId).filter(Boolean);
  if (!links.length) {
    return `<div class="creator-empty">No ability links yet. Add one to connect an existing ability to this equipment model.</div>`;
  }

  return links
    .map((link, index) => {
      const passive = link.grantMode === "passive";
      const reloadMode = String(link.reloadMode ?? "");
      return `
        <div class="creator-link-card" data-creator-link-row="${index}">
          <div class="creator-link-head">
            <strong>Ability Link ${index + 1}</strong>
            <button type="button" class="secondary" data-creator-link-remove="${index}">Remove</button>
          </div>
          <div class="field-grid creator-grid-2">
            <label class="field-stack">
              <span>Ability</span>
              <select data-creator-link-input="abilityDefId" data-link-index="${index}">
                ${buildAbilityOptions(references, link.abilityDefId, selectedIds)}
              </select>
            </label>
            <label class="field-stack">
              <span>Grant Mode</span>
              <select data-creator-link-input="grantMode" data-link-index="${index}">
                <option value="activated"${link.grantMode === "activated" ? " selected" : ""}>Active</option>
                <option value="passive"${passive ? " selected" : ""}>Passive</option>
              </select>
            </label>
          </div>
          ${passive ? `
            <div class="creator-auto-meta creator-small-meta">
              <div><strong>Passive:</strong> always active while the equipment is equipped.</div>
            </div>
          ` : `
            <div class="field-grid creator-grid-2">
              ${buildOptionalNumberField({
                label: "Duration",
                field: "durationRounds",
                index,
                value: link.durationRounds,
                mode: link.durationRoundsMode,
              })}
              ${buildOptionalNumberField({
                label: "Charges",
                field: "charges",
                index,
                value: link.charges,
                mode: link.chargesMode,
              })}
              ${buildOptionalNumberField({
                label: "Cooldown",
                field: "cooldownRounds",
                index,
                value: link.cooldownRounds,
                mode: link.cooldownRoundsMode,
              })}
              <div class="creator-small-stack">
                <span>Reload</span>
                <div class="creator-mini-grid creator-mini-grid-wide">
                  <select data-creator-link-input="reloadMode" data-link-index="${index}">
                    ${RELOAD_MODES.map((mode) => `<option value="${escapeHtml(mode.value)}"${reloadMode === mode.value ? " selected" : ""}>${escapeHtml(mode.label)}</option>`).join("")}
                  </select>
                  <select data-creator-link-input="reloadItemCode" data-link-index="${index}"${reloadMode ? "" : " disabled"}>
                    ${buildItemOptions(references, link.reloadItemCode)}
                  </select>
                </div>
              </div>
            </div>
          `}
        </div>
      `;
    })
    .join("");
}

function buildEquipmentEditorMarkup(state, references) {
  const draft = state.drafts.equipment;
  const auto = generatedEquipmentPreview(draft, state);
  const types = getEquipmentUiTypes(references);
  const showProtectionSlots = shouldShowProtectionSlots(draft.itemType);
  const allowedBodyPartCodes = getEffectiveAllowedBodyPartCodes(draft);
  const advancedFlagsCount = Object.keys(toPlainObject(draft.flagsExtraData)).length;
  const advancedEffectDataCount = Object.keys(toPlainObject(draft.effectDataExtraData)).length;
  const payloadCollapsed = Boolean(state.collapsed.equipmentPayload);
  const dataModifiersCollapsed = Boolean(state.collapsed.equipmentDataModifiers);
  const typeOptions = types
    .map((itemType) => `<option value="${escapeHtml(itemType)}"${draft.itemType === itemType ? " selected" : ""}>${escapeHtml(itemType)}</option>`)
    .join("");
  const payloadPreview = (() => {
    try {
      return prettyJson(buildEquipmentPayload(draft, auto));
    } catch (_error) {
      return prettyJson({ draft });
    }
  })();

  return `
    <div class="creator-editor-head">
      <div>
        <div class="creator-editor-title">${escapeHtml(draft.name || "New Equipment Draft")}</div>
        <div class="muted">${draft.id ? "Editing saved definition." : "Draft is local until Save."}</div>
      </div>
      <div class="creator-pill${state.dirty.equipment ? " dirty" : ""}" data-creator-dirty-pill="equipment">${state.dirty.equipment ? "Unsaved" : "Saved / clean"}</div>
    </div>
    <div class="button-row">
      <button type="button" data-creator-action="newDraft">Create New</button>
      <button type="button" class="secondary" data-creator-action="duplicateDraft">Duplicate</button>
      <button type="button" data-creator-action="saveDraft">Save</button>
      <button type="button" class="secondary" data-creator-action="reloadSelected"${draft.id ? "" : " disabled"}>Reload</button>
      <button type="button" class="secondary" data-creator-action="deleteSelected"${draft.id ? "" : " disabled"}>Delete</button>
    </div>
    <form class="creator-form" data-creator-form="equipment">
      <label class="field-stack">
        <span>Name</span>
        <input data-creator-input="name" type="text" value="${escapeHtml(draft.name)}" placeholder="Frontier Plate">
      </label>
      <div class="field-grid creator-grid-3">
        <label class="field-stack">
          <span>Item Type</span>
          <select data-creator-input="itemType">${typeOptions}</select>
        </label>
        <label class="field-stack">
          <span>Armor Value</span>
          <input data-creator-input="armorValue" type="number" value="${escapeHtml(draft.armorValue)}">
        </label>
        <label class="field-stack">
          <span>Armor Max Critical</span>
          <input data-creator-input="armorMaxCritical" type="number" value="${escapeHtml(draft.armorMaxCritical)}">
        </label>
      </div>
      <label class="field-stack">
        <span>Description</span>
        <textarea data-creator-input="description" rows="4" placeholder="Short GM-facing description">${escapeHtml(draft.description)}</textarea>
      </label>
      ${showProtectionSlots ? `
      <div class="creator-section-card">
        <div class="creator-section-head">
          <strong>Protection Slots</strong>
          <span class="muted">Structured creator fields instead of raw JSON.</span>
        </div>
        <div class="field-stack">
          <span>Allowed Body Parts</span>
          <div class="creator-check-grid">
            ${buildBodyPartCheckboxMarkup(references, allowedBodyPartCodes)}
          </div>
        </div>
        ${(advancedFlagsCount || advancedEffectDataCount) ? `
          <div class="creator-auto-meta creator-small-meta">
            ${advancedFlagsCount ? `<div><strong>Preserved extra flags:</strong> ${escapeHtml(String(advancedFlagsCount))}</div>` : ""}
            ${advancedEffectDataCount ? `<div><strong>Preserved extra data keys:</strong> ${escapeHtml(String(advancedEffectDataCount))}</div>` : ""}
          </div>
        ` : ""}
      </div>
      ` : ""}
      ${buildDisclosureSection({
        title: "Data & Modifiers",
        collapsed: dataModifiersCollapsed,
        action: "toggleEquipmentDataModifiers",
        summary: draft.modifiers?.length
          ? `${draft.modifiers.length} modifier(s)`
          : (draft.notes || draft.reservedForFuture ? "configured" : ""),
        actionsMarkup: `<button type="button" data-creator-action="addModifier">Add Modifier</button>`,
        bodyMarkup: `
          <div class="field-grid creator-grid-2">
            <label class="toggle-inline creator-toggle-card">
              <input data-creator-input="reservedForFuture" type="checkbox"${draft.reservedForFuture ? " checked" : ""}>
              <span>Reserved for future logic</span>
            </label>
          </div>
          <label class="field-stack">
            <span>Notes</span>
            <textarea data-creator-input="notes" rows="4" placeholder="Optional backend note for GM / future implementation">${escapeHtml(draft.notes)}</textarea>
          </label>
          <div class="creator-links-block">
            ${buildModifierEditorMarkup(draft, references)}
          </div>
        `,
      })}
      <div class="creator-links-block">
        <div class="creator-links-head">
          <span>Ability Links</span>
          <button type="button" data-creator-action="addAbilityLink">Add Ability Link</button>
        </div>
        ${buildAbilityLinksEditorMarkup(draft, references)}
      </div>
      ${buildDisclosureSection({
        title: "Payload Preview",
        collapsed: payloadCollapsed,
        action: "toggleEquipmentPayload",
        bodyMarkup: `
          <label class="field-stack">
            <textarea rows="12" readonly>${escapeHtml(payloadPreview)}</textarea>
          </label>
        `,
      })}
    </form>
  `;
}

function buildPanelMarkup(state, access) {
  if (!access.isGm) {
    return `
      <section class="panel">
        <div class="panel-title">Creator Menu</div>
        <p class="muted">Creator tools are GM-only. Players should not edit catalog definitions from this surface.</p>
      </section>
    `;
  }

  if (!access.configured) {
    return `
      <section class="panel">
        <div class="panel-title">Creator Menu</div>
        <p class="muted">Configure Supabase room settings above, then the creator tabs for Skills, Effects, Abilities, and Equipment Models will unlock here.</p>
      </section>
    `;
  }

  const references = state.references ?? {};
  const listMarkup = state.activeTab === "skills"
    ? buildListMarkup("skills", state.lists.skills, state.selectedIds.skills)
    : state.activeTab === "effects"
    ? buildListMarkup("effects", state.lists.effects, state.selectedIds.effects)
    : state.activeTab === "abilities"
    ? buildListMarkup("abilities", state.lists.abilities, state.selectedIds.abilities)
    : buildListMarkup("equipment", state.lists.equipment, state.selectedIds.equipment);
  const filtersMarkup = state.activeTab === "skills"
    ? buildSkillFilterMarkup(state, references)
    : state.activeTab === "effects"
    ? buildEffectFilterMarkup(state)
    : state.activeTab === "abilities"
    ? buildAbilityFilterMarkup(state)
    : buildEquipmentFilterMarkup(state, references);
  const editorMarkup = state.activeTab === "skills"
    ? buildSkillEditorMarkup(state, references)
    : state.activeTab === "effects"
    ? buildEffectEditorMarkup(state, references)
    : state.activeTab === "abilities"
    ? buildAbilityEditorMarkup(state, references)
    : buildEquipmentEditorMarkup(state, references);
  const catalogCollapsed = state.activeTab === "skills"
    ? Boolean(state.collapsed.skillsCatalog)
    : state.activeTab === "effects"
    ? Boolean(state.collapsed.effectsCatalog)
    : state.activeTab === "abilities"
    ? Boolean(state.collapsed.abilitiesCatalog)
    : Boolean(state.collapsed.equipmentCatalog);
  const catalogMarkup = buildCatalogSection({
    title: state.activeTab === "skills" ? "Skill Catalog" : state.activeTab === "effects" ? "Effect Catalog" : state.activeTab === "abilities" ? "Ability Catalog" : "Equipment Catalog",
    count: state.activeTab === "skills" ? state.lists.skills.length : state.activeTab === "effects" ? state.lists.effects.length : state.activeTab === "abilities" ? state.lists.abilities.length : state.lists.equipment.length,
    collapsed: catalogCollapsed,
    action: state.activeTab === "skills" ? "toggleSkillsCatalog" : state.activeTab === "effects" ? "toggleEffectsCatalog" : state.activeTab === "abilities" ? "toggleAbilitiesCatalog" : "toggleEquipmentCatalog",
    bodyMarkup: listMarkup,
  });

  return `
    <section class="panel creator-panel">
      <div class="panel-title">Creator Menu</div>
      <p class="panel-note">Drafts stay local in the UI until you press Save. Code, tags, and sort order are generated automatically to keep catalog work fast for the GM.</p>
      <nav class="creator-tabs">${buildTabButtons(state.activeTab)}</nav>
      ${filtersMarkup}
      ${state.error ? `<div class="creator-banner error">${escapeHtml(state.error)}</div>` : ""}
      ${state.info ? `<div class="creator-banner info">${escapeHtml(state.info)}</div>` : ""}
      ${state.loading ? `<div class="creator-banner info">Loading: ${escapeHtml(state.loadingLabel || "working...")}</div>` : ""}
      <div class="creator-layout">
        ${catalogMarkup}
        <div class="creator-editor">
          ${editorMarkup}
        </div>
      </div>
    </section>
  `;
}

function readSkillDraftFromDom(root) {
  const form = root.querySelector('[data-creator-form="skills"]');
  if (!(form instanceof HTMLElement)) {
    return createEmptySkillDraft();
  }
  const query = (field) => form.querySelector(`[data-creator-input="${field}"]`);
  const skillGroup = String(query("skillGroup")?.value ?? "combat");
  const skillConfig = getSkillSubcategoryConfig(skillGroup, String(query("skillSubcategory")?.value ?? ""));
  return {
    id: String(form.dataset.creatorEntityId ?? ""),
    name: String(query("name")?.value ?? ""),
    skillGroup,
    skillSubcategory: String(skillConfig.value ?? "melee"),
    category: String(skillConfig.backendCategory ?? "combat"),
    maxLevel: String(skillConfig.maxLevel ?? 5),
    mainAttributeId: String(query("mainAttributeId")?.value ?? ""),
    secondaryAttributeId: String(query("secondaryAttributeId")?.value ?? ""),
    description: String(query("description")?.value ?? ""),
  };
}

function readEffectDraftFromDom(root, fallbackDraft = createEmptyEffectDraft()) {
  const form = root.querySelector('[data-creator-form="effects"]');
  if (!(form instanceof HTMLElement)) {
    return cloneJson(fallbackDraft);
  }
  const query = (field) => form.querySelector(`[data-creator-input="${field}"]`);
  const modifierRows = Array.from(form.querySelectorAll("[data-creator-modifier-row]"));
  const modifiers = modifierRows.length
    ? modifierRows.map((row) => {
        const index = String(row.getAttribute("data-creator-modifier-row") ?? "");
        const fallbackModifier = Array.isArray(fallbackDraft.modifiers)
          ? fallbackDraft.modifiers[Number.parseInt(index, 10)] ?? createEmptyModifierDraft()
          : createEmptyModifierDraft();
        const modifierQuery = (field) => form.querySelector(`[data-creator-modifier-input="${field}"][data-modifier-index="${index}"]`);
        return {
          target: String(modifierQuery("target")?.value ?? fallbackModifier.target ?? "attack_accuracy"),
          customTarget: String(modifierQuery("customTarget")?.value ?? fallbackModifier.customTarget ?? ""),
          attributeCode: String(modifierQuery("attributeCode")?.value ?? fallbackModifier.attributeCode ?? ""),
          skillCode: String(modifierQuery("skillCode")?.value ?? fallbackModifier.skillCode ?? ""),
          value: String(modifierQuery("value")?.value ?? fallbackModifier.value ?? "0"),
        };
      })
    : cloneJson(fallbackDraft.modifiers ?? []);
  const flagRows = Array.from(form.querySelectorAll("[data-creator-flag-row]"));
  const flags = flagRows.length
    ? flagRows.map((row) => {
        const index = String(row.getAttribute("data-creator-flag-row") ?? "");
        const fallbackFlag = Array.isArray(fallbackDraft.flags)
          ? fallbackDraft.flags[Number.parseInt(index, 10)] ?? createEmptyFlagDraft()
          : createEmptyFlagDraft();
        const flagQuery = (field) => form.querySelector(`[data-creator-flag-input="${field}"][data-flag-index="${index}"]`);
        return {
          key: String(flagQuery("key")?.value ?? fallbackFlag.key ?? "helpless"),
          customKey: String(flagQuery("customKey")?.value ?? fallbackFlag.customKey ?? ""),
          enabled: Boolean(flagQuery("enabled")?.checked ?? fallbackFlag.enabled ?? true),
        };
      })
    : cloneJson(fallbackDraft.flags ?? []);
  const effectType = String(query("effectType")?.value ?? fallbackDraft.effectType ?? "modifiers_flags");
  return {
    id: String(form.dataset.creatorEntityId ?? ""),
    name: String(query("name")?.value ?? ""),
    uiCategory: String(query("uiCategory")?.value ?? fallbackDraft.uiCategory ?? "utility"),
    description: String(query("description")?.value ?? fallbackDraft.description ?? ""),
    defaultDurationType: String(query("defaultDurationType")?.value ?? fallbackDraft.defaultDurationType ?? "manual"),
    defaultRounds: String(query("defaultRounds")?.value ?? fallbackDraft.defaultRounds ?? ""),
    stackingMode: String(query("stackingMode")?.value ?? fallbackDraft.stackingMode ?? "replace"),
    isNegative: Boolean(query("isNegative")?.checked ?? fallbackDraft.isNegative),
    isNarrative: Boolean(query("isNarrative")?.checked ?? fallbackDraft.isNarrative),
    effectType,
    targetScope: String(query("targetScope")?.value ?? fallbackDraft.targetScope ?? getDefaultTargetScopeForEffectType(effectType)),
    amountMetric: String(query("amountMetric")?.value ?? fallbackDraft.amountMetric ?? getDefaultMetricForEffectType(effectType)),
    scaleBase: String(query("scaleBase")?.value ?? fallbackDraft.scaleBase ?? "0"),
    scalePerLevel: String(query("scalePerLevel")?.value ?? fallbackDraft.scalePerLevel ?? "0"),
    tickPhase: String(query("tickPhase")?.value ?? fallbackDraft.tickPhase ?? "turn_end"),
    resourcePoolId: String(query("resourcePoolId")?.value ?? fallbackDraft.resourcePoolId ?? ""),
    restoreDisabled: Boolean(query("restoreDisabled")?.checked ?? fallbackDraft.restoreDisabled),
    modifiers,
    flags,
    dataExtraData: cloneJson(fallbackDraft.dataExtraData ?? {}),
    payloadExtraData: cloneJson(fallbackDraft.payloadExtraData ?? {}),
  };
}

function readAbilityDraftFromDom(root, fallbackDraft = createEmptyAbilityDraft()) {
  const form = root.querySelector('[data-creator-form="abilities"]');
  if (!(form instanceof HTMLElement)) {
    return cloneJson(fallbackDraft);
  }
  const query = (field) => form.querySelector(`[data-creator-input="${field}"]`);
  const effectLinks = Array.from(form.querySelectorAll("[data-creator-ability-effect-row]")).map((row) => {
    const index = String(row.getAttribute("data-creator-ability-effect-row") ?? "");
    const fallbackLink = Array.isArray(fallbackDraft.effectLinks)
      ? fallbackDraft.effectLinks[Number.parseInt(index, 10)] ?? createEmptyAbilityEffectLinkDraft()
      : createEmptyAbilityEffectLinkDraft();
    const effectQuery = (field) => form.querySelector(`[data-creator-ability-effect-input="${field}"][data-ability-effect-index="${index}"]`);
    return {
      effectDefId: String(effectQuery("effectDefId")?.value ?? fallbackLink.effectDefId ?? ""),
    };
  });
  const levelRows = Array.from(form.querySelectorAll("[data-creator-ability-level-row]"));
  const levels = levelRows.length
    ? levelRows.map((row, index) => {
        const rowIndex = String(row.getAttribute("data-creator-ability-level-row") ?? index);
        const fallbackLevel = Array.isArray(fallbackDraft.levels)
          ? fallbackDraft.levels[Number.parseInt(rowIndex, 10)] ?? createEmptyAbilityLevelDraft(index + 1)
          : createEmptyAbilityLevelDraft(index + 1);
        const levelQuery = (field) => form.querySelector(`[data-creator-ability-level-input="${field}"][data-ability-level-index="${rowIndex}"]`);
        return {
          id: String(fallbackLevel.id ?? ""),
          abilityLevel: String(levelQuery("abilityLevel")?.value ?? fallbackLevel.abilityLevel ?? String(index + 1)),
          resourceCost: String(levelQuery("resourceCost")?.value ?? fallbackLevel.resourceCost ?? "0"),
          durationRounds: String(levelQuery("durationRounds")?.value ?? fallbackLevel.durationRounds ?? ""),
          attackAccuracyBonus: String(levelQuery("attackAccuracyBonus")?.value ?? fallbackLevel.attackAccuracyBonus ?? "0"),
          attackDamageBonus: String(levelQuery("attackDamageBonus")?.value ?? fallbackLevel.attackDamageBonus ?? "0"),
          attackArmorPierce: String(levelQuery("attackArmorPierce")?.value ?? fallbackLevel.attackArmorPierce ?? "0"),
          specialArmorValue: String(levelQuery("specialArmorValue")?.value ?? fallbackLevel.specialArmorValue ?? ""),
          specialMaxCritical: String(levelQuery("specialMaxCritical")?.value ?? fallbackLevel.specialMaxCritical ?? ""),
          dataExtraData: cloneJson(fallbackLevel.dataExtraData ?? {}),
          effectDataExtraData: cloneJson(fallbackLevel.effectDataExtraData ?? {}),
        };
      })
    : cloneJson(fallbackDraft.levels ?? [createEmptyAbilityLevelDraft(1)]);
  const uiKind = String(query("uiKind")?.value ?? fallbackDraft.uiKind ?? "utility");
  const resolutionMode = String(query("resolutionMode")?.value ?? fallbackDraft.resolutionMode ?? getDefaultResolutionForAbilityKind(uiKind));
  const attackType = String(query("attackType")?.value ?? fallbackDraft.attackType ?? getDefaultAttackTypeForAbilityKind(uiKind));
  const isMelee = attackType === "melee";
  return normalizeAbilityEditorDraft({
    id: String(form.dataset.creatorEntityId ?? ""),
    name: String(query("name")?.value ?? ""),
    uiKind,
    sourceLabel: String(query("sourceLabel")?.value ?? fallbackDraft.sourceLabel ?? "technical"),
    resolutionMode,
    targetType: String(query("targetType")?.value ?? fallbackDraft.targetType ?? getDefaultTargetTypeForAbilityKind(uiKind, resolutionMode)),
    attackType,
    rangeMode: isMelee
      ? "limited"
      : String(query("rangeMode")?.value ?? fallbackDraft.rangeMode ?? "none"),
    maxDistanceM: isMelee
      ? "2"
      : String(query("maxDistanceM")?.value ?? fallbackDraft.maxDistanceM ?? ""),
    description: String(query("description")?.value ?? fallbackDraft.description ?? ""),
    effectLinks,
    levels,
    dataExtraData: cloneJson(fallbackDraft.dataExtraData ?? {}),
    effectDataExtraData: cloneJson(fallbackDraft.effectDataExtraData ?? {}),
  });
}

function readEquipmentDraftFromDom(root, fallbackDraft = createEmptyEquipmentDraft()) {
  const form = root.querySelector('[data-creator-form="equipment"]');
  if (!(form instanceof HTMLElement)) {
    return cloneJson(fallbackDraft);
  }
  const query = (field) => form.querySelector(`[data-creator-input="${field}"]`);
  const bodyPartCodes = Array.from(form.querySelectorAll("[data-creator-body-part-code]:checked"))
    .map((entry) => String(entry.getAttribute("data-creator-body-part-code") ?? "").trim())
    .filter(Boolean);
  const abilityLinks = Array.from(form.querySelectorAll("[data-creator-link-row]")).map((row) => {
    const index = String(row.getAttribute("data-creator-link-row") ?? "");
    const fallbackLink = Array.isArray(fallbackDraft.abilityLinks)
      ? fallbackDraft.abilityLinks[Number.parseInt(index, 10)] ?? createEmptyAbilityLinkDraft()
      : createEmptyAbilityLinkDraft();
    const linkQuery = (field) => form.querySelector(`[data-creator-link-input="${field}"][data-link-index="${index}"]`);
    const grantMode = String(linkQuery("grantMode")?.value ?? "activated");
    return {
      abilityDefId: String(linkQuery("abilityDefId")?.value ?? ""),
      grantMode,
      durationRoundsMode: String(linkQuery("durationRoundsMode")?.value ?? fallbackLink.durationRoundsMode ?? "none"),
      durationRounds: String(linkQuery("durationRounds")?.value ?? fallbackLink.durationRounds ?? ""),
      chargesMode: String(linkQuery("chargesMode")?.value ?? fallbackLink.chargesMode ?? "none"),
      charges: String(linkQuery("charges")?.value ?? fallbackLink.charges ?? ""),
      cooldownRoundsMode: String(linkQuery("cooldownRoundsMode")?.value ?? fallbackLink.cooldownRoundsMode ?? "none"),
      cooldownRounds: String(linkQuery("cooldownRounds")?.value ?? fallbackLink.cooldownRounds ?? ""),
      reloadMode: String(linkQuery("reloadMode")?.value ?? fallbackLink.reloadMode ?? ""),
      reloadItemCode: String(linkQuery("reloadItemCode")?.value ?? fallbackLink.reloadItemCode ?? ""),
    };
  });
  const modifierRows = Array.from(form.querySelectorAll("[data-creator-modifier-row]"));
  const modifiers = modifierRows.length
    ? modifierRows.map((row) => {
        const index = String(row.getAttribute("data-creator-modifier-row") ?? "");
        const fallbackModifier = Array.isArray(fallbackDraft.modifiers)
          ? fallbackDraft.modifiers[Number.parseInt(index, 10)] ?? createEmptyModifierDraft()
          : createEmptyModifierDraft();
        const modifierQuery = (field) => form.querySelector(`[data-creator-modifier-input="${field}"][data-modifier-index="${index}"]`);
        return {
          target: String(modifierQuery("target")?.value ?? fallbackModifier.target ?? "attack_accuracy"),
          customTarget: String(modifierQuery("customTarget")?.value ?? fallbackModifier.customTarget ?? ""),
          attributeCode: String(modifierQuery("attributeCode")?.value ?? fallbackModifier.attributeCode ?? ""),
          skillCode: String(modifierQuery("skillCode")?.value ?? fallbackModifier.skillCode ?? ""),
          value: String(modifierQuery("value")?.value ?? fallbackModifier.value ?? "0"),
        };
      })
    : cloneJson(fallbackDraft.modifiers ?? []);
  return {
    id: String(form.dataset.creatorEntityId ?? ""),
    name: String(query("name")?.value ?? ""),
    itemType: String(query("itemType")?.value ?? "armor"),
    description: String(query("description")?.value ?? ""),
    armorValue: String(query("armorValue")?.value ?? "0"),
    armorMaxCritical: String(query("armorMaxCritical")?.value ?? "0"),
    defaultBodyPartCode: getPrimaryBodyPartCode(bodyPartCodes, fallbackDraft.defaultBodyPartCode ?? ""),
    allowedBodyPartCodes: bodyPartCodes.length ? bodyPartCodes : cloneJson(fallbackDraft.allowedBodyPartCodes ?? []),
    reservedForFuture: query("reservedForFuture")
      ? Boolean(query("reservedForFuture")?.checked)
      : Boolean(fallbackDraft.reservedForFuture),
    notes: String(query("notes")?.value ?? fallbackDraft.notes ?? ""),
    modifiers,
    flagsExtraData: cloneJson(fallbackDraft.flagsExtraData ?? {}),
    effectDataExtraData: cloneJson(fallbackDraft.effectDataExtraData ?? {}),
    abilityLinks,
  };
}

function updateDirtyPill(root, kind, isDirty) {
  const pill = root.querySelector(`[data-creator-dirty-pill="${kind}"]`);
  if (!(pill instanceof HTMLElement)) {
    return;
  }
  pill.textContent = isDirty ? "Unsaved" : "Saved / clean";
  pill.classList.toggle("dirty", Boolean(isDirty));
}

export function mountCreatorMenu({
  root,
  runtime,
  getPlayer,
  getSettings,
  onDiagnostic = () => {},
}) {
  const state = createInitialState();

  function getAccess() {
    const player = getPlayer();
    const settings = getSettings();
    return {
      player,
      settings,
      isGm: player?.role === "GM",
      configured: hasSupabaseSettings(settings),
      settingsKey: hasSupabaseSettings(settings)
        ? `${settings.url}::${settings.apiKey}`
        : "",
    };
  }

  function captureActiveDraft() {
    if (state.activeTab === "skills") {
      state.drafts.skills = readSkillDraftFromDom(root);
    } else if (state.activeTab === "effects") {
      state.drafts.effects = readEffectDraftFromDom(root, state.drafts.effects);
    } else if (state.activeTab === "abilities") {
      state.drafts.abilities = readAbilityDraftFromDom(root, state.drafts.abilities);
    } else {
      state.drafts.equipment = readEquipmentDraftFromDom(root, state.drafts.equipment);
    }
  }

  function clearMessages() {
    state.error = "";
    state.info = "";
  }

  function resetLoadedData({ keepTab = true } = {}) {
    const activeTab = keepTab ? state.activeTab : "skills";
    state.references = null;
    state.loadedTabs = { skills: false, effects: false, abilities: false, equipment: false };
    state.lists = { skills: [], effects: [], abilities: [], equipment: [] };
    state.selectedIds = { skills: "", effects: "", abilities: "", equipment: "" };
    state.bundles = { skills: null, effects: null, abilities: null, equipment: null };
    state.drafts = {
      skills: createEmptySkillDraft(),
      effects: createEmptyEffectDraft(),
      abilities: createEmptyAbilityDraft(),
      equipment: createEmptyEquipmentDraft(),
    };
    state.dirty = { skills: false, effects: false, abilities: false, equipment: false };
    state.activeTab = activeTab;
  }

  function render() {
    const access = getAccess();
    root.innerHTML = buildPanelMarkup(state, access);

    const form = root.querySelector(`[data-creator-form="${state.activeTab}"]`);
    if (form instanceof HTMLElement) {
      form.dataset.creatorEntityId = state.drafts[state.activeTab].id || "";
      form.addEventListener("input", () => {
        captureActiveDraft();
        state.dirty[state.activeTab] = true;
        clearMessages();
        updateDirtyPill(root, state.activeTab, true);
      });
      form.addEventListener("change", (event) => {
        captureActiveDraft();
        state.dirty[state.activeTab] = true;
        clearMessages();
        updateDirtyPill(root, state.activeTab, true);
        const target = event.target;
        if (
          target instanceof HTMLElement
          && (
            (
              target.hasAttribute("data-creator-input")
              && ["skillGroup", "effectType", "defaultDurationType", "uiKind", "sourceLabel", "resolutionMode", "rangeMode", "attackType", "targetType"].includes(String(target.getAttribute("data-creator-input")))
            )
            || (
              target.hasAttribute("data-creator-link-input")
              && ["grantMode", "reloadMode", "durationRoundsMode", "chargesMode", "cooldownRoundsMode"].includes(String(target.getAttribute("data-creator-link-input")))
            )
            || (
              target.hasAttribute("data-creator-input")
              && ["itemType"].includes(String(target.getAttribute("data-creator-input")))
            )
            || target.hasAttribute("data-creator-modifier-input")
            || target.hasAttribute("data-creator-flag-input")
            || target.hasAttribute("data-creator-ability-effect-input")
            || target.hasAttribute("data-creator-ability-level-input")
          )
        ) {
          render();
        }
      });
    }

    root.querySelectorAll("[data-creator-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        captureActiveDraft();
        state.activeTab = button.dataset.creatorTab;
        clearMessages();
        render();
        void ensureReadyForActiveTab();
      });
    });

    root.querySelectorAll("[data-creator-open]").forEach((button) => {
      button.addEventListener("click", () => {
        const [kind, id] = String(button.dataset.creatorOpen ?? "").split(":");
        if (!kind || !id) return;
        captureActiveDraft();
        void openRecord(kind, id);
      });
    });

    root.querySelectorAll("[data-creator-link-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        captureActiveDraft();
        const index = Number.parseInt(String(button.dataset.creatorLinkRemove ?? ""), 10);
        if (!Number.isFinite(index)) return;
        state.drafts.equipment.abilityLinks.splice(index, 1);
        state.dirty.equipment = true;
        clearMessages();
        render();
      });
    });

    root.querySelectorAll("[data-creator-ability-effect-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        captureActiveDraft();
        const index = Number.parseInt(String(button.dataset.creatorAbilityEffectRemove ?? ""), 10);
        if (!Number.isFinite(index)) return;
        state.drafts.abilities.effectLinks.splice(index, 1);
        state.dirty.abilities = true;
        clearMessages();
        render();
      });
    });

    root.querySelectorAll("[data-creator-ability-level-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        captureActiveDraft();
        const index = Number.parseInt(String(button.dataset.creatorAbilityLevelRemove ?? ""), 10);
        if (!Number.isFinite(index)) return;
        if (Array.isArray(state.drafts.abilities.levels) && state.drafts.abilities.levels.length > 1) {
          state.drafts.abilities.levels.splice(index, 1);
          state.drafts.abilities.levels = state.drafts.abilities.levels.map((entry, levelIndex) => ({
            ...entry,
            abilityLevel: String(levelIndex + 1),
          }));
          state.dirty.abilities = true;
          clearMessages();
          render();
        }
      });
    });

    root.querySelectorAll("[data-creator-modifier-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        captureActiveDraft();
        const index = Number.parseInt(String(button.dataset.creatorModifierRemove ?? ""), 10);
        if (!Number.isFinite(index)) return;
        if (state.activeTab === "effects") {
          state.drafts.effects.modifiers.splice(index, 1);
          state.dirty.effects = true;
        } else {
          state.drafts.equipment.modifiers.splice(index, 1);
          state.dirty.equipment = true;
        }
        clearMessages();
        render();
      });
    });

    root.querySelectorAll("[data-creator-flag-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        captureActiveDraft();
        const index = Number.parseInt(String(button.dataset.creatorFlagRemove ?? ""), 10);
        if (!Number.isFinite(index)) return;
        state.drafts.effects.flags.splice(index, 1);
        state.dirty.effects = true;
        clearMessages();
        render();
      });
    });

    root.querySelectorAll("[data-creator-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.creatorAction;
        switch (action) {
          case "applyFilters":
            captureActiveDraft();
            applyFiltersFromDom();
            void refreshActiveList();
            break;
          case "refreshList":
            captureActiveDraft();
            void refreshActiveList({ forceRefs: true });
            break;
          case "toggleSkillsCatalog":
            captureActiveDraft();
            state.collapsed.skillsCatalog = !state.collapsed.skillsCatalog;
            render();
            break;
          case "toggleEquipmentCatalog":
            captureActiveDraft();
            state.collapsed.equipmentCatalog = !state.collapsed.equipmentCatalog;
            render();
            break;
          case "toggleEffectsCatalog":
            captureActiveDraft();
            state.collapsed.effectsCatalog = !state.collapsed.effectsCatalog;
            render();
            break;
          case "toggleAbilitiesCatalog":
            captureActiveDraft();
            state.collapsed.abilitiesCatalog = !state.collapsed.abilitiesCatalog;
            render();
            break;
          case "toggleSkillsPayload":
            captureActiveDraft();
            state.collapsed.skillsPayload = !state.collapsed.skillsPayload;
            render();
            break;
          case "toggleEffectsPayload":
            captureActiveDraft();
            state.collapsed.effectsPayload = !state.collapsed.effectsPayload;
            render();
            break;
          case "toggleEffectsBehavior":
            captureActiveDraft();
            state.collapsed.effectsBehavior = !state.collapsed.effectsBehavior;
            render();
            break;
          case "toggleAbilitiesPayload":
            captureActiveDraft();
            state.collapsed.abilitiesPayload = !state.collapsed.abilitiesPayload;
            render();
            break;
          case "toggleAbilitiesLevels":
            captureActiveDraft();
            state.collapsed.abilitiesLevels = !state.collapsed.abilitiesLevels;
            render();
            break;
          case "toggleEquipmentPayload":
            captureActiveDraft();
            state.collapsed.equipmentPayload = !state.collapsed.equipmentPayload;
            render();
            break;
          case "toggleEquipmentDataModifiers":
            captureActiveDraft();
            state.collapsed.equipmentDataModifiers = !state.collapsed.equipmentDataModifiers;
            render();
            break;
          case "newDraft":
            captureActiveDraft();
            createNewDraft();
            break;
          case "duplicateDraft":
            captureActiveDraft();
            duplicateDraft();
            break;
          case "saveDraft":
            captureActiveDraft();
            void saveDraft();
            break;
          case "reloadSelected":
            captureActiveDraft();
            void reloadSelected();
            break;
          case "deleteSelected":
            captureActiveDraft();
            void deleteSelected();
            break;
          case "addAbilityLink":
            captureActiveDraft();
            state.drafts.equipment.abilityLinks.push(createEmptyAbilityLinkDraft());
            state.dirty.equipment = true;
            clearMessages();
            render();
            break;
          case "addAbilityEffectLink":
            captureActiveDraft();
            state.drafts.abilities.effectLinks.push(createEmptyAbilityEffectLinkDraft());
            state.dirty.abilities = true;
            clearMessages();
            render();
            break;
          case "addAbilityLevel":
            captureActiveDraft();
            state.drafts.abilities.levels.push(createEmptyAbilityLevelDraft((state.drafts.abilities.levels?.length ?? 0) + 1));
            state.drafts.abilities = normalizeAbilityEditorDraft(state.drafts.abilities);
            state.dirty.abilities = true;
            state.collapsed.abilitiesLevels = false;
            clearMessages();
            render();
            break;
          case "fillAbilityLevels":
            captureActiveDraft();
            {
              const existingLevels = Array.isArray(state.drafts.abilities.levels) ? state.drafts.abilities.levels : [];
              const nextLevels = [];
              for (let index = 0; index < 5; index += 1) {
                const sourceLevel = existingLevels[index] ?? existingLevels[existingLevels.length - 1] ?? createEmptyAbilityLevelDraft(index + 1);
                nextLevels.push({
                  ...cloneJson(sourceLevel),
                  id: index < existingLevels.length ? String(sourceLevel?.id ?? "") : "",
                  abilityLevel: String(index + 1),
                });
              }
              state.drafts.abilities.levels = nextLevels;
              state.drafts.abilities = normalizeAbilityEditorDraft(state.drafts.abilities);
              state.dirty.abilities = true;
              state.collapsed.abilitiesLevels = false;
              clearMessages();
              render();
            }
            break;
          case "copyAbilityLevelsDown":
            captureActiveDraft();
            {
              const existingLevels = Array.isArray(state.drafts.abilities.levels) && state.drafts.abilities.levels.length
                ? state.drafts.abilities.levels.map((entry) => ({ ...cloneJson(entry) }))
                : [createEmptyAbilityLevelDraft(1)];
              const nextLevels = existingLevels.map((entry, index) => {
                if (index === 0) {
                  return {
                    ...cloneJson(entry),
                    abilityLevel: "1",
                  };
                }
                return {
                  ...cloneJson(existingLevels[index - 1]),
                  id: String(entry?.id ?? ""),
                  abilityLevel: String(index + 1),
                };
              });
              state.drafts.abilities.levels = nextLevels;
              state.drafts.abilities = normalizeAbilityEditorDraft(state.drafts.abilities);
              state.dirty.abilities = true;
              state.collapsed.abilitiesLevels = false;
              clearMessages();
              render();
            }
            break;
          case "clearAbilityLevels":
            captureActiveDraft();
            state.drafts.abilities.levels = [createEmptyAbilityLevelDraft(1)];
            state.drafts.abilities = normalizeAbilityEditorDraft(state.drafts.abilities);
            state.dirty.abilities = true;
            state.collapsed.abilitiesLevels = false;
            clearMessages();
            render();
            break;
          case "addModifier":
            captureActiveDraft();
            if (state.activeTab === "effects") {
              state.drafts.effects.modifiers.push(createEmptyModifierDraft());
              state.dirty.effects = true;
              state.collapsed.effectsBehavior = false;
            } else {
              state.drafts.equipment.modifiers.push(createEmptyModifierDraft());
              state.dirty.equipment = true;
              state.collapsed.equipmentDataModifiers = false;
            }
            clearMessages();
            render();
            break;
          case "addFlag":
            captureActiveDraft();
            state.drafts.effects.flags.push(createEmptyFlagDraft());
            state.dirty.effects = true;
            state.collapsed.effectsBehavior = false;
            clearMessages();
            render();
            break;
          default:
            break;
        }
      });
    });
  }

  function applyFiltersFromDom() {
    if (state.activeTab === "skills") {
      const search = root.querySelector('[data-creator-filter-search="skills"]');
      const category = root.querySelector('[data-creator-filter-category="skills"]');
      state.filters.skills.search = String(search?.value ?? "").trim();
      state.filters.skills.category = String(category?.value ?? "").trim();
    } else if (state.activeTab === "effects") {
      const search = root.querySelector('[data-creator-filter-search="effects"]');
      const category = root.querySelector('[data-creator-filter-category="effects"]');
      state.filters.effects.search = String(search?.value ?? "").trim();
      state.filters.effects.category = String(category?.value ?? "").trim();
    } else if (state.activeTab === "abilities") {
      const search = root.querySelector('[data-creator-filter-search="abilities"]');
      state.filters.abilities.search = String(search?.value ?? "").trim();
    } else {
      const search = root.querySelector('[data-creator-filter-search="equipment"]');
      const itemType = root.querySelector('[data-creator-filter-item-type="equipment"]');
      state.filters.equipment.search = String(search?.value ?? "").trim();
      state.filters.equipment.itemType = String(itemType?.value ?? "").trim();
    }
  }

  async function loadReferenceData(settings) {
    const [referenceResult, itemDefinitions, effectDefinitions] = await Promise.all([
      runtime.api.creator.getCreatorReferenceData(settings),
      runtime.bridges.supabase.fetchSupabaseRows(
        "odyssey_item_defs?select=id,code,name,item_type&order=name.asc",
        settings,
        "Unable to load item definition reference data.",
      ).catch(() => []),
      runtime.api.creator.listEffects({ search: null, categories: [] }, settings).catch(() => ({ ok: true, items: [] })),
    ]);
    if (!referenceResult?.ok) {
      throw new Error(formatCreatorError(referenceResult, "Unable to load creator reference data."));
    }
    return {
      ...referenceResult,
      itemDefinitions: Array.isArray(itemDefinitions) ? itemDefinitions : [],
      effects: effectDefinitions?.ok && Array.isArray(effectDefinitions.items) ? effectDefinitions.items : [],
    };
  }

  async function ensureReadyForActiveTab({ forceRefs = false } = {}) {
    const access = getAccess();
    if (!access.isGm || !access.configured) {
      return;
    }

    if (state.lastLoadedSettingsKey && state.lastLoadedSettingsKey !== access.settingsKey) {
      resetLoadedData();
    }

    const shouldLoadRefs = forceRefs || !state.references || state.lastLoadedSettingsKey !== access.settingsKey;
    const shouldLoadList = shouldLoadRefs || !state.loadedTabs[state.activeTab];
    if (!shouldLoadRefs && !shouldLoadList) {
      return;
    }

    const requestId = ++state.requestNonce;
    state.loading = true;
    state.loadingLabel = shouldLoadRefs ? "reference data and catalog" : "catalog";
    clearMessages();
    render();

    try {
      if (shouldLoadRefs) {
        state.references = await loadReferenceData(access.settings);
        if (requestId !== state.requestNonce) return;
        state.lastLoadedSettingsKey = access.settingsKey;
      }
      await loadListForTab(state.activeTab, access.settings, requestId);
      if (requestId !== state.requestNonce) return;
      state.loading = false;
      render();
    } catch (error) {
      if (requestId !== state.requestNonce) return;
      state.loading = false;
      state.error = toErrorMessage(error, "Unable to load creator data.");
      onDiagnostic("error", "Creator load failed", state.error);
      render();
    }
  }

  async function loadListForTab(kind, settings, requestId = state.requestNonce) {
    let result = null;
    if (kind === "skills") {
      const filters = state.filters.skills;
      result = await runtime.api.creator.listSkills(
        {
          search: filters.search || null,
          categories: getSkillBackendCategoriesForFilter(filters.category),
        },
        settings,
      );
    } else if (kind === "effects") {
      const filters = state.filters.effects;
      result = await runtime.api.creator.listEffects(
        {
          search: filters.search || null,
          categories: filters.category ? [filters.category] : [],
        },
        settings,
      );
    } else if (kind === "abilities") {
      const filters = state.filters.abilities;
      result = await runtime.api.creator.listAbilities(
        {
          search: filters.search || null,
        },
        settings,
      );
    } else {
      const filters = state.filters.equipment;
      result = await runtime.api.creator.listEquipmentModels(
        {
          search: filters.search || null,
          itemTypes: filters.itemType ? [filters.itemType] : [],
        },
        settings,
      );
    }

    if (requestId !== state.requestNonce) return;
    if (!result?.ok) {
      throw new Error(formatCreatorError(result, "Unable to load catalog list."));
    }

    state.lists[kind] = kind === "skills"
      ? (Array.isArray(result.items) ? result.items : []).filter((item) => getAllowedSkillBackendCategories().includes(String(item?.category ?? "")))
      : kind === "effects"
      ? (Array.isArray(result.items) ? result.items : [])
      : kind === "abilities"
      ? (Array.isArray(result.items) ? result.items : [])
      : kind === "equipment"
      ? (Array.isArray(result.items) ? result.items : []).filter((item) => String(item?.item_type ?? "") !== "device")
      : (Array.isArray(result.items) ? result.items : []);
    state.loadedTabs[kind] = true;

    if (
      state.selectedIds[kind]
      && !state.lists[kind].some((item) => item.id === state.selectedIds[kind])
    ) {
      state.selectedIds[kind] = "";
      state.bundles[kind] = null;
      state.drafts[kind] = kind === "skills"
        ? createEmptySkillDraft()
        : kind === "effects"
        ? createEmptyEffectDraft()
        : kind === "abilities"
        ? createEmptyAbilityDraft()
        : createEmptyEquipmentDraft();
      state.dirty[kind] = false;
    }
  }

  async function refreshActiveList({ forceRefs = false } = {}) {
    const access = getAccess();
    if (!access.isGm || !access.configured) {
      return;
    }
    const requestId = ++state.requestNonce;
    state.loading = true;
    state.loadingLabel = forceRefs ? "reference data and current list" : "current list";
    clearMessages();
    render();
    try {
      if (forceRefs) {
        state.references = await loadReferenceData(access.settings);
        state.lastLoadedSettingsKey = access.settingsKey;
      }
      await loadListForTab(state.activeTab, access.settings, requestId);
      state.loading = false;
      state.info = `${state.activeTab === "skills" ? "Skill" : state.activeTab === "effects" ? "Effect" : state.activeTab === "abilities" ? "Ability" : "Equipment"} catalog refreshed.`;
      render();
    } catch (error) {
      state.loading = false;
      state.error = toErrorMessage(error, "Unable to refresh creator list.");
      onDiagnostic("error", "Creator refresh failed", state.error);
      render();
    }
  }

  async function openRecord(kind, id) {
    const access = getAccess();
    if (!access.isGm || !access.configured) {
      return;
    }
    const requestId = ++state.requestNonce;
    state.loading = true;
      state.loadingLabel = `loading ${kind === "skills" ? "skill" : kind === "effects" ? "effect" : kind === "abilities" ? "ability" : "equipment model"}`;
    clearMessages();
    render();

    try {
      const result = kind === "skills"
        ? await runtime.api.creator.getSkill(id, access.settings)
        : kind === "effects"
        ? await runtime.api.creator.getEffect(id, access.settings)
        : kind === "abilities"
        ? await runtime.api.creator.getAbility(id, access.settings)
        : await runtime.api.creator.getEquipmentModel(id, access.settings);
      if (requestId !== state.requestNonce) return;
      if (!result?.ok) {
        throw new Error(formatCreatorError(result, "Unable to load creator record."));
      }
      state.selectedIds[kind] = id;
      state.bundles[kind] = result;
      state.drafts[kind] = kind === "skills"
        ? normalizeSkillDraft(result)
        : kind === "effects"
        ? normalizeEffectDraft(result)
        : kind === "abilities"
        ? normalizeAbilityDraft(result)
        : normalizeEquipmentDraft(result);
      state.dirty[kind] = false;
      state.loading = false;
      state.info = `${kind === "skills" ? "Skill" : kind === "effects" ? "Effect" : kind === "abilities" ? "Ability" : "Equipment model"} loaded into draft.`;
      render();
    } catch (error) {
      if (requestId !== state.requestNonce) return;
      state.loading = false;
      state.error = toErrorMessage(error, "Unable to open creator record.");
      onDiagnostic("error", "Creator open failed", state.error);
      render();
    }
  }

  function createNewDraft() {
    clearMessages();
    if (state.activeTab === "skills") {
      state.selectedIds.skills = "";
      state.bundles.skills = null;
      state.drafts.skills = createEmptySkillDraft();
      state.dirty.skills = false;
      state.info = "New skill draft created.";
    } else if (state.activeTab === "effects") {
      state.selectedIds.effects = "";
      state.bundles.effects = null;
      state.drafts.effects = createEmptyEffectDraft();
      state.dirty.effects = false;
      state.info = "New effect draft created.";
    } else if (state.activeTab === "abilities") {
      state.selectedIds.abilities = "";
      state.bundles.abilities = null;
      state.drafts.abilities = createEmptyAbilityDraft();
      state.dirty.abilities = false;
      state.info = "New ability draft created.";
    } else {
      state.selectedIds.equipment = "";
      state.bundles.equipment = null;
      state.drafts.equipment = createEmptyEquipmentDraft();
      state.dirty.equipment = false;
      state.info = "New equipment draft created.";
    }
    render();
  }

  function duplicateDraft() {
    clearMessages();
    if (state.activeTab === "skills") {
      state.selectedIds.skills = "";
      state.bundles.skills = null;
      state.drafts.skills = makeSkillDuplicateDraft(state.drafts.skills);
      state.dirty.skills = true;
      state.info = "Skill draft duplicated as a new record.";
    } else if (state.activeTab === "effects") {
      state.selectedIds.effects = "";
      state.bundles.effects = null;
      state.drafts.effects = makeEffectDuplicateDraft(state.drafts.effects);
      state.dirty.effects = true;
      state.info = "Effect draft duplicated as a new record.";
    } else if (state.activeTab === "abilities") {
      state.selectedIds.abilities = "";
      state.bundles.abilities = null;
      state.drafts.abilities = makeAbilityDuplicateDraft(state.drafts.abilities);
      state.dirty.abilities = true;
      state.info = "Ability draft duplicated as a new record.";
    } else {
      state.selectedIds.equipment = "";
      state.bundles.equipment = null;
      state.drafts.equipment = makeEquipmentDuplicateDraft(state.drafts.equipment);
      state.dirty.equipment = true;
      state.info = "Equipment draft duplicated as a new record.";
    }
    render();
  }

  async function buildSavePayload(kind, draft, settings) {
    if (kind === "skills") {
      const allSkills = await runtime.api.creator.listSkills({ search: null, categories: [] }, settings);
      if (!allSkills?.ok) {
        throw new Error(formatCreatorError(allSkills, "Unable to calculate automatic skill fields."));
      }
      const referenceScope = state.references ?? {};
      const list = Array.isArray(allSkills.items) ? allSkills.items : [];
      const existingCodes = list
        .filter((item) => item.id !== draft.id)
        .map((item) => item.code);
      const auto = {
        code: uniqueGeneratedCode(slugifyName(draft.name), existingCodes),
        sortOrder: draft.id
          ? Number.parseInt(String(state.bundles.skills?.skill?.sort_order ?? 0), 10) || 0
          : nextFreeSortOrder(list),
        tags: buildSkillAutoTags(draft, referenceScope),
      };
      return buildSkillPayload(draft, auto);
    }

    if (kind === "effects") {
      const allEffects = await runtime.api.creator.listEffects({ search: null, categories: [] }, settings);
      if (!allEffects?.ok) {
        throw new Error(formatCreatorError(allEffects, "Unable to calculate automatic effect fields."));
      }
      const list = Array.isArray(allEffects.items) ? allEffects.items : [];
      const existingCodes = list
        .filter((item) => item.id !== draft.id)
        .map((item) => item.code);
      const auto = {
        code: uniqueGeneratedCode(slugifyName(draft.name), existingCodes),
        sortOrder: draft.id
          ? Number.parseInt(String(state.bundles.effects?.effect?.sort_order ?? 0), 10) || 0
          : nextFreeSortOrder(list),
        tags: buildEffectAutoTags(draft),
      };
      return buildEffectPayload(draft, auto);
    }

    if (kind === "abilities") {
      const allAbilities = await runtime.api.creator.listAbilities({ search: null }, settings);
      if (!allAbilities?.ok) {
        throw new Error(formatCreatorError(allAbilities, "Unable to calculate automatic ability fields."));
      }
      const list = Array.isArray(allAbilities.items) ? allAbilities.items : [];
      const existingCodes = list
        .filter((item) => item.id !== draft.id)
        .map((item) => item.code);
      const auto = {
        code: uniqueGeneratedCode(slugifyName(draft.name), existingCodes),
        sortOrder: draft.id
          ? Number.parseInt(String(state.bundles.abilities?.ability?.sort_order ?? 0), 10) || 0
          : nextFreeSortOrder(list),
        tags: buildAbilityAutoTags(draft),
      };
      return buildAbilityPayload(draft, auto);
    }

    const allEquipment = await runtime.api.creator.listEquipmentModels({ search: null, itemTypes: [] }, settings);
    if (!allEquipment?.ok) {
      throw new Error(formatCreatorError(allEquipment, "Unable to calculate automatic equipment fields."));
    }
    const list = Array.isArray(allEquipment.items) ? allEquipment.items : [];
    const existingCodes = list
      .filter((item) => item.id !== draft.id)
      .map((item) => item.code);
    const auto = {
      code: uniqueGeneratedCode(slugifyName(draft.name), existingCodes),
      sortOrder: draft.id
        ? Number.parseInt(String(state.bundles.equipment?.equipment_model?.sort_order ?? 0), 10) || 0
        : nextFreeSortOrder(list),
      tags: buildEquipmentAutoTags(draft),
    };
    return buildEquipmentPayload(draft, auto);
  }

  async function saveDraft() {
    const access = getAccess();
    if (!access.isGm || !access.configured) {
      return;
    }
    clearMessages();
    state.loading = true;
    state.loadingLabel = "saving draft";
    render();
    try {
      const draft = state.activeTab === "skills"
        ? state.drafts.skills
        : state.activeTab === "effects"
        ? state.drafts.effects
        : state.activeTab === "abilities"
        ? state.drafts.abilities
        : state.drafts.equipment;
      const payload = await buildSavePayload(state.activeTab, draft, access.settings);
      const result = state.activeTab === "skills"
        ? await runtime.api.creator.upsertSkill(payload, access.settings)
        : state.activeTab === "effects"
        ? await runtime.api.creator.upsertEffect(payload, access.settings)
        : state.activeTab === "abilities"
        ? await runtime.api.creator.upsertAbility(payload, access.settings)
        : await runtime.api.creator.upsertEquipmentModel(payload, access.settings);
      if (!result?.ok) {
        throw new Error(formatCreatorError(result, "Unable to save draft."));
      }
      const bundle = extractEntityBundle(result);
      if (!bundle?.ok) {
        throw new Error("Save succeeded but the returned entity bundle was incomplete.");
      }
      if (state.activeTab === "skills") {
        state.selectedIds.skills = String(result.entity_id ?? "");
        state.bundles.skills = bundle;
        state.drafts.skills = normalizeSkillDraft(bundle);
        state.dirty.skills = false;
      } else if (state.activeTab === "effects") {
        state.selectedIds.effects = String(result.entity_id ?? "");
        state.bundles.effects = bundle;
        state.drafts.effects = normalizeEffectDraft(bundle);
        state.dirty.effects = false;
      } else if (state.activeTab === "abilities") {
        state.selectedIds.abilities = String(result.entity_id ?? "");
        state.bundles.abilities = bundle;
        state.drafts.abilities = normalizeAbilityDraft(bundle);
        state.dirty.abilities = false;
      } else {
        state.selectedIds.equipment = String(result.entity_id ?? "");
        state.bundles.equipment = bundle;
        state.drafts.equipment = normalizeEquipmentDraft(bundle);
        state.dirty.equipment = false;
      }
      await loadListForTab(state.activeTab, access.settings);
      state.loading = false;
      state.info = `${state.activeTab === "skills" ? "Skill" : state.activeTab === "effects" ? "Effect" : state.activeTab === "abilities" ? "Ability" : "Equipment model"} saved to Supabase.`;
      onDiagnostic("info", "Creator save complete", state.info);
      render();
    } catch (error) {
      state.loading = false;
      state.error = toErrorMessage(error, "Unable to save draft.");
      onDiagnostic("error", "Creator save failed", state.error);
      render();
    }
  }

  async function reloadSelected() {
    const id = state.selectedIds[state.activeTab];
    if (!id) {
      return;
    }
    await openRecord(state.activeTab, id);
  }

  async function deleteSelected() {
    const access = getAccess();
    const id = state.selectedIds[state.activeTab];
    if (!access.isGm || !access.configured || !id) {
      return;
    }
    const label = state.activeTab === "skills" ? "skill" : state.activeTab === "effects" ? "effect" : state.activeTab === "abilities" ? "ability" : "equipment model";
    if (!globalThis.confirm(`Delete this ${label} definition from the catalog?`)) {
      return;
    }

    clearMessages();
    state.loading = true;
    state.loadingLabel = `deleting ${label}`;
    render();
    try {
      const result = state.activeTab === "skills"
        ? await runtime.api.creator.deleteSkill(id, access.settings)
        : state.activeTab === "effects"
        ? await runtime.api.creator.deleteEffect(id, access.settings)
        : state.activeTab === "abilities"
        ? await runtime.api.creator.deleteAbility(id, access.settings)
        : await runtime.api.creator.deleteEquipmentModel(id, access.settings);
      if (!result?.ok) {
        throw new Error(formatCreatorError(result, `Unable to delete ${label}.`));
      }
      if (state.activeTab === "skills") {
        state.selectedIds.skills = "";
        state.bundles.skills = null;
        state.drafts.skills = createEmptySkillDraft();
        state.dirty.skills = false;
      } else if (state.activeTab === "effects") {
        state.selectedIds.effects = "";
        state.bundles.effects = null;
        state.drafts.effects = createEmptyEffectDraft();
        state.dirty.effects = false;
      } else if (state.activeTab === "abilities") {
        state.selectedIds.abilities = "";
        state.bundles.abilities = null;
        state.drafts.abilities = createEmptyAbilityDraft();
        state.dirty.abilities = false;
      } else {
        state.selectedIds.equipment = "";
        state.bundles.equipment = null;
        state.drafts.equipment = createEmptyEquipmentDraft();
        state.dirty.equipment = false;
      }
      await loadListForTab(state.activeTab, access.settings);
      state.loading = false;
      state.info = `${label[0].toUpperCase()}${label.slice(1)} deleted from the catalog.`;
      onDiagnostic("info", "Creator delete complete", state.info);
      render();
    } catch (error) {
      state.loading = false;
      state.error = toErrorMessage(error, `Unable to delete ${label}.`);
      onDiagnostic("error", "Creator delete failed", state.error);
      render();
    }
  }

  const controller = {
    syncAccess() {
      const access = getAccess();
      if (state.lastLoadedSettingsKey && state.lastLoadedSettingsKey !== access.settingsKey) {
        resetLoadedData();
      }
      render();
      void ensureReadyForActiveTab();
    },
    refresh() {
      render();
      void ensureReadyForActiveTab({ forceRefs: true });
    },
  };

  render();
  void ensureReadyForActiveTab();
  return controller;
}
