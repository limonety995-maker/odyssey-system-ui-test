// HUD Abilities — Phase 4.0: quick-actions runtime mapper (PURE).
//
// THE single normalization point between the server's quick-actions runtime
// (odyssey_get_character_quick_actions_runtime) and the HUD's ability contract.
// Whitelist-only: each quick action carries display metadata, cost, cooldown,
// targeting and availability — NEVER inventory, private target state, raw
// ability-definition JSON, GM-only modifiers, or auth data.
//
// Honesty rules (per Phase 4.0 spec):
//   - disabledReason comes from the server; the client NEVER fabricates a reason.
//   - Missing server fields become explicit sentinel states, not invented values:
//       * "not configured"      → the definition lacks this field
//       * "not returned by server" → the runtime omitted the field entirely
//   - availability / cooldown / cost are NOT computed on the client.
//
// The four canonical action TYPES (attack_technique | directed | instant |
// toggle) are normalized here so the UI can render them consistently in 4.0 and
// wire execution in 4.1. Unknown types degrade to "instant" (safest inert type).

export const QUICK_ACTION_TYPES = Object.freeze({
  attackTechnique: "attack_technique",
  directed: "directed",
  instant: "instant",
  toggle: "toggle",
  // Phase 4.1B.4: not produced by the server today (passive abilities are
  // excluded from the quickbar runtime entirely — see
  // docs/PHASE_4_1B_4_PASSIVE_UNSUPPORTED_POLISH_AUDIT.md §3) — whitelisted
  // here so that IF this is ever revisited, a real `type:"passive"` survives
  // normalizeType() instead of being silently coerced to "instant".
  passive: "passive",
});

export const QUICK_ACTION_SOURCES = Object.freeze({
  perk: "perk",
  psi: "psi",
  skill: "skill",
  weapon: "weapon",
  armor: "armor",
  implant: "implant",
  prosthetic: "prosthetic",
  equipment: "equipment",
  item: "item",
  technique: "technique",
});

export const SEMANTIC_KINDS = Object.freeze({
  attack: "attack",
  psi: "psi",
  tech: "tech",
  utility: "utility",
  intervention: "intervention",
});

// Sentinel strings for honestly-missing data (never masked as working values).
export const FIELD_SENTINELS = Object.freeze({
  notConfigured: "not configured",
  notImplemented: "not implemented",
  notReturned: "not returned by server",
});

const VALID_TYPES = new Set(Object.values(QUICK_ACTION_TYPES));
const VALID_SOURCES = new Set(Object.values(QUICK_ACTION_SOURCES));
const VALID_SEMANTIC = new Set(Object.values(SEMANTIC_KINDS));

