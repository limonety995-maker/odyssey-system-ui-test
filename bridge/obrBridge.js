import OBR from "@owlbear-rodeo/sdk";
import { ROOM_CONTEXT_KEY } from "../constants/metadataKeys.js";

let readyPromise = null;

export { OBR };

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePlayer(player = {}) {
  return {
    id: String(player?.id ?? "").trim(),
    name: String(player?.name ?? "").trim(),
    role: String(player?.role ?? "PLAYER").trim().toUpperCase() || "PLAYER",
    color: String(player?.color ?? "").trim(),
    selection: ensureArray(player?.selection)
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  };
}

export function waitForObrReady() {
  if (!readyPromise) {
    readyPromise = new Promise((resolve) => {
      OBR.onReady(() => resolve(OBR));
    });
  }
  return readyPromise;
}

export async function getPlayerInfo() {
  await waitForObrReady();
  const [role, id, name, selection] = await Promise.all([
    OBR.player.getRole().catch(() => "PLAYER"),
    OBR.player.getId().catch(() => ""),
    OBR.player.getName().catch(() => ""),
    OBR.player.getSelection().catch(() => []),
  ]);
  return normalizePlayer({ role, id, name, selection });
}

export async function getSelectedTokenIds() {
  await waitForObrReady();
  const selection = await OBR.player.getSelection().catch(() => []);
  return ensureArray(selection)
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

export async function getSceneItems() {
  await waitForObrReady();
  return ensureArray(await OBR.scene.items.getItems().catch(() => []));
}

export async function getSceneGrid() {
  await waitForObrReady();
  const [type, measurement, dpi, scale] = await Promise.all([
    OBR.scene.grid.getType().catch(() => "SQUARE"),
    OBR.scene.grid.getMeasurement().catch(() => "CHEBYSHEV"),
    OBR.scene.grid.getDpi().catch(() => 0),
    OBR.scene.grid.getScale().catch(() => null),
  ]);
  return { type, measurement, dpi, scale };
}

export async function snapScenePosition(position, snappingSensitivity = 1, useCorners = false, useCenter = false) {
  await waitForObrReady();
  return OBR.scene.grid.snapPosition(
    position,
    snappingSensitivity,
    useCorners,
    useCenter,
  );
}

export async function getSelectedOwlbearTokens() {
  const [selectionIds, items] = await Promise.all([
    getSelectedTokenIds(),
    getSceneItems(),
  ]);
  const selectedSet = new Set(selectionIds);
  return items.filter((item) => selectedSet.has(String(item?.id ?? "").trim()));
}

export async function getRoomMetadata() {
  await waitForObrReady();
  return (await OBR.room.getMetadata().catch(() => ({}))) ?? {};
}

export async function setRoomMetadata(patch) {
  await waitForObrReady();
  await OBR.room.setMetadata(patch ?? {});
  return getRoomMetadata();
}

function firstNonEmptyText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function normalizeStoredRoomContext(metadata, roomId) {
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  const scoped =
    (meta[ROOM_CONTEXT_KEY] && typeof meta[ROOM_CONTEXT_KEY] === "object")
      ? meta[ROOM_CONTEXT_KEY]
      : {};

  const campaignId = firstNonEmptyText(
    scoped.campaignId,
    scoped.campaign_id,
    meta.campaignId,
    meta.campaign_id,
    meta.odysseyCampaignId,
    meta.odyssey_campaign_id,
    roomId,
  );

  const sceneId = firstNonEmptyText(
    scoped.sceneId,
    scoped.scene_id,
    meta.sceneId,
    meta.scene_id,
    meta.odysseySceneId,
    meta.odyssey_scene_id,
    roomId,
  );

  return {
    campaignId,
    roomId,
    sceneId,
  };
}

// OBR SDK v3.1 does not expose canonical campaign/scene ids. We first look for
// an Odyssey room-metadata override and otherwise fall back to room_id as the
// stable scope proxy so older rooms keep working.
export async function getRoomSceneContext() {
  await waitForObrReady();
  const roomId = String(OBR.room?.id ?? "").trim();
  const metadata = await getRoomMetadata();
  return normalizeStoredRoomContext(metadata, roomId);
}

export async function subscribePlayerChanges(listener) {
  await waitForObrReady();
  let active = true;
  OBR.player.onChange((player) => {
    if (!active) return;
    listener(normalizePlayer(player));
  });
  return () => {
    active = false;
  };
}

export async function subscribeSceneItems(listener) {
  await waitForObrReady();
  let active = true;
  OBR.scene.items.onChange((items) => {
    if (!active) return;
    listener(ensureArray(items));
  });
  return () => {
    active = false;
  };
}

export async function activateTool(toolId) {
  await waitForObrReady();
  return OBR.tool.activateTool(toolId);
}

export async function activateToolMode(toolId, modeId) {
  await waitForObrReady();
  return OBR.tool.activateMode(toolId, modeId);
}

export async function getActiveTool() {
  await waitForObrReady();
  return OBR.tool.getActiveTool().catch(() => "");
}

export async function getActiveToolMode() {
  await waitForObrReady();
  return OBR.tool.getActiveToolMode().catch(() => "");
}

export async function subscribeToolChanges(listener) {
  await waitForObrReady();
  let active = true;
  OBR.tool.onToolChange((toolId) => {
    if (!active) return;
    listener(String(toolId ?? "").trim());
  });
  return () => {
    active = false;
  };
}

export async function subscribeToolModeChanges(listener) {
  await waitForObrReady();
  let active = true;
  OBR.tool.onToolModeChange((modeId) => {
    if (!active) return;
    listener(String(modeId ?? "").trim());
  });
  return () => {
    active = false;
  };
}
