import OBR, { buildLine, buildText } from "@owlbear-rodeo/sdk";
import { addDiagnosticEntry } from "../utils/diagnostics.js";
import { normalizeError, toErrorMessage } from "../utils/errors.js";
import {
  getPlayerInfo,
  getRoomSceneContext,
  getSceneItems,
  getSelectedOwlbearTokens,
  getSceneGrid,
  snapScenePosition,
  subscribeSceneItems,
  waitForObrReady,
} from "../bridge/obrBridge.js";
import { loadRoomSupabaseSettings, hasSupabaseSettings } from "../bridge/settingsBridge.js";
import { getTokenCharacterLink } from "../bridge/tokenBridge.js";
import { computeDistanceCells, normalizeDistanceMode, normalizeObrGridType, normalizeTacticalGridSettings, sceneToCell, sameCell } from "./gridMath.js";
import {
  MOVE_TOOL_COMMANDS,
  MOVE_TOOL_EVENTS,
  publishMoveToolEvent,
  subscribeMoveToolMessages,
} from "./moveToolBridge.js";

const TOOL_ID = "odyssey-move";
const MODE_ID = "move-character";

function createToolIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="12" fill="#162338"/>
      <path d="M18 42c4-10 12-17 24-22" fill="none" stroke="#ff6b6b" stroke-width="5" stroke-linecap="round"/>
      <circle cx="20" cy="44" r="6" fill="#ffd166"/>
      <circle cx="42" cy="24" r="6" fill="#4ecdc4"/>
      <path d="M40 13l8 8-8 8" fill="none" stroke="#f8fafc" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `.trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function createInitialState() {
  return {
    player: null,
    settings: null,
    active: false,
    pending: false,
    encounterId: "",
    tokenId: "",
    characterId: "",
    characterName: "",
    stateVersion: 0,
    movementVersion: 0,
    moveCurrent: 0,
    moveMax: 0,
    grid: null,
    originCell: null,
    originScene: null,
    preview: null,
    previewCreated: false,
  };
}

function buildStatus(state, extras = {}) {
  const preview = state.preview ?? null;
  return {
    active: state.active,
    pending: state.pending,
    encounterId: state.encounterId,
    tokenId: state.tokenId,
    characterId: state.characterId,
    characterName: state.characterName,
    moveCurrent: state.moveCurrent,
    moveMax: state.moveMax,
    stateVersion: state.stateVersion,
    movementVersion: state.movementVersion,
    tacticalGrid: state.grid,
    preview: preview
      ? {
          cell_q: preview.cell.q,
          cell_r: preview.cell.r,
          scene_x: preview.scene.x,
          scene_y: preview.scene.y,
          distanceCells: preview.distanceCells,
          moveCostM: preview.moveCostM,
          remainingMoveM: preview.remainingMoveM,
          inRange: preview.inRange,
        }
      : null,
    ...extras,
  };
}

function extractParticipant(runtime, characterId, tokenId) {
  const participants = ensureArray(runtime?.visible_participants);
  return participants.find((participant) => {
    const participantCharacterId = String(participant?.character_id ?? "").trim();
    const participantTokenId = String(participant?.token_id ?? "").trim();
    return (
      (participantCharacterId && participantCharacterId === characterId) ||
      (participantTokenId && tokenId && participantTokenId === tokenId)
    );
  }) ?? null;
}

function resolvePreviewIds(playerId = "") {
  const safe = String(playerId || "viewer").replace(/[^a-z0-9_-]/gi, "_");
  return {
    lineId: `odyssey-move-preview-line-${safe}`,
    labelId: `odyssey-move-preview-label-${safe}`,
  };
}

function buildPreviewLabel(preview) {
  if (!preview) return "";
  if (!preview.inRange) {
    return `${preview.moveCostM} m | Недостаточно MOVE`;
  }
  return `${preview.moveCostM} m | осталось ${preview.remainingMoveM} m`;
}

function buildLineItem(ids, from, to) {
  return buildLine()
    .id(ids.lineId)
    .name("Odyssey Move Preview")
    .layer("POINTER")
    .locked(true)
    .disableHit(true)
    .startPosition(from)
    .endPosition(to)
    .strokeColor("#ff6b6b")
    .strokeOpacity(0.95)
    .strokeWidth(6)
    .strokeDash([10, 8])
    .build();
}

function buildLabelItem(ids, preview) {
  return buildText()
    .id(ids.labelId)
    .name("Odyssey Move Preview Label")
    .layer("TEXT")
    .locked(true)
    .disableHit(true)
    .position({ x: preview.scene.x + 10, y: preview.scene.y - 16 })
    .plainText(buildPreviewLabel(preview))
    .fontSize(18)
    .fontWeight(700)
    .padding(8)
    .textAlign("LEFT")
    .textAlignVertical("MIDDLE")
    .fillColor(preview.inRange ? "#b9ffd1" : "#ffd5d5")
    .fillOpacity(1)
    .strokeColor("#08111f")
    .strokeOpacity(0.85)
    .strokeWidth(5)
    .build();
}

export function setupTacticalMoveTool({ runtime }) {
  const combatApi = runtime?.api?.combat;

  if (!combatApi) {
    addDiagnosticEntry("error", "Tactical move init failed", "Combat API is unavailable.");
    return {
      dispose() {},
    };
  }

  const state = createInitialState();
  const ids = { lineId: "", labelId: "" };
  let unsubscribeBroadcast = null;
  let unsubscribeSceneItems = null;
  let disposed = false;

  async function notify(message, variant = "INFO") {
    try {
      await OBR.notification.show(message, variant);
    } catch {
      // ignore notification errors in standalone/dev contexts
    }
  }

  async function publishStatus(extras = {}) {
    try {
      await publishMoveToolEvent(MOVE_TOOL_EVENTS.Status, buildStatus(state, extras));
    } catch {
      // ignore local broadcast failures
    }
  }

  async function clearPreview() {
    if (!ids.lineId || !ids.labelId) return;
    try {
      await OBR.scene.local.deleteItems([ids.lineId, ids.labelId]);
    } catch {
      // preview might not exist yet
    }
    state.preview = null;
    state.previewCreated = false;
  }

  async function updatePreview(preview) {
    state.preview = preview;
    if (!ids.lineId || !ids.labelId) {
      const nextIds = resolvePreviewIds(state.player?.id);
      ids.lineId = nextIds.lineId;
      ids.labelId = nextIds.labelId;
    }
    const line = buildLineItem(ids, state.originScene, preview.scene);
    const label = buildLabelItem(ids, preview);
    try {
      if (!state.previewCreated) {
        await OBR.scene.local.addItems([line, label]);
        state.previewCreated = true;
      } else {
        await OBR.scene.local.updateItems([ids.lineId, ids.labelId], (items) => {
          for (const item of items) {
            if (item.id === ids.lineId && item.type === "LINE") {
              item.startPosition = line.startPosition;
              item.endPosition = line.endPosition;
              item.style = line.style;
            }
            if (item.id === ids.labelId && item.type === "TEXT") {
              item.position = label.position;
              item.text = label.text;
              item.metadata = label.metadata;
            }
          }
        });
      }
    } catch (error) {
      const normalized = normalizeError(error, "Unable to update move preview.");
      addDiagnosticEntry("error", "Move preview failed", normalized.message);
    }
    await publishStatus();
  }

  async function loadRuntimeForSelection(characterId, tokenId) {
    state.settings = await loadRoomSupabaseSettings();
    if (!hasSupabaseSettings(state.settings)) {
      throw new Error("Supabase room settings are not configured.");
    }
    state.player = await getPlayerInfo();
    const roomContext = await getRoomSceneContext();
    const runtimeResponse = await combatApi.getActiveRuntime(
      {
        campaign_id: roomContext.campaignId,
        room_id: roomContext.roomId,
        scene_id: roomContext.sceneId,
        actor_player_id: state.player.id,
        actor_is_gm: state.player.role === "GM",
        include_hidden: state.player.role === "GM",
      },
      state.settings,
    );
    if (runtimeResponse?.ok === false) {
      throw new Error(runtimeResponse?.message || "Unable to read active encounter runtime.");
    }
    return { roomContext, runtimeResponse };
  }

  async function prepareFromSelectedToken(reason = "manual") {
    const selectedTokens = await getSelectedOwlbearTokens();
    if (selectedTokens.length !== 1) {
      await clearPreview();
      state.active = false;
      await publishStatus({ error: "Select exactly one linked token before using Move." });
      await notify("Select exactly one linked token before using Move.", "WARNING");
      return false;
    }

    const token = selectedTokens[0];
    const link = getTokenCharacterLink(token);
    const characterId = String(link.characterId ?? "").trim();
    if (!characterId) {
      await clearPreview();
      state.active = false;
      await publishStatus({ error: "The selected token is not linked to a character." });
      await notify("The selected token is not linked to a character.", "WARNING");
      return false;
    }

    try {
      const { runtimeResponse } = await loadRuntimeForSelection(characterId, String(token.id ?? "").trim());
      const encounter = runtimeResponse?.encounter;
      if (!encounter?.id) {
        throw new Error("This character is not part of an active encounter.");
      }

      const participant = extractParticipant(runtimeResponse, characterId, String(token.id ?? "").trim());
      if (!participant) {
        throw new Error("No active encounter participant matches the selected token.");
      }

      if (!participant?.control?.allowed) {
        throw new Error("You cannot control this character right now.");
      }

      if (!participant?.is_current_turn) {
        throw new Error("It is not this character's turn.");
      }

      const tacticalGrid = normalizeTacticalGridSettings(runtimeResponse?.tactical_grid);
      if (!tacticalGrid) {
        throw new Error("The tactical grid has not been synced by the GM yet.");
      }

      const originPosition = participant?.position ?? null;
      if (!originPosition) {
        throw new Error("This token position has not been synced by the GM yet.");
      }

      state.active = true;
      state.pending = false;
      state.encounterId = String(encounter.id ?? "").trim();
      state.tokenId = String(participant.token_id ?? token.id ?? "").trim();
      state.characterId = characterId;
      state.characterName = String(participant.display_name ?? token.name ?? characterId).trim();
      state.stateVersion = Number(runtimeResponse?.state_version ?? encounter?.state_version ?? 0) || 0;
      state.movementVersion = Number(participant?.movement_version ?? 0) || 0;
      state.moveCurrent = Number(participant?.move_current ?? 0) || 0;
      state.moveMax = Number(participant?.move_max ?? 0) || 0;
      state.grid = tacticalGrid;
      state.originCell = {
        q: Number(originPosition.cell_q ?? 0) || 0,
        r: Number(originPosition.cell_r ?? 0) || 0,
      };
      state.originScene = {
        x: Number(originPosition.scene_x ?? token.position?.x ?? 0) || 0,
        y: Number(originPosition.scene_y ?? token.position?.y ?? 0) || 0,
      };
      await clearPreview();
      await publishStatus({ reason });
      await publishMoveToolEvent(MOVE_TOOL_EVENTS.Activated, buildStatus(state, { reason }));
      return true;
    } catch (error) {
      const message = toErrorMessage(error, "Unable to prepare movement for the selected token.");
      state.active = false;
      state.pending = false;
      await clearPreview();
      await publishStatus({ error: message, reason });
      await publishMoveToolEvent(MOVE_TOOL_EVENTS.Error, { message, reason });
      await notify(message, "WARNING");
      return false;
    }
  }

  function buildPreviewFromPosition(snappedPosition) {
    if (!state.active || !state.grid || !state.originCell || !state.originScene) return null;
    const cell = sceneToCell(state.grid, snappedPosition);
    if (!cell) return null;
    const distanceCells = computeDistanceCells(state.grid, state.originCell, cell);
    const moveCostM = distanceCells * state.grid.metersPerCell;
    const remainingMoveM = state.moveCurrent - moveCostM;
    return {
      cell,
      scene: { x: Number(snappedPosition.x) || 0, y: Number(snappedPosition.y) || 0 },
      distanceCells,
      moveCostM,
      remainingMoveM,
      inRange: remainingMoveM >= 0,
    };
  }

  async function applyMove(preview) {
    if (!preview || !state.active || state.pending) return;
    state.pending = true;
    await publishStatus();
    try {
      const result = await combatApi.moveCharacter(
        {
          encounter_id: state.encounterId,
          character_id: state.characterId,
          token_id: state.tokenId,
          expected_state_version: state.stateVersion,
          expected_movement_version: state.movementVersion,
          actor_player_id: state.player?.id ?? "",
          actor_is_gm: state.player?.role === "GM",
          destination: {
            cell_q: preview.cell.q,
            cell_r: preview.cell.r,
            scene_x: preview.scene.x,
            scene_y: preview.scene.y,
          },
        },
        state.settings,
      );

      if (!result || result.ok === false) {
        const message = String(result?.message ?? result?.error ?? "Unable to move character.");
        if (result?.runtime) {
          const participant = extractParticipant(result.runtime, state.characterId, state.tokenId);
          if (participant?.position) {
            state.stateVersion = Number(result.runtime?.state_version ?? state.stateVersion) || state.stateVersion;
            state.movementVersion = Number(participant.movement_version ?? state.movementVersion) || state.movementVersion;
            state.moveCurrent = Number(participant.move_current ?? state.moveCurrent) || state.moveCurrent;
            state.moveMax = Number(participant.move_max ?? state.moveMax) || state.moveMax;
            state.originCell = {
              q: Number(participant.position.cell_q ?? state.originCell?.q ?? 0) || 0,
              r: Number(participant.position.cell_r ?? state.originCell?.r ?? 0) || 0,
            };
            state.originScene = {
              x: Number(participant.position.scene_x ?? state.originScene?.x ?? 0) || 0,
              y: Number(participant.position.scene_y ?? state.originScene?.y ?? 0) || 0,
            };
          }
        }
        await clearPreview();
        state.pending = false;
        await publishStatus({ error: message });
        await publishMoveToolEvent(MOVE_TOOL_EVENTS.Error, { message, code: result?.error ?? "" });
        await notify(message, result?.error === "STATE_VERSION_CONFLICT" ? "WARNING" : "ERROR");
        return;
      }

      const nextPosition = result?.position ?? {};
      await OBR.scene.items.updateItems([state.tokenId], (items) => {
        for (const item of items) {
          item.position = {
            x: Number(nextPosition.scene_x ?? preview.scene.x) || 0,
            y: Number(nextPosition.scene_y ?? preview.scene.y) || 0,
          };
        }
      });

      state.originCell = {
        q: Number(nextPosition.cell_q ?? preview.cell.q) || 0,
        r: Number(nextPosition.cell_r ?? preview.cell.r) || 0,
      };
      state.originScene = {
        x: Number(nextPosition.scene_x ?? preview.scene.x) || 0,
        y: Number(nextPosition.scene_y ?? preview.scene.y) || 0,
      };
      state.moveCurrent = Number(result.move_current ?? state.moveCurrent) || 0;
      state.movementVersion = Number(result.movement_version ?? state.movementVersion) || 0;
      state.stateVersion = Number(result.state_version ?? state.stateVersion) || 0;
      state.pending = false;
      await clearPreview();
      await publishStatus({ applied: true });
      await publishMoveToolEvent(MOVE_TOOL_EVENTS.Applied, {
        ...buildStatus(state, { applied: true }),
        runtime: result.runtime ?? null,
      });
      await notify(
        result.move_cost_m > 0
          ? `${state.characterName} moved ${result.move_cost_m} m.`
          : `${state.characterName} position confirmed.`,
        "SUCCESS",
      );
    } catch (error) {
      state.pending = false;
      await clearPreview();
      const normalized = normalizeError(error, "Unable to move character.");
      addDiagnosticEntry("error", "Move RPC failed", normalized.message);
      await publishStatus({ error: normalized.message });
      await publishMoveToolEvent(MOVE_TOOL_EVENTS.Error, { message: normalized.message });
      await notify(normalized.message, "ERROR");
    }
  }

  async function cancelMove(reason = "cancelled") {
    state.active = false;
    state.pending = false;
    await clearPreview();
    await publishStatus({ reason });
    await publishMoveToolEvent(MOVE_TOOL_EVENTS.Cancelled, { reason });
  }

  async function handleToolMove(_context, event) {
    if (!state.active || state.pending || !state.grid) return;
    const snapped = await snapScenePosition(event.pointerPosition, 1);
    const preview = buildPreviewFromPosition(snapped);
    if (!preview) return;
    await updatePreview(preview);
  }

  async function handleToolClick(_context, event) {
    if (!state.active || state.pending || !state.grid) {
      return;
    }
    const snapped = await snapScenePosition(event.pointerPosition, 1);
    const preview = buildPreviewFromPosition(snapped);
    if (!preview) return;
    if (!preview.inRange) {
      await updatePreview(preview);
      await notify("Недостаточно MOVE", "WARNING");
      return;
    }
    await applyMove(preview);
  }

  async function handleToolActivate() {
    await prepareFromSelectedToken("tool-activate");
  }

  async function handleToolDeactivate() {
    await cancelMove("tool-deactivate");
  }

  async function handleSceneItemsChanged(items) {
    if (!state.active || !state.tokenId) return;
    const exists = ensureArray(items).some((item) => String(item?.id ?? "").trim() === state.tokenId);
    if (!exists) {
      await cancelMove("token-missing");
    }
  }

  async function handleBroadcastMessage(message) {
    switch (message.type) {
      case MOVE_TOOL_COMMANDS.RequestStatus:
        await publishStatus({ reason: "status-request" });
        break;
      case MOVE_TOOL_COMMANDS.Cancel:
        await cancelMove("broadcast-cancel");
        break;
      case MOVE_TOOL_COMMANDS.ActivateSelected:
        if (await prepareFromSelectedToken("broadcast-activate")) {
          await OBR.tool.activateTool(TOOL_ID);
          await OBR.tool.activateMode(TOOL_ID, MODE_ID);
        }
        break;
      default:
        break;
    }
  }

  async function registerTool() {
    await waitForObrReady();

    ids.lineId = resolvePreviewIds((await getPlayerInfo())?.id).lineId;
    ids.labelId = resolvePreviewIds((await getPlayerInfo())?.id).labelId;

    try { await OBR.tool.removeMode(MODE_ID); } catch {}
    try { await OBR.tool.remove(TOOL_ID); } catch {}

    await OBR.tool.create({
      id: TOOL_ID,
      icons: [{ icon: createToolIcon(), label: "Move" }],
      defaultMode: MODE_ID,
      defaultMetadata: { extension: "odyssey" },
    });

    await OBR.tool.createMode({
      id: MODE_ID,
      icons: [{ icon: createToolIcon(), label: "Move" }],
      onToolMove: handleToolMove,
      onToolClick: handleToolClick,
      onActivate: handleToolActivate,
      onDeactivate: handleToolDeactivate,
      onKeyDown: async (_context, event) => {
        if (event.key === "Escape") {
          await cancelMove("escape");
        }
      },
    });

    addDiagnosticEntry("info", "Tactical move tool ready", `tool=${TOOL_ID} mode=${MODE_ID}`);
  }

  async function start() {
    try {
      await registerTool();
      unsubscribeBroadcast = await subscribeMoveToolMessages(handleBroadcastMessage);
      unsubscribeSceneItems = await subscribeSceneItems(handleSceneItemsChanged);
      await publishStatus({ ready: true });
    } catch (error) {
      const normalized = normalizeError(error, "Unable to initialize tactical move tool.");
      addDiagnosticEntry("error", "Tactical move init failed", normalized.message);
    }
  }

  void start();

  return {
    async dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeBroadcast?.();
      unsubscribeSceneItems?.();
      await cancelMove("dispose");
      try { await OBR.tool.removeMode(MODE_ID); } catch {}
      try { await OBR.tool.remove(TOOL_ID); } catch {}
    },
  };
}
