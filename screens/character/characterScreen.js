// Character Panel (Stage 5B start). Source of truth is Supabase; this screen only
// collects input, calls existing RPC adapters, renders results, and re-reads server
// state after mutations. No combat math, no client rolls, no direct table writes.

import characterStyles from "./characterStyles.css";
import { escapeHtml } from "../../utils/json.js";
import { toErrorMessage } from "../../utils/errors.js";
import { describeError } from "../resolveAttack/resolveAttackService.js";
import {
  loadDevSettings,
  hasUsableSettings,
  resolveEffectiveSettings,
} from "../resolveAttack/resolveAttackSettings.js";
import { getRealtimeClient } from "../../bridge/realtimeClient.js";
import { normalizeDistanceMode, normalizeObrGridType, sceneToCell, sameCell } from "../../movement/gridMath.js";
import {
  MOVE_TOOL_COMMANDS,
  MOVE_TOOL_EVENTS,
  TACTICAL_MOVE_MODE_ID,
  TACTICAL_MOVE_TOOL_ID,
  sendMoveToolCommand,
  subscribeMoveToolMessages,
} from "../../movement/moveToolBridge.js";

/* canonical attribute codes in display order (psionics and perception swapped vs alphabetical) */
const ATTR_RU = {
  strength: "Сила",
  agility: "Ловкость",
  reaction: "Реакция",
  endurance: "Выносливость",
  psionics: "Псионика",
  intelligence: "Интеллект",
  charisma: "Харизма",
  willpower: "Сила воли",
  perception: "Восприятие",
};
const BASE_ATTR_CODES = Object.keys(ATTR_RU);

const PART_GEOMETRY = {
  head: { x: 31, y: 6, w: 18, h: 18, r: "50%" },
  torso: { x: 28, y: 26, w: 24, h: 30, r: 6 },
  l_arm: { x: 16, y: 28, w: 8, h: 26, r: 5 },
  r_arm: { x: 56, y: 28, w: 8, h: 26, r: 5 },
  l_leg: { x: 28, y: 58, w: 9, h: 24, r: 5 },
  r_leg: { x: 42, y: 58, w: 9, h: 24, r: 5 },
};
const PART_ALIASES = {
  arm_l: "l_arm",
  arm_r: "r_arm",
  leg_l: "l_leg",
  leg_r: "r_leg",
  larm: "l_arm",
  rarm: "r_arm",
  lleg: "l_leg",
  rleg: "r_leg",
  left_arm: "l_arm",
  right_arm: "r_arm",
  left_leg: "l_leg",
  right_leg: "r_leg",
  leftarm: "l_arm",
  rightarm: "r_arm",
  leftleg: "l_leg",
  rightleg: "r_leg",
};
const DOLL_SCALE = 1.7;
const OBR_TIMEOUT = 1500;
const ARMOR_TYPES = new Set(["armor", "shield", "special_protection"]);
const IMPLANT_TYPES = new Set(["implant", "prosthetic", "device"]);

const esc = (v) => escapeHtml(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const dash = (v) => (v === null || v === undefined || v === "" ? "-" : v);
const normalizeBodyPartCode = (value) => {
  const code = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_")
    .replace(/__+/g, "_");
  return PART_ALIASES[code] || code;
};
const normPart = (p) => normalizeBodyPartCode(p?.code || p?.part_key || "");
const isShieldPart = (p) => normPart(p) === "shield";
const isSpecialPart = (p) => normPart(p) === "special";

function injectStylesOnce() {
  if (document.getElementById("cp-screen-styles")) return;
  const s = document.createElement("style");
  s.id = "cp-screen-styles";
  s.textContent = characterStyles;
  document.head.appendChild(s);
}
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    Promise.resolve().then(() => promise).catch(() => fallback),
    new Promise((r) => setTimeout(() => r(fallback), ms)),
  ]);
}
function normalizeTacticalGridSettings(raw) {
  if (!raw || typeof raw !== "object") return null;

  const gridType = String(raw.grid_type ?? "")
    .trim()
    .toLowerCase();

  const distanceMode = String(raw.distance_mode ?? "")
    .trim()
    .toLowerCase();

  const metersPerCell = Number(raw.meters_per_cell);
  const anchorSceneX = Number(raw.anchor_scene_x);
  const anchorSceneY = Number(raw.anchor_scene_y);
  const gridDpi = Number(raw.grid_dpi);

  const supportedGridTypes = new Set([
    "square",
    "hex_vertical",
    "hex_horizontal",
  ]);

  if (!supportedGridTypes.has(gridType)) {
    return null;
  }

  const hasValidDistanceMode =
    (gridType === "square" &&
      ["chebyshev", "manhattan"].includes(distanceMode)) ||
    (gridType !== "square" && distanceMode === "hex");

  if (!hasValidDistanceMode) {
    return null;
  }

  if (
    !Number.isFinite(anchorSceneX) ||
    !Number.isFinite(anchorSceneY) ||
    !Number.isFinite(gridDpi) ||
    gridDpi <= 0
  ) {
    return null;
  }

  return {
    grid_type: gridType,
    distance_mode: distanceMode,
    meters_per_cell:
      Number.isFinite(metersPerCell) && metersPerCell > 0
        ? Math.round(metersPerCell)
        : 1,
    anchor_scene_x: anchorSceneX,
    anchor_scene_y: anchorSceneY,
    grid_dpi: gridDpi,
  };
}
function banner(kind, html) {
  return `<div class="cp-banner ${kind}">${html}</div>`;
}

