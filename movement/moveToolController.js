import OBR from "@owlbear-rodeo/sdk";
import { addDiagnosticEntry } from "../utils/diagnostics.js";
import { normalizeError, toErrorMessage } from "../utils/errors.js";
import {
  activateTool,
  activateToolMode,
  getActiveTool,
  getActiveToolMode,
  getPlayerInfo,
  getRoomSceneContext,
  getSelectedOwlbearTokens,
  snapScenePosition,
  subscribePlayerChanges,
  subscribeSceneItems,
  subscribeToolChanges,
  waitForObrReady,
} from "../bridge/obrBridge.js";
import { loadRoomSupabaseSettings, hasSupabaseSettings } from "../bridge/settingsBridge.js";
import { COMBAT_MOVEMENT_METADATA_KEY } from "../constants/metadataKeys.js";
import { BC_HUD_SESSION } from "../hud/overlay/overlayConstants.js";
import {
  buildStraightSquarePath,
  cellToScene,
  normalizeTacticalGridSettings,
  sceneToCell,
} from "./gridMath.js";
import {
  buildPreviewItems,
  PREVIEW_GHOST_ID,
  PREVIEW_LABEL_ID,
  PREVIEW_LINE_ID,
} from "./combatMovementPreview.js";
import { resolveCombatMovementPermission } from "./combatMovementPermissions.js";
import { syncCombatScenePositions } from "./tacticalSync.js";
import {
  MOVE_TOOL_COMMANDS,
  MOVE_TOOL_EVENTS,
  TACTICAL_MOVE_MODE_ID,
  TACTICAL_MOVE_TOOL_ID,
  publishMoveToolEvent,
  subscribeMoveToolMessages,
} from "./moveToolBridge.js";

const MOVE_TOOL_ICON_URL =
  "https://odyssey-services.github.io/Odyssey_System/icon.svg?v=1.8.46";

const PREVIEW_IDS = [PREVIEW_LINE_ID, PREVIEW_LABEL_ID, PREVIEW_GHOST_ID];
const MARKER_TTL_MS = 15_000;
const POSITION_EPSILON = 0.01;
const PREVIEW_POSITION_EPSILON = 0.5;
const INTERNAL_MOVEMENT_SOURCES = new Set([
  "combat-movement",
  "combat-movement-revert",
]);

