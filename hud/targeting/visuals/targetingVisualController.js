// HUD Targeting — local map-visuals controller (background context).
//
// Purely a CONSUMER of the two broadcasts the existing flow already produces
// (targetSelectionController's BC_HUD_TARGETING via its onTargetingState
// callback, and sceneSelectionController's selection payload via its
// onSelectionState callback) — see hud/overlay/combatHudOverlayController.js
// for the two call sites that feed handleTargetingState/handleSelectionState.
// This module starts NO new target-selection mechanism, sends NO commands
// back into that flow, and never touches Supabase/RPC/canonical combat state.
// It only decides "what should the map show ME right now" and asks the
// renderer (OBR.scene.local — never-synced, per-client only) to reflect it.
//
// Cursor: a minimal OBR Tool mode with ONLY a `cursors` entry — no onClick/
// onToolClick/drag handlers of any kind, so it cannot intercept or change how
// clicking a token updates OBR.player.selection (the exact mechanism
// targetSelectionController.js already relies on). Modeled directly on this
// project's own existing precedent, movement/moveToolController.js, which
// activates a custom tool mode alongside that SAME selection-watching
// mechanism without disturbing it.

import OBR from "@owlbear-rodeo/sdk";
import { activateTool, activateToolMode, getActiveTool, getActiveToolMode } from "../../../bridge/obrBridge.js";
import { buildTargetCursorValue, buildTargetCursorToolIcon } from "../targetCursorSvg.js";
import {
  shouldShowSourceOutline,
  shouldShowTargetRing,
  isPickingActive,
  nextRingRotation,
  RING_TICK_MS,
} from "./targetingVisualPolicy.js";
import {
  showSourceOutline,
  hideSourceOutline,
  showTargetRing,
  hideTargetRing,
  setTargetRingRotation,
  hideAllTargetingVisuals,
} from "./targetingVisualRenderer.js";

export const TARGETING_CURSOR_TOOL_ID = "com.odyssey-system/targeting-cursor-tool";
export const TARGETING_CURSOR_MODE_ID = "com.odyssey-system/targeting-cursor-mode";