function str(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

function num(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v, fallback = false) {
  return v === null || v === undefined ? fallback : Boolean(v);
}

// Map raw server type/activation to one of the four canonical action types.
// The server currently sends activation_type ('manual'|'custom') plus a
// semanticKind (ability_kind); we prefer an explicit `type` when present.
function normalizeType(raw) {
  const v = String(raw?.type ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (VALID_TYPES.has(v)) return v;
  // Derive from semantic hints when the explicit type is absent/unknown.
  const kind = String(raw?.semanticKind ?? raw?.ability_kind ?? "").toLowerCase();
  if (kind === "attack") return QUICK_ACTION_TYPES.attackTechnique;
  // toggle/directed can't be safely inferred → default to the inert "instant".
  return QUICK_ACTION_TYPES.instant;
}

function normalizeSource(raw) {
  const v = String(raw?.sourceType ?? raw?.source_type ?? "").toLowerCase();
  if (VALID_SOURCES.has(v)) return v;
  const aliases = {
    psionic: QUICK_ACTION_SOURCES.psi,
    innate: QUICK_ACTION_SOURCES.perk,
    custom: QUICK_ACTION_SOURCES.technique,
  };
  return aliases[v] ?? QUICK_ACTION_SOURCES.technique;
}

function normalizeSemantic(raw) {
  const v = String(raw?.semanticKind ?? raw?.ability_kind ?? "").toLowerCase();
  if (VALID_SEMANTIC.has(v)) return v;
  const aliases = {
    buff: SEMANTIC_KINDS.utility,
    defense: SEMANTIC_KINDS.intervention,
    narrative: SEMANTIC_KINDS.utility,
  };
  return aliases[v] ?? SEMANTIC_KINDS.utility;
}

// Targeting block: preserve server values; fill honest defaults for absent keys.
function mapTargeting(raw) {
  const t = raw?.targeting && typeof raw.targeting === "object" ? raw.targeting : {};
  return {
    mode: str(t.mode) ?? "none",
    minTargets: num(t.minTargets, 0),
    maxTargets: num(t.maxTargets, 0),
    allowAllies: bool(t.allowAllies, false),
    allowSelf: bool(t.allowSelf, false),
    requiresBodyZone: bool(t.requiresBodyZone, false),
  };
}

// Costs block: never invented. A null value means "server did not return it".
function mapCosts(raw) {
  const c = raw?.costs && typeof raw.costs === "object" ? raw.costs : {};
  return {
    main: num(c.main, 0),
    move: num(c.move, 0),
    psi: num(c.psi, 0),
    charges: num(c.charges, 0),
  };
}

// Cooldown block: current/max are server truth. Never decremented on client.
function mapCooldown(raw) {
  const cd = raw?.cooldown && typeof raw.cooldown === "object" ? raw.cooldown : {};
  const current = num(cd.current, 0);
  const max = num(cd.max, 0);
  return {
    current,
    max,
    unit: str(cd.unit) ?? "turn",
    active: current > 0,
  };
}

// State block: availability + disabledReason are SERVER-provided. The client
// only supplies a generic fallback label when the server truly returned nothing.
//
// Phase 4.1A.2: executionAvailable/executionReason are a SEPARATE axis from
// available — an ability can be available (selectable/armable) yet have an
// effect the current execution path can't run (e.g. a technique with a
// damage/armor-pierce effect, migration 100's ACTION_EFFECT_NOT_IMPLEMENTED).
// Both are copied verbatim from the server (migration 101) — never derived
// from the ability's name or a client-side effect-grammar copy.
function mapState(raw) {
  const s = raw?.state && typeof raw.state === "object" ? raw.state : {};
  const available = bool(s.available, false);
  const serverReason = str(s.disabledReason);
  return {
    available,
    active: bool(s.active, false),
    // If unavailable but the server gave no reason, use a neutral fallback —
    // never invent a specific cause (e.g. do not claim "cooldown" ourselves).
    disabledReason: serverReason ?? (available ? null : "Not available"),
    selectable: bool(s.selectable, available),
    executionAvailable: bool(s.executionAvailable, true),
    executionReason: str(s.executionReason),
    // Structural signal (migration 101) — lets the UI distinguish "insufficient
    // resource" from any other unavailable reason without parsing disabledReason.
    resourceSufficient: bool(s.resourceSufficient, true),
  };
}

function mapRequirements(raw) {
  const r = raw?.requirements && typeof raw.requirements === "object" ? raw.requirements : {};
  return {
    weaponClass: str(r.weaponClass),
    weaponId: str(r.weaponId),
    equipmentItemId: str(r.equipmentItemId),
    itemId: str(r.itemId),
    requiresSelectedSource: bool(r.requiresSelectedSource, false),
    requiresEquipped: bool(r.requiresEquipped, false),
    requiresInstalled: bool(r.requiresInstalled, false),
    conditionSummary: str(r.conditionSummary),
  };
}

function mapReload(raw) {
  const r = raw?.reload && typeof raw.reload === "object" ? raw.reload : {};
  return {
    required: bool(r.required, false),
    itemCode: str(r.itemCode) ?? str(r.item_code),
    itemCost: num(r.itemCost ?? r.item_cost, 1),
  };
}

/** Map one raw server quick-action row to the safe HUD quick-action shape. */
export function mapQuickAction(raw) {
  const q = raw && typeof raw === "object" ? raw : {};
  return {
    characterActionId: str(q.characterActionId) ?? str(q.character_action_id) ?? null,
    definitionId: str(q.definitionId) ?? str(q.definition_id) ?? null,
    characterSkillId: str(q.characterSkillId) ?? str(q.character_skill_id) ?? null,
    sourceCharacterWeaponId: str(q.sourceCharacterWeaponId) ?? str(q.source_character_weapon_id) ?? null,
    sourceEquipmentItemId: str(q.sourceEquipmentItemId) ?? str(q.source_equipment_item_id) ?? null,
    sourceCharacterItemId: str(q.sourceCharacterItemId) ?? str(q.source_character_item_id) ?? null,
    sourceLabel: str(q.sourceLabel) ?? str(q.source_label) ?? null,
    sourceType: normalizeSource(q),
    type: normalizeType(q),
    name: str(q.name) ?? "Unknown action",
    shortDescription: str(q.shortDescription) ?? str(q.short_description) ?? "",
    fullDescription: str(q.fullDescription) ?? str(q.full_description) ?? "",
    iconKey: str(q.iconKey) ?? str(q.icon_key) ?? "bolt",
    semanticKind: normalizeSemantic(q),
    targeting: mapTargeting(q),
    costs: mapCosts(q),
    cooldown: mapCooldown(q),
    state: mapState(q),
    requirements: mapRequirements(q),
    reload: mapReload(q),
  };
}

// Quickbar slots: each references a characterActionId or is empty. The mapper
// validates references against the actions list so a stale slot (action no
// longer in the library) is flagged as `missing` for the editor to surface.
function mapSlots(rawSlots, actionIdSet) {
  const slots = Array.isArray(rawSlots) ? rawSlots : [];
  return slots
    .map((s) => {
      const actionId = str(s?.characterActionId) ?? str(s?.character_action_id) ?? str(s?.actionId) ?? null;
      const empty = actionId == null;
      return {
        slotIndex: num(s?.slotIndex ?? s?.slot_index ?? s?.index, 0),
        characterActionId: actionId,
        empty,
        // A non-empty slot whose action isn't in the current library is a
        // "missing" slot: shown to the user, removable, never silently dropped.
        missing: !empty && !actionIdSet.has(actionId),
      };
    })
    .sort((a, b) => a.slotIndex - b.slotIndex);
}

/**
 * Map the raw quick-actions runtime RPC response to the HUD abilities snapshot.
 * Missing/malformed sections degrade to safe empty values, never throw.
 *
 * @param {object|null} runtime raw odyssey_get_character_quick_actions_runtime response
 * @returns {{
 *   ok: boolean, error: (string|null), characterId: (string|null),
 *   quickActions: object[],
 *   quickbar: { slots: object[], maxSlots: number, version: number }
 * }}
 */
export function mapQuickActionsRuntime(runtime) {
  const r = runtime && typeof runtime === "object" ? runtime : null;

  if (!r) {
    return {
      ok: false,
      error: "NO_RUNTIME",
      characterId: null,
      quickActions: [],
      quickbar: { slots: [], maxSlots: 20, version: 1 },
    };
  }

  const rawActions = Array.isArray(r.quickActions) ? r.quickActions : [];
  const quickActions = rawActions.map(mapQuickAction);
  const actionIdSet = new Set(quickActions.map((a) => a.characterActionId).filter(Boolean));

  const rawQuickbar = r.quickbar && typeof r.quickbar === "object" ? r.quickbar : {};
  const slots = mapSlots(rawQuickbar.slots, actionIdSet);

  return {
    ok: r.ok !== false,
    error: str(r.error),
    characterId: str(r.characterId) ?? str(r.character_id) ?? null,
    quickActions,
    quickbar: {
      slots,
      maxSlots: num(rawQuickbar.maxSlots ?? rawQuickbar.max_slots, 20),
      // 0 matches the server's own "no layout saved yet" version (never 1 —
      // that would desync from odyssey_save_character_quickbar_layout's own
      // "no row" default and falsely trigger QUICKBAR_VERSION_CONFLICT).
      version: num(rawQuickbar.version, 0),
    },
  };
}

/**
 * Look up a quick action by its characterActionId within a mapped runtime.
 * @returns {object|null}
 */
export function findQuickAction(mappedRuntime, characterActionId) {
  if (!mappedRuntime || !characterActionId) return null;
  return mappedRuntime.quickActions.find((a) => a.characterActionId === characterActionId) ?? null;
}