function createToolIcon() {
  return MOVE_TOOL_ICON_URL;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso() {
  return new Date().toISOString();
}

function createRequestId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nextAnimationFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function formatPreviewDiagnostics(details = {}) {
  try {
    return JSON.stringify(details);
  } catch {
    return String(details?.reason ?? "preview-diagnostic");
  }
}

function positionsMatch(a, b) {
  if (!a || !b) return false;
  return Math.abs((Number(a.x) || 0) - (Number(b.x) || 0)) <= POSITION_EPSILON
    && Math.abs((Number(a.y) || 0) - (Number(b.y) || 0)) <= POSITION_EPSILON;
}

function sameScenePosition(a, b, epsilon = PREVIEW_POSITION_EPSILON) {
  if (!a || !b) return false;
  return Math.abs((Number(a.x) || 0) - (Number(b.x) || 0)) <= epsilon
    && Math.abs((Number(a.y) || 0) - (Number(b.y) || 0)) <= epsilon;
}

function getCellKey(cell) {
  return `${Number(cell?.q ?? cell?.cell_q ?? 0) || 0}:${Number(cell?.r ?? cell?.cell_r ?? 0) || 0}`;
}

function createInitialState() {
  return {
    player: null,
    settings: null,
    runtime: null,
    encounterId: "",
    stateVersion: 0,
    grid: null,
    participantsByTokenId: new Map(),
    viewerControlledCharacterIds: new Set(),
    authoritativeByTokenId: new Map(),
    selectedToken: null,
    selectedParticipant: null,
    permission: null,
    preview: null,
    previewCreated: false,
    previewGhostCreated: false,
    previewRequestVersion: 0,
    previewRenderQueue: [],
    previewRenderActive: false,
    previewPointerQueue: [],
    previewPointerActive: false,
    pending: false,
    dragActive: false,
    toolRegistered: false,
    previousToolId: "",
    previousModeId: "",
    autoToolClaimed: false,
    runtimeRefreshPromise: null,
    runtimeRefreshTimer: null,
    lastSessionSignature: "",
    localMarkersByTokenId: new Map(),
    autoSyncedMarkerByTokenId: new Map(),
    autoSyncInFlightByKey: new Map(),
    gridRecoveryPromise: null,
    gridRecoveryKey: "",
  };
}

function buildStatus(state, extras = {}) {
  const participant = state.selectedParticipant ?? null;
  const permission = state.permission ?? {};
  const preview = state.preview ?? null;
  const position = participant?.position ?? null;

  return {
    active: !!participant,
    pending: state.pending,
    toolRegistered: state.toolRegistered,
    encounterId: state.encounterId,
    tokenId: String(state.selectedToken?.id ?? participant?.token_id ?? "").trim(),
    characterId: String(participant?.character_id ?? "").trim(),
    characterName: String(participant?.display_name ?? state.selectedToken?.name ?? "").trim(),
    moveCurrent: Number(participant?.move_current ?? 0) || 0,
    moveMax: Number(participant?.move_max ?? 0) || 0,
    stateVersion: Number(state.stateVersion ?? 0) || 0,
    movementVersion: Number(participant?.movement_version ?? 0) || 0,
    tacticalGrid: state.grid,
    gridReady: state.grid?.gridType === "square",
    currentTurn: permission.currentTurn === true,
    measureOnly: permission.measureOnly === true,
    canCommit: permission.canCommit === true,
    controlAllowed: permission.controlAllowed === true,
    position: position
      ? {
          cell_q: Number(position.cell_q ?? 0) || 0,
          cell_r: Number(position.cell_r ?? 0) || 0,
          scene_x: Number(position.scene_x ?? 0) || 0,
          scene_y: Number(position.scene_y ?? 0) || 0,
        }
      : null,
    preview: preview
      ? {
          cell_q: preview.cell.q,
          cell_r: preview.cell.r,
          scene_x: preview.scene.x,
          scene_y: preview.scene.y,
          path: Array.isArray(preview.path)
            ? preview.path.map((cell) => ({
                cell_q: Number(cell?.q ?? 0) || 0,
                cell_r: Number(cell?.r ?? 0) || 0,
              }))
            : [],
          blocked: preview.blocked === true,
          blockedCell: preview.blockedCell
            ? {
                cell_q: Number(preview.blockedCell.q ?? 0) || 0,
                cell_r: Number(preview.blockedCell.r ?? 0) || 0,
              }
            : null,
          blockedTokenId: String(preview.blockedTokenId ?? "").trim(),
          blockedCharacterId: String(preview.blockedCharacterId ?? "").trim(),
          blockReason: String(preview.blockReason ?? "").trim(),
          distanceCells: preview.distanceCells,
          moveCostM: preview.moveCostM,
          moveLimitM: preview.moveLimitM,
          remainingMoveM: preview.remainingMoveM,
          inRange: preview.inRange,
        }
      : null,
    ...extras,
  };
}

function extractMovementMarker(item) {
  const raw = item?.metadata?.[COMBAT_MOVEMENT_METADATA_KEY];
  if (!raw || typeof raw !== "object") return null;
  const source = String(raw.source ?? "").trim();
  const requestId = String(raw.requestId ?? "").trim();
  const updatedAt = String(raw.updatedAt ?? "").trim();
  const movementVersion = Number(raw.movementVersion ?? 0) || 0;
  if (!source || !updatedAt) return null;
  return {
    source,
    requestId,
    updatedAt,
    movementVersion,
  };
}

function isFreshMarker(marker) {
  if (!marker?.updatedAt) return false;
  const updatedAtMs = Date.parse(marker.updatedAt);
  if (!Number.isFinite(updatedAtMs)) return false;
  return Date.now() - updatedAtMs <= MARKER_TTL_MS;
}

function buildMovementMarker({ requestId, movementVersion, source }) {
  return {
    source,
    requestId,
    movementVersion,
    updatedAt: nowIso(),
  };
}

function participantHasAuthoritativePosition(participant) {
  const position = participant?.position ?? null;
  if (!position || typeof position !== "object") return false;
  return Number.isFinite(Number(position.scene_x))
    && Number.isFinite(Number(position.scene_y))
    && Number.isFinite(Number(position.cell_q))
    && Number.isFinite(Number(position.cell_r));
}

function hasReadyTacticalRuntime(runtimeResponse) {
  if (!normalizeTacticalGridSettings(runtimeResponse?.tactical_grid)) {
    return false;
  }
  for (const participant of ensureArray(runtimeResponse?.visible_participants)) {
    const tokenId = String(participant?.token_id ?? "").trim();
    if (!tokenId) continue;
    if (!participantHasAuthoritativePosition(participant)) {
      return false;
    }
  }
  return true;
}

export function setupTacticalMoveTool({ runtime }) {
  const combatApi = runtime?.api?.combat;

  if (!combatApi) {
    addDiagnosticEntry("error", "Combat movement init failed", "Combat API is unavailable.");
    return {
      dispose() {},
    };
  }

  const state = createInitialState();
  let unsubscribeBroadcast = null;
  let unsubscribeSceneItems = null;
  let unsubscribePlayer = null;
  let unsubscribeSession = null;
  let unsubscribeTool = null;
  let disposed = false;

  async function notify(message, variant = "INFO") {
    if (!message) return;
    try {
      await OBR.notification.show(message, variant);
    } catch {
      // ignore notification failures outside OBR runtime
    }
  }

  async function publishStatus(extras = {}) {
    try {
      await publishMoveToolEvent(MOVE_TOOL_EVENTS.Status, buildStatus(state, extras));
    } catch {
      // ignore local broadcast failures
    }
  }

  function clearRuntimeCache() {
    state.runtime = null;
    state.encounterId = "";
    state.stateVersion = 0;
    state.grid = null;
    state.participantsByTokenId = new Map();
    state.viewerControlledCharacterIds = new Set();
    state.authoritativeByTokenId = new Map();
  }

  function updateRuntimeCache(runtimeResponse) {
    const encounter = runtimeResponse?.encounter ?? null;
    if (!encounter?.id || String(encounter?.status ?? "").trim() !== "active") {
      clearRuntimeCache();
      return;
    }

    state.runtime = runtimeResponse;
    state.encounterId = String(encounter.id ?? "").trim();
    state.stateVersion = Number(
      runtimeResponse?.state_version ?? encounter?.state_version ?? 0,
    ) || 0;
    state.grid = normalizeTacticalGridSettings(runtimeResponse?.tactical_grid);

    const nextParticipants = new Map();
    const nextPositions = new Map();
    for (const participant of ensureArray(runtimeResponse?.visible_participants)) {
      const tokenId = String(participant?.token_id ?? "").trim();
      const characterId = String(participant?.character_id ?? "").trim();
      if (!tokenId || !characterId) continue;
      nextParticipants.set(tokenId, participant);
      const position = participant?.position ?? null;
      if (position) {
        nextPositions.set(tokenId, {
          encounterId: state.encounterId,
          tokenId,
          characterId,
          cell_q: Number(position.cell_q ?? 0) || 0,
          cell_r: Number(position.cell_r ?? 0) || 0,
          scene_x: Number(position.scene_x ?? 0) || 0,
          scene_y: Number(position.scene_y ?? 0) || 0,
          movementVersion: Number(participant?.movement_version ?? 0) || 0,
          stateVersion: state.stateVersion,
        });
      }
    }

    state.participantsByTokenId = nextParticipants;
    state.authoritativeByTokenId = nextPositions;
    state.viewerControlledCharacterIds = new Set(
      ensureArray(runtimeResponse?.viewer_controlled_character_ids)
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    );
  }

  async function ensureSettingsLoaded() {
    if (!state.settings) {
      state.settings = await loadRoomSupabaseSettings();
    }
    if (!hasSupabaseSettings(state.settings)) {
      throw new Error("Supabase room settings are not configured.");
    }
  }

  async function ensurePlayerLoaded() {
    state.player = await getPlayerInfo();
    return state.player;
  }

  async function fetchRuntime(reason = "refresh") {
    if (state.runtimeRefreshPromise) {
      return state.runtimeRefreshPromise;
    }

    state.runtimeRefreshPromise = (async () => {
      await ensureSettingsLoaded();
      const player = await ensurePlayerLoaded();
      const roomContext = await getRoomSceneContext();
      if (!roomContext?.campaignId || !roomContext?.roomId || !roomContext?.sceneId) {
        throw new Error("Unable to resolve Owlbear room or scene context.");
      }
      const runtimeResponse = await combatApi.getActiveRuntime(
        {
          campaign_id: roomContext.campaignId,
          room_id: roomContext.roomId,
          scene_id: roomContext.sceneId,
          actor_player_id: player.id,
          actor_is_gm: player.role === "GM",
          include_hidden: player.role === "GM",
        },
        state.settings,
      );
      if (runtimeResponse?.ok === false) {
        throw new Error(runtimeResponse?.message || "Unable to read active combat runtime.");
      }
      updateRuntimeCache(runtimeResponse);
      addDiagnosticEntry(
        "info",
        "Authoritative runtime loaded",
        `gridReady=${hasReadyTacticalRuntime(runtimeResponse) ? "true" : "false"}`,
      );
      return runtimeResponse;
    })()
      .catch((error) => {
        const normalized = normalizeError(error, `Unable to refresh combat runtime (${reason}).`);
        addDiagnosticEntry("warn", "Combat movement runtime refresh failed", normalized.message);
        clearRuntimeCache();
        throw normalized;
      })
      .finally(() => {
        state.runtimeRefreshPromise = null;
      });

    return state.runtimeRefreshPromise;
  }

  function scheduleRuntimeRefresh(reason = "scheduled") {
    if (state.runtimeRefreshTimer) {
      clearTimeout(state.runtimeRefreshTimer);
    }
    state.runtimeRefreshTimer = setTimeout(() => {
      state.runtimeRefreshTimer = null;
      void fetchRuntime(reason)
        .then((runtimeResponse) => syncSelectionState(`${reason}-selection`, { runtimeResponse }))
        .catch(() => syncSelectionState(`${reason}-selection`));
    }, 120);
  }

  async function clearPreview({ reason = "preview-cleared", silent = false } = {}) {
    state.previewRequestVersion += 1;
    state.previewRenderQueue = [];
    state.previewPointerQueue = [];
    try {
      await OBR.scene.local.deleteItems(PREVIEW_IDS);
    } catch {
      // preview may not exist yet
    }
    state.preview = null;
    state.previewCreated = false;
    state.previewGhostCreated = false;
    state.previewRenderActive = false;
    state.previewPointerActive = false;
    state.dragActive = false;
    if (!silent) {
      await publishStatus({ reason });
    }
  }

  async function updatePreview(preview) {
    if (!state.selectedToken || !state.selectedParticipant) return;

    const current = state.preview;
    const previewPositionUnchanged = sameScenePosition(
      current?.scene,
      preview?.scene,
    );
    if (
      current
      && previewPositionUnchanged
      && current.inRange === preview.inRange
      && current.moveCostM === preview.moveCostM
      && current.remainingMoveM === preview.remainingMoveM
    ) {
      return;
    }

    state.preview = preview;
    const originScene = {
      x: Number(state.selectedParticipant.position?.scene_x ?? 0) || 0,
      y: Number(state.selectedParticipant.position?.scene_y ?? 0) || 0,
    };
    const items = buildPreviewItems({
      preview,
      originScene,
      selectedToken: state.selectedToken,
    });

    addDiagnosticEntry(
      "info",
      "Preview label prepared",
      formatPreviewDiagnostics({
        id: items.label?.id,
        type: items.label?.type,
        textType: items.label?.text?.type,
        text: items.label?.text?.plainText,
        position: items.label?.position,
      }),
    );

    if (items.ghostError) {
      const normalized = normalizeError(items.ghostError, "Unable to build movement preview ghost.");
      addDiagnosticEntry(
        "warn",
        "Combat preview ghost build failed",
        formatPreviewDiagnostics({
          ...items.ghostDebugInfo,
          tokenId: String(state.selectedToken?.id ?? "").trim(),
          message: normalized.message,
        }),
      );
    }

    try {
      if (!state.previewCreated) {
        await OBR.scene.local.addItems([items.line, items.label]);
        state.previewCreated = true;
        addDiagnosticEntry(
          "info",
          "Combat preview core created",
          buildPreviewDiagnosticDetails({
            tokenId: state.selectedToken?.id,
            cell: preview.cell,
            scene: preview.scene,
            distanceCells: preview.distanceCells,
            moveCostM: preview.moveCostM,
          }),
        );
      } else {
        await OBR.scene.local.updateItems([PREVIEW_LINE_ID, PREVIEW_LABEL_ID], (sceneItems) => {
          for (const item of sceneItems) {
            if (item.id === PREVIEW_LINE_ID && item.type === "LINE") {
              item.startPosition = items.line.startPosition;
              item.endPosition = items.line.endPosition;
              item.style = items.line.style;
            }
            if (item.id === PREVIEW_LABEL_ID && item.type === "TEXT") {
              item.position = items.label.position;
              item.text = items.label.text;
              item.style = items.label.style;
            }
          }
        });
      }
    } catch (error) {
      state.previewCreated = false;
      const normalized = normalizeError(error, "Unable to update core movement preview.");
      addDiagnosticEntry("warn", "Combat preview core update failed", normalized.message);
      await publishStatus();
      return;
    }

    if (!items.ghost) {
      if (state.previewGhostCreated) {
        try {
          await OBR.scene.local.deleteItems([PREVIEW_GHOST_ID]);
        } catch {
          // ignore ghost cleanup failures
        }
      }
      state.previewGhostCreated = false;
      await publishStatus();
      return;
    }

    addDiagnosticEntry(
      "info",
      "Combat preview render",
      formatPreviewDiagnostics({
        tokenId: String(state.selectedToken?.id ?? "").trim(),
        cellQ: Number(preview.cell?.q ?? 0) || 0,
        cellR: Number(preview.cell?.r ?? 0) || 0,
        sceneX: Number(preview.scene?.x ?? 0) || 0,
        sceneY: Number(preview.scene?.y ?? 0) || 0,
      }),
    );

    try {
      if (!state.previewGhostCreated) {
        await OBR.scene.local.addItems([items.ghost]);
        state.previewGhostCreated = true;
        addDiagnosticEntry(
          "info",
          "Combat preview ghost added",
          buildPreviewDiagnosticDetails({
            tokenId: state.selectedToken?.id,
            cell: preview.cell,
            scene: preview.scene,
            distanceCells: preview.distanceCells,
            moveCostM: preview.moveCostM,
          }),
        );
      } else {
        await OBR.scene.local.updateItems([PREVIEW_GHOST_ID], (sceneItems) => {
          for (const item of sceneItems) {
            if (item.id === PREVIEW_GHOST_ID && item.type === "IMAGE") {
              item.position = items.ghost.position;
              item.rotation = items.ghost.rotation;
              item.scale = items.ghost.scale;
            }
          }
        });
      }
    } catch (error) {
      state.previewGhostCreated = false;
      const normalized = normalizeError(error, "Unable to add movement preview ghost.");
      addDiagnosticEntry(
        "warn",
        "Combat preview ghost add failed",
        formatPreviewDiagnostics({
          ...items.ghostDebugInfo,
          tokenId: String(state.selectedToken?.id ?? "").trim(),
          message: normalized.message,
        }),
      );
    }

    await publishStatus();
  }

  function getSelectedParticipantOrigin() {
    const position = state.selectedParticipant?.position ?? null;
    if (!position) return null;
    return {
      cell: {
        q: Number(position.cell_q ?? 0) || 0,
        r: Number(position.cell_r ?? 0) || 0,
      },
      scene: {
        x: Number(position.scene_x ?? 0) || 0,
        y: Number(position.scene_y ?? 0) || 0,
      },
    };
  }

  function buildPreviewDiagnosticDetails({
    tokenId = "",
    cell = null,
    scene = null,
    distanceCells = null,
    moveCostM = null,
    reason = "",
  } = {}) {
    return formatPreviewDiagnostics({
      tokenId: String(tokenId ?? state.selectedToken?.id ?? "").trim(),
      cellQ: Number(cell?.q ?? 0) || 0,
      cellR: Number(cell?.r ?? 0) || 0,
      sceneX: Number(scene?.x ?? 0) || 0,
      sceneY: Number(scene?.y ?? 0) || 0,
      distanceCells: Number(distanceCells ?? 0) || 0,
      moveCostM: Number(moveCostM ?? 0) || 0,
      reason: String(reason ?? "").trim(),
    });
  }

  function getOccupiedRouteBlock(path) {
    if (!Array.isArray(path) || path.length <= 1) {
      return null;
    }

    const selectedTokenId = String(state.selectedToken?.id ?? "").trim();
    const selectedCharacterId = String(state.selectedParticipant?.character_id ?? "").trim();
    const occupiedByCell = new Map();

    for (const [tokenId, authoritative] of state.authoritativeByTokenId.entries()) {
      const normalizedTokenId = String(tokenId ?? "").trim();
      const characterId = String(authoritative?.characterId ?? "").trim();
      if (!normalizedTokenId) continue;
      if (normalizedTokenId === selectedTokenId) continue;
      if (characterId && characterId === selectedCharacterId) continue;
      occupiedByCell.set(
        getCellKey({
          q: authoritative?.cell_q,
          r: authoritative?.cell_r,
        }),
        {
          tokenId: normalizedTokenId,
          characterId,
        },
      );
    }

    for (const stepCell of path.slice(1)) {
      const occupant = occupiedByCell.get(getCellKey(stepCell));
      if (!occupant) continue;
      return {
        blockedCell: {
          q: Number(stepCell?.q ?? 0) || 0,
          r: Number(stepCell?.r ?? 0) || 0,
        },
        blockedTokenId: occupant.tokenId,
        blockedCharacterId: occupant.characterId,
        blockReason: "occupied",
      };
    }

    return null;
  }

  function buildPreviewFromScenePosition(scenePosition, tokenIdOverride = "") {
    const grid = state.grid;
    const participant = state.selectedParticipant;
    const tokenId = String(
      tokenIdOverride
      || state.selectedToken?.id
      || participant?.token_id
      || "",
    ).trim();
    if (!grid) {
      addDiagnosticEntry(
        "info",
        "Combat preview unavailable",
        buildPreviewDiagnosticDetails({ tokenId, reason: "missing-grid" }),
      );
      return null;
    }
    if (grid.gridType !== "square") {
      addDiagnosticEntry(
        "info",
        "Combat preview unavailable",
        buildPreviewDiagnosticDetails({ tokenId, reason: "square-grid-required" }),
      );
      return null;
    }
    if (!participant?.position) {
      addDiagnosticEntry(
        "info",
        "Combat preview unavailable",
        buildPreviewDiagnosticDetails({ tokenId, reason: "missing-participant-position" }),
      );
      return null;
    }
    if (!scenePosition) {
      addDiagnosticEntry(
        "info",
        "Combat preview unavailable",
        buildPreviewDiagnosticDetails({ tokenId, reason: "missing-scene-position" }),
      );
      return null;
    }

    const origin = getSelectedParticipantOrigin();
    if (!origin) {
      addDiagnosticEntry(
        "info",
        "Combat preview unavailable",
        buildPreviewDiagnosticDetails({ tokenId, reason: "missing-participant-position" }),
      );
      return null;
    }

    const cell = sceneToCell(grid, scenePosition);
    if (!cell) {
      addDiagnosticEntry(
        "info",
        "Combat preview unavailable",
        buildPreviewDiagnosticDetails({
          tokenId,
          scene: scenePosition,
          reason: "cell-conversion-failed",
        }),
      );
      return null;
    }

    const snappedScene = cellToScene(grid, cell);
    if (!snappedScene) {
      addDiagnosticEntry(
        "info",
        "Combat preview unavailable",
        buildPreviewDiagnosticDetails({
          tokenId,
          cell,
          reason: "scene-conversion-failed",
        }),
      );
      return null;
    }

    const path = buildStraightSquarePath(origin.cell, cell);
    const distanceCells = Math.max(path.length - 1, 0);
    const moveCostM = distanceCells * Math.max(Number(grid.metersPerCell ?? 1) || 1, 1);
    const moveLimitM = Number(participant.move_current ?? 0) || 0;
    const blockedRoute = getOccupiedRouteBlock(path);

    const preview = {
      cell,
      scene: {
        x: Number(snappedScene.x) || 0,
        y: Number(snappedScene.y) || 0,
      },
      path,
      blocked: !!blockedRoute,
      blockedCell: blockedRoute?.blockedCell ?? null,
      blockedTokenId: String(blockedRoute?.blockedTokenId ?? "").trim(),
      blockedCharacterId: String(blockedRoute?.blockedCharacterId ?? "").trim(),
      blockReason: String(blockedRoute?.blockReason ?? "").trim(),
      distanceCells,
      moveCostM,
      moveLimitM,
      remainingMoveM: moveLimitM - moveCostM,
      inRange: !blockedRoute && moveCostM <= moveLimitM,
    };

    addDiagnosticEntry(
      "info",
      "Combat preview built",
      formatPreviewDiagnostics({
        tokenId,
        cellQ: Number(cell?.q ?? 0) || 0,
        cellR: Number(cell?.r ?? 0) || 0,
        sceneX: Number(preview.scene?.x ?? 0) || 0,
        sceneY: Number(preview.scene?.y ?? 0) || 0,
        distanceCells: Number(distanceCells ?? 0) || 0,
        moveCostM: Number(moveCostM ?? 0) || 0,
        gridDpi: Number(grid?.gridDpi ?? 0) || 0,
        anchorX: Number(grid?.anchor?.x ?? 0) || 0,
        anchorY: Number(grid?.anchor?.y ?? 0) || 0,
      }),
    );

    return preview;
  }

  function buildPreviewFromPointerFast(pointerPosition) {
    return buildPreviewFromScenePosition(pointerPosition);
  }

  async function buildPreviewFromPointer(pointerPosition) {
    const participant = state.selectedParticipant;
    const tokenId = String(state.selectedToken?.id ?? participant?.token_id ?? "").trim();
    if (!pointerPosition) {
      addDiagnosticEntry(
        "info",
        "Combat preview unavailable",
        buildPreviewDiagnosticDetails({ tokenId, reason: "missing-pointer-position" }),
      );
      return null;
    }

    const snappedScene = await snapScenePosition(
      pointerPosition,
      1,
      false,
      true,
    );

    if (!snappedScene) {
      addDiagnosticEntry(
        "info",
        "Combat preview unavailable",
        buildPreviewDiagnosticDetails({ tokenId, reason: "snap-returned-null" }),
      );
      return null;
    }

    addDiagnosticEntry(
      "info",
      "Combat preview position snapped",
      buildPreviewDiagnosticDetails({
        tokenId,
        scene: snappedScene,
      }),
    );

    return buildPreviewFromScenePosition(snappedScene, tokenId);
  }

  function queuePreviewRender(preview) {
    if (!preview) return;
    const previous = state.previewRenderQueue.at(-1);
    if (previous && sameScenePosition(previous.scene, preview.scene, 0.01)) {
      return;
    }
    state.previewRenderQueue.push(preview);
    if (!state.previewRenderActive) {
      void flushPreviewRenderQueue();
    }
  }

  async function flushPreviewRenderQueue() {
    if (state.previewRenderActive) return;
    state.previewRenderActive = true;
    try {
      while (state.dragActive && state.previewRenderQueue.length > 0) {
        const preview = state.previewRenderQueue.shift();
        if (!preview) continue;
        await updatePreview(preview);
        await nextAnimationFrame();
      }
    } finally {
      state.previewRenderActive = false;
    }
  }

  function queuePreviewPointer(pointerPosition) {
    if (!pointerPosition) return;
    const preview = buildPreviewFromPointerFast(pointerPosition);
    if (!preview) return;
    state.previewPointerQueue = [];
    state.previewRenderQueue = [];
    queuePreviewRender(preview);
  }

  async function flushPreviewPointerQueue() {
    if (state.previewPointerActive) return;
    state.previewPointerActive = true;
    try {
      while (state.dragActive && state.previewPointerQueue.length > 0) {
        const pointerPosition = state.previewPointerQueue.shift();
        if (!pointerPosition) continue;
        const preview = await buildPreviewFromPointer(pointerPosition);
        if (!state.dragActive) break;
        if (!preview) continue;
        queuePreviewRender(preview);
      }
      await flushPreviewRenderQueue();
    } finally {
      state.previewPointerActive = false;
    }
  }

  async function capturePreviousTool() {
    if (state.autoToolClaimed) return;
    const [activeTool, activeMode] = await Promise.all([
      getActiveTool().catch(() => ""),
      getActiveToolMode().catch(() => ""),
    ]);
    if (activeTool && activeTool !== TACTICAL_MOVE_TOOL_ID) {
      state.previousToolId = activeTool;
      state.previousModeId = activeMode;
    }
  }

  async function ensureToolActivated(reason = "auto-select") {
    await capturePreviousTool();
    const [activeTool, activeMode] = await Promise.all([
      getActiveTool().catch(() => ""),
      getActiveToolMode().catch(() => ""),
    ]);
    if (activeTool === TACTICAL_MOVE_TOOL_ID && activeMode === TACTICAL_MOVE_MODE_ID) {
      state.autoToolClaimed = true;
      return;
    }
    await activateTool(TACTICAL_MOVE_TOOL_ID);
    await activateToolMode(TACTICAL_MOVE_TOOL_ID, TACTICAL_MOVE_MODE_ID);
    state.autoToolClaimed = true;
    await publishStatus({ reason });
  }

  async function restorePreviousTool(reason = "restore-tool") {
    if (!state.autoToolClaimed) return;
    const activeTool = await getActiveTool().catch(() => "");
    if (activeTool === TACTICAL_MOVE_TOOL_ID && state.previousToolId) {
      try {
        await activateTool(state.previousToolId);
        if (state.previousModeId) {
          await activateToolMode(state.previousToolId, state.previousModeId).catch(() => {});
        }
      } catch {
        // ignore restore failures
      }
    }
    state.autoToolClaimed = false;
    await publishStatus({ reason });
  }

  async function syncSelectionState(reason = "selection-sync", options = {}) {
    state.player = await getPlayerInfo().catch(() => state.player);
    const selectedTokens = await getSelectedOwlbearTokens().catch(() => []);
    const selectedToken = selectedTokens.length === 1 ? selectedTokens[0] : null;
    const runtimeResponse = options.runtimeResponse ?? state.runtime;

    if (!selectedToken) {
      state.selectedToken = null;
      state.selectedParticipant = null;
      state.permission = null;
      await clearPreview({ reason: `${reason}-no-selection`, silent: true });
      await restorePreviousTool(`${reason}-no-selection`);
      await publishStatus({ reason: `${reason}-no-selection` });
      return;
    }

    state.selectedToken = selectedToken;

    if (!runtimeResponse?.encounter?.id || !state.encounterId) {
      state.selectedParticipant = null;
      state.permission = null;
      await clearPreview({ reason: `${reason}-no-encounter`, silent: true });
      await restorePreviousTool(`${reason}-no-encounter`);
      await publishStatus({ reason: `${reason}-no-encounter`, tokenId: selectedToken.id });
      return;
    }

    const participant = state.participantsByTokenId.get(String(selectedToken.id ?? "").trim()) ?? null;
    if (!participant) {
      state.selectedParticipant = null;
      state.permission = null;
      await clearPreview({ reason: `${reason}-non-combat-token`, silent: true });
      await restorePreviousTool(`${reason}-non-combat-token`);
      await publishStatus({ reason: `${reason}-non-combat-token`, tokenId: selectedToken.id });
      return;
    }

    const previousCharacterId = String(state.selectedParticipant?.character_id ?? "").trim();
    state.selectedParticipant = participant;
    state.permission = resolveCombatMovementPermission({
      player: state.player,
      participant,
      viewerControlledCharacterIds: state.viewerControlledCharacterIds,
    });

    const nextCharacterId = String(participant.character_id ?? "").trim();
    const selectionChanged = previousCharacterId !== nextCharacterId;
    const gridReady = state.grid?.gridType === "square";

    if (selectionChanged || !gridReady) {
      await clearPreview({ reason: `${reason}-selection-updated`, silent: true });
    }

    await ensureToolActivated(reason);
    await publishStatus({ reason, gridReady });
  }

  async function refreshRuntimeAndSelection(reason = "refresh-runtime") {
    try {
      const runtimeResponse = await fetchRuntime(reason);
      await syncSelectionState(reason, { runtimeResponse });
      if (state.encounterId && !hasReadyTacticalRuntime(runtimeResponse)) {
        await ensureTacticalGridReady(reason);
      }
    } catch {
      await syncSelectionState(reason);
    }
  }

  async function writeTokenPositionWithMarker(tokenId, scenePosition, movementVersion, source) {
    const requestId = createRequestId();
    const marker = buildMovementMarker({
      requestId,
      movementVersion,
      source,
    });
    state.localMarkersByTokenId.set(tokenId, marker);

    await OBR.scene.items.updateItems([tokenId], (items) => {
      for (const item of items) {
        item.position = {
          x: Number(scenePosition.x ?? scenePosition.scene_x ?? 0) || 0,
          y: Number(scenePosition.y ?? scenePosition.scene_y ?? 0) || 0,
        };
        item.metadata = {
          ...(item.metadata ?? {}),
          [COMBAT_MOVEMENT_METADATA_KEY]: marker,
        };
      }
    });
  }

  async function revertUnauthorizedTokenMove(tokenId, authoritative, message = "Use combat movement during your turn.") {
    try {
      await writeTokenPositionWithMarker(
        tokenId,
        { x: authoritative.scene_x, y: authoritative.scene_y },
        authoritative.movementVersion,
        "combat-movement-revert",
      );
      await notify(message, "WARNING");
    } catch (error) {
      const normalized = normalizeError(error, "Unable to restore authoritative combat position.");
      addDiagnosticEntry("warn", "Combat movement revert failed", normalized.message);
    }
  }

  async function applyMoveResultToScene(result, source) {
    const nextPosition = result?.position ?? null;
    const tokenId = String(
      nextPosition?.token_id
      ?? state.selectedParticipant?.token_id
      ?? state.selectedToken?.id
      ?? "",
    ).trim();
    if (!nextPosition || !tokenId) return;

    await writeTokenPositionWithMarker(
      tokenId,
      {
        x: Number(nextPosition.scene_x ?? 0) || 0,
        y: Number(nextPosition.scene_y ?? 0) || 0,
      },
      Number(result?.movement_version ?? state.selectedParticipant?.movement_version ?? 0) || 0,
      source,
    );
  }

  async function tryRetryStaleMovement({
    preview,
    payloadBase,
    invokeMutation,
    source = "combat-movement",
  }) {
    const runtimeResponse = state.runtime;
    if (!runtimeResponse?.encounter?.id) {
      return null;
    }

    await syncSelectionState(`${source}-stale-reload`, { runtimeResponse });

    if (!state.selectedParticipant || !state.permission?.canCommit || !state.grid) {
      return null;
    }

    if (String(state.encounterId ?? "").trim() !== String(payloadBase.encounter_id ?? "").trim()) {
      return null;
    }

    if (String(state.selectedParticipant.character_id ?? "").trim() !== String(payloadBase.character_id ?? "").trim()) {
      return null;
    }

    if (!participantHasAuthoritativePosition(state.selectedParticipant)) {
      return null;
    }

    const origin = getSelectedParticipantOrigin();
    if (!origin) {
      return null;
    }

    const path = Array.isArray(preview.path) && preview.path.length
      ? preview.path
      : buildStraightSquarePath(origin.cell, preview.cell);
    const distanceCells = Math.max(path.length - 1, 0);
    const moveCostM = distanceCells * Math.max(Number(state.grid.metersPerCell ?? 1) || 1, 1);
    const moveLimitM = Number(state.selectedParticipant.move_current ?? 0) || 0;

    if (distanceCells <= 0 || preview.blocked || moveCostM > moveLimitM) {
      return null;
    }

    const retryPayload = {
      ...payloadBase,
      token_id: String(state.selectedParticipant.token_id ?? state.selectedToken?.id ?? "").trim(),
      expected_state_version: Number(state.stateVersion ?? 0) || 0,
      expected_movement_version: Number(state.selectedParticipant.movement_version ?? 0) || 0,
      destination: {
        cell_q: preview.cell.q,
        cell_r: preview.cell.r,
        scene_x: preview.scene.x,
        scene_y: preview.scene.y,
      },
    };

    addDiagnosticEntry(
      "info",
      "Combat movement stale retry",
      formatPreviewDiagnostics({
        tokenId: retryPayload.token_id,
        cellQ: preview.cell.q,
        cellR: preview.cell.r,
        sceneX: preview.scene.x,
        sceneY: preview.scene.y,
        distanceCells,
        moveCostM,
      }),
    );

    return invokeMutation(retryPayload, state.settings);
  }

  async function finalizeMutationSuccess(result, source, successMessage) {
    if (result?.runtime) {
      updateRuntimeCache(result.runtime);
    }
    await applyMoveResultToScene(result, source);
    await clearPreview({ reason: `${source}-applied`, silent: true });
    state.pending = false;
    await syncSelectionState(`${source}-applied`, { runtimeResponse: result?.runtime ?? state.runtime });
    await publishMoveToolEvent(MOVE_TOOL_EVENTS.Applied, {
      ...buildStatus(state, { applied: true, source }),
      runtime: result?.runtime ?? null,
    });
    await notify(successMessage, "SUCCESS");
  }

  async function runAutoTacticalSync({
    onlyCharacterId = "",
    runtimeResponse = null,
    reason = "auto-sync",
  } = {}) {
    if (String(state.player?.role ?? "").toUpperCase() !== "GM") {
      addDiagnosticEntry("info", "Tactical sync skipped", "player is not GM");
      return null;
    }

    const key = String(onlyCharacterId ?? "").trim() || "*";
    if (state.autoSyncInFlightByKey.has(key)) {
      return state.autoSyncInFlightByKey.get(key);
    }

    const syncPromise = syncCombatScenePositions({
      combatApi,
      settings: state.settings,
      runtimeResponse,
      onlyCharacterId: key === "*" ? "" : key,
    })
      .then(({ result, positions }) => {
        if (result?.runtime) {
          updateRuntimeCache(result.runtime);
        }
        addDiagnosticEntry(
          "info",
          "Auto tactical sync complete",
          `${reason}: synced ${positions.length} token(s).`,
        );
        return { result, positions };
      })
      .catch((error) => {
        const normalized = normalizeError(error, "Unable to auto-sync tactical positions.");
        addDiagnosticEntry("warn", "Auto tactical sync failed", `${reason}: ${normalized.message}`);
        return null;
      })
      .finally(() => {
        state.autoSyncInFlightByKey.delete(key);
      });

    state.autoSyncInFlightByKey.set(key, syncPromise);
    return syncPromise;
  }

  async function ensureTacticalGridReady(reason = "grid-recovery") {
    const selectedParticipantReady = !state.selectedParticipant || participantHasAuthoritativePosition(state.selectedParticipant);
    if (state.grid && selectedParticipantReady) {
      return true;
    }

    const recoveryKey = String(state.encounterId ?? "").trim() || "scene";
    if (state.gridRecoveryPromise && state.gridRecoveryKey === recoveryKey) {
      return state.gridRecoveryPromise;
    }

    state.gridRecoveryKey = recoveryKey;
    state.gridRecoveryPromise = (async () => {
      addDiagnosticEntry("info", "Combat movement grid recovery started", reason);
      try {
        let runtimeResponse = await fetchRuntime(`${reason}-runtime`);

        if (hasReadyTacticalRuntime(runtimeResponse)) {
          await syncSelectionState(`${reason}-runtime-ready`, { runtimeResponse });
          addDiagnosticEntry("info", "Combat movement grid recovery succeeded", `${reason}: runtime already had grid`);
          return Boolean(state.grid);
        }

        const isGm = String(state.player?.role ?? "").toUpperCase() === "GM";
        if (isGm) {
          const syncResult = await runAutoTacticalSync({
            runtimeResponse,
            reason: `${reason}-sync`,
          });

          runtimeResponse = syncResult?.result?.runtime
            ?? await fetchRuntime(`${reason}-post-sync`);

          updateRuntimeCache(runtimeResponse);
          await syncSelectionState(`${reason}-post-sync`, { runtimeResponse });
        } else {
          addDiagnosticEntry("info", "Tactical sync skipped", "player is not GM");
          runtimeResponse = await fetchRuntime(`${reason}-retry`);
          await syncSelectionState(`${reason}-retry`, { runtimeResponse });
        }

        const ready = Boolean(state.grid)
          && (!state.selectedParticipant || participantHasAuthoritativePosition(state.selectedParticipant));

        addDiagnosticEntry(
          ready ? "info" : "warn",
          ready ? "Combat movement grid recovery succeeded" : "Combat movement grid recovery failed",
          ready ? reason : `${reason}: tactical grid or authoritative position is still missing`,
        );
        return ready;
      } catch (error) {
        const normalized = normalizeError(error, "Unable to synchronize tactical grid.");
        addDiagnosticEntry("warn", "Combat movement grid recovery failed", normalized.message);
        return Boolean(state.grid)
          && (!state.selectedParticipant || participantHasAuthoritativePosition(state.selectedParticipant));
      } finally {
        state.gridRecoveryPromise = null;
        state.gridRecoveryKey = "";
      }
    })();

    return state.gridRecoveryPromise;
  }

  async function failMutation(result, fallbackMessage) {
    const message = String(result?.message ?? result?.error ?? fallbackMessage);
    if (result?.runtime) {
      updateRuntimeCache(result.runtime);
    }
    await clearPreview({ reason: "move-failed", silent: true });
    state.pending = false;
    await syncSelectionState("move-failed", { runtimeResponse: result?.runtime ?? state.runtime });
    await publishStatus({ error: message });
    await publishMoveToolEvent(MOVE_TOOL_EVENTS.Error, {
      message,
      code: String(result?.error ?? "").trim(),
      tokenId: String(state.selectedToken?.id ?? "").trim(),
      characterId: String(state.selectedParticipant?.character_id ?? "").trim(),
    });
    await notify(message, result?.error === "STALE_MOVEMENT_STATE" ? "WARNING" : "ERROR");
  }

  async function commitPreview(preview) {
    if (!state.selectedParticipant || !state.permission || state.pending) return;

    if (!preview || preview.distanceCells <= 0) {
      await clearPreview({ reason: "zero-distance", silent: true });
      await publishStatus({ reason: "zero-distance" });
      return;
    }

    if (!state.permission.canCommit) {
      await clearPreview({ reason: "measure-only", silent: true });
      await publishStatus({ reason: "measure-only" });
      await notify(
        state.permission.controlAllowed ? "It is not your turn." : "You cannot control this combatant.",
        "WARNING",
      );
      return;
    }

    if (preview.blocked) {
      await clearPreview({ reason: "move-path-blocked", silent: true });
      await publishStatus({
        reason: "move-path-blocked",
        error: "Path blocked.",
      });
      await notify("Path blocked.", "WARNING");
      return;
    }

    if (!preview.inRange) {
      await clearPreview({ reason: "move-too-far", silent: true });
      await publishStatus({ reason: "move-too-far" });
      await notify("Movement exceeds remaining distance.", "WARNING");
      return;
    }

    state.pending = true;
    await publishStatus({ reason: "mutation-start" });

    const payloadBase = {
      encounter_id: state.encounterId,
      character_id: String(state.selectedParticipant.character_id ?? "").trim(),
      token_id: String(state.selectedParticipant.token_id ?? state.selectedToken?.id ?? "").trim(),
      expected_state_version: state.stateVersion,
      expected_movement_version: Number(state.selectedParticipant.movement_version ?? 0) || 0,
      actor_player_id: state.player?.id ?? "",
      actor_is_gm: state.player?.role === "GM",
      destination: {
        cell_q: preview.cell.q,
        cell_r: preview.cell.r,
        scene_x: preview.scene.x,
        scene_y: preview.scene.y,
      },
    };

    try {
      let result = await combatApi.moveCharacter(payloadBase, state.settings);
      if (result?.ok === false && result?.error === "STALE_MOVEMENT_STATE" && result?.runtime) {
        updateRuntimeCache(result.runtime);
        const retryResult = await tryRetryStaleMovement({
          preview,
          payloadBase,
          invokeMutation: (retryPayload, settings) => combatApi.moveCharacter(retryPayload, settings),
          source: "combat-movement",
        });
        if (retryResult) {
          result = retryResult;
        }
      }
      if (!result || result.ok === false) {
        await failMutation(result, "Unable to move combatant.");
        return;
      }
      await finalizeMutationSuccess(
        result,
        "combat-movement",
        `Moved ${preview.moveCostM} m - ${Math.max(preview.remainingMoveM, 0)} m remaining.`,
      );
    } catch (error) {
      const normalized = normalizeError(error, "Unable to move combatant.");
      addDiagnosticEntry("error", "Combat movement RPC failed", normalized.message);
      await clearPreview({ reason: "move-exception", silent: true });
      state.pending = false;
      await publishStatus({ error: normalized.message });
      await publishMoveToolEvent(MOVE_TOOL_EVENTS.Error, {
        message: normalized.message,
        tokenId: String(state.selectedToken?.id ?? "").trim(),
        characterId: String(state.selectedParticipant?.character_id ?? "").trim(),
      });
      await notify(normalized.message, "ERROR");
    }
  }

  async function handleToolDragStart(_context, event) {
    if (!state.selectedToken || !state.selectedParticipant) return;
    const targetId = String(event?.target?.id ?? "").trim();
    const selectedTokenId = String(state.selectedToken.id ?? "").trim();
    if (!targetId || targetId !== selectedTokenId) return;

    if (!state.permission?.canPreview) {
      await publishStatus({ error: state.permission?.message || "You cannot control this combatant." });
      await notify(state.permission?.message || "You cannot control this combatant.", "WARNING");
      return;
    }

    if (!state.grid || !participantHasAuthoritativePosition(state.selectedParticipant)) {
      const gridReady = await ensureTacticalGridReady("drag-start");

      if (!gridReady) {
        const isGm = String(state.player?.role ?? "").toUpperCase() === "GM";
        const message = isGm
          ? "Unable to synchronize tactical grid. Check the Owlbear grid settings."
          : "Tactical grid is being prepared by the GM. Try again in a moment.";

        await publishStatus({
          error: message,
          gridReady: false,
        });

        await notify(message, "WARNING");
        return;
      }
    }

    if (state.grid?.gridType !== "square") {
      const message = "Tactical Move v1 supports only square grids.";
      await publishStatus({
        error: message,
        gridReady: false,
      });
      await notify(message, "WARNING");
      return;
    }

    addDiagnosticEntry(
      "info",
      "Combat drag started",
      formatPreviewDiagnostics({
        tokenId: selectedTokenId,
      }),
    );

    state.dragActive = true;
    state.previewRenderQueue = [];
    state.previewPointerQueue = [];
    queuePreviewPointer(event.pointerPosition);
  }

  async function handleToolDragMove(_context, event) {
    if (!state.dragActive || !state.permission?.canPreview) return;
    queuePreviewPointer(event.pointerPosition);
  }

  async function handleToolDragEnd(_context, event) {
    if (!state.dragActive) return;
    addDiagnosticEntry(
      "info",
      "Combat drag ended",
      formatPreviewDiagnostics({
        tokenId: String(state.selectedToken?.id ?? "").trim(),
      }),
    );
    const finalPreview = await buildPreviewFromPointer(event.pointerPosition);

    state.previewPointerQueue = [];
    state.previewRenderQueue = [];

    if (finalPreview) {
      await updatePreview(finalPreview);
      await nextAnimationFrame();
    }

    state.dragActive = false;
    state.previewPointerQueue = [];
    state.previewRenderQueue = [];

    if (!finalPreview) {
      await clearPreview({ reason: "drag-end-no-preview", silent: true });
      await publishStatus({ reason: "drag-end-no-preview" });
      return;
    }

    await clearPreview({ reason: "drag-end-release", silent: true });
    await commitPreview(finalPreview);
  }

  async function handleToolDragCancel() {
    await clearPreview({ reason: "drag-cancelled", silent: true });
    await publishStatus({ reason: "drag-cancelled" });
  }

  async function handleSceneItemsChanged(items) {
    const sceneItems = ensureArray(items);
    const indexed = new Map(
      sceneItems.map((item) => [String(item?.id ?? "").trim(), item]),
    );

    if (state.selectedToken && !indexed.has(String(state.selectedToken.id ?? "").trim())) {
      state.selectedToken = null;
      state.selectedParticipant = null;
      state.permission = null;
      await clearPreview({ reason: "selected-token-missing", silent: true });
      await publishStatus({ reason: "selected-token-missing" });
    }

    if (!state.encounterId || !state.authoritativeByTokenId.size) return;

    for (const [tokenId, authoritative] of state.authoritativeByTokenId.entries()) {
      const item = indexed.get(tokenId);
      if (!item?.position) continue;
      const authoritativeScene = {
        x: Number(authoritative.scene_x ?? 0) || 0,
        y: Number(authoritative.scene_y ?? 0) || 0,
      };
      if (positionsMatch(item.position, authoritativeScene)) {
        continue;
      }

      const marker = extractMovementMarker(item);
      if (marker && isFreshMarker(marker)) {
        if (INTERNAL_MOVEMENT_SOURCES.has(marker.source)) {
          scheduleRuntimeRefresh("internal-movement-marker");
          continue;
        }
        if (String(state.player?.role ?? "").toUpperCase() === "GM") {
          const markerKey = marker.requestId || marker.updatedAt;
          if (state.autoSyncedMarkerByTokenId.get(tokenId) !== markerKey) {
            state.autoSyncedMarkerByTokenId.set(tokenId, markerKey);
            const participant = state.participantsByTokenId.get(tokenId);
            if (participant?.character_id) {
              void runAutoTacticalSync({
                onlyCharacterId: String(participant.character_id ?? "").trim(),
                runtimeResponse: state.runtime,
                reason: "marker-observed",
              });
            }
          }
        }
        scheduleRuntimeRefresh("movement-marker");
        continue;
      }

      const localMarker = state.localMarkersByTokenId.get(tokenId);
      if (localMarker && isFreshMarker(localMarker)) {
        continue;
      }

      await revertUnauthorizedTokenMove(tokenId, authoritative);
    }
  }

  async function handleBroadcastMessage(message) {
    switch (message.type) {
      case MOVE_TOOL_COMMANDS.RequestStatus:
        await publishStatus({ reason: "status-request" });
        break;
      case MOVE_TOOL_COMMANDS.Cancel:
        await clearPreview({ reason: "broadcast-cancel", silent: true });
        await publishStatus({ reason: "broadcast-cancel" });
        break;
      case MOVE_TOOL_COMMANDS.ActivateSelected:
        await refreshRuntimeAndSelection("legacy-activate-selected");
        break;
      default:
        break;
    }
  }

  async function handleSessionBroadcast(event) {
    const session = event?.data?.session ?? {};
    const exists = session?.exists === true;
    const signature = exists
      ? `${String(session.id ?? "").trim()}:${Number(session.version ?? 0) || 0}`
      : "inactive";
    if (signature === state.lastSessionSignature) return;
    state.lastSessionSignature = signature;

    if (!exists) {
      clearRuntimeCache();
      await clearPreview({ reason: "encounter-ended", silent: true });
      await restorePreviousTool("encounter-ended");
      await publishStatus({ reason: "encounter-ended" });
      return;
    }

    scheduleRuntimeRefresh("session-broadcast");
  }

  async function registerTool() {
    await waitForObrReady();

    try { await OBR.tool.removeMode(TACTICAL_MOVE_MODE_ID); } catch {}
    try { await OBR.tool.remove(TACTICAL_MOVE_TOOL_ID); } catch {}

    await OBR.tool.createMode({
      id: TACTICAL_MOVE_MODE_ID,
      icons: [{ icon: createToolIcon(), label: "Tactical Move" }],
      onToolDragStart: handleToolDragStart,
      onToolDragMove: handleToolDragMove,
      onToolDragEnd: handleToolDragEnd,
      onToolDragCancel: handleToolDragCancel,
      onActivate: async () => {
        await publishStatus({ reason: "tool-activate" });
      },
      onDeactivate: async () => {
        await clearPreview({ reason: "tool-deactivate", silent: true });
        await publishStatus({ reason: "tool-deactivate" });
      },
      onKeyDown: async (_context, event) => {
        if (event.key === "Escape") {
          await clearPreview({ reason: "escape", silent: true });
          await publishStatus({ reason: "escape" });
        }
      },
    });

    await OBR.tool.create({
      id: TACTICAL_MOVE_TOOL_ID,
      icons: [{ icon: createToolIcon(), label: "Tactical Move" }],
      defaultMode: TACTICAL_MOVE_MODE_ID,
      defaultMetadata: { extension: "odyssey" },
    });

    state.toolRegistered = true;
    addDiagnosticEntry("info", "Combat movement tool ready", `tool=${TACTICAL_MOVE_TOOL_ID} mode=${TACTICAL_MOVE_MODE_ID}`);
  }

  async function start() {
    try {
      await registerTool();
      unsubscribeBroadcast = await subscribeMoveToolMessages(handleBroadcastMessage);
      unsubscribeSceneItems = await subscribeSceneItems(handleSceneItemsChanged);
      unsubscribePlayer = await subscribePlayerChanges((player) => {
        state.player = player;
        void syncSelectionState("player-change", { runtimeResponse: state.runtime }).catch(() => {});
      });
      unsubscribeTool = await subscribeToolChanges((toolId) => {
        if (disposed) return;
        const selectedTokenId = String(state.selectedToken?.id ?? "").trim();
        const hasSelectedCombatToken = !!selectedTokenId && state.participantsByTokenId.has(selectedTokenId);
        if (!hasSelectedCombatToken) return;
        if (toolId === TACTICAL_MOVE_TOOL_ID) return;
        void ensureToolActivated("tool-reclaim").catch(() => {});
      });
      unsubscribeSession = OBR.broadcast.onMessage(BC_HUD_SESSION, (event) => {
        void handleSessionBroadcast(event).catch(() => {});
      });
      await refreshRuntimeAndSelection("startup");
      if (state.encounterId && !state.grid) {
        await ensureTacticalGridReady("startup");
      }
      await publishStatus({
        ready: true,
        toolRegistered: true,
      });
    } catch (error) {
      const normalized = normalizeError(
        error,
        "Unable to initialize automatic combat movement.",
      );
      console.error(
        "[Odyssey] Automatic combat movement init failed:",
        normalized,
      );
      addDiagnosticEntry("error", "Combat movement init failed", normalized.message);
      await publishMoveToolEvent(
        MOVE_TOOL_EVENTS.Error,
        {
          source: "tool-registration",
          message: normalized.message,
        },
        "LOCAL",
      );
      await notify(
        `Combat movement registration failed: ${normalized.message}`,
        "ERROR",
      );
    }
  }

  void start();

  return {
    async dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeBroadcast?.();
      unsubscribeSceneItems?.();
      unsubscribePlayer?.();
      unsubscribeSession?.();
      unsubscribeTool?.();
      if (state.runtimeRefreshTimer) {
        clearTimeout(state.runtimeRefreshTimer);
      }
      await clearPreview({ reason: "dispose", silent: true });
      try { await OBR.tool.removeMode(TACTICAL_MOVE_MODE_ID); } catch {}
      try { await OBR.tool.remove(TACTICAL_MOVE_TOOL_ID); } catch {}
    },
  };
}