export function setupTargetingVisuals() {
  if (typeof OBR === "undefined" || OBR.isAvailable === false) {
    return { handleTargetingState() {}, handleSelectionState() {}, cleanup() {} };
  }

  let disposed = false;
  let toolRegistered = false;
  let toolActive = false;
  let previousToolId = "";
  let previousModeId = "";

  let sourceTokenId = null;
  let targetTokenId = null;
  let picking = false;
  let viewerRole = "player";
  let canView = false;

  let outlineVisible = false;
  let ringVisible = false;
  let ringTokenId = null; // the token the ring is CURRENTLY attached to
  let ringRotationDeg = 0;
  let ringTimer = null;
  let ringTickInFlight = false;

  let unsubscribeSceneReady = null;

  async function registerToolOnce() {
    if (toolRegistered) return;
    try {
      // Defensive re-create (mirrors movement/moveToolController.js): a stale
      // registration from a previous load must never block a fresh one.
      try { await OBR.tool.removeMode(TARGETING_CURSOR_MODE_ID); } catch (_e) { /* ignore */ }
      try { await OBR.tool.remove(TARGETING_CURSOR_TOOL_ID); } catch (_e) { /* ignore */ }

      // No onClick/onToolClick/drag/key handlers at all — this mode ONLY
      // supplies a cursor skin. It never intercepts a token click, so the
      // existing OBR.player.onChange-based target-picking keeps working
      // exactly as it does with the native tool active.
      const toolIcon = buildTargetCursorToolIcon();
      await OBR.tool.createMode({
        id: TARGETING_CURSOR_MODE_ID,
        icons: [{ icon: toolIcon, label: "Odyssey Target Picker" }],
        cursors: [{ cursor: buildTargetCursorValue() }],
      });
      await OBR.tool.create({
        id: TARGETING_CURSOR_TOOL_ID,
        icons: [{ icon: toolIcon, label: "Odyssey Target Picker" }],
        defaultMode: TARGETING_CURSOR_MODE_ID,
      });
      toolRegistered = true;
    } catch (_e) {
      // Cosmetic-only: if tool registration fails for any reason, picking
      // still works via the existing flow — it just keeps the native cursor.
      toolRegistered = false;
    }
  }

  async function activatePickingCursor() {
    if (!toolRegistered) await registerToolOnce();
    if (!toolRegistered || toolActive) return;
    try {
      const [activeTool, activeMode] = await Promise.all([getActiveTool(), getActiveToolMode()]);
      if (activeTool && activeTool !== TARGETING_CURSOR_TOOL_ID) {
        previousToolId = activeTool;
        previousModeId = activeMode || "";
      }
      await activateTool(TARGETING_CURSOR_TOOL_ID);
      await activateToolMode(TARGETING_CURSOR_TOOL_ID, TARGETING_CURSOR_MODE_ID);
      toolActive = true;
    } catch (_e) { /* cosmetic only */ }
  }

  async function restorePickingCursor() {
    if (!toolActive) return;
    toolActive = false;
    try {
      if (previousToolId) {
        await activateTool(previousToolId);
        if (previousModeId) await activateToolMode(previousToolId, previousModeId).catch(() => {});
      }
    } catch (_e) { /* cosmetic only */ } finally {
      previousToolId = "";
      previousModeId = "";
    }
  }

  function stopRingTimer() {
    if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
  }

  function startRingTimer() {
    if (ringTimer) return;
    let lastTick = Date.now();
    ringTimer = setInterval(async () => {
      if (disposed || !ringVisible || ringTickInFlight) return;
      const now = Date.now();
      const elapsed = now - lastTick;
      lastTick = now;
      ringRotationDeg = nextRingRotation(ringRotationDeg, elapsed);
      ringTickInFlight = true;
      try { await setTargetRingRotation(ringRotationDeg); } catch (_e) { /* cosmetic only */ }
      ringTickInFlight = false;
    }, RING_TICK_MS);
  }

  async function reconcileOutline() {
    const wanted = shouldShowSourceOutline({ viewerRole, canView, sourceTokenId });
    if (wanted === outlineVisible) return;
    outlineVisible = wanted;
    try {
      if (wanted) await showSourceOutline(sourceTokenId);
      else await hideSourceOutline();
    } catch (_e) { outlineVisible = false; }
  }

  async function reconcileRing() {
    const wanted = shouldShowTargetRing({ targetTokenId });
    if (!wanted) {
      if (!ringVisible) return;
      ringVisible = false;
      ringTokenId = null;
      stopRingTimer();
      try { await hideTargetRing(); } catch (_e) { /* best effort */ }
      return;
    }
    // Already showing on this EXACT token — a genuinely unrelated broadcast
    // (this function only ever runs when targetChanged fired, but guard
    // anyway) must never tear down/restart an already-correct ring.
    if (ringVisible && ringTokenId === targetTokenId) return;
    // Either a fresh pick, or the target switched to a DIFFERENT token: tear
    // down the old ring/anchor pair (if any) before attaching the new one —
    // never leave the ring attached to a stale target.
    stopRingTimer();
    if (ringVisible) {
      try { await hideTargetRing(); } catch (_e) { /* best effort */ }
    }
    ringVisible = false;
    ringTokenId = null;
    ringRotationDeg = 0;
    try {
      await showTargetRing(targetTokenId);
      ringVisible = true;
      ringTokenId = targetTokenId;
      startRingTimer();
    } catch (_e) {
      ringVisible = false;
      ringTokenId = null;
    }
  }

  async function reconcileCursor() {
    if (picking) await activatePickingCursor();
    else await restorePickingCursor();
  }

  /** @param {{ mode?: string, source?: {tokenId?:string|null}, target?: {tokenId?:string|null} }} payload */
  function handleTargetingState(payload) {
    if (disposed) return;
    const nextSource = payload?.source?.tokenId ?? null;
    const nextTarget = payload?.target?.tokenId ?? null;
    const nextPicking = isPickingActive(payload?.mode);
    const sourceChanged = nextSource !== sourceTokenId;
    const targetChanged = nextTarget !== targetTokenId;
    const pickingChanged = nextPicking !== picking;
    sourceTokenId = nextSource;
    targetTokenId = nextTarget;
    picking = nextPicking;
    if (pickingChanged) void reconcileCursor();
    if (sourceChanged) void reconcileOutline();
    if (targetChanged) void reconcileRing();
  }

  /** @param {{ viewer?: {role?:string}, access?: {canView?:boolean} }} payload */
  function handleSelectionState(payload) {
    if (disposed) return;
    const nextRole = String(payload?.viewer?.role ?? "player").toLowerCase();
    const nextCanView = payload?.access?.canView === true;
    if (nextRole === viewerRole && nextCanView === canView) return;
    viewerRole = nextRole;
    canView = nextCanView;
    void reconcileOutline();
  }

  OBR.onReady(() => {
    if (disposed) return;
    unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
      if (disposed || ready) return;
      // Scene is going away — local items don't survive a scene switch, and
      // there is nothing left worth writing to; just reset our own tracking
      // so a fresh scene starts from a clean "nothing shown" state.
      stopRingTimer();
      outlineVisible = false;
      ringVisible = false;
      ringTokenId = null;
      picking = false;
      toolActive = false;
    });
  });

  return {
    handleTargetingState,
    handleSelectionState,
    async cleanup() {
      if (disposed) return;
      disposed = true;
      stopRingTimer();
      unsubscribeSceneReady?.();
      await restorePickingCursor();
      try { await hideAllTargetingVisuals(); } catch (_e) { /* best effort */ }
      if (toolRegistered) {
        try { await OBR.tool.removeMode(TARGETING_CURSOR_MODE_ID); } catch (_e) { /* ignore */ }
        try { await OBR.tool.remove(TARGETING_CURSOR_TOOL_ID); } catch (_e) { /* ignore */ }
      }
    },
  };
}