export function mountCharacterScreen({ root, runtime }) {
  injectStylesOnce();
  const api = runtime?.api ?? {};
  const bridges = runtime?.bridges ?? {};

  const state = {
    settings: loadDevSettings(),
    role: "PLAYER", // from OBR
    devRole: "auto", // 'auto' | 'PLAYER' | 'GM'
    characterId: "",
    loading: false,
    error: null,
    section: "overview",
    sheet: null,
    perks: [],
    perkAvailability: [],
    abilities: [],
    pools: [],
    armory: null,
    equipment: null,
    inv: { ammoStock: [], magazines: [], items: [], fallback: false },
    itemDefs: [],
    skillDefs: [],
    weaponDefs: [],
    magazineDefs: [],
    ammoDefs: [],
    equipmentDefs: [],
    lastSlot: {}, // equipmentItemId -> last equipped body_part id (for re-equip default)
    pinnedPartId: "",
    rollingAttr: "",
    busy: false,
    isStartingCombat: false,
    combatStartStage: "",
    notice: "",
    realtimeSubscriptions: [], // Real-Time listeners for auto-refresh
    sceneRealtimeSubscriptions: [],
    catalogSubscriptions: [],
    refreshInFlight: null,
    queuedRefresh: null,
    realtimeRefreshPending: null,
    realtimeRefreshTimer: null,
    selectionSyncTimer: null,
    selectionSyncRequestId: 0,
    lastSelectionSignature: "",
    selectedTokenResolution: null,
    selectedToken: null,
    moveToolStatus: null,
    sceneCombatSnapshot: null,
    tacticalSnapshot: null,
    uiSubscriptions: [],
  };

  const settings = () => state.settings;
  const isGM = () => (state.devRole === "GM" ? true : state.devRole === "PLAYER" ? false : state.role === "GM");

  function setCombatStartStage(stage) {
    state.combatStartStage = stage;
    console.info("[Odyssey combat]", stage);
  }

  function isSelectionRequestCurrent(requestId) {
    return !requestId || requestId === state.selectionSyncRequestId;
  }

  function scheduleSelectionSync(force = false) {
    if (state.selectionSyncTimer) {
      clearTimeout(state.selectionSyncTimer);
    }
    state.selectionSyncTimer = setTimeout(() => {
      state.selectionSyncTimer = null;
      syncCharacterFromOwlbearSelection({ force }).catch((error) => {
        console.warn("[Odyssey] Selection sync failed:", error);
      });
    }, 100);
  }

  async function refreshSelectedTokenContext() {
    const tokens = await withTimeout(bridges.obr?.getSelectedOwlbearTokens?.(), OBR_TIMEOUT, []);
    if (!Array.isArray(tokens) || tokens.length !== 1) {
      state.selectedToken = null;
      render();
      return;
    }
    const token = tokens[0] ?? null;
    if (!token) {
      state.selectedToken = null;
      render();
      return;
    }
    const link = bridges.token?.getTokenCharacterLink?.(token) ?? { characterId: "" };
    state.selectedToken = {
      id: String(token.id ?? "").trim(),
      name: String(token.name ?? "").trim(),
      position: token.position ?? null,
      layer: String(token.layer ?? "").trim(),
      link,
    };
    render();
  }

  async function fetchActiveCombatRuntimeForScene(context, player, includeHidden = false) {
    if (!context?.roomId || !context?.sceneId || !api.combat?.getActiveRuntime || !hasUsableSettings(settings())) {
      return null;
    }
    return api.combat.getActiveRuntime(
      {
        campaign_id: context.campaignId,
        room_id: context.roomId,
        scene_id: context.sceneId,
        actor_player_id: player?.id ?? "",
        actor_is_gm: String(player?.role ?? "").toUpperCase() === "GM",
        include_hidden: includeHidden || String(player?.role ?? "").toUpperCase() === "GM",
      },
      settings(),
    ).catch(() => null);
  }

  async function refreshSceneCombatSnapshot(forceRender = false) {
    if (!bridges.obr?.getRoomSceneContext || !api.combat?.getActiveRuntime) {
      state.sceneCombatSnapshot = null;
      if (forceRender) render();
      return;
    }

    try {
      const [context, player] = await Promise.all([
        withTimeout(bridges.obr.getRoomSceneContext?.(), OBR_TIMEOUT, null),
        withTimeout(bridges.obr.getPlayerInfo?.(), OBR_TIMEOUT, null),
      ]);

      if (
        !context?.campaignId ||
        !context?.roomId ||
        !context?.sceneId ||
        !hasUsableSettings(settings())
      ) {
        state.sceneCombatSnapshot = null;
        if (forceRender) render();
        return;
      }

      const runtime = await withTimeout(
        fetchActiveCombatRuntimeForScene(
          context,
          player,
          String(player?.role ?? "").toUpperCase() === "GM",
        ),
        5000,
        null,
      );

      if (!runtime?.encounter?.id) {
        state.sceneCombatSnapshot = null;
      } else {
        state.sceneCombatSnapshot = {
          encounterId: String(runtime.encounter.id ?? "").trim(),
          stateVersion: Number(
            runtime.state_version ?? runtime.encounter?.state_version ?? 0,
          ) || 0,
          runtime,
        };
      }
    } catch (error) {
      console.warn("[Odyssey] Unable to refresh scene combat snapshot", error);
      state.sceneCombatSnapshot = null;
    }

    if (forceRender) render();
  }

  async function syncCharacterFromOwlbearSelection({ force = false } = {}) {
    const requestId = ++state.selectionSyncRequestId;
    const tokens = await withTimeout(
      bridges.obr?.getSelectedOwlbearTokens?.(),
      OBR_TIMEOUT,
      [],
    );
    if (!isSelectionRequestCurrent(requestId)) return;

    const selectedTokens = arr(tokens);
    const signature = `${selectedTokens.length}:${selectedTokens.map((token) => String(token?.id ?? "").trim()).sort().join("|")}`;
    if (!force && signature === state.lastSelectionSignature) {
      return;
    }
    state.lastSelectionSignature = signature;

    if (!selectedTokens.length) {
      state.selectedToken = null;
      state.selectedTokenResolution = {
        status: "idle",
        tokenId: "",
        tokenName: "",
        characterId: "",
        characterName: "",
        source: "",
        message: "No token selected.",
      };
      render();
      return;
    }

    if (selectedTokens.length > 1) {
      state.selectedToken = null;
      state.selectedTokenResolution = {
        status: "multiple",
        tokenId: "",
        tokenName: "",
        characterId: "",
        characterName: "",
        source: "",
        message: "Select exactly one token to open its character.",
      };
      render();
      return;
    }

    const selectedToken = selectedTokens[0] ?? null;
    if (!selectedToken) {
      state.selectedToken = null;
      state.selectedTokenResolution = {
        status: "idle",
        tokenId: "",
        tokenName: "",
        characterId: "",
        characterName: "",
        source: "",
        message: "No token selected.",
      };
      render();
      return;
    }

    const tokenLink = bridges.token?.getTokenCharacterLink?.(selectedToken) ?? { characterId: "" };
    const selectedTokenId = String(selectedToken.id ?? "").trim();
    const selectedTokenName = String(selectedToken.name ?? "").trim();
    state.selectedToken = {
      id: selectedTokenId,
      name: selectedTokenName,
      position: selectedToken.position ?? null,
      layer: String(selectedToken.layer ?? "").trim(),
      link: tokenLink,
    };
    state.selectedTokenResolution = {
      status: "loading",
      tokenId: selectedTokenId,
      tokenName: selectedTokenName,
      characterId: "",
      characterName: "",
      source: "",
      message: "Resolving selected token...",
    };
    render();

    const [context, player] = await Promise.all([
      withTimeout(bridges.obr?.getRoomSceneContext?.(), OBR_TIMEOUT, null),
      withTimeout(bridges.obr?.getPlayerInfo?.(), OBR_TIMEOUT, null),
    ]);
    if (!isSelectionRequestCurrent(requestId)) return;

    if (!context?.campaignId || !context?.roomId || !context?.sceneId || !hasUsableSettings(settings())) {
      state.selectedTokenResolution = {
        status: "error",
        tokenId: selectedTokenId,
        tokenName: selectedTokenName,
        characterId: "",
        characterName: "",
        source: "",
        message: "Unable to resolve Owlbear scene context.",
      };
      render();
      return;
    }

    let runtime = state.sceneCombatSnapshot?.runtime ?? null;
    if (!runtime) {
      await refreshSceneCombatSnapshot();
      if (!isSelectionRequestCurrent(requestId)) return;
      runtime = state.sceneCombatSnapshot?.runtime ?? null;
    }

    const isGm = isGM();
    let candidateCharacterId = "";
    let candidateCharacterName = "";
    let candidateSource = "";

    const participant = arr(runtime?.visible_participants).find(
      (row) => String(row?.token_id ?? "").trim() === selectedTokenId,
    ) ?? null;

    if (participant) {
      candidateCharacterId = String(participant.character_id ?? "").trim();
      candidateCharacterName = String(participant.display_name ?? participant.character_key ?? "").trim();
      candidateSource = "combat_runtime";
      const controlledIds = new Set(
        arr(runtime?.viewer_controlled_character_ids)
          .map((id) => String(id ?? "").trim())
          .filter(Boolean),
      );
      const allowed = isGm || controlledIds.has(candidateCharacterId);
      if (!allowed) {
        state.selectedTokenResolution = {
          status: "forbidden",
          tokenId: selectedTokenId,
          tokenName: selectedTokenName,
          characterId: candidateCharacterId,
          characterName: "",
          source: candidateSource,
          message: "You can only open characters assigned to you.",
        };
        render();
        return;
      }
    } else {
      const linkResult = await api.placement.getSceneTokenLinks(
        {
          campaign_id: context.campaignId,
          room_id: context.roomId,
          scene_id: context.sceneId,
          token_id: selectedTokenId,
          actor_player_id: player?.id ?? "",
          actor_is_gm: isGm,
        },
        settings(),
      ).catch(() => null);
      if (!isSelectionRequestCurrent(requestId)) return;

      const link = arr(linkResult?.links)[0] ?? null;
      const control = link?.character?.control ?? {};
      const allowed = isGm || control?.allowed === true || link?.character?.can_control === true;

      if (!link?.character?.id) {
        state.selectedTokenResolution = {
          status: "unlinked",
          tokenId: selectedTokenId,
          tokenName: selectedTokenName,
          characterId: "",
          characterName: "",
          source: "scene_link",
          message: "Selected token is not linked to a character.",
        };
        render();
        return;
      }

      candidateCharacterId = String(link.character.id ?? "").trim();
      candidateCharacterName = String(link.character.display_name ?? link.character.character_key ?? "").trim();
      candidateSource = "scene_link";

      if (!allowed) {
        state.selectedTokenResolution = {
          status: "forbidden",
          tokenId: selectedTokenId,
          tokenName: selectedTokenName,
          characterId: candidateCharacterId,
          characterName: "",
          source: candidateSource,
          message: "You can only open characters assigned to you.",
        };
        render();
        return;
      }
    }

    state.selectedTokenResolution = {
      status: "resolved",
      tokenId: selectedTokenId,
      tokenName: selectedTokenName,
      characterId: candidateCharacterId,
      characterName: candidateCharacterName,
      source: candidateSource,
      message: "",
    };

    if (state.characterId === candidateCharacterId) {
      await refreshTacticalSnapshot(true);
      render();
      return;
    }

    await loadCharacter(candidateCharacterId, { selectionRequestId: requestId });
    if (!isSelectionRequestCurrent(requestId)) return;
    await refreshSelectedTokenContext();
    if (!isSelectionRequestCurrent(requestId)) return;
    await refreshTacticalSnapshot(true);
  }

  async function refreshTacticalSnapshot(forceRender = false) {
    if (!state.characterId || !bridges.obr?.getRoomSceneContext || !api.combat?.getActiveRuntime) {
      state.tacticalSnapshot = null;
      if (forceRender) render();
      return;
    }
    try {
      const [player, context] = await Promise.all([
        withTimeout(bridges.obr.getPlayerInfo?.(), OBR_TIMEOUT, null),
        withTimeout(bridges.obr.getRoomSceneContext?.(), OBR_TIMEOUT, null),
      ]);
      if (!context?.roomId || !context?.sceneId || !hasUsableSettings(settings())) {
        state.tacticalSnapshot = null;
        if (forceRender) render();
        return;
      }
      const runtimeRes = state.sceneCombatSnapshot?.runtime
        ?? await fetchActiveCombatRuntimeForScene(
          context,
          player,
          String(player?.role ?? "").toUpperCase() === "GM",
        );
      const participants = arr(runtimeRes?.visible_participants);
      const participant = participants.find((row) => String(row?.character_id ?? "").trim() === state.characterId) ?? null;
      if (!runtimeRes?.encounter?.id) {
        state.tacticalSnapshot = null;
      } else {
        state.tacticalSnapshot = {
          encounterId: String(runtimeRes.encounter.id ?? "").trim(),
          stateVersion: Number(runtimeRes.state_version ?? runtimeRes.encounter?.state_version ?? 0) || 0,
          grid: normalizeTacticalGridSettings(runtimeRes.tactical_grid),
          participant,
          runtime: runtimeRes,
        };
      }
    } catch (error) {
      console.warn("[Odyssey] Tactical snapshot refresh failed:", error);
      state.tacticalSnapshot = null;
    }
    if (forceRender) render();
  }

  /* ---- detect role (best-effort; OBR may be absent) ---- */
  (async () => {
    const player = await withTimeout(bridges.obr?.getPlayerInfo?.(), OBR_TIMEOUT, null);
    if (player?.role) {
      state.role = String(player.role).toUpperCase() === "GM" ? "GM" : "PLAYER";
      if (isGM()) {
        setupCatalogSubscriptions();
        refreshGmCatalogs().catch(() => {});
      } else {
        cleanupCatalogSubscriptions();
      }
      render();
    }
  })();

  void (async () => {
    const subs = [];
    const safePush = (unsubscribe) => {
      if (typeof unsubscribe === "function") subs.push(unsubscribe);
    };
    safePush(await bridges.obr?.subscribePlayerChanges?.(() => {
      scheduleSelectionSync();
    }));
    safePush(await bridges.obr?.subscribeSceneItems?.(() => {
      scheduleSelectionSync(true);
    }));
    safePush(await subscribeMoveToolMessages((event) => {
      if (
        event.type === MOVE_TOOL_EVENTS.Status ||
        event.type === MOVE_TOOL_EVENTS.Activated ||
        event.type === MOVE_TOOL_EVENTS.Cancelled
      ) {
        state.moveToolStatus = {
          ...(state.moveToolStatus ?? {}),
          ...(event.payload ?? {}),
        };
        render();
      }
      if (event.type === MOVE_TOOL_EVENTS.Applied) {
        state.moveToolStatus = {
          ...(state.moveToolStatus ?? {}),
          ...(event.payload ?? {}),
        };
        if (state.characterId && event.payload?.characterId === state.characterId) {
          refresh({ sheet: true, armory: false, equipment: false, inventory: false, abilities: false, perkAvailability: false }).catch(() => {});
        } else {
          render();
        }
      }
      if (event.type === MOVE_TOOL_EVENTS.Error) {
        state.moveToolStatus = {
          ...(state.moveToolStatus ?? {}),
          active: false,
          pending: false,
          characterId: String(
            event.payload?.characterId ?? state.characterId ?? "",
          ).trim(),
          tokenId: String(
            event.payload?.tokenId ?? state.selectedToken?.id ?? "",
          ).trim(),
          error: String(
            event.payload?.message ?? "Unable to activate Move.",
          ),
        };
        render();
      }
    }));
    state.uiSubscriptions = subs;
    await refreshSelectedTokenContext().catch(() => {});
    await ensureSettings().catch(() => {});
    setupSceneCombatSubscriptions();
    await refreshSceneCombatSnapshot(true).catch(() => {});
    scheduleSelectionSync(true);
    await sendMoveToolCommand(MOVE_TOOL_COMMANDS.RequestStatus).catch(() => {});
  })();

  /* ---- data adapters ---- */
  // Central read via get_character_runtime_bundle - one RPC replaces 4-5 parallel calls.
  // combat section: body_parts with minor/serious/critical/disabled/destroyed/armor_value/armor_critical
  // No HP tracking - damage state is tracked per body part.
  const loadBundle = (id, sections) =>
    api.placement.getCharacterRuntimeBundle({ character_id: id, sections }, settings());

  // Catalog of item definitions for the GM "Add item" dropdown (read-only).
  async function fetchItemDefs() {
    const rows = await bridges.supabase.fetchSupabaseRows(
      "odyssey_item_defs?select=code,name,item_type&order=name",
      settings(),
      "Unable to read item defs.",
    );
    return arr(rows);
  }

  async function fetchAmmoAndMagazineDefs() {
    const safe = (p) => p.catch(() => []);
    const [magazines, ammo] = await Promise.all([
      safe(bridges.supabase.fetchSupabaseRows("odyssey_magazine_defs?select=id,code,name,capacity,caliber_id,caliber:caliber_id(id,code,name)&order=name", settings(), "")),
      safe(bridges.supabase.fetchSupabaseRows("odyssey_ammo_type_defs?select=id,code,name,caliber_id,caliber:caliber_id(id,code,name)&order=name", settings(), "")),
    ]);
    state.magazineDefs = arr(magazines);
    state.ammoDefs = arr(ammo);
  }

  // Fetch GM-only grant defs (skills, weapon models, equipment models).
  async function fetchGmDefs() {
    const safe = (p) => p.catch(() => []);
    const [skills, weapons, equipment] = await Promise.all([
      safe(bridges.supabase.fetchSupabaseRows("odyssey_skill_defs?select=id,code,name,category,max_level&order=name", settings(), "")),
      safe(bridges.supabase.fetchSupabaseRows("odyssey_weapon_model_defs?select=id,code,name&order=name", settings(), "")),
      safe(bridges.supabase.fetchSupabaseRows("odyssey_equipment_model_defs?select=id,code,name,item_type&order=name", settings(), "")),
    ]);
    state.skillDefs = arr(skills);
    state.weaponDefs = arr(weapons);
    state.equipmentDefs = arr(equipment);
  }

  async function refreshGmCatalogs() {
    await Promise.all([
      fetchAmmoAndMagazineDefs().catch(() => {}),
      fetchGmDefs().catch(() => {}),
      fetchItemDefs().then((rows) => { state.itemDefs = arr(rows); }).catch(() => {}),
    ]);
    render();
  }

  // Maps bundle response into state. Merges into existing sheet so partial refreshes
  // (abilities-only, equipment-only, etc.) never wipe fields that weren't requested.
  function applyBundle(bundle) {
    if (!bundle || bundle.ok === false || !bundle.character) return false;
    const s = bundle.sections ?? {};
    const combat = s.combat && typeof s.combat === "object" ? s.combat : null;

    // Build only the patch for sections that were actually returned
    const patch = { character: bundle.character };
    if (s.attributes !== undefined)           patch.attributes    = arr(s.attributes);
    if (combat !== null) {
      patch.body_parts    = arr(combat.body_parts);
      patch.is_alive      = combat.is_alive ?? true;
      patch.is_conscious  = combat.is_conscious ?? true;
      patch.armor_summary = combat.armor_summary ?? null;
      patch.combat_flags  = combat.combat_flags ?? {};
    }
    if (s.combat_session !== undefined)      patch.combat_session = s.combat_session ?? null;
    if (s.skills !== undefined)               patch.skills        = arr(s.skills);
    if (s.abilities?.resource_pools !== undefined) patch.resource_pools = arr(s.abilities.resource_pools);
    if (bundle.state?.status_summary !== undefined) patch.status_summary = bundle.state.status_summary;

    // Merge into existing sheet; initialise defaults on first load
    state.sheet = state.sheet
      ? { ...state.sheet, ...patch }
      : { attributes: [], body_parts: [], skills: [], resource_pools: [],
          is_alive: true, is_conscious: true, status_summary: "",
          armor_summary: null, combat_flags: {}, combat_session: null, ...patch };

    if (s.abilities) {
      state.abilities = arr(s.abilities.abilities);
      state.pools = arr(s.abilities.resource_pools);
    }
    if (s.perks !== undefined) {
      state.perks = arr(s.perks);
    }
    if (s.equipment !== undefined) {
      // Bundle returns a flat array; add model/body_part sub-objects for render compat
      state.equipment = arr(s.equipment).map((it) => {
        const model = it.model && typeof it.model === "object"
          ? it.model
          : {
              id: it.equipment_model_id ?? null,
              code: it.equipment_model_code ?? null,
              name: it.equipment_model_name ?? it.name ?? null,
              item_type: it.item_type,
              description: it.model_description ?? "",
              default_body_part_code: it.default_body_part_code ?? null,
              can_equip: it.can_equip !== false,
              can_equip_to_body_part: it.can_equip_to_body_part !== false,
              effect_data: it.effect_data ?? {},
              flags: it.flags ?? {},
              tags: arr(it.tags),
            };
        return {
          ...it,
          model,
          effective_flags: (it.effective_flags && typeof it.effective_flags === "object")
            ? it.effective_flags
            : (it.flags && typeof it.flags === "object" ? it.flags : (model.flags || {})),
          body_part: it.body_part && typeof it.body_part === "object"
            ? it.body_part
            : ((it.is_equipped && it.equipped_body_part_id)
              ? { id: it.equipped_body_part_id, name: it.equipped_body_part_name, code: it.equipped_body_part_code, part_key: it.equipped_body_part_key }
              : null),
        };
      });
    }
    if (s.inventory) {
      state.inv = {
        ammoStock: arr(s.inventory.ammo_stock),
        magazines: arr(s.inventory.magazines),
        items: arr(s.inventory.items),
        fallback: false,
      };
    }
    return true;
  }

  async function ensureSettings() {
    const dev = loadDevSettings();
    if (hasUsableSettings(dev)) { state.settings = dev; return dev; }
    const resolved = await resolveEffectiveSettings();
    state.settings = resolved.settings;
    return resolved.settings;
  }

  const ALL_SECTIONS = ["summary", "combat", "combat_session", "attributes", "skills", "perks", "equipment", "inventory", "abilities", "effects"];
  const DEFAULT_REFRESH = { sheet: true, armory: true, equipment: true, inventory: true, abilities: false, perkAvailability: false };

  function mergeRefreshOptions(base = {}, extra = {}) {
    return {
      sheet: !!(base.sheet || extra.sheet),
      armory: !!(base.armory || extra.armory),
      equipment: !!(base.equipment || extra.equipment),
      inventory: !!(base.inventory || extra.inventory),
      abilities: !!(base.abilities || extra.abilities),
      perkAvailability: !!(base.perkAvailability || extra.perkAvailability),
    };
  }

  async function loadCharacter(id, options = {}) {
    const selectionRequestId = options.selectionRequestId ?? 0;
    state.loading = true; state.error = null; state.notice = ""; render();
    cleanupRealtimeSubscriptions();
    try {
      await ensureSettings();
      if (!hasUsableSettings(settings())) {
        throw new Error("Supabase is not configured. Set URL/key in the Resolve Attack tab.");
      }
      const gmMode = isGM();
      const [bundle, itemDefs, armoryData, perksResult, availablePerksResult] = await Promise.all([
        loadBundle(id, ALL_SECTIONS),
        gmMode && !state.itemDefs.length ? fetchItemDefs().catch(() => []) : Promise.resolve(state.itemDefs),
        api.weapon.getCharacterArmory(id, settings()).catch(() => null),
        api.perk.getCharacterPerks({ character_id: id }, settings()).catch(() => null),
        gmMode ? api.perk.getCharacterAvailablePerks({ character_id: id }, settings()).catch(() => null) : Promise.resolve(null),
      ]);
      if (!state.ammoDefs.length || !state.magazineDefs.length) {
        await fetchAmmoAndMagazineDefs().catch(() => {});
      }
      if (gmMode && (!state.skillDefs.length || !state.weaponDefs.length || !state.equipmentDefs.length)) {
        fetchGmDefs().then(() => render()).catch(() => {});
      }
      if (!isSelectionRequestCurrent(selectionRequestId)) return false;
      if (!bundle || bundle.ok === false || !bundle.character) throw new Error("Character not found: check character_id.");
      state.characterId = id;
      state.itemDefs = arr(itemDefs);
      if (armoryData) state.armory = armoryData;
      applyBundle(bundle);
      if (perksResult?.ok) state.perks = arr(perksResult.perks);
      state.perkAvailability = gmMode && availablePerksResult?.ok ? arr(availablePerksResult.perks) : [];
      state.pinnedPartId = "";
      setupRealtimeSubscriptions(id);
      await refreshSceneCombatSnapshot();
      await refreshTacticalSnapshot();
      return true;
    } catch (e) {
      state.error = e.message;
    } finally {
      state.loading = false;
      render();
    }
    return false;
  }

  // Re-pull server state after a mutation using bundle sections - selective refresh.
  async function performRefresh(options) {
    const id = state.characterId;
    if (!id) return;
    const { sheet, armory, equipment, inventory, abilities, perkAvailability } = options;
    const sections = [
      ...(sheet ? ["summary", "combat", "combat_session", "attributes", "skills"] : []),
      ...(sheet ? ["perks"] : []),
      ...(equipment ? ["equipment"] : []),
      ...(inventory ? ["inventory"] : []),
      ...(abilities ? ["abilities"] : []),
    ];
    const bundlePromise = sections.length ? loadBundle(id, sections).catch(() => null) : Promise.resolve(null);
    const armoryPromise = armory ? api.weapon.getCharacterArmory(id, settings()).catch(() => null) : Promise.resolve(null);
    const perksPromise = sheet ? api.perk.getCharacterPerks({ character_id: id }, settings()).catch(() => null) : Promise.resolve(null);
    const availablePerksPromise = isGM() && perkAvailability
      ? api.perk.getCharacterAvailablePerks({ character_id: id }, settings()).catch(() => null)
      : Promise.resolve(null);
    const [bundle, armoryData, perksResult, availablePerksResult] = await Promise.all([bundlePromise, armoryPromise, perksPromise, availablePerksPromise]);
    if (bundle) applyBundle(bundle);
    if (armoryData) state.armory = armoryData;
    if (perksResult?.ok) state.perks = arr(perksResult.perks);
    if (perkAvailability) {
      state.perkAvailability = isGM() && availablePerksResult?.ok ? arr(availablePerksResult.perks) : [];
    }
    if (sheet) {
      await refreshSceneCombatSnapshot();
      await refreshTacticalSnapshot();
    }
    render();
  }

  async function refresh(options = {}) {
    const merged = { ...DEFAULT_REFRESH, ...options };
    if (state.refreshInFlight) {
      state.queuedRefresh = state.queuedRefresh
        ? mergeRefreshOptions(state.queuedRefresh, merged)
        : merged;
      return state.refreshInFlight;
    }

    state.refreshInFlight = (async () => {
      await performRefresh(merged);
    })();

    try {
      await state.refreshInFlight;
    } finally {
      state.refreshInFlight = null;
      if (state.queuedRefresh) {
        const next = state.queuedRefresh;
        state.queuedRefresh = null;
        return refresh(next);
      }
    }
    return null;
  }

  function queueRealtimeRefresh(options = {}) {
    state.realtimeRefreshPending = state.realtimeRefreshPending
      ? mergeRefreshOptions(state.realtimeRefreshPending, options)
      : { ...DEFAULT_REFRESH, ...options };
    if (state.realtimeRefreshTimer) clearTimeout(state.realtimeRefreshTimer);
    state.realtimeRefreshTimer = setTimeout(() => {
      const pending = state.realtimeRefreshPending;
      state.realtimeRefreshPending = null;
      state.realtimeRefreshTimer = null;
      refresh(pending).catch(() => {});
    }, 120);
  }

  function setupSceneCombatSubscriptions(sb = getRealtimeClient(settings())) {
    if (!sb) return;
    cleanupSceneCombatSubscriptions(sb);
    const combatTables = [
      "odyssey_combat_encounters",
      "odyssey_initiative_entries",
      "odyssey_combat_positions",
    ];
    const combatEpoch = Date.now();
    for (const table of combatTables) {
      const channel = sb
        .channel(`cp:scene-combat:${combatEpoch}:${table}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => {
            refreshSceneCombatSnapshot(true).catch(() => {});
            if (state.characterId) {
              refreshTacticalSnapshot(true).catch(() => {});
            }
            scheduleSelectionSync(true);
          },
        )
        .subscribe();
      state.sceneRealtimeSubscriptions.push(channel);
    }
  }

  /* ---- Real-Time subscriptions for live updates ---- */
  function setupRealtimeSubscriptions(characterId) {
    const sb = getRealtimeClient(settings());
    if (!sb) return;

    const tables = [
      "odyssey_character_body_parts",
      "odyssey_character_equipment_items",
      "odyssey_character_items",
      "odyssey_character_attributes",
      "odyssey_character_weapons",
      "odyssey_character_weapon_profile_states",
      "odyssey_character_magazines",
      "odyssey_character_perks",
      "odyssey_character_abilities",
      "odyssey_character_effects",
      "odyssey_character_resource_pools",
    ];

    const epoch = Date.now();
    for (const table of tables) {
      const channel = sb
        .channel(`cp:${epoch}:${table}:${characterId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `character_id=eq.${characterId}` },
          () => { onRealtimeUpdate(table); },
        )
        .subscribe();
      state.realtimeSubscriptions.push(channel);
    }

    if (isGM()) setupCatalogSubscriptions(sb);
  }

  function setupCatalogSubscriptions(sb = getRealtimeClient(settings())) {
    if (!sb) return;
    cleanupCatalogSubscriptions(sb);
    const tables = [
      "odyssey_item_defs",
      "odyssey_skill_defs",
      "odyssey_weapon_model_defs",
      "odyssey_equipment_model_defs",
      "odyssey_magazine_defs",
      "odyssey_ammo_type_defs",
    ];
    const epoch = Date.now();
    for (const table of tables) {
      const channel = sb
        .channel(`cp:def:${epoch}:${table}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => { refreshGmCatalogs().catch(() => {}); },
        )
        .subscribe();
      state.catalogSubscriptions.push(channel);
    }
  }

  function cleanupRealtimeSubscriptions() {
    const sb = getRealtimeClient(settings());
    if (!sb) { state.realtimeSubscriptions = []; return; }
    for (const channel of state.realtimeSubscriptions) sb.removeChannel(channel);
    state.realtimeSubscriptions = [];
    cleanupCatalogSubscriptions(sb);
    if (state.realtimeRefreshTimer) clearTimeout(state.realtimeRefreshTimer);
    state.realtimeRefreshTimer = null;
    state.realtimeRefreshPending = null;
  }

  function cleanupSceneCombatSubscriptions(sb = getRealtimeClient(settings())) {
    if (!sb) { state.sceneRealtimeSubscriptions = []; return; }
    for (const channel of state.sceneRealtimeSubscriptions) sb.removeChannel(channel);
    state.sceneRealtimeSubscriptions = [];
  }

  function cleanupCatalogSubscriptions(sb = getRealtimeClient(settings())) {
    if (!sb) { state.catalogSubscriptions = []; return; }
    for (const channel of state.catalogSubscriptions) sb.removeChannel(channel);
    state.catalogSubscriptions = [];
  }

  function onRealtimeUpdate(table) {
    // Selectively refresh based on which table changed
    switch (table) {
      case "odyssey_character_body_parts":
        queueRealtimeRefresh({ sheet: true, armory: false, equipment: false, inventory: false, abilities: false, perkAvailability: false });
        break;
      case "odyssey_character_equipment_items":
        queueRealtimeRefresh({ sheet: true, armory: false, equipment: true, inventory: false, abilities: false, perkAvailability: false });
        break;
      case "odyssey_character_items":
        queueRealtimeRefresh({ sheet: false, armory: false, equipment: false, inventory: true, abilities: false, perkAvailability: false });
        break;
      case "odyssey_character_attributes":
        queueRealtimeRefresh({ sheet: true, armory: false, equipment: false, inventory: false, abilities: false, perkAvailability: true });
        break;
      case "odyssey_character_perks":
      case "odyssey_character_effects":
        queueRealtimeRefresh({ sheet: true, armory: false, equipment: false, inventory: false, abilities: false, perkAvailability: true });
        break;
      case "odyssey_character_weapons":
      case "odyssey_character_weapon_profile_states":
      case "odyssey_character_magazines":
        queueRealtimeRefresh({ sheet: false, armory: true, equipment: false, inventory: true, abilities: false, perkAvailability: false });
        break;
      case "odyssey_character_abilities":
      case "odyssey_character_resource_pools":
        queueRealtimeRefresh({ sheet: false, armory: false, equipment: false, inventory: false, abilities: true, perkAvailability: false });
        break;
    }
  }

  /* ---- mutation runner: handles {ok:false} AND thrown SupabaseError; never crashes ---- */
  async function runMutation(label, fn, after) {
    if (state.busy) return;
    state.busy = true; state.notice = `${label}...`; render();
    try {
      let result;
      try { result = await fn(); }
      catch (e) {
        state.notice = ""; setNotice("err", `${esc(describeError(e.code, e.message))}`);
        state.busy = false; render(); return null;
      }
      if (result && result.ok === false) {
        setNotice("err", `${esc(describeError(result.error, result.message))}${result.error ? ` <span class="cp-mono">[${esc(result.error)}]</span>` : ""}`);
        state.busy = false; render(); return null;
      }
      if (after) await after(result);
      setNotice("ok", `${esc(label)} done.`);
      return result;
    } finally {
      state.busy = false; render();
    }
  }
  function setNotice(kind, html) { state.notice = `__${kind}__${html}`; }
  function noticeHtml() {
    if (!state.notice) return "";
    const m = state.notice.match(/^__(ok|err|warn|info)__(.*)$/s);
    if (m) return banner(m[1], m[2]);
    return banner("info", esc(state.notice));
  }

  /* =========================================================== render */
  function render() {
    root.innerHTML = `<div class="cp-screen">${topBar()}${body()}</div>`;
    bindStaticEvents();
  }

  function topBar() {
    const cfgWarn = hasUsableSettings(loadDevSettings()) ? "" :
      `<div class="cp-banner warn" style="margin-top:6px">Supabase not configured - open the <b>Resolve Attack</b> tab and save URL/key, then load a character here.</div>`;
    const selection = state.selectedTokenResolution;
    const selectionMeta = isGM() ? "GM control" : "Your character";
    const selectionText = (() => {
      if (!selection || selection.status === "idle") return "No token selected.";
      if (selection.status === "multiple") return "Select exactly one token.";
      if (selection.status === "unlinked") return "Selected token is not linked to a character.";
      if (selection.status === "forbidden") return "You can only open characters assigned to you.";
      if (selection.status === "error") return selection.message || "Unable to resolve Owlbear scene context.";
      if (selection.status === "loading") return `Selected token: ${esc(selection.tokenName || "Token")} · resolving...`;
      if (selection.status === "resolved") {
        const tokenName = esc(selection.tokenName || "Token");
        const charName = esc(selection.characterName || selection.characterId || "Character");
        return `Selected token: ${tokenName} · ${charName}`;
      }
      return selection.message || "No token selected.";
    })();
    return `
      <section class="panel">
        <div class="panel-title">Character</div>
        <div class="cp-row">
          <label class="cp-field"><span>character_id</span><input data-ref="charId" class="cp-mono" placeholder="uuid" autocomplete="off" value="${esc(state.characterId)}"></label>
          <label class="cp-field" style="max-width:170px"><span>View as (dev)</span>
            <select data-ref="devRole">
              <option value="auto" ${state.devRole === "auto" ? "selected" : ""}>Auto (${esc(state.role)})</option>
              <option value="PLAYER" ${state.devRole === "PLAYER" ? "selected" : ""}>Player</option>
              <option value="GM" ${state.devRole === "GM" ? "selected" : ""}>GM</option>
            </select></label>
        </div>
        <div class="button-row">
          <button data-ref="loadBtn" type="button">Load character</button>
        </div>
        <div class="cp-muted" style="margin-top:6px">${selectionText}</div>
        ${(selection?.status === "resolved") ? `<div class="cp-muted" style="margin-top:4px">${selectionMeta}</div>` : ""}
        ${cfgWarn}
      </section>`;
  }

  function body() {
    if (state.loading) return skeleton();
    if (state.error) {
      return `<section class="panel">${banner("err", esc(state.error))}
        <div class="button-row"><button data-ref="retry" type="button">Retry</button></div></section>`;
    }
    if (!state.sheet) {
      return `<section class="panel">${noticeHtml()}${renderCombatSessionCard()}<div class="cp-empty">Select a token in Owlbear or enter a character_id and press <b>Load character</b>.</div></section>`;
    }
    return `<section class="panel">
      ${headerBlock()}
      <div class="cp-nav" role="tablist">${navTabs()}</div>
      ${noticeHtml()}
      <div data-ref="section" style="margin-top:10px">${sectionContent()}</div>
    </section>`;
  }

  function skeleton() {
    return `<section class="panel">
      <div class="cp-skel cp-skel-card" style="width:60%"></div>
      <div class="cp-attrs" style="margin-top:10px">${Array.from({ length: 9 }).map(() => `<div class="cp-skel cp-skel-card"></div>`).join("")}</div>
      <div class="cp-skel cp-skel-line" style="width:40%;margin-top:12px"></div>
    </section>`;
  }

  /* ---- header ---- */
  function headerBlock() {
    const ch = state.sheet.character || {};
    const res = ch.resources && typeof ch.resources === "object" ? ch.resources : {};
    const portrait = res.portrait || res.avatar_url || res.image || "";
    const meta = [];
    if (res.faction) meta.push(`Faction: ${esc(res.faction)}`);
    if (res.age) meta.push(`Age: ${esc(res.age)}`);
    if (ch.character_bucket) meta.push(esc(ch.character_bucket));
    const poolChips = state.pools
      .filter((p) => p && (p.max_value ?? 0) > 0)
      .map((p) => {
        if (isGM()) {
          const cur = p.current_value ?? 0;
          const max = p.max_value ?? 0;
          return `<span class="cp-chip cp-pool-gm">
            <button class="cp-pool-adj" data-pool-adjust="-1" data-pool-code="${esc(p.code)}" ${cur <= 0 ? "disabled" : ""} aria-label="Decrease ${esc(p.name || p.code)}">-</button>
            <span>${esc(p.name || p.code)} <span class="cp-mono">${dash(cur)}/${dash(max)}</span></span>
            <button class="cp-pool-adj" data-pool-adjust="1" data-pool-code="${esc(p.code)}" ${cur >= max ? "disabled" : ""} aria-label="Increase ${esc(p.name || p.code)}">+</button>
          </span>`;
        }
        return `<span class="cp-chip">${esc(p.name || p.code)} <span class="cp-mono">${dash(p.current_value)}/${dash(p.max_value)}</span></span>`;
      })
      .join("");
    return `<div class="cp-head">
      <div class="cp-avatar">${portrait ? `<img src="${esc(portrait)}" alt="">` : esc((ch.name || "?").slice(0, 1).toUpperCase())}</div>
      <div style="flex:1;min-width:120px">
        <div class="cp-name">${esc(ch.name || ch.character_key || "Character")}</div>
        <div class="cp-muted">${meta.join(" - ") || "&nbsp;"}</div>
      </div>
      <div class="cp-head-actions">
        ${isGM() ? `<button data-ref="refreshCatalogsTop" type="button" class="cp-pill cp-head-btn">Sync</button><span class="cp-pill good">GM</span>` : `<span class="cp-pill">Player</span>`}
      </div>
    </div>
    ${poolChips ? `<div class="cp-row" style="margin-top:8px">${poolChips}</div>` : ""}`;
  }

  function navTabs() {
    const tabs = [
      ["overview", "Overview"], ["skills", "Skills"], ["perks", "Perks"], ["abilities", "Abilities"],
      ["inventory", "Inventory"], ["armor", "Armor"], ["implants", "Implants"],
    ];
    return tabs.map(([k, label]) =>
      `<button class="cp-tab ${state.section === k ? "active" : ""}" role="tab" aria-selected="${state.section === k}" data-section="${k}">${label}</button>`,
    ).join("");
  }

  function sectionContent() {
    switch (state.section) {
      case "skills": return renderSkills();
      case "perks": return renderPerks();
      case "abilities": return renderAbilities();
      case "inventory": return renderInventory();
      case "armor": return renderArmor();
      case "implants": return renderImplants();
      default: return renderOverview();
    }
  }

  async function buildOwlbearTacticalGridPayload() {
    const grid = await withTimeout(bridges.obr?.getSceneGrid?.(), OBR_TIMEOUT, null);
    if (!grid) {
      throw new Error("Owlbear grid is not available.");
    }
    const gridType = normalizeObrGridType(grid.type);
    const distanceMode = normalizeDistanceMode(grid.type, grid.measurement);
    if (!gridType || !distanceMode || !(Number(grid.dpi) > 0)) {
      throw new Error("Only Square, Hex Vertical, and Hex Horizontal grids are supported for tactical movement.");
    }
    const anchor = await withTimeout(
      bridges.obr?.snapScenePosition?.({ x: 0, y: 0 }, 1),
      OBR_TIMEOUT,
      null,
    );
    if (!anchor) {
      throw new Error("Unable to resolve tactical grid anchor from Owlbear.");
    }
    const metersPerCell = Math.max(1, Math.round(Number(grid?.scale?.parsed?.multiplier ?? 1) || 1));
    return {
      grid_type: gridType,
      distance_mode: distanceMode,
      meters_per_cell: metersPerCell,
      anchor_scene_x: Number(anchor.x) || 0,
      anchor_scene_y: Number(anchor.y) || 0,
      grid_dpi: Number(grid.dpi) || 0,
    };
  }

  function getLoadedCharacterParticipant() {
    return state.tacticalSnapshot?.participant ?? null;
  }

  function getActiveEncounterSummary() {
    const snapshot = state.sceneCombatSnapshot;
    if (!snapshot?.encounterId) return null;
    const runtime = snapshot.runtime ?? {};
    const encounter = runtime.encounter ?? {};
    const participants = arr(runtime.visible_participants);
    return {
      id: snapshot.encounterId,
      name: encounter.name || "Combat",
      round: Number(encounter.current_round ?? runtime.current_round ?? 0) || 0,
      stateVersion: snapshot.stateVersion,
      participantCount: participants.length,
      hasLoadedCharacterParticipant: !!getLoadedCharacterParticipant(),
    };
  }

  function getSelectedTokenForLoadedCharacter() {
    const selectedToken = state.selectedToken;
    const participant = getLoadedCharacterParticipant();

    if (!selectedToken || !participant) {
      return null;
    }

    const selectedTokenId = String(selectedToken.id ?? "").trim();
    const participantTokenId = String(participant.token_id ?? "").trim();

    if (
      selectedTokenId &&
      participantTokenId &&
      selectedTokenId === participantTokenId
    ) {
      return selectedToken;
    }

    const metadataCharacterId = String(
      selectedToken?.link?.characterId ?? "",
    ).trim();

    if (metadataCharacterId === state.characterId) {
      return selectedToken;
    }

    return null;
  }

  function getTokenPositionMismatch() {
    const participant = getLoadedCharacterParticipant();
    const selectedToken = getSelectedTokenForLoadedCharacter();
    const grid = state.tacticalSnapshot?.grid ?? null;
    const participantPosition = participant?.position ?? null;
    if (!participantPosition || !selectedToken?.position || !grid) return false;
    const selectedCell = sceneToCell(grid, selectedToken.position);
    if (!selectedCell) return false;
    return !sameCell(selectedCell, {
      q: participantPosition.cell_q,
      r: participantPosition.cell_r,
    });
  }

  async function syncTacticalGrid(selectedOnly = false) {
    if (!isGM()) {
      setNotice("err", "Only the GM can sync tactical positions.");
      render();
      return;
    }
    const snapshot = state.tacticalSnapshot;
    if (!snapshot?.encounterId) {
      setNotice("err", "No active encounter is loaded for this character.");
      render();
      return;
    }
    const selectedForCharacter = getSelectedTokenForLoadedCharacter();
    if (selectedOnly && !selectedForCharacter) {
      setNotice("err", "Select this character's token in Owlbear before syncing its position.");
      render();
      return;
    }
    state.busy = true;
    render();
    try {
      await ensureSettings();
      const [context, player] = await Promise.all([
        withTimeout(bridges.obr?.getRoomSceneContext?.(), OBR_TIMEOUT, null),
        withTimeout(bridges.obr?.getPlayerInfo?.(), OBR_TIMEOUT, null),
      ]);
      const [sceneItems, gridPayload, runtimeRes] = await Promise.all([
        withTimeout(bridges.obr?.getSceneItems?.(), OBR_TIMEOUT, []),
        buildOwlbearTacticalGridPayload(),
        api.combat.getActiveRuntime(
          {
            campaign_id: context?.campaignId ?? "",
            room_id: context?.roomId ?? "",
            scene_id: context?.sceneId ?? "",
            actor_player_id: player?.id ?? "",
            actor_is_gm: true,
            include_hidden: true,
          },
          settings(),
        ),
      ]);
      if (!context?.roomId || !context?.sceneId || !runtimeRes?.encounter?.id) {
        throw new Error("Unable to resolve the active encounter context.");
      }
      const itemById = new Map(arr(sceneItems).map((item) => [String(item?.id ?? "").trim(), item]));
      const participants = arr(runtimeRes.visible_participants).filter((participant) => {
        if (!participant?.token_id || !participant?.character_id) return false;
        if (selectedOnly) {
          return String(participant.character_id ?? "").trim() === state.characterId;
        }
        return true;
      });
      const positions = [];
      for (const participant of participants) {
        const item = itemById.get(String(participant.token_id ?? "").trim());
        if (!item) continue;
        const snapped = await withTimeout(bridges.obr?.snapScenePosition?.(item.position, 1), OBR_TIMEOUT, null);
        if (!snapped) continue;
        const cell = sceneToCell(gridPayload, snapped);
        if (!cell) continue;
        positions.push({
          character_id: participant.character_id,
          token_id: participant.token_id,
          cell_q: cell.q,
          cell_r: cell.r,
          scene_x: Number(snapped.x) || 0,
          scene_y: Number(snapped.y) || 0,
        });
      }
      if (!positions.length) {
        throw new Error("No linked encounter tokens were available to sync.");
      }
      const result = await api.combat.syncPositionsFromOwlbear(
        {
          encounter_id: runtimeRes.encounter.id,
          campaign_id: context.campaignId,
          room_id: context.roomId,
          scene_id: context.sceneId,
          actor_player_id: player?.id ?? "",
          actor_is_gm: true,
          ...gridPayload,
          positions,
        },
        settings(),
      );
      if (!result || result.ok === false) {
        throw new Error(result?.message || result?.error || "Unable to sync tactical positions.");
      }
      setNotice("ok", selectedOnly ? "Token position synced." : `Tactical grid synced for ${positions.length} token(s).`);
      await refresh({ sheet: true, armory: false, equipment: false, inventory: false, abilities: false, perkAvailability: false });
      await refreshSelectedTokenContext();
      scheduleSelectionSync(true);
    } catch (error) {
      setNotice("err", esc(toErrorMessage(error, "Unable to sync tactical positions.")));
      render();
    } finally {
      state.busy = false;
      render();
    }
  }

  async function startMoveForLoadedCharacter() {
    const participant = getLoadedCharacterParticipant();
    const token = getSelectedTokenForLoadedCharacter();

    if (!participant || !token) {
      state.moveToolStatus = {
        active: false,
        pending: false,
        characterId: state.characterId,
        tokenId: String(state.selectedToken?.id ?? "").trim(),
        error: "Select this character's token in Owlbear before moving.",
      };
      render();
      return;
    }

    state.moveToolStatus = {
      ...(state.moveToolStatus ?? {}),
      active: false,
      pending: true,
      characterId: state.characterId,
      tokenId: String(token.id ?? "").trim(),
      error: "",
    };
    render();

    try {
      await bridges.obr.activateTool(TACTICAL_MOVE_TOOL_ID);
      await bridges.obr.activateToolMode(
        TACTICAL_MOVE_TOOL_ID,
        TACTICAL_MOVE_MODE_ID,
      );

      const [activeTool, activeMode] = await Promise.all([
        bridges.obr.getActiveTool(),
        bridges.obr.getActiveToolMode(),
      ]);

      if (
        activeTool !== TACTICAL_MOVE_TOOL_ID ||
        activeMode !== TACTICAL_MOVE_MODE_ID
      ) {
        throw new Error("Owlbear did not activate the Tactical Move tool.");
      }

      state.moveToolStatus = {
        ...(state.moveToolStatus ?? {}),
        active: true,
        pending: false,
        characterId: state.characterId,
        tokenId: String(token.id ?? "").trim(),
        error: "",
      };
      render();
    } catch (error) {
      state.moveToolStatus = {
        ...(state.moveToolStatus ?? {}),
        active: false,
        pending: false,
        characterId: state.characterId,
        tokenId: String(token.id ?? "").trim(),
        error: toErrorMessage(
          error,
          "Unable to activate Tactical Move.",
        ),
      };
      render();
    }
  }

  async function refreshAfterCombatStart() {
    setCombatStartStage("Refreshing character sheet...");
    const refreshPromise = withTimeout(
      refresh({
        sheet: true,
        armory: false,
        equipment: false,
        inventory: false,
        abilities: false,
        perkAvailability: false,
      }),
      5000,
      { __timedOut: "refresh" },
    );
    const selectedTokenPromise = (async () => {
      setCombatStartStage("Refreshing selected token...");
      return withTimeout(
        refreshSelectedTokenContext(),
        5000,
        { __timedOut: "selectedTokenContext" },
      );
    })();
    const results = await Promise.allSettled([refreshPromise, selectedTokenPromise]);

    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[Odyssey] Post-start refresh failed:", result.reason);
      }
      if (result.status === "fulfilled" && result.value?.__timedOut) {
        console.warn(`[Odyssey] Post-start step timed out: ${result.value.__timedOut}`);
      }
    }
    setCombatStartStage("Ready.");
    render();
  }

  async function startCombatForScene() {
    if (!isGM()) {
      setNotice("err", "Only the GM can start combat.");
      render();
      return;
    }
    state.busy = true;
    state.isStartingCombat = true;
    setCombatStartStage("Resolving Supabase settings...");
    setNotice("info", "Starting combat...");
    render();
    try {
      await ensureSettings();
      setCombatStartStage("Reading Owlbear room and scene...");
      const context = await withTimeout(
        bridges.obr?.getRoomSceneContext?.(),
        OBR_TIMEOUT,
        null,
      );
      setCombatStartStage("Reading Owlbear player...");
      const player = await withTimeout(
        bridges.obr?.getPlayerInfo?.(),
        OBR_TIMEOUT,
        null,
      );
      if (!context?.campaignId || !context?.roomId || !context?.sceneId) {
        throw new Error("Unable to resolve Owlbear room or scene context.");
      }
      const payload = {
        campaign_id: context.campaignId,
        room_id: context.roomId,
        scene_id: context.sceneId,
        actor_player_id: player?.id ?? "",
        actor_is_gm: true,
        name: "Combat",
      };
      setCombatStartStage("Creating Supabase RPC request...");
      let startPromise;
      try {
        startPromise = api.combat.startEncounter(payload, settings());
      } catch (error) {
        setCombatStartStage("Start RPC failed before request creation.");
        throw error;
      }
      setCombatStartStage("Waiting for Supabase response...");
      const timedResult = await withTimeout(
        startPromise,
        8000,
        { __timedOut: true },
      );
      let result = timedResult;
      if (timedResult?.__timedOut) {
        setCombatStartStage("Start RPC timed out. Checking whether combat was created...");
        const runtimeAfterTimeout = await withTimeout(
          fetchActiveCombatRuntimeForScene(context, player, true),
          3000,
          null,
        );
        if (runtimeAfterTimeout?.encounter?.id) {
          result = {
            ok: true,
            encounter: runtimeAfterTimeout.encounter,
            runtime: runtimeAfterTimeout,
            __resolvedByPoll: true,
          };
        } else {
          throw new Error(
            "Start combat request timed out and no active encounter was found.",
          );
        }
      }
      if (!result || result.ok === false) {
        throw new Error(result?.message || result?.error || "Unable to start combat.");
      }
      setCombatStartStage("Combat created.");
      if (result?.runtime?.encounter?.id) {
        const nextSceneSnapshot = {
          encounterId: String(result.runtime.encounter.id ?? "").trim(),
          stateVersion: Number(
            result.runtime.state_version ?? result.runtime.encounter?.state_version ?? 0,
          ) || 0,
          runtime: result.runtime,
        };
        state.sceneCombatSnapshot = nextSceneSnapshot;
        if (state.characterId) {
          const participants = arr(result.runtime.visible_participants);
          const participant = participants.find((row) => String(row?.character_id ?? "").trim() === state.characterId) ?? null;
          state.tacticalSnapshot = {
            encounterId: nextSceneSnapshot.encounterId,
            stateVersion: nextSceneSnapshot.stateVersion,
            grid: normalizeTacticalGridSettings(result.runtime.tactical_grid),
            participant,
            runtime: result.runtime,
          };
        }
      } else {
        void refreshSceneCombatSnapshot(true);
      }
      state.isStartingCombat = false;
      state.busy = false;
      setNotice("ok", result.__resolvedByPoll ? "Combat started. Runtime was confirmed by follow-up check." : "Combat started.");
      render();
      void refreshAfterCombatStart();
      scheduleSelectionSync(true);
    } catch (error) {
      const message = toErrorMessage(error, "Unable to start combat.");
      setCombatStartStage(`Failed: ${message}`);
      setNotice("err", esc(message));
      render();
    } finally {
      state.isStartingCombat = false;
      state.busy = false;
      render();
    }
  }

  async function endCombatForScene() {
    if (!isGM()) {
      setNotice("err", "Only the GM can end combat.");
      render();
      return;
    }
    const encounter = getActiveEncounterSummary();
    if (!encounter?.id) {
      setNotice("err", "No active combat was found for this scene.");
      render();
      return;
    }
    state.busy = true;
    render();
    try {
      await ensureSettings();
      const player = await withTimeout(bridges.obr?.getPlayerInfo?.(), OBR_TIMEOUT, null);
      const result = await api.combat.endEncounter(
        {
          encounter_id: encounter.id,
          actor_player_id: player?.id ?? "",
          actor_is_gm: true,
        },
        settings(),
      );
      if (!result || result.ok === false) {
        throw new Error(result?.message || result?.error || "Unable to end combat.");
      }
      state.sceneCombatSnapshot = null;
      state.tacticalSnapshot = null;
      state.moveToolStatus = null;
      setNotice("ok", "Combat ended.");
      await refresh({ sheet: true, armory: false, equipment: false, inventory: false, abilities: false, perkAvailability: false });
      await refreshSelectedTokenContext();
      scheduleSelectionSync(true);
    } catch (error) {
      setNotice("err", esc(toErrorMessage(error, "Unable to end combat.")));
      render();
    } finally {
      state.busy = false;
      render();
    }
  }

  function renderCombatSessionCard() {
    const encounter = getActiveEncounterSummary();
    const hasActiveEncounter = !!encounter?.id;
    return `
      <div class="cp-section-title">Combat session</div>
      <div class="cp-card">
        <div class="cp-rowitem">
          <span>${hasActiveEncounter ? esc(encounter.name || "Combat") : "No active combat"}</span>
          <span class="cp-row" style="gap:6px">
            <span class="cp-pill ${hasActiveEncounter ? "good" : ""}">${hasActiveEncounter ? "active" : "inactive"}</span>
            ${hasActiveEncounter ? `<span class="cp-chip">round ${dash(encounter.round)}</span>` : ""}
          </span>
        </div>
        <div class="cp-muted" style="margin-top:6px">
          ${hasActiveEncounter
            ? `${encounter.participantCount} participant(s) on this scene${encounter.hasLoadedCharacterParticipant ? " · loaded character is in combat" : " · loaded character is not in combat"}`
            : "Start combat for the current Owlbear scene to enable tactical movement and turn flow."}
        </div>
        <div class="cp-muted" style="margin-top:6px">Debug: ${esc(state.combatStartStage || "idle")}</div>
        <div class="button-row" style="margin-top:8px">
          ${isGM() ? `<button type="button" data-ref="startCombat" ${!hasActiveEncounter && !state.isStartingCombat && !state.busy ? "" : "disabled"}>${state.isStartingCombat ? "Starting combat..." : "Start combat"}</button>` : ""}
          ${isGM() ? `<button type="button" class="secondary" data-ref="endCombat" ${hasActiveEncounter && !state.busy ? "" : "disabled"}>End combat</button>` : ""}
        </div>
      </div>
    `;
  }

  function renderTacticalMoveCard() {
    const participant = getLoadedCharacterParticipant();
    if (!participant) return "";
    const selectedToken = getSelectedTokenForLoadedCharacter();
    const toolStatus = state.moveToolStatus && state.moveToolStatus.characterId === state.characterId
      ? state.moveToolStatus
      : null;
    const mismatch = getTokenPositionMismatch();
    const isCurrentTurn = !!participant.is_current_turn;
    const moveCurrent = Number(participant.move_current ?? 0) || 0;
    const moveMax = Number(participant.move_max ?? 0) || 0;
    const gridReady = !!state.tacticalSnapshot?.grid;
    const moveReady = !!selectedToken && gridReady && isCurrentTurn && !mismatch;
    const preview = toolStatus?.preview ?? null;
    const tokenLine = selectedToken
      ? `${esc(selectedToken.name || "Selected token")} · ${esc(selectedToken.id.slice(0, 8))}`
      : "Select this character's token in Owlbear to move it.";
    return `
      <div class="cp-section-title">Tactical move</div>
      <div class="cp-card">
        <div class="cp-rowitem">
          <span>MOVE <span class="cp-mono">${moveCurrent}/${moveMax} m</span></span>
          <span class="cp-row" style="gap:6px">
            <span class="cp-pill ${isCurrentTurn ? "good" : ""}">${isCurrentTurn ? "Current turn" : "Waiting turn"}</span>
            ${gridReady ? `<span class="cp-pill">grid synced</span>` : `<span class="cp-pill bad">grid not synced</span>`}
          </span>
        </div>
        <div class="cp-muted" style="margin-top:6px">${tokenLine}</div>
        ${preview ? `<div class="cp-muted" style="margin-top:6px">Preview: ${preview.moveCostM} m, remaining ${preview.remainingMoveM} m${preview.inRange ? "" : " - out of range"}</div>` : ""}
        ${toolStatus?.error ? `<div class="cp-muted" style="margin-top:6px;color:#ff9b9b">${esc(toolStatus.error)}</div>` : ""}
        ${mismatch ? `<div class="cp-muted" style="margin-top:6px;color:#ffd58a">Scene token position differs from Supabase. Sync it before moving.</div>` : ""}
        <div class="button-row" style="margin-top:8px">
          <button type="button" data-ref="startMove" ${moveReady && !state.busy ? "" : "disabled"}>Move</button>
          <button type="button" class="secondary" data-ref="cancelMove" ${toolStatus?.active ? "" : "disabled"}>Cancel</button>
          ${isGM() ? `<button type="button" class="secondary" data-ref="syncTacticalGrid" ${state.busy ? "disabled" : ""}>Sync tactical grid</button>` : ""}
          ${isGM() ? `<button type="button" class="secondary" data-ref="syncTokenPosition" ${(selectedToken && !state.busy) ? "" : "disabled"}>Sync token position</button>` : ""}
        </div>
      </div>
    `;
  }

  /* ---- OVERVIEW: characteristics + doll ---- */
  function renderOverview() {
    const attrs = arr(state.sheet.attributes);
    const base = BASE_ATTR_CODES
      .map((code) => attrs.find((a) => a.code === code))
      .filter(Boolean);
    const customs = attrs.filter((a) => !BASE_ATTR_CODES.includes(a.code));
    return `
      <div class="cp-overview">
        <div class="cp-doll-col">${renderDoll()}</div>
        <div class="cp-attrs-col">
          <div class="cp-section-title" style="margin-top:0">Characteristics</div>
          <div class="cp-attrs">${base.map(attrCard).join("")}</div>
        </div>
      </div>
      ${renderCombatSessionCard()}
      ${renderTacticalMoveCard()}
      ${customs.length ? `<div class="cp-section-title">Additional attributes</div><div class="cp-row">${customs.map((a) => `<span class="cp-chip">${esc(a.name || a.code)} <span class="cp-mono">${dash(a.value)}</span></span>`).join("")}</div>` : ""}
      ${renderAdditionalParts()}
      ${isGM() ? gmToolsBlock() : ""}`;
  }

  function attrCard(a) {
    const label = a.name || a.code;
    const pending = state.rollingAttr === a.code;
    const modifier = Number(a?.effect_modifier ?? a?.modifier ?? 0) || 0;
    const bonus = Math.max(0, Number(a?.effect_bonus ?? 0) || 0);
    const penalty = Math.max(0, Number(a?.effect_penalty ?? 0) || 0);
    const effectiveValue = Number(
      a?.effective_value ?? ((Number(a?.value ?? a?.base_value ?? 0) || 0) + modifier),
    ) || 0;
    const editBtn = isGM()
      ? `<button class="cp-attr-edit" data-attr-edit="${esc(a.code)}" aria-label="Edit ${esc(label)} (GM)" title="Edit (GM)">E</button>`
      : "";
    return `<div class="cp-attr" role="button" tabindex="${pending ? -1 : 0}" data-attr-roll="${esc(a.code)}" aria-label="Roll ${esc(label)}" aria-disabled="${pending}" title="Roll ${esc(label)}">
      ${editBtn}
      ${bonus > 0 ? `<div class="cp-attr-mod cp-attr-mod-pos">+${esc(bonus)}</div>` : (modifier > 0 ? `<div class="cp-attr-mod cp-attr-mod-pos">+${esc(modifier)}</div>` : "")}
      ${penalty > 0 ? `<div class="cp-attr-mod cp-attr-mod-neg">-${esc(penalty)}</div>` : (modifier < 0 ? `<div class="cp-attr-mod cp-attr-mod-neg">${esc(modifier)}</div>` : "")}
      <div class="cp-attr-val">${dash(effectiveValue)}</div>
      <div class="cp-attr-code">${esc(a.code)}</div>
      ${pending ? `<div class="cp-attr-pending">Rolling...</div>` : ""}
    </div>`;
  }

  /* ---- doll ---- */
  function partColorClass(p) {
    if (p.destroyed || p.disabled || (p.critical || 0) > 0) return "cp-c-danger";
    if ((p.serious || 0) > 0 || (p.minor || 0) > 0) return "cp-c-warn";
    return "cp-c-intact";
  }
  function bodyStatusText(p) {
    if (p.destroyed) return ["Destroyed", "cp-sb-danger"];
    if (p.disabled) return ["Disabled", "cp-sb-danger"];
    if ((p.critical || 0) > 0) return ["Damaged", "cp-sb-danger"];
    if ((p.serious || 0) > 0 || (p.minor || 0) > 0) return ["Damaged", "cp-sb-warn"];
    return ["Intact", "cp-sb-intact"];
  }
  function armorStatusText(p) {
    const src = armorInfoForPart(p);
    if (src.armor_destroyed) return ["Armor destroyed", "cp-sb-danger"];
    if ((src.armor_critical || 0) > 0) return ["Armor damaged", "cp-sb-warn"];
    if ((src.armor_value || 0) > 0) return ["Armor ok", "cp-sb-intact"];
    return ["No armor", "cp-sb-intact"];
  }
  function equippedArmorItemForPart(p) {
    return equipmentItems().find((it) =>
      it?.is_equipped
      && ARMOR_TYPES.has(it.model?.item_type)
      && it.body_part?.id === p?.id,
    ) || null;
  }
  function armorInfoForPart(p) {
    const item = equippedArmorItemForPart(p);
    if (item) {
      return {
        source: item,
        armor_value: item.armor_value ?? 0,
        armor_critical: item.armor_critical ?? 0,
        armor_max_critical: item.armor_max_critical ?? 0,
        armor_destroyed: !!item.armor_destroyed,
      };
    }
    const armorValue = Number(p?.armor_value ?? 0) || 0;
    const armorCritical = Number(p?.armor_critical ?? 0) || 0;
    const armorMaxCritical = Number(p?.armor_max_critical ?? 0) || 0;
    return {
      source: null,
      armor_value: armorValue,
      armor_critical: armorCritical,
      armor_max_critical: armorMaxCritical,
      armor_destroyed: (armorValue > 0 || armorCritical > 0 || armorMaxCritical > 0) ? !!p?.armor_destroyed : false,
    };
  }
  function bodyPartCodes(part) {
    return [part?.code, part?.part_key]
      .map((value) => normalizeBodyPartCode(value))
      .filter(Boolean);
  }
  function collectAllowedBodyPartCodes(item) {
    const allowedCodes = new Set();
    const knownBodyPartCodes = new Set(
      arr(state.sheet?.body_parts).flatMap((part) => bodyPartCodes(part)),
    );
    const pushCode = (value) => {
      const normalized = normalizeBodyPartCode(value);
      if (normalized) allowedCodes.add(normalized);
    };
    const pushCodes = (value) => {
      if (Array.isArray(value)) {
        value.forEach(pushCode);
        return;
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return;
        if (trimmed.includes(",")) {
          trimmed.split(",").forEach(pushCode);
          return;
        }
        pushCode(trimmed);
      }
    };

    pushCodes(item?.effective_flags?.allowed_body_part_codes);
    pushCodes(item?.flags?.allowed_body_part_codes);
    pushCodes(item?.model?.flags?.allowed_body_part_codes);
    pushCodes(item?.data?.flags?.allowed_body_part_codes);
    pushCodes(item?.model?.data?.flags?.allowed_body_part_codes);
    pushCodes(item?.effective_flags?.allowedBodyPartCodes);
    pushCodes(item?.flags?.allowedBodyPartCodes);
    pushCodes(item?.model?.flags?.allowedBodyPartCodes);
    pushCodes(item?.data?.flags?.allowedBodyPartCodes);
    pushCodes(item?.model?.data?.flags?.allowedBodyPartCodes);
    pushCodes(item?.allowed_body_part_codes);
    pushCodes(item?.model?.allowed_body_part_codes);

    if (!allowedCodes.size) {
      pushCode(item?.default_body_part_code);
      pushCode(item?.model?.default_body_part_code);
    }

    if (!allowedCodes.size) {
      arr(item?.effective_flags?.allowed_body_part_tags).forEach(pushCode);
      arr(item?.flags?.allowed_body_part_tags).forEach(pushCode);
      arr(item?.model?.flags?.allowed_body_part_tags).forEach(pushCode);
    }

    if (!allowedCodes.size) {
      arr(item?.model?.tags || item?.tags || []).forEach((tag) => {
        const normalized = normalizeBodyPartCode(tag);
        if (knownBodyPartCodes.has(normalized)) allowedCodes.add(normalized);
      });
    }

    return [...allowedCodes];
  }
  function compatibleBodyParts(item) {
    const allowedCodes = collectAllowedBodyPartCodes(item);
    const parts = arr(state.sheet?.body_parts).filter((part) => !!part?.id);
    if (!allowedCodes.length) return [];
    return parts.filter((part) => bodyPartCodes(part).some((code) => allowedCodes.includes(code)));
  }
  function shouldShowAdditionalPart(p) {
    if (!p || PART_GEOMETRY[normPart(p)]) return false;
    if (isShieldPart(p)) return !!equippedArmorItemForPart(p);
    if (isSpecialPart(p)) {
      return (p.critical || 0) > 0
        || (p.max_critical || 0) > 0
        || (p.armor_value || 0) > 0
        || (p.armor_critical || 0) > 0
        || !!p.disabled
        || !!p.destroyed;
    }
    return true;
  }
  function renderDoll() {
    const parts = arr(state.sheet.body_parts);
    const s = DOLL_SCALE, W = 96 * s, H = 104 * s;
    let doll = `<div class="cp-doll" style="width:${W}px;height:${H}px">`;
    doll += `<div class="cp-base" style="left:${22 * s}px;top:${84 * s}px;width:${36 * s}px;height:${9 * s}px"></div>`;
    for (const p of parts) {
      const g = PART_GEOMETRY[normPart(p)];
      if (!g) continue;
      const rad = g.r === "50%" ? "50%" : g.r * s + "px";
      const pinned = p.id === state.pinnedPartId ? "pinned" : "";
      doll += `<div class="cp-part ${partColorClass(p)} ${pinned}" tabindex="0" role="button" data-part="${esc(p.id)}" aria-label="${esc(p.name)}: ${bodyStatusText(p)[0]}"
        style="left:${g.x * s}px;top:${g.y * s}px;width:${g.w * s}px;height:${g.h * s}px;border-radius:${rad}"></div>`;
    }
    doll += `<div data-ref="tip"></div></div>`;
    return doll;
  }
  function renderAdditionalParts() {
    const additional = arr(state.sheet.body_parts).filter(shouldShowAdditionalPart);
    if (!additional.length) return "";
    return `<div class="cp-section-title">Additional body parts / modules</div><div class="cp-list">${additional.map((p) => {
      const [bs, bcls] = bodyStatusText(p);
      return `<div class="cp-card cp-rowitem" tabindex="0" role="button" data-part="${esc(p.id)}" aria-label="${esc(p.name)}">
        <span>${esc(p.name)}</span><span class="cp-statebadge ${bcls}">${bs} - crit ${dash(p.critical)}/${dash(p.max_critical)}</span></div>`;
    }).join("")}</div>`;
  }
  function partTipHtml(p) {
    const armor = armorInfoForPart(p);
    const [bs, bcls] = bodyStatusText(p);
    const [as, acls] = armorStatusText(p);
    return `<b>${esc(p.name)}</b>
      <div class="cp-kv"><span>Status</span><span class="cp-statebadge ${bcls}">${bs}</span></div>
      <div class="cp-kv"><span>Minor injuries</span><span>${dash(p.minor)}</span></div>
      <div class="cp-kv"><span>Serious injuries</span><span>${dash(p.serious)}</span></div>
      <div class="cp-kv"><span>Critical injuries</span><span>${dash(p.critical)}/${dash(p.max_critical)}</span></div>
      <div class="cp-kv"><span>Armor</span><span class="cp-statebadge ${acls}">${as}</span></div>
      <div class="cp-kv"><span>Armor value</span><span>${dash(armor.armor_value)}</span></div>
      <div class="cp-kv"><span>Armor critical</span><span>${dash(armor.armor_critical)}/${dash(armor.armor_max_critical)}</span></div>
      ${armor.source ? `<div class="cp-kv"><span>Armor item</span><span>${esc(armor.source.name || armor.source.model?.name || "Armor")}</span></div>` : ""}`;
  }

  /* ---- SKILLS ---- */
  function renderSkills() {
    const skills = arr(state.sheet.skills).filter((s) => {
      const eff = s.effective_level ?? s.level ?? 0;
      return eff > 0; // only trained skills
    });
    const gmBlock = isGM() ? gmSkillsBlock() : "";
    if (!skills.length) return `<div class="cp-empty">No trained skills.</div>${gmBlock}`;
    const byCat = {};
    for (const s of skills) (byCat[s.category || "other"] ||= []).push(s);
    return Object.entries(byCat).map(([cat, list]) => `
      <div class="cp-section-title">${esc(cat)}</div>
      <div class="cp-list">${list.map(skillRow).join("")}</div>`).join("") + gmBlock;
  }
  function skillDisplayMaxLevel(s) {
    const baseMax = Number(s?.max_level ?? 0) || 5;
    const promotedMax = baseMax >= 5 ? 10 : baseMax === 3 ? 5 : baseMax;
    const eff = Number(s?.effective_level ?? s?.level ?? 0) || 0;
    const purchased = Number(s?.purchased_level ?? 0) || 0;
    return Math.max(promotedMax, eff, purchased);
  }
  function skillRow(s) {
    const baseMax = Number(s?.max_level ?? 0) || 5;
    const max = skillDisplayMaxLevel(s);
    const eff = Number(s?.effective_level ?? s?.level ?? 0) || 0;
    const purchased = Number(s?.purchased_level ?? s?.level ?? 0) || 0;
    const levelModifier = Number(s?.effect_level_modifier ?? (eff - purchased)) || 0;
    const rollBonusBase = Number(s?.skill_bonus ?? 0) || 0;
    const rollBonusModifier = Number(s?.effect_skill_bonus ?? 0) || 0;
    const rollBonusTotal = rollBonusBase + rollBonusModifier;
    const pips = Array.from({ length: max }).map((_, i) => `<span class="cp-pip ${i < eff ? "on" : ""}"></span>`).join("");
    const attrs = [s.main_attribute, s.secondary_attribute].filter(Boolean).join(" - ");
    const perks = arr(s.perks).map((p) => `<span class="cp-pill good">${esc(p.name || p.code || p)}</span>`).join("");
    const locked = s.locked || s.is_locked;
    const passive = s.is_passive || s.category === "passive";
    const isPsionics = s.category?.toLowerCase() === "psionics";
    const isClickable = !passive && !isPsionics;
    const attrs_str = attrs ? ` <span class="cp-muted">(${esc(attrs)})</span>` : "";
    const levelModChip = levelModifier > 0
      ? `<span class="cp-skill-mod cp-skill-mod-pos">lvl +${esc(levelModifier)}</span>`
      : levelModifier < 0
        ? `<span class="cp-skill-mod cp-skill-mod-neg">lvl ${esc(levelModifier)}</span>`
        : "";
    const rollModChip = rollBonusModifier > 0
      ? `<span class="cp-skill-mod cp-skill-mod-pos">roll +${esc(rollBonusModifier)}</span>`
      : rollBonusModifier < 0
        ? `<span class="cp-skill-mod cp-skill-mod-neg">roll ${esc(rollBonusModifier)}</span>`
        : "";
    const totalRollChip = rollBonusTotal !== 0
      ? `<span class="cp-chip"><span class="cp-mono">roll ${rollBonusTotal > 0 ? `+${esc(rollBonusTotal)}` : esc(rollBonusTotal)}</span></span>`
      : "";
    const capStr = max > baseMax ? `<span class="cp-chip">base ${dash(baseMax)} / GM ${dash(max)}</span>` : "";
    const editBtn = isGM()
      ? `<button class="cp-skill-edit" data-skill-edit="${esc(s.id)}" aria-label="Edit ${esc(s.name)} (GM)" title="Edit ${esc(s.name)} (GM)" type="button">E</button>`
      : "";
    const deleteSkillId = s.character_skill_id || s.id;
    return `<div class="cp-card"${isClickable ? ` role="button" tabindex="0" data-skill-roll="${esc(s.code)}"` : ""} aria-label="Skill ${esc(s.name)}" ${isClickable ? 'title="Skill check"' : ''}>
      <div class="cp-rowitem">
        <span>${esc(s.name)}${attrs_str}
          <span class="cp-pill">${passive ? "passive" : "trained"}</span></span>
        <span class="cp-row" style="gap:6px">${perks}${levelModChip}${rollModChip}${totalRollChip}<span class="cp-pips" title="${dash(eff)}/${max}">${pips}</span>${locked ? `<span class="cp-pill bad">locked</span>` : ""}${editBtn}</span>
      </div>
      ${capStr ? `<div class="cp-row" style="gap:6px;margin-top:6px">${capStr}</div>` : ""}
      ${isGM() ? `<div class="button-row" style="margin-top:4px"><button class="cp-btn-sm secondary" data-gmdel="skill" data-id="${esc(deleteSkillId)}" type="button">GM delete</button></div>` : ""}
    </div>`;
  }

  /* ---- PERKS ---- */
  function perkRequiresWeapon(perk) {
    return arr(perk?.effect_data?.requires_weapon_tags).length > 0 || perk?.code === "not_full_auto";
  }
  function perkWeaponOptions(perk) {
    const weapons = arr(state.armory?.weapons);
    if (!weapons.length) return `<option value="">-- no weapons --</option>`;
    return weapons.map((w) => {
      const activeProfile = w.active_profile || {};
      const label = [
        w.name || "Weapon",
        activeProfile.name || activeProfile.code || w.model?.weapon_class_name || "",
      ].filter(Boolean).join(" - ");
      return `<option value="${esc(w.id)}">${esc(label)}</option>`;
    }).join("");
  }
  function renderPerks() {
    const perks = arr(state.perks);
    const gmBlock = isGM() ? gmPerksBlock() : "";
    if (!perks.length) return `<div class="cp-empty">No perks.</div>${gmBlock}`;
    const groups = {
      passive: [],
      active: [],
      narrative: [],
      other: [],
    };
    for (const perk of perks) {
      const key = String(perk.perk_type || "").toLowerCase();
      if (groups[key]) groups[key].push(perk);
      else groups.other.push(perk);
    }
    const titles = {
      passive: "Passive perks",
      active: "Active perks",
      narrative: "Narrative / reaction perks",
      other: "Other perks",
    };
    return Object.entries(groups)
      .filter(([_, list]) => list.length > 0)
      .map(([key, list]) => `
        <div class="cp-section-title">${titles[key]}</div>
        <div class="cp-list">${list.map(perkCard).join("")}</div>
      `)
      .join("") + gmBlock;
  }
  function perkCard(perk) {
    const passive = perk.is_passive || perk.activation_type === "passive" || perk.perk_type === "passive";
    const requiresWeapon = perkRequiresWeapon(perk);
    const hint = perk.ui_hint || perk.description || "";
    const canUse = !passive && perk.can_use !== false;
    return `<div class="cp-card" data-perk="${esc(perk.id)}">
      <div class="cp-rowitem">
        <span><b>${esc(perk.name)}</b> <span class="cp-pill">${esc(perk.linked_skill_name || perk.linked_skill_code || "perk")}</span></span>
        <span class="cp-row" style="gap:6px">
          <span class="cp-pill">${esc(perk.perk_type || "perk")}</span>
          <span class="cp-pill ${passive ? "" : "good"}">${esc(perk.resolution_mode || "backend")}</span>
        </span>
      </div>
      <div class="cp-row" style="gap:6px;margin-top:6px">
        <span class="cp-chip">req lvl ${dash(perk.required_skill_level)}</span>
        <span class="cp-chip">${esc(perk.activation_type || "manual")}</span>
      </div>
      ${perk.description ? `<div class="cp-muted" style="margin-top:6px">${esc(perk.description)}</div>` : ""}
      ${hint && hint !== perk.description ? `<div class="cp-muted" style="margin-top:6px">${esc(hint)}</div>` : ""}
      ${requiresWeapon ? `<div class="cp-row" style="gap:8px;margin-top:8px">
        <label class="cp-field" style="min-width:170px"><span>Weapon</span><select data-perk-weapon="${esc(perk.id)}">${perkWeaponOptions(perk)}</select></label>
      </div>` : ""}
      ${canUse ? `<div class="button-row" style="margin-top:8px"><button class="cp-btn-sm" data-perk-use="${esc(perk.id)}" type="button">Use perk</button></div>` : ""}
    </div>`;
  }

  /* ---- ABILITIES ---- */
  function renderAbilities() {
    const list = state.abilities;
    if (!list.length) return `<div class="cp-empty">No abilities.</div>`;
    // Group by source_type for categorization
    const byCat = { psionics: [], implants: [], weapon: [], other: [] };
    for (const a of list) {
      const type = String(a.source_type || "").toLowerCase();
      if (type.includes("psion")) byCat.psionics.push(a);
      else if (type.includes("implant") || type.includes("prosthetic") || type.includes("device")) byCat.implants.push(a);
      else if (type.includes("weapon")) byCat.weapon.push(a);
      else byCat.other.push(a);
    }
    const catNames = { psionics: "Psionics", implants: "Implants", weapon: "Weapon", other: "Other" };
    return Object.entries(byCat)
      .filter(([_, items]) => items.length > 0)
      .map(([catKey, items]) => `
        <div class="cp-section-title">${catNames[catKey]}</div>
        <div class="cp-list">${items.map(abilityCard).join("")}</div>`).join("");
  }
  function abilityCard(a) {
    const passive = a.activation_type === "passive" || a.ability_kind === "passive";
    const cost = a.resource?.cost;
    const cd = a.current_cooldown_rounds;
    const effect = a.level_data?.effect_data?.summary || a.description || "";
    const canUse = !passive && !cd; // can use if active and not on cooldown
    return `<div class="cp-card"${canUse ? ` role="button" tabindex="0" data-ability-use="${esc(a.id)}"` : ""} aria-label="Ability ${esc(a.name)}">
      <div class="cp-rowitem"><span><b>${esc(a.name)}</b> <span class="cp-pill">${esc(a.source_type || "ability")}</span></span>
      <span class="cp-pill ${passive ? "" : "good"}">${passive ? "passive" : cd ? "cooldown" : "active"}</span></div>
      <div class="cp-row" style="gap:6px;margin-top:6px">
        ${a.effective_level != null ? `<span class="cp-chip">lvl ${dash(a.effective_level)}</span>` : ""}
        ${cost != null ? `<span class="cp-chip">cost Рє:${esc(cost)}</span>` : ""}
        ${cd ? `<span class="cp-chip bad">cooldown ${esc(cd)}</span>` : ""}
        ${a.attack_type && a.attack_type !== "none" ? `<span class="cp-chip">attack: ${esc(a.attack_type)}</span>` : ""}
      </div>
      ${effect ? `<div class="cp-muted" style="margin-top:6px">${esc(effect)}</div>` : ""}
    </div>`;
  }

  function getWeaponAbilities(weapon) {
    const linked = arr(weapon?.weapon_abilities);
    if (!linked.length) return [];
    return linked.map((entry) => {
      const full = state.abilities.find((ability) => ability.id === entry.character_ability_id);
      return full
        ? {
            ...full,
            source_weapon_name: entry.weapon_name || weapon?.name || "",
            required_profile_name: entry.profile_name || "",
            is_available_for_active_profile: entry.is_available_for_active_profile !== false,
          }
        : entry;
    });
  }

  /* ---- INVENTORY (weapons mgmt + magazines + ammo + items + GM) ---- */
  function renderInventory() {
    const armory = state.armory;
    const weapons = arr(armory?.weapons);
    const mags = arr(state.armory?.magazines);
    const ammo = arr(state.inv.ammoStock);
    const items = arr(state.inv.items);
    return `
      ${state.inv.fallback ? banner("warn", "Ammo/items read via fallback (backend get_character_inventory error 25006).") : ""}
      <div class="cp-section-title" style="margin-top:0">Weapons</div>
      <div class="cp-list">${weapons.length ? weapons.map(weaponCard).join("") : `<div class="cp-empty">No weapons.</div>`}</div>
      <div class="cp-section-title">Magazines</div>
      <div class="cp-list">${mags.length ? mags.map(magCard).join("") : `<div class="cp-empty">No magazines.</div>`}</div>
      <div class="cp-section-title">Ammo stock</div>
      <div class="cp-list">${ammo.length ? ammo.map((a) => `<div class="cp-card"><div class="cp-rowitem"><span>${esc(a.display_name)}</span><span class="cp-mono">${esc(getAmmoStockTypeName(a))} · ${esc(getAmmoStockCaliberName(a))} · x${dash(a.quantity)}</span></div>${isGM() ? `<div class="cp-row" style="gap:6px;margin-top:6px;align-items:center"><input data-gmammoqty="${esc(a.id)}" type="number" min="1" max="${a.quantity}" value="1" class="cp-mono" style="width:46px;padding:3px 4px;font-size:11px"><button class="cp-btn-sm secondary" data-gmammo="removeqty" data-ammo="${esc(a.id)}" type="button">GM -N</button><button class="cp-btn-sm secondary" data-gmammo="removeall" data-ammo="${esc(a.id)}" data-maxqty="${a.quantity}" type="button">GM -all</button></div>` : ""}</div>`).join("") : `<div class="cp-empty">No ammo.</div>`}</div>
      <div class="cp-section-title">Active items</div>
      <div class="cp-list">${items.length ? items.map(itemCard).join("") : `<div class="cp-empty">No items.</div>`}</div>
      ${isGM() ? gmInventoryBlock() : ""}`;
  }

  function findAmmoDefForRow(row) {
    const ammoTypeId = String(row?.ammo_type_id ?? "").trim();
    const ammoCode = String(row?.ammo_type_code ?? row?.ammo_code ?? "").trim().toLowerCase();
    return state.ammoDefs.find((def) =>
      (ammoTypeId && String(def?.id ?? "").trim() === ammoTypeId) ||
      (!ammoTypeId && ammoCode && String(def?.code ?? "").trim().toLowerCase() === ammoCode)
    ) || null;
  }

  function findMagazineDefForRow(row) {
    const magazineDefId = String(row?.magazine_def?.id ?? row?.magazine_def_id ?? "").trim();
    const magazineCode = String(row?.magazine_def?.code ?? row?.code ?? "").trim().toLowerCase();
    return state.magazineDefs.find((def) =>
      (magazineDefId && String(def?.id ?? "").trim() === magazineDefId) ||
      (magazineCode && String(def?.code ?? "").trim().toLowerCase() === magazineCode)
    ) || null;
  }

  function getAmmoStockCaliberCode(row) {
    const ammoDef = findAmmoDefForRow(row);
    return String(
      row?.caliber_code ||
      row?.caliber?.code ||
      ammoDef?.caliber_code ||
      ammoDef?.caliber?.code ||
      ""
    ).trim().toLowerCase();
  }

  function getAmmoStockCaliberName(row) {
    const ammoDef = findAmmoDefForRow(row);
    return String(
      row?.caliber_name ||
      row?.caliber?.name ||
      ammoDef?.caliber_name ||
      ammoDef?.caliber?.name ||
      ""
    ).trim();
  }

  function getAmmoStockTypeCode(row) {
    const ammoDef = findAmmoDefForRow(row);
    return String(
      row?.ammo_type_code ||
      row?.ammo_code ||
      ammoDef?.code ||
      ""
    ).trim().toLowerCase();
  }

  function getAmmoStockTypeName(row) {
    const ammoDef = findAmmoDefForRow(row);
    return String(
      row?.ammo_type_name ||
      row?.ammo_name ||
      ammoDef?.name ||
      ""
    ).trim();
  }

  function getMagazineCaliberCode(row) {
    const magazineDef = findMagazineDefForRow(row);
    return String(
      row?.magazine_def?.caliber_code ||
      row?.magazine_def?.caliber ||
      row?.caliber_code ||
      row?.caliber?.code ||
      magazineDef?.caliber_code ||
      magazineDef?.caliber?.code ||
      ""
    ).trim().toLowerCase();
  }

  function getMagazineCurrentAmmoTypeCode(row) {
    return String(
      row?.ammo_type?.code ||
      row?.ammo_type_code ||
      row?.ammo_code ||
      ""
    ).trim().toLowerCase();
  }

  function weaponCard(w) {
    const isMelee = !w.model?.caliber;
    const mag = w.loaded_magazine || w.active_profile?.loaded_magazine || null;
    const fm = w.selected_fire_mode || w.active_profile?.selected_fire_mode || null;
    const profiles = arr(w.profiles);
    const fireModes = arr(w.available_fire_modes?.length ? w.available_fire_modes : w.active_profile?.available_fire_modes);
    const compatMags = arr(state.armory?.magazines).filter((m) => !w.model?.caliber || (m.magazine_def?.caliber || m.caliber) === w.model.caliber);
    const ammoChips = isMelee
      ? `<span class="cp-chip">melee</span>`
      : (mag
          ? `<span class="cp-chip ${(mag.current_rounds ?? 0) <= 0 ? "bad" : ""}">${dash(mag.current_rounds)}/${dash(mag.capacity || mag.magazine_def?.capacity)} - ${esc(mag.ammo_type_name || mag.ammo_type?.name || "")}</span>`
          : `<span class="cp-chip bad">no magazine</span>`);
    const weaponAbilities = getWeaponAbilities(w);
    return `<div class="cp-card" data-weapon="${esc(w.id)}">
      <div class="cp-rowitem"><span><b>${esc(w.name)}</b> <span class="cp-pill">${esc(w.model?.weapon_class_name || w.model?.weapon_class || "")}</span></span>
        <span class="cp-row" style="gap:6px">${w.model?.caliber_name ? `<span class="cp-chip">${esc(w.model.caliber_name)}</span>` : ""}${ammoChips}</span></div>
      <div class="cp-row" style="gap:8px;margin-top:8px">
        ${profiles.length > 1 ? `<label class="cp-field" style="min-width:130px"><span>Profile</span><select data-wact="profile" data-weapon="${esc(w.id)}">${profiles.map((p) => `<option value="${esc(p.id)}" ${p.id === w.active_profile_id ? "selected" : ""}>${esc(p.name || p.code)}</option>`).join("")}</select></label>` : ""}
        ${fireModes.length && !isMelee ? `<label class="cp-field" style="min-width:130px"><span>Fire mode</span><select data-wact="firemode" data-weapon="${esc(w.id)}">${fireModes.map((f) => `<option value="${esc(f.id)}" ${f.id === fm?.id ? "selected" : ""}>${esc(f.name || f.code)}</option>`).join("")}</select></label>` : ""}
        ${!isMelee ? `<label class="cp-field" style="min-width:150px"><span>Insert magazine</span><select data-wact="reloadmag" data-weapon="${esc(w.id)}">${compatMags.length ? compatMags.map((m) => `<option value="${esc(m.id)}">${esc(m.name)} - ${dash(m.current_rounds)}/${dash(m.magazine_def?.capacity ?? m.capacity)}</option>`).join("") : `<option value="">-- none --</option>`}</select></label>` : ""}
      </div>
      ${weaponAbilities.length ? `<div class="cp-list" style="margin-top:8px">${weaponAbilities.map((ability) => {
        const passive = ability.activation_type === "passive" || ability.ability_kind === "passive";
        const cooldown = ability.current_cooldown_rounds;
        const attackAbility = ability.attack_type && ability.attack_type !== "none";
        const canUse = !passive && !cooldown && !attackAbility && ability.is_available_for_active_profile !== false;
        return `<div class="cp-card">
          <div class="cp-rowitem">
            <span><b>${esc(ability.name || ability.code || "Ability")}</b> <span class="cp-pill">weapon ability</span></span>
            <span class="cp-row" style="gap:6px">
              ${ability.required_profile_name ? `<span class="cp-chip">${esc(ability.required_profile_name)}</span>` : `<span class="cp-chip">all profiles</span>`}
              ${attackAbility ? `<span class="cp-chip">attack: ${esc(ability.attack_type)}</span>` : ""}
              ${ability.is_available_for_active_profile === false ? `<span class="cp-chip bad">profile mismatch</span>` : ""}
            </span>
          </div>
          ${canUse ? `<div class="button-row" style="margin-top:8px"><button class="cp-btn-sm" type="button" data-ability-use="${esc(ability.id)}">Use ability</button></div>` : ""}
        </div>`;
      }).join("")}</div>` : ""}
      ${!isMelee ? `<div class="button-row" style="margin-top:8px"><button class="cp-btn-sm" data-wbtn="reload" data-weapon="${esc(w.id)}" type="button" ${compatMags.length ? "" : "disabled"}>Reload (insert magazine)</button>${isGM() ? `<button class="cp-btn-sm secondary" data-gmdel="weapon" data-id="${esc(w.id)}" type="button">GM delete</button>` : ""}</div>${compatMags.length ? "" : `<div class="cp-muted">No compatible magazine to insert.</div>`}` : `${isGM() ? `<div class="button-row" style="margin-top:8px"><button class="cp-btn-sm secondary" data-gmdel="weapon" data-id="${esc(w.id)}" type="button">GM delete</button></div>` : ""}`}
    </div>`;
  }

  function magCard(m) {
    const inW = arr(state.armory?.weapons).find((w) => (w.loaded_magazine?.id || w.active_profile?.loaded_magazine?.id) === m.id);
    const cap = m.magazine_def?.capacity ?? m.capacity;
    const ammoName = m.ammo_type?.name || m.ammo_type_name || "empty";
    const caliberCode = getMagazineCaliberCode(m);
    const currentAmmoTypeCode = getMagazineCurrentAmmoTypeCode(m);
    const compatAmmo = arr(state.inv.ammoStock).filter((a) => {
      const ammoCaliberCode = getAmmoStockCaliberCode(a);
      const ammoTypeCode = getAmmoStockTypeCode(a);
      if (caliberCode && ammoCaliberCode !== caliberCode) return false;
      if ((m.current_rounds ?? 0) > 0 && currentAmmoTypeCode && ammoTypeCode !== currentAmmoTypeCode) return false;
      return true;
    });
    const empty = (m.current_rounds ?? 0) <= 0;
    return `<div class="cp-card" data-mag="${esc(m.id)}">
      <div class="cp-rowitem"><span><b>${esc(m.name)}</b> ${inW ? `<span class="cp-pill good">Inserted in ${esc(inW.name)}</span>` : `<span class="cp-pill">not inserted</span>`}</span>
        <span class="cp-mono">${dash(m.current_rounds)}/${dash(cap)} - ${esc(ammoName)}</span></div>
      <div class="cp-row" style="gap:8px;margin-top:8px">
        <label class="cp-field" style="min-width:150px"><span>Ammo to load</span><select data-mact="ammo" data-mag="${esc(m.id)}">${compatAmmo.length ? compatAmmo.map((a) => `<option value="${esc(a.id)}">${esc(a.display_name)} - ${esc(getAmmoStockTypeName(a))} - x${dash(a.quantity)}</option>`).join("") : `<option value="">-- no compatible ammo --</option>`}</select></label>
        <div class="button-row" style="margin:0;align-items:flex-end">
          <button class="cp-btn-sm" data-mbtn="load" data-mag="${esc(m.id)}" type="button" ${compatAmmo.length ? "" : "disabled"}>Load / Top up</button>
          <button class="cp-btn-sm secondary" data-mbtn="unload" data-mag="${esc(m.id)}" type="button" ${empty ? "disabled" : ""}>Unload all</button>
        </div>
      </div>
      ${compatAmmo.length ? "" : `<div class="cp-muted">No compatible ammo in stock.</div>`}
      ${isGM() ? `<div class="button-row" style="margin-top:6px"><button class="cp-btn-sm secondary" data-gmdel="mag" data-id="${esc(m.id)}" type="button">GM delete</button></div>` : ""}
    </div>`;
  }

  function itemCard(i) {
    const healable = i.use_action_type === "heal" || i.code === "basic_medkit";
    return `<div class="cp-card" data-item="${esc(i.id)}">
      <div class="cp-rowitem"><span><b>${esc(i.name)}</b> <span class="cp-pill">${esc(i.item_type || "")}</span></span><span class="cp-mono">x${dash(i.quantity)}</span></div>
      ${healable ? `<div class="cp-row" style="gap:8px;margin-top:8px">
        <label class="cp-field" style="min-width:160px"><span>Heal body part</span><select data-iact="part" data-item="${esc(i.id)}">${arr(state.sheet.body_parts).map((p) => `<option value="${esc(p.id)}" ${p.destroyed ? "disabled" : ""}>${esc(p.name)}${p.destroyed ? " (destroyed)" : ""}</option>`).join("")}</select></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-ibtn="use" data-item="${esc(i.id)}" type="button">Use</button></div>
      </div>` : ""}
      ${isGM() ? `<div class="cp-row" style="gap:6px;margin-top:6px;align-items:center">
        <input data-gmqty="${esc(i.id)}" type="number" min="1" max="${i.quantity}" value="1" class="cp-mono" style="width:46px;padding:3px 4px;font-size:11px">
        <button class="cp-btn-sm secondary" data-gmitem="removeqty" data-item="${esc(i.id)}" data-code="${esc(i.code || "")}" type="button">GM -N</button>
        <button class="cp-btn-sm secondary" data-gmitem="removeall" data-item="${esc(i.id)}" data-code="${esc(i.code || "")}" data-maxqty="${i.quantity}" type="button">GM -all</button>
      </div>` : ""}
    </div>`;
  }

  function gmInventoryBlock() {
    const itemOpts = state.itemDefs.length
      ? state.itemDefs.map((d) => `<option value="${esc(d.code)}">${esc(d.name)}${d.item_type ? ` - ${esc(d.item_type)}` : ""}</option>`).join("")
      : `<option value="">-- no item defs --</option>`;
    const weaponOpts = state.weaponDefs.length
      ? state.weaponDefs.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("")
      : `<option value="">-- no weapon models --</option>`;
    // For magazine block: filter ammo types by selected magazine's caliber
    const curMagId = root?.querySelector('[data-ref="gmMagDef"]')?.value || state.magazineDefs[0]?.id || "";
    const curMag = state.magazineDefs.find((d) => d.id === curMagId);
    const magAmmoOpts = (() => {
      const compatible = curMag ? state.ammoDefs.filter((a) => a.caliber_id === curMag.caliber_id) : state.ammoDefs;
      return compatible.length
        ? compatible.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("")
        : `<option value="">-- no compatible ammo --</option>`;
    })();
      const magOpts = state.magazineDefs.length
        ? state.magazineDefs.map((d) => `<option value="${esc(d.id)}" ${d.id === curMagId ? "selected" : ""}>${esc(d.name)} (x${esc(d.capacity)})</option>`).join("")
        : `<option value="">-- no magazine defs --</option>`;
      const ammoOpts = state.ammoDefs.length
        ? state.ammoDefs.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}${d.caliber?.name ? ` - ${esc(d.caliber.name)}` : ""}</option>`).join("")
        : `<option value="">-- no ammo types --</option>`;
    return `
      <div class="cp-section-title">GM - add weapon</div>
      <div class="cp-card"><div class="cp-row" style="gap:8px">
        <label class="cp-field"><span>Model</span><select data-ref="gmWeaponDef">${weaponOpts}</select></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-gmbtn="addweapon" type="button" ${state.weaponDefs.length ? "" : "disabled"}>Add weapon</button></div>
      </div></div>
      <div class="cp-section-title">GM - add magazine</div>
      <div class="cp-card"><div class="cp-row" style="gap:8px;flex-wrap:wrap">
        <label class="cp-field"><span>Magazine</span><select data-ref="gmMagDef" data-gmmag="1">${magOpts}</select></label>
        <label class="cp-field"><span>Ammo type (initial)</span><select data-ref="gmMagAmmo">${magAmmoOpts}</select></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-gmbtn="addmag" type="button" ${state.magazineDefs.length ? "" : "disabled"}>Add magazine</button></div>
      </div></div>
      <div class="cp-section-title">GM - add ammo</div>
      <div class="cp-card"><div class="cp-row" style="gap:8px">
        <label class="cp-field"><span>Ammo type</span><select data-ref="gmAmmoDef">${ammoOpts}</select></label>
        <label class="cp-field" style="max-width:90px"><span>qty</span><input data-ref="gmAmmoQty" type="number" min="1" value="10" class="cp-mono"></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-gmbtn="addammo" type="button" ${state.ammoDefs.length ? "" : "disabled"}>Add ammo</button></div>
      </div></div>
      <div class="cp-section-title">GM - add item</div>
      <div class="cp-card"><div class="cp-row" style="gap:8px">
        <label class="cp-field"><span>Item</span><select data-ref="gmAddCode">${itemOpts}</select></label>
        <label class="cp-field" style="max-width:90px"><span>qty</span><input data-ref="gmAddQty" type="number" min="1" value="1" class="cp-mono"></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-gmbtn="additem" type="button" ${state.itemDefs.length ? "" : "disabled"}>Add item</button><button class="cp-btn-sm secondary" data-gmbtn="refreshcatalogs" type="button">Refresh catalogs</button></div>
      </div></div>`;
  }
  function gmSkillsBlock() {
    const opts = state.skillDefs.length
      ? state.skillDefs.map((d) => `<option value="${esc(d.id)}">${esc(d.name)} - ${esc(d.category)}</option>`).join("")
      : `<option value="">-- no skill defs --</option>`;
    return `<div class="cp-section-title">GM - add skill</div>
      <div class="cp-card"><div class="cp-row" style="gap:8px">
        <label class="cp-field"><span>Skill</span><select data-ref="gmSkillDef">${opts}</select></label>
        <label class="cp-field" style="max-width:80px"><span>Level</span><input data-ref="gmSkillLevel" type="number" min="1" max="10" value="1" class="cp-mono"></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-gmbtn="addskill" type="button" ${state.skillDefs.length ? "" : "disabled"}>Add skill</button></div>
      </div></div>`;
  }
  function gmPerkGrantOptions() {
    const items = arr(state.perkAvailability)
      .filter((perk) => perk && perk.owned !== true)
      .sort((a, b) => {
        const aLocked = a.available === true ? 0 : 1;
        const bLocked = b.available === true ? 0 : 1;
        if (aLocked !== bLocked) return aLocked - bLocked;
        return String(a.name || a.code || "").localeCompare(String(b.name || b.code || ""));
      });
    if (!items.length) return `<option value="">-- no perks to add --</option>`;
    return items.map((perk) => {
      const skillName = perk.linked_skill_name || perk.linked_skill_code || "No skill";
      const req = Number(perk.required_skill_level ?? 0);
      const cur = Number(perk.current_skill_level ?? 0);
      const locked = perk.available !== true;
      const lockSuffix = locked
        ? ` [locked ${cur}/${req}${perk.lock_reason ? ` ${perk.lock_reason}` : ""}]`
        : ` [ready ${cur}/${req}]`;
      return `<option value="${esc(perk.code)}" ${locked ? "disabled" : ""}>${esc(perk.name)} - ${esc(skillName)} ${esc(lockSuffix)}</option>`;
    }).join("");
  }
  function gmPerksBlock() {
    const availableCount = arr(state.perkAvailability).filter((perk) => perk.available === true).length;
    const totalCount = arr(state.perkAvailability).filter((perk) => perk.owned !== true).length;
    return `<div class="cp-section-title">GM - add perk</div>
      <div class="cp-card"><div class="cp-row" style="gap:8px;flex-wrap:wrap">
        <label class="cp-field" style="min-width:260px"><span>Perk</span><select data-ref="gmPerkCode">${gmPerkGrantOptions()}</select></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-gmbtn="addperk" type="button" ${availableCount > 0 ? "" : "disabled"}>Add perk</button></div>
      </div>
      <div class="cp-muted" style="margin-top:6px">Available now: ${availableCount}. Locked perks stay unavailable until the linked skill level requirement is met.</div>
      ${totalCount > 0 ? "" : `<div class="cp-muted" style="margin-top:4px">This character already owns every perk visible to the current catalog.</div>`}
      </div>`;
  }
  function gmArmorBlock() {
    const defs = state.equipmentDefs.filter((d) => ARMOR_TYPES.has(d.item_type));
    const opts = defs.length
        ? defs.map((d) => `<option value="${esc(d.code)}">${esc(d.name)} - ${esc(d.item_type)}</option>`).join("")
      : `<option value="">-- no armor models --</option>`;
    return `<div class="cp-section-title">GM - add armor</div>
      <div class="cp-card"><div class="cp-row" style="gap:8px">
        <label class="cp-field"><span>Model</span><select data-ref="gmArmorDef">${opts}</select></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-gmbtn="addarmor" type="button" ${defs.length ? "" : "disabled"}>Add armor</button></div>
      </div></div>`;
  }
  function gmImplantsBlock() {
    const defs = state.equipmentDefs.filter((d) => IMPLANT_TYPES.has(d.item_type));
    const opts = defs.length
        ? defs.map((d) => `<option value="${esc(d.code)}">${esc(d.name)} - ${esc(d.item_type)}</option>`).join("")
      : `<option value="">-- no implant models --</option>`;
    return `<div class="cp-section-title">GM - add implant</div>
      <div class="cp-card"><div class="cp-row" style="gap:8px">
        <label class="cp-field"><span>Model</span><select data-ref="gmImplantDef">${opts}</select></label>
        <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-gmbtn="addimplant" type="button" ${defs.length ? "" : "disabled"}>Add implant</button></div>
      </div></div>`;
  }
  function gmToolsBlock() {
    return `<div class="cp-section-title">GM - character tools</div>
      <div class="button-row"><button class="cp-btn-sm" data-gmbtn="heal" type="button">Heal (full)</button>
      <button class="cp-btn-sm secondary" data-gmbtn="repair" type="button">Repair armor</button></div>`;
  }

  /* ---- ARMOR ---- */
  function equipmentItems() { return arr(state.equipment); }
  function renderArmor() {
    const items = equipmentItems().filter((it) => ARMOR_TYPES.has(it.model?.item_type) || (it.armor_max_critical || 0) > 0 || (it.armor_value || 0) > 0);
    const gmBlock = isGM() ? gmArmorBlock() : "";
    if (!state.equipment) return `<div class="cp-empty">Equipment unavailable.</div>${gmBlock}`;
    if (!items.length) return `<div class="cp-empty">No armor.</div>${gmBlock}`;
    return `<div class="cp-list">${items.map(armorCard).join("")}</div>${gmBlock}`;
  }
  function armorCard(it) {
    const dest = it.armor_destroyed;
    const hasCrit = (it.armor_critical || 0) > 0;
    const hasSerious = (it.armor_serious || 0) > 0;
    const hasMinor = (it.armor_minor || 0) > 0;
    const status = dest ? ["Destroyed", "bad"]
      : hasCrit ? ["Damaged", ""]
      : hasSerious ? ["Damaged", ""]
      : (hasMinor ? ["Minor damage", ""] : ["OK", "good"]);
    const slot = it.body_part?.name || it.equipped_body_part_name || it.default_body_part_code || it.model?.default_body_part_code || "-";
    return `<div class="cp-card" data-equip="${esc(it.id)}">
      <div class="cp-rowitem"><span><b>${esc(it.name)}</b> <span class="cp-pill">${esc(it.model?.item_type || "armor")}</span></span>
      <span class="cp-pill ${status[1]}">${status[0]}</span></div>
      <div class="cp-row" style="gap:6px;margin-top:6px">
        <span class="cp-chip">${it.is_equipped ? `Equipped - ${esc(slot)}` : "Unequipped"}</span>
        <span class="cp-chip">AV ${dash(it.armor_value)}</span>
        <span class="cp-chip${(it.armor_minor||0) > 0 ? " warn" : ""}">Minor ${dash(it.armor_minor)}/${dash(it.armor_max_minor)}</span>
        <span class="cp-chip${(it.armor_serious||0) > 0 ? " warn" : ""}">Serious ${dash(it.armor_serious)}/${dash(it.armor_max_serious)}</span>
        <span class="cp-chip${hasCrit ? " bad" : ""}">Crit ${dash(it.armor_critical)}/${dash(it.armor_max_critical)}</span>
      </div>
      ${it.is_equipped
        ? `<div class="button-row" style="margin-top:8px"><button class="cp-btn-sm secondary" data-armorbtn="unequip" data-equip="${esc(it.id)}" type="button">Unequip</button>${isGM() ? `<button class="cp-btn-sm secondary" data-gmdel="equip" data-id="${esc(it.id)}" type="button">GM delete</button>` : ""}</div>`
        : `<div class="cp-row" style="gap:8px;margin-top:8px">
            <label class="cp-field" style="min-width:150px"><span>Equip to body part</span>
              <select data-equip-part="${esc(it.id)}">${armorSlotOptions(it)}</select></label>
            <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-armorbtn="equip" data-equip="${esc(it.id)}" type="button" ${it.model?.can_equip === false ? "disabled" : ""}>Equip</button>${isGM() ? `<button class="cp-btn-sm secondary" data-gmdel="equip" data-id="${esc(it.id)}" type="button">GM delete</button>` : ""}</div>
          </div>`}
    </div>`;
  }

  /* ---- IMPLANTS ---- */
  function renderImplants() {
    const items = equipmentItems().filter((it) => IMPLANT_TYPES.has(it.model?.item_type));
    const gmBlock = isGM() ? gmImplantsBlock() : "";
    if (!state.equipment) return `<div class="cp-empty">Equipment unavailable.</div>${gmBlock}`;
    if (!items.length) return `<div class="cp-empty">No installed implants</div>${gmBlock}`;
    return `<div class="cp-list">${items.map(implantCard).join("")}</div>${gmBlock}`;
  }
  function implantCard(it) {
    const eff = it.model?.effect_data;
    const effTxt = eff && typeof eff === "object" ? (eff.summary || eff.description || "") : "";
    const active = it.is_equipped;
    const slot = it.body_part?.name || it.equipped_body_part_name || it.default_body_part_code || it.model?.default_body_part_code || "-";
    const canInstall = isGM() && it.model?.can_equip !== false && it.model?.can_equip_to_body_part !== false;
    const slotOptions = equipmentSlotOptions(it);
    const hasCompatiblePart = compatibleBodyParts(it).length > 0;
    return `<div class="cp-card">
      <div class="cp-rowitem"><span><b>${esc(it.name)}</b> <span class="cp-pill">${esc(it.model?.item_type || "implant")}</span></span>
      <span class="cp-pill ${active ? "good" : ""}">${active ? "installed" : "inactive"}</span></div>
      ${it.model?.description ? `<div class="cp-muted" style="margin-top:6px">${esc(it.model.description)}</div>` : ""}
      <div class="cp-row" style="gap:6px;margin-top:6px">
        <span class="cp-chip">${active ? `Installed - ${esc(slot)}` : "Not installed"}</span>
        ${it.max_charges ? `<span class="cp-chip">charges ${dash(it.current_charges)}/${dash(it.max_charges)}</span>` : ""}
        ${effTxt ? `<span class="cp-chip">${esc(effTxt)}</span>` : ""}
      </div>
      ${isGM() && active
        ? `<div class="button-row" style="margin-top:8px"><button class="cp-btn-sm secondary" data-armorbtn="unequip" data-equip="${esc(it.id)}" type="button">Uninstall</button><button class="cp-btn-sm secondary" data-gmdel="equip" data-id="${esc(it.id)}" type="button">GM delete</button></div>`
        : isGM() && canInstall
          ? `<div class="cp-row" style="gap:8px;margin-top:8px">
              <label class="cp-field" style="min-width:150px"><span>Install to body part</span><select data-equip-part="${esc(it.id)}">${slotOptions}</select></label>
              <div class="button-row" style="margin:0;align-items:flex-end"><button class="cp-btn-sm" data-armorbtn="equip" data-equip="${esc(it.id)}" type="button" ${hasCompatiblePart ? "" : "disabled"}>Install</button><button class="cp-btn-sm secondary" data-gmdel="equip" data-id="${esc(it.id)}" type="button">GM delete</button></div>
            </div>`
          : isGM()
            ? `<div class="button-row" style="margin-top:8px"><button class="cp-btn-sm secondary" data-gmdel="equip" data-id="${esc(it.id)}" type="button">GM delete</button></div>`
            : ""}
    </div>`;
  }

  /* =========================================================== events */
  function bindStaticEvents() {
    const $ = (r) => root.querySelector(`[data-ref="${r}"]`);
    $("loadBtn")?.addEventListener("click", () => {
      const id = $("charId").value.trim();
      if (!id) { setNotice("err", "Enter a character_id."); render(); return; }
      loadCharacter(id);
    });
    $("retry")?.addEventListener("click", () => state.characterId && loadCharacter(state.characterId));
    $("charId")?.addEventListener("keydown", (e) => { if (e.key === "Enter") $("loadBtn").click(); });
    $("refreshCatalogsTop")?.addEventListener("click", () => refreshGmCatalogs().catch(() => {}));
    $("startCombat")?.addEventListener("click", () => {
      startCombatForScene().catch(() => {});
    });
    $("endCombat")?.addEventListener("click", () => {
      endCombatForScene().catch(() => {});
    });
    $("cancelMove")?.addEventListener("click", async () => {
      await sendMoveToolCommand(MOVE_TOOL_COMMANDS.Cancel).catch(() => {});
    });
    $("syncTacticalGrid")?.addEventListener("click", () => {
      syncTacticalGrid(false).catch(() => {});
    });
    $("syncTokenPosition")?.addEventListener("click", () => {
      syncTacticalGrid(true).catch(() => {});
    });
    $("devRole")?.addEventListener("change", async (e) => {
      state.devRole = e.target.value;
      if (isGM()) {
        setupCatalogSubscriptions();
        refreshGmCatalogs().catch(() => {});
      } else {
        cleanupCatalogSubscriptions();
      }
      render();
      if (state.characterId && isGM()) {
        await refresh({ sheet: true, armory: false, equipment: false, inventory: false, abilities: false, perkAvailability: true });
      }
      scheduleSelectionSync(true);
    });

    // section nav
    root.querySelectorAll("[data-section]").forEach((b) =>
      b.addEventListener("click", () => {
        state.section = b.dataset.section;
        state.notice = "";
        render();
        if (isGM() && ["inventory", "armor", "implants", "skills", "perks"].includes(state.section)) {
          refreshGmCatalogs().catch(() => {});
        }
      }));

    // pool +/- buttons in header - registered once on root to survive re-renders
    if (!root._poolAdjBound) {
      root._poolAdjBound = true;
      root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-pool-adjust]");
        if (btn) onPoolAdjust(btn.dataset.poolCode, Number(btn.dataset.poolAdjust));
      });
    }

    // delegated clicks/changes inside the panel
    const section = $("section");
    if (section) {
      section.addEventListener("click", onSectionClick);
      section.addEventListener("change", onSectionChange);
      // doll tooltips (hover + focus)
      section.querySelectorAll("[data-part]").forEach((el) => {
        el.addEventListener("mouseenter", () => showTip(el));
        el.addEventListener("mouseleave", hideTip);
        el.addEventListener("focus", () => showTip(el));
        el.addEventListener("blur", hideTip);
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pinPart(el.dataset.part); } });
      });
      // keep a pinned body-part tooltip visible after re-render
      if (state.pinnedPartId) {
        const pinnedEl = section.querySelector(`.cp-part[data-part="${CSS.escape(state.pinnedPartId)}"]`);
        if (pinnedEl) showTip(pinnedEl);
      }
    }
    // characteristic keyboard
    root.querySelectorAll("[data-attr-roll]").forEach((el) =>
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRoll(el.dataset.attrRoll); } }));
    root.querySelectorAll("[data-skill-roll]").forEach((el) =>
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRollSkill(el.dataset.skillRoll); } }));
    root.querySelectorAll("[data-ability-use]").forEach((el) =>
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onUseAbility(el.dataset.abilityUse); } }));
    root.querySelectorAll("[data-perk-use]").forEach((el) =>
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onUsePerk(el.dataset.perkUse); } }));
    document.addEventListener("keydown", onEscOnce);
  }
  function onEscOnce(e) { if (e.key === "Escape") { hideTip(); if (state.pinnedPartId) { state.pinnedPartId = ""; render(); } } }

  function showTip(el) {
    const p = arr(state.sheet?.body_parts).find((x) => x.id === el.dataset.part);
    const host = root.querySelector('[data-ref="tip"]');
    if (!p || !host || !PART_GEOMETRY[normPart(p)]) return;
    host.className = "cp-tip";
    host.style.left = el.style.left;
    host.style.top = `calc(${el.style.top} + 24px)`;
    host.innerHTML = partTipHtml(p);
  }
  function hideTip() {
    const host = root.querySelector('[data-ref="tip"]');
    if (!host) return;
    if (state.pinnedPartId) { // keep the pinned part's tooltip visible
      const el = root.querySelector(`.cp-part[data-part="${CSS.escape(state.pinnedPartId)}"]`);
      if (el) { showTip(el); return; }
    }
    host.className = ""; host.innerHTML = "";
  }
  function pinPart(id) { state.pinnedPartId = state.pinnedPartId === id ? "" : id; render(); }

  function onSectionClick(e) {
    const t = e.target;
    const startMoveButton = t.closest('[data-ref="startMove"]');
    if (startMoveButton) {
      e.preventDefault();
      startMoveForLoadedCharacter().catch((error) => {
        state.moveToolStatus = {
          ...(state.moveToolStatus ?? {}),
          active: false,
          pending: false,
          characterId: state.characterId,
          tokenId: String(state.selectedToken?.id ?? "").trim(),
          error: toErrorMessage(
            error,
            "Unable to start Tactical Move.",
          ),
        };
        render();
      });
      return;
    }
    const startCombatButton = t.closest('[data-ref="startCombat"]');
    if (startCombatButton) {
      startCombatForScene().catch(() => {});
      return;
    }
    const endCombatButton = t.closest('[data-ref="endCombat"]');
    if (endCombatButton) {
      endCombatForScene().catch(() => {});
      return;
    }
    const part = t.closest("[data-part]"); if (part && !t.closest("[data-wact],[data-mact]")) { pinPart(part.dataset.part); return; }
    const attrRoll = t.closest("[data-attr-roll]"); if (attrRoll && !t.closest("[data-attr-edit]")) { onRoll(attrRoll.dataset.attrRoll); return; }
    const attrEdit = t.closest("[data-attr-edit]"); if (attrEdit) { e.stopPropagation(); onAttrEdit(attrEdit.dataset.attrEdit); return; }
    const skillEdit = t.closest("[data-skill-edit]"); if (skillEdit) { e.stopPropagation(); onSkillEdit(skillEdit.dataset.skillEdit); return; }
    const skillRoll = t.closest("[data-skill-roll]"); if (skillRoll && !t.closest("[data-skill-edit]")) { onRollSkill(skillRoll.dataset.skillRoll); return; }
    const abilityUse = t.closest("[data-ability-use]"); if (abilityUse) { onUseAbility(abilityUse.dataset.abilityUse); return; }
    const perkUse = t.closest("[data-perk-use]"); if (perkUse) { onUsePerk(perkUse.dataset.perkUse); return; }
    // weapon buttons
    const wbtn = t.closest("[data-wbtn]"); if (wbtn) { onReloadWeapon(wbtn.dataset.weapon); return; }
    const mbtn = t.closest("[data-mbtn]"); if (mbtn) { mbtn.dataset.mbtn === "load" ? onLoadRounds(mbtn.dataset.mag) : onUnloadRounds(mbtn.dataset.mag); return; }
    const ibtn = t.closest("[data-ibtn]"); if (ibtn) { onUseItem(ibtn.dataset.item); return; }
    // inventory items - click on card to use
    const itemCard = t.closest("[data-item]"); if (itemCard && !t.closest("select,button,[data-gmitem]")) { onUseItem(itemCard.dataset.item); return; }
    const armorBtn = t.closest("[data-armorbtn]"); if (armorBtn) { armorBtn.dataset.armorbtn === "equip" ? onEquip(armorBtn.dataset.equip) : onUnequip(armorBtn.dataset.equip); return; }
    const gmItem = t.closest("[data-gmitem]");
    if (gmItem) {
      const { code, item: itemId, maxqty } = gmItem.dataset;
      if (gmItem.dataset.gmitem === "removeall") {
        onGmRemoveItem(code, maxqty);
      } else {
        const qty = root.querySelector(`[data-gmqty="${CSS.escape(itemId)}"]`)?.value ?? 1;
        onGmRemoveItem(code, qty);
      }
      return;
    }
    const gmAmmo = t.closest("[data-gmammo]");
    if (gmAmmo) {
      const { ammo: ammoStockId, maxqty } = gmAmmo.dataset;
      if (gmAmmo.dataset.gmammo === "removeall") {
        onGmRemoveAmmo(ammoStockId, maxqty);
      } else {
        const qty = root.querySelector(`[data-gmammoqty="${CSS.escape(ammoStockId)}"]`)?.value ?? 1;
        onGmRemoveAmmo(ammoStockId, qty);
      }
      return;
    }
    const gmDel = t.closest("[data-gmdel]");
    if (gmDel) { onGmDelete(gmDel.dataset.gmdel, gmDel.dataset.id); return; }
    const gmBtn = t.closest("[data-gmbtn]");
    if (gmBtn) {
      if (gmBtn.dataset.gmbtn === "addmag" && gmBtn.closest("[data-gmmag]") === null) {
        // re-render magazine ammo dropdown when magazine selection may have changed
      }
      onGmTool(gmBtn.dataset.gmbtn); return;
    }
  }
  function onSectionChange(e) {
    const sel = e.target;
    if (sel.dataset.wact === "profile") return onSwitchProfile(sel.dataset.weapon, sel.value);
    if (sel.dataset.wact === "firemode") return onSwitchFireMode(sel.dataset.weapon, sel.value);
    if (sel.dataset.gmmag) return render(); // update compatible ammo dropdown
    // reloadmag / ammo / part selects are read on button click via DOM
  }
  function selVal(attr, key, val) {
    const el = root.querySelector(`[data-${attr}="${CSS.escape(val)}"][data-${key}]`) || root.querySelector(`select[data-${key}][data-${attr === "weapon" ? "weapon" : attr}="${CSS.escape(val)}"]`);
    return el?.value || "";
  }

  /* ---- characteristic roll (server-authoritative roll_characteristic) ---- */
  async function onRoll(code) {
    if (state.rollingAttr || state.busy) return; // prevent double-trigger
    state.rollingAttr = code; render();
    try {
      const r = await api.checks.rollCharacteristic({ character_id: state.characterId, attribute_code: code }, settings());
      if (!r || r.ok === false) setNotice("err", esc(describeError(r?.error, r?.message || "Roll failed.")));
      else setNotice(r.result?.success ? "ok" : "warn", rollResultText(r));
    } catch (e) {
      setNotice("err", `Roll error: ${esc(e.message)}`);
    } finally {
      state.rollingAttr = ""; render();
    }
  }
  function rollResultText(r) {
    const a = r.attribute || {}, roll = r.roll || {}, res = r.result || {};
      const crit = res.is_critical_success ? " - CRIT SUCCESS" : res.is_critical_failure ? " - CRIT FAIL" : "";
    const name = ATTR_RU[a.code] || a.name || a.code;
    return `${esc(name)} check - d20 <span class="cp-mono">${dash(roll.natural_roll)} <= ${dash(roll.target_value)}</span> -> <b>${res.success ? "SUCCESS" : "FAILURE"}</b>${crit}`;
  }
  /* ---- skill check (roll_skill) ---- */
  async function onRollSkill(code) {
    if (state.busy || state.rollingAttr) return;
    state.rollingAttr = "skill:" + code; render();
    try {
      const r = await api.checks.rollSkill({ character_id: state.characterId, skill_code: code }, settings());
      if (!r || r.ok === false) setNotice("err", esc(describeError(r?.error, r?.message || "Skill check failed.")));
      else { const res = r.result || {}; setNotice(res.success ? "ok" : "warn", `Skill check - ${esc(code)} -> <b>${esc(res.outcome || (res.success ? "success" : "failure"))}</b>`); }
    } catch (e) {
      setNotice("err", `Skill check error: ${esc(e.message)}`);
    } finally {
      state.rollingAttr = ""; render();
    }
  }
  /* ---- GM pool adjust (+/-) ---- */
  async function onPoolAdjust(code, delta) {
    const pool = state.pools.find((p) => p.code === code);
    if (!pool || state.busy) return;
    const cur = pool.current_value ?? 0;
    const max = pool.max_value ?? 0;
    const newVal = Math.max(0, Math.min(max, cur + delta));
    if (newVal === cur) return;
    state.busy = true; render();
    try {
      await bridges.supabase.mutateSupabaseRows(
        `odyssey_character_resource_pools?id=eq.${encodeURIComponent(pool.id)}`,
        { current_value: newVal },
        settings(),
        { method: "PATCH", prefer: "return=minimal" },
      );
      await refresh({ sheet: false, armory: false, equipment: false, inventory: false, abilities: true });
    } catch (e) {
      setNotice("err", `Pool update failed: ${esc(e.message)}`); render();
    } finally {
      state.busy = false; render();
    }
  }

  /* ---- GM attribute edit (gm_update_character_attribute) ---- */
  function onAttrEdit(code) {
    const a = arr(state.sheet.attributes).find((x) => x.code === code) || {};
    const name = a.name || code;
    openForm({
      title: `Edit ${name} (GM)`,
      note: (a.default_value != null || a.max_value != null) ? `Allowed: ${dash(a.default_value)} - ${dash(a.max_value)}` : "",
      current: a.value, min: a.default_value, max: a.max_value,
      onSave: (value) => runMutation("Update attribute",
        () => api.gm.gmUpdateCharacterAttribute({ character_id: state.characterId, attribute_code: code, operation: "set", value, reason: "GM edit" }, settings()),
        () => refresh({ armory: false, equipment: false, inventory: false, perkAvailability: true })),
    });
  }
  function onSkillEdit(skillId) {
    const skill = arr(state.sheet?.skills).find((entry) => entry.id === skillId);
    if (!skill) return;
    const current = Number(skill.level ?? skill.effective_level ?? 0) || 0;
    const max = skillDisplayMaxLevel(skill);
    const note = skill.max_level === 5
      ? `Base skill cap: 5. GM manual cap: ${max}.`
      : skill.max_level === 3
        ? `Base skill cap: 3. GM manual cap: ${max}.`
        : `Allowed: 0 - ${max}`;
    openForm({
      title: `Edit ${skill.name} (GM)`,
      note,
      current,
      min: 0,
      max,
      onSave: (value) => runMutation("Update skill",
        () => bridges.supabase.mutateSupabaseRows(
          `odyssey_character_skills?id=eq.${encodeURIComponent(skillId)}&character_id=eq.${encodeURIComponent(state.characterId)}`,
          { level: value },
          settings(),
          { method: "PATCH", prefer: "return=minimal" },
        ),
        () => refresh({ armory: false, equipment: false, inventory: false })),
    });
  }

  /* ---- weapon mutations ---- */
  function onSwitchProfile(weaponId, profileId) {
    runMutation("Switch profile", () => api.weapon.switchWeaponProfile(weaponId, profileId, settings()), () => refresh({ equipment: false }));
  }
  function onSwitchFireMode(weaponId, fireModeId) {
    runMutation("Switch fire mode", () => api.weapon.switchWeaponFireMode(state.characterId, weaponId, fireModeId, settings()), () => refresh({ equipment: false }));
  }
  function onReloadWeapon(weaponId) {
    const w = arr(state.armory?.weapons).find((x) => x.id === weaponId);
    const profileId = w?.active_profile?.id || w?.active_profile_id;
    const magId = root.querySelector(`select[data-wact="reloadmag"][data-weapon="${CSS.escape(weaponId)}"]`)?.value;
    if (!profileId || !magId) { setNotice("err", "Select a magazine to insert."); render(); return; }
    runMutation("Reload", () => api.weapon.loadWeaponProfileMagazine({ character_weapon_id: weaponId, profile_id: profileId, character_magazine_id: magId }, settings()), () => refresh({ equipment: false }));
  }
  function onLoadRounds(magId) {
    const ammoId = root.querySelector(`select[data-mact="ammo"][data-mag="${CSS.escape(magId)}"]`)?.value;
    if (!ammoId) { setNotice("err", "Select ammo to load."); render(); return; }
    runMutation("Load rounds", () => api.inventory.loadRoundsToMagazine({ character_magazine_id: magId, ammo_stock_id: ammoId, quantity: 0, allow_partial: true }, settings()), () => refresh({ equipment: false }));
  }
  function onUnloadRounds(magId) {
    runMutation("Unload", () => api.inventory.unloadRoundsFromMagazine({ character_magazine_id: magId }, settings()), () => refresh({ equipment: false }));
  }

  /* ---- abilities (activation) ---- */
  function onUseAbility(abilityId) {
    const ability = state.abilities.find((a) => a.id === abilityId);
    if (!ability || state.busy) return;
    const passive = ability.activation_type === "passive" || ability.ability_kind === "passive";
    if (passive) { setNotice("warn", "Passive abilities activate automatically."); render(); return; }
    if (ability.attack_type && ability.attack_type !== "none") {
      setNotice("warn", "Attack abilities are resolved from Combat → Resolve Attack.");
      render();
      return;
    }
    const payload = {
      character_id: state.characterId,
      character_ability_id: ability.id,
      created_by: isGM() ? "GM" : "PLAYER",
    };
    const sourceWeaponId = String(
      ability.source?.character_weapon_id
      ?? ability.source_character_weapon_id
      ?? ""
    ).trim();
    if (sourceWeaponId) {
      payload.character_weapon_id = sourceWeaponId;
    }
    state.busy = true;
    state.notice = `Using ability ${ability.name}...`;
    render();
    (async () => {
      try {
        const result = await api.ability.useAbility(payload, settings());
        if (!result || result.ok === false) {
          setNotice("err", `${esc(describeError(result?.error, result?.message || "Ability use failed."))}${result?.error ? ` <span class="cp-mono">[${esc(result.error)}]</span>` : ""}`);
          return;
        }
        await refresh({ sheet: true, armory: true, equipment: false, inventory: false, abilities: true, perkAvailability: false });
        setNotice("ok", esc(result.message || `${ability.name} used.`));
      } catch (e) {
        setNotice("err", `Ability use failed: ${esc(e.message)}`);
      } finally {
        state.busy = false;
        render();
      }
    })();
  }

  async function onUsePerk(perkId) {
    const perk = state.perks.find((p) => p.id === perkId);
    if (!perk || state.busy) return;
    if (perk.is_passive || perk.activation_type === "passive" || perk.perk_type === "passive") {
      setNotice("warn", "Passive perks activate automatically.");
      render();
      return;
    }
    const payload = {
      character_id: state.characterId,
      perk_code: perk.code,
      created_by: isGM() ? "GM" : "PLAYER",
    };
    if (perkRequiresWeapon(perk)) {
      const weaponId = root.querySelector(`select[data-perk-weapon="${CSS.escape(perkId)}"]`)?.value || "";
      if (!weaponId) {
        setNotice("err", "Select a weapon for this perk.");
        render();
        return;
      }
      payload.character_weapon_id = weaponId;
    }
    state.busy = true;
    state.notice = `Using perk ${perk.name}...`;
    render();
    try {
      const result = await api.perk.useCharacterPerk(payload, settings());
      if (!result || result.ok === false) {
        setNotice("err", `${esc(describeError(result?.error, result?.message || "Perk use failed."))}${result?.error ? ` <span class="cp-mono">[${esc(result.error)}]</span>` : ""}`);
        return;
      }
      await refresh({ sheet: true, armory: true, equipment: false, inventory: false, abilities: false });
      const message = result.message || `${perk.name} used.`;
      const hint = result.gm_hint ? `<div class="cp-muted" style="margin-top:4px">${esc(result.gm_hint)}</div>` : "";
      setNotice("ok", `${esc(message)}${hint}`);
    } catch (e) {
      setNotice("err", `Perk use failed: ${esc(e.message)}`);
    } finally {
      state.busy = false;
      render();
    }
  }

  /* ---- items / medkit ---- */
  function onUseItem(itemId) {
    const partId = root.querySelector(`select[data-iact="part"][data-item="${CSS.escape(itemId)}"]`)?.value;
    if (!partId) { setNotice("err", "Select a body part."); render(); return; }
    runMutation("Use item", () => api.inventory.useCharacterItem({ character_item_id: itemId, target_body_part_id: partId, used_by_character_id: state.characterId }, settings()), () => refresh());
  }

  /* ---- armor equip/unequip ---- */
  // Body-part choices when equipping armor. The model's default slot (if any) is
  // pre-selected; otherwise the user picks the target part explicitly so an
  // unequipped item can always be re-equipped.
  function equipmentSlotOptions(it) {
    const def = normalizeBodyPartCode(it?.default_body_part_code || it?.model?.default_body_part_code || "");
    const lastId = state.lastSlot[it.id]; // previously-equipped part wins as default
    let parts = compatibleBodyParts(it);

    if (!parts.length) return `<option value="">This item has no configured installation slot.</option>`;

    // Pre-select: last slot > default > first available
    const selected = parts.find((b) => b.id === lastId) ||
                     parts.find((b) => def && bodyPartCodes(b).includes(def)) ||
                     parts[0];

    return parts.map((b) => {
      const sel = b.id === selected?.id ? "selected" : "";
      return `<option value="${esc(b.id)}" ${sel}>${esc(b.name)}</option>`;
    }).join("");
  }
  function armorSlotOptions(it) { return equipmentSlotOptions(it); }
  function onEquip(equipId) {
    const partId = root.querySelector(`select[data-equip-part="${CSS.escape(equipId)}"]`)?.value;
    if (!partId) { setNotice("err", "Select a body part to equip to."); render(); return; }
    runMutation("Equip", () => api.equipment.equipCharacterEquipmentItem(equipId, partId, settings()), () => refresh());
  }
  function onUnequip(equipId) {
    const it = equipmentItems().find((x) => x.id === equipId);
    if (it?.body_part?.id) state.lastSlot[equipId] = it.body_part.id; // remember slot for re-equip
    runMutation("Unequip", () => api.equipment.unequipCharacterEquipmentItem(equipId, settings()), () => refresh());
  }

  /* ---- GM ---- */
  function onGmRemoveItem(code, qty) {
    if (!code) { setNotice("err", "Item has no code."); render(); return; }
    const n = Math.max(1, Number(qty) || 1);
    runMutation("Remove item", () => api.inventory.removeCharacterItemQuantity(state.characterId, code, n, settings()), () => refresh());
  }
  function onGmRemoveAmmo(ammoStockId, qty) {
    if (!ammoStockId) { setNotice("err", "Ammo stack ID is missing."); render(); return; }
    const n = Math.max(1, Number(qty) || 1);
    runMutation("Remove ammo", () => api.inventory.removeCharacterAmmoStock(ammoStockId, n, settings()), () => refresh({ sheet: false, armory: false, equipment: false, abilities: false }));
  }
  function onGmAddItem() {
    const code = root.querySelector('[data-ref="gmAddCode"]')?.value.trim();
    const qty = Math.max(Number(root.querySelector('[data-ref="gmAddQty"]')?.value) || 1, 1);
    if (!code) { setNotice("err", "Select item."); render(); return; }
    runMutation("Add item", () => api.inventory.addCharacterItem({ character_id: state.characterId, item_code: code, quantity: qty }, settings()), () => refresh({ sheet: false, equipment: false, abilities: false }));
  }
  function onGmAddSkill() {
    const defId = root.querySelector('[data-ref="gmSkillDef"]')?.value;
    if (!defId) { setNotice("err", "Select a skill."); render(); return; }
    const def = arr(state.skillDefs).find((entry) => String(entry?.id || "") === defId);
    const baseMax = Number(def?.max_level ?? 0) || 5;
    const manualMax = baseMax >= 5 ? 10 : baseMax === 3 ? 5 : baseMax;
    const level = Math.max(1, Math.min(manualMax, Number(root.querySelector('[data-ref="gmSkillLevel"]')?.value) || 1));
    runMutation("Add skill", () => bridges.supabase.mutateSupabaseRows(
      "odyssey_character_skills",
      { character_id: state.characterId, skill_def_id: defId, level },
      settings(), { method: "POST", prefer: "return=minimal" }
    ), () => refresh({ armory: false, equipment: false, inventory: false, perkAvailability: true }));
  }
  function onGmAddPerk() {
    const perkCode = root.querySelector('[data-ref="gmPerkCode"]')?.value?.trim();
    if (!perkCode) { setNotice("err", "Select a perk."); render(); return; }
    const perk = arr(state.perkAvailability).find((entry) => String(entry?.code || "").trim() === perkCode);
    if (!perk) { setNotice("err", "Perk definition not found."); render(); return; }
    if (perk.available !== true) {
      const skillName = perk.linked_skill_name || perk.linked_skill_code || "linked skill";
      setNotice("err", `Cannot add perk: ${esc(perk.name || perkCode)} requires ${esc(skillName)} ${dash(perk.required_skill_level)}, current ${dash(perk.current_skill_level)}.`);
      render();
      return;
    }
    runMutation("Add perk", () => api.perk.grantCharacterPerk(
      { character_id: state.characterId, perk_code: perkCode, created_by: "GM", spend_development_point: false },
      settings()
    ), () => refresh({ sheet: true, armory: false, equipment: false, inventory: false, abilities: false, perkAvailability: true }));
  }
  function onGmAddWeapon() {
    const defId = root.querySelector('[data-ref="gmWeaponDef"]')?.value;
    if (!defId) { setNotice("err", "Select a weapon model."); render(); return; }
    runMutation("Add weapon", () => bridges.supabase.mutateSupabaseRows(
      "odyssey_character_weapons",
      { character_id: state.characterId, weapon_model_id: defId },
      settings(), { method: "POST", prefer: "return=minimal" }
    ), () => refresh({ sheet: false, equipment: false, abilities: false }));
  }
  function onGmAddMagazine() {
    const defId = root.querySelector('[data-ref="gmMagDef"]')?.value;
    const ammoId = root.querySelector('[data-ref="gmMagAmmo"]')?.value;
    if (!defId) { setNotice("err", "Select a magazine type."); render(); return; }
    if (!ammoId) { setNotice("err", "Select an ammo type for the magazine."); render(); return; }
    runMutation("Add magazine", () => bridges.supabase.mutateSupabaseRows(
      "odyssey_character_magazines",
      { character_id: state.characterId, magazine_def_id: defId, ammo_type_id: ammoId },
      settings(), { method: "POST", prefer: "return=minimal" }
    ), () => refresh({ sheet: false, equipment: false, abilities: false }));
  }
  function onGmAddAmmo() {
    const ammoTypeId = root.querySelector('[data-ref="gmAmmoDef"]')?.value;
    const qty = Math.max(1, Number(root.querySelector('[data-ref="gmAmmoQty"]')?.value) || 1);
    if (!ammoTypeId) { setNotice("err", "Select an ammo type."); render(); return; }
    const ammoDef = state.ammoDefs.find((d) => String(d?.id ?? "") === ammoTypeId);
    if (!ammoDef) { setNotice("err", "Ammo type definition not found."); render(); return; }
    runMutation("Add ammo", () => api.inventory.addCharacterAmmoStock(
      { character_id: state.characterId, ammo_type_id: ammoTypeId, quantity: qty }, settings()
    ), () => refresh({ sheet: false, equipment: false, abilities: false }));
  }
  function onGmDelete(type, id) {
    if (!id) { setNotice("err", "Missing ID."); render(); return; }
    const DEL = { method: "DELETE", prefer: "return=minimal" };
    const charIdFilter = `character_id=eq.${encodeURIComponent(state.characterId)}`;
    const idFilter = `id=eq.${encodeURIComponent(id)}`;
    if (type === "skill") {
      runMutation("Delete skill", () => bridges.supabase.mutateSupabaseRows(
        `odyssey_character_skills?${idFilter}&${charIdFilter}`, null, settings(), DEL
      ), () => refresh({ armory: false, equipment: false, inventory: false, perkAvailability: true }));
    } else if (type === "weapon") {
      runMutation("Delete weapon", () => bridges.supabase.mutateSupabaseRows(
        `odyssey_character_weapons?${idFilter}&${charIdFilter}`, null, settings(), DEL
      ), () => refresh({ sheet: false, equipment: false, inventory: false, abilities: false }));
    } else if (type === "mag") {
      runMutation("Delete magazine", () => bridges.supabase.mutateSupabaseRows(
        `odyssey_character_magazines?${idFilter}&${charIdFilter}`, null, settings(), DEL
      ), () => refresh({ sheet: false, equipment: false, abilities: false }));
    } else if (type === "equip") {
      runMutation("Delete equipment", () => bridges.supabase.mutateSupabaseRows(
        `odyssey_character_equipment_items?${idFilter}&${charIdFilter}`, null, settings(), DEL
      ), () => refresh({ sheet: false, armory: false, inventory: false, abilities: false }));
    } else {
      setNotice("err", `Unknown delete type: ${type}`); render();
    }
  }
  function onGmAddEquipment(refKey, label) {
    const code = root.querySelector(`[data-ref="${refKey}"]`)?.value;
    if (!code) { setNotice("err", "Select a model."); render(); return; }
    runMutation(label, () => api.equipment.createCharacterEquipmentItem(
      { character_id: state.characterId, equipment_model_code: code }, settings()
    ), () => refresh({ sheet: false, armory: false, inventory: false, abilities: false }));
  }
  function onGmTool(kind) {
    if (kind === "additem")    return onGmAddItem();
    if (kind === "addskill")   return onGmAddSkill();
    if (kind === "addperk")    return onGmAddPerk();
    if (kind === "addweapon")  return onGmAddWeapon();
    if (kind === "addmag")     return onGmAddMagazine();
    if (kind === "addammo")    return onGmAddAmmo();
    if (kind === "refreshcatalogs") return refreshGmCatalogs();
    if (kind === "addarmor")   return onGmAddEquipment("gmArmorDef", "Add armor");
    if (kind === "addimplant") return onGmAddEquipment("gmImplantDef", "Add implant");
    if (kind === "heal")   return runMutation("GM heal",   () => api.gm.gmHealCharacter(state.characterId, settings()), () => refresh());
    if (kind === "repair") return runMutation("GM repair", () => api.gm.gmRepairCharacterArmor(state.characterId, settings()), () => refresh());
  }

  /* ---- numeric edit dialog with - / + stepper (Save/Cancel) ---- */
  function openForm({ title, note, current, min, max, onSave }) {
    const overlay = document.createElement("div");
    overlay.className = "cp-overlay";
    overlay.innerHTML = `<div class="cp-dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h3>${esc(title)}</h3>
      ${note ? `<div class="cp-muted" style="font-size:11px;margin-bottom:8px">${esc(note)}</div>` : ""}
      <div class="cp-dlg-stepper">
        <button data-dlg-dec type="button" class="secondary cp-dlg-step">-</button>
        <input data-dlg-input type="text" inputmode="numeric" value="${esc(current ?? "")}" class="cp-mono cp-dlg-input">
        <button data-dlg-inc type="button" class="secondary cp-dlg-step">+</button>
      </div>
      <div class="button-row" style="margin-top:8px"><button data-dlg-save type="button">Save</button><button data-dlg-cancel type="button" class="secondary">Cancel</button></div>
    </div>`;
    const input = overlay.querySelector("[data-dlg-input]");
    const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
    const save = () => {
      let v = Number(input.value);
      if (!Number.isFinite(v)) { input.focus(); return; }
      if (min != null) v = Math.max(v, Number(min));
      if (max != null) v = Math.min(v, Number(max));
      close();
      Promise.resolve(onSave(v)).catch(() => {});
    };
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Enter" && document.activeElement === input) { e.preventDefault(); save(); }
    }
    overlay.addEventListener("click", (e) => { if (e.target === overlay || e.target.closest("[data-dlg-cancel]")) close(); });
    overlay.querySelector("[data-dlg-save]").addEventListener("click", save);
    overlay.querySelector("[data-dlg-dec]").addEventListener("click", () => {
      let v = Number(input.value) - 1;
      if (min != null) v = Math.max(v, Number(min));
      input.value = v;
    });
    overlay.querySelector("[data-dlg-inc]").addEventListener("click", () => {
      let v = Number(input.value) + 1;
      if (max != null) v = Math.min(v, Number(max));
      input.value = v;
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    input.focus(); input.select();
  }

  render();
  root.addEventListener("odyssey:tabshow", () => {
    refreshSceneCombatSnapshot(true).catch(() => {});
    if (state.characterId) {
      refreshTacticalSnapshot(true).catch(() => {});
    }
    scheduleSelectionSync(true);
  });
  return () => {
    document.removeEventListener("keydown", onEscOnce);
    if (state.selectionSyncTimer) clearTimeout(state.selectionSyncTimer);
    cleanupRealtimeSubscriptions(); // cleanup real-time listeners on unmount
    cleanupSceneCombatSubscriptions();
  };
}
