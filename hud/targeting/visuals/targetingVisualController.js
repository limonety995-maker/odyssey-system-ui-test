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
import { activateTool, activateToolMode, getActiveTool, getActiveToolMode, getRoomSceneContext } from "../../../bridge/obrBridge.js";
import { buildTargetCursorValue, buildTargetCursorToolIcon } from "../targetCursorSvg.js";
import { logDebugEvent } from "../../debug/debugLogStore.js";
import { serializeError } from "../../debug/errorSerialization.js";
import {
  shouldShowSourceOutline,
  shouldShowTargetRing,
  isPickingActive,
} from "./targetingVisualPolicy.js";
import {
  showSourceOutline,
  hideSourceOutline,
  showTargetRing,
  hideTargetRing,
  updateTargetRingGeometry,
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
  let sourceCharacterId = null;
  let targetTokenId = null;
  let targetCharacterId = null;
  let picking = false;
  let viewerRole = "player";
  let canView = false;
  // Best-effort, fetched once — a diagnostic field only (never used for any
  // gating decision), so a failure to resolve it must never block targeting.
  let sceneId = null;
  void getRoomSceneContext().then((ctx) => { sceneId = ctx?.sceneId ?? null; }).catch(() => {});

  let outlineVisible = false;
  let ringVisible = false;
  // anchorState: pure internal JS bookkeeping only — never an OBR item, never
  // passed to addItems. ringTokenId tracks which token the ring is CURRENTLY
  // following; lastRingBounds is the last geometry (width/height/center) we
  // actually wrote to the ring item — updateTargetRingGeometry() diffs a
  // freshly-read bounds against this before writing anything, so a scene
  // event that doesn't actually change OUR token's geometry is a no-op.
  let ringTokenId = null;
  let lastRingBounds = null;
  let ringGeometrySyncInFlight = false;

  let unsubscribeSceneReady = null;
  let unsubscribeSceneItems = null;

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

  /**
   * THE single failure-reporting path for every target-ring phase (Urgent
   * Diagnostic Fix). Never throws, never blocks targeting — logging a
   * failure here is itself best-effort. Structured details (never a bare
   * `String(error)`, which is exactly what used to collapse to the useless
   * "[object Object]") go to the Debug Console; the raw, unserialized error
   * plus this same context object go to the real browser console for full
   * devtools inspection.
   * @param {string} phase one of: target-state-to-token-lookup,
   *   scene-item-lookup, ring-creation, ring-anchor-update, ring-cleanup,
   *   ring-geometry-sync, scene-change-handling
   * @param {string} operation short, specific action name within the phase
   * @param {unknown} error
   */
  function logRingFailure(phase, operation, error) {
    const context = {
      phase, operation,
      tokenId: targetTokenId,
      targetCharacterId,
      sourceCharacterId,
      sceneId,
    };
    try {
      logDebugEvent("targeting", "target-ring-failed", { ...context, ...serializeError(error) }, false);
    } catch (_e) { /* logging itself must never throw */ }
    try {
      // eslint-disable-next-line no-console
      console.error("[Odyssey HUD] target ring failed", error, context);
    } catch (_e) { /* never let console logging break targeting */ }
  }

  function logRingSuccess(operation) {
    logDebugEvent("targeting", "target-ring-shown", { operation, tokenId: targetTokenId, targetCharacterId, sourceCharacterId, sceneId }, true);
  }

  /**
   * The anchor/geometry layer's ONLY trigger: a real OBR.scene.items.onChange
   * event (registered once below), never a fixed-interval poll. Video
   * regression fix — see docs/TARGET_RING_ANIMATION_AUDIT.md's "Video
   * regression: 2026-07-08" section: the ring previously animated by pushing
   * a fresh rotation value through updateItems every 150ms, and each write is
   * a real round-trip through the local scene store — what should have been
   * continuous motion instead showed a visible step on every tick. The ring
   * is now static (no rotation), so this handler's only job is keeping its
   * position/width/height honest when the TARGET TOKEN itself actually moves,
   * resizes, or rotates — never on every frame, never unconditionally.
   * @param {Array<{id?:string}>} items whatever OBR.scene.items.onChange just
   *   reported changed — used only as a cheap "something happened, worth
   *   checking" signal; updateTargetRingGeometry() does its own bounds diff
   *   before writing anything.
   */
  async function handleSceneItemsChanged(items) {
    if (disposed || !ringVisible || !ringTokenId || ringGeometrySyncInFlight) return;
    if (!Array.isArray(items) || !items.some((item) => item?.id === ringTokenId)) return;
    ringGeometrySyncInFlight = true;
    try {
      const result = await updateTargetRingGeometry(ringTokenId, lastRingBounds);
      lastRingBounds = result.bounds;
    } catch (error) {
      logRingFailure("ring-geometry-sync", "updateTargetRingGeometry", error);
    } finally {
      ringGeometrySyncInFlight = false;
    }
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
    // Phase: target-state-to-token-lookup — deciding what (if anything)
    // should be shown, purely from the already-extracted targetTokenId.
    let wanted;
    try {
      wanted = shouldShowTargetRing({ targetTokenId });
    } catch (error) {
      logRingFailure("target-state-to-token-lookup", "shouldShowTargetRing", error);
      return;
    }
    if (!wanted) {
      if (!ringVisible) return;
      ringVisible = false;
      ringTokenId = null;
      lastRingBounds = null;
      try {
        await hideTargetRing();
      } catch (error) {
        logRingFailure("ring-cleanup", "hideTargetRing(clear)", error);
      }
      return;
    }
    // Already showing on this EXACT token — a genuinely unrelated broadcast
    // (this function only ever runs when targetChanged fired, but guard
    // anyway) must never tear down/restart an already-correct ring.
    if (ringVisible && ringTokenId === targetTokenId) return;
    // Either a fresh pick, or the target switched to a DIFFERENT token: tear
    // down the old ring (if any) before attaching the new one — never leave
    // the ring attached to a stale target.
    if (ringVisible) {
      try {
        await hideTargetRing();
      } catch (error) {
        logRingFailure("ring-anchor-update", "hideTargetRing(retarget)", error);
      }
    }
    ringVisible = false;
    ringTokenId = null;
    lastRingBounds = null;
    try {
      const bounds = await showTargetRing(targetTokenId);
      ringVisible = true;
      ringTokenId = targetTokenId;
      lastRingBounds = bounds;
      logRingSuccess("showTargetRing");
    } catch (error) {
      ringVisible = false;
      ringTokenId = null;
      // Cosmetic-only (never breaks targeting itself) — but a silently
      // swallowed failure here is exactly what made a real "ring never
      // appears" bug indistinguishable from "everything is fine" in the
      // past. logRingFailure() surfaces the REAL structured error to both
      // the Debug Console and the browser console — never a bare
      // String(error), which is exactly what used to collapse to
      // "[object Object]". showTargetRing()'s own internal steps
      // (bounds lookup vs. anchor/ring creation) tag the thrown error with
      // a MORE specific error.phase/error.operation than this generic
      // fallback — use those when present.
      logRingFailure(error?.phase ?? "ring-creation", error?.operation ?? "showTargetRing", error);
    }
  }

  async function reconcileCursor() {
    if (picking) await activatePickingCursor();
    else await restorePickingCursor();
  }

  /** @param {{ mode?: string, source?: {tokenId?:string|null, characterId?:string|null}, target?: {tokenId?:string|null, characterId?:string|null} }} payload */
  function handleTargetingState(payload) {
    if (disposed) return;
    // Phase: target-state-to-token-lookup — this whole function IS that
    // lookup (extracting the token/character ids the rest of this module
    // acts on from the broadcast payload). It only ever does plain property
    // reads, so a try/catch here is defensive-only, but still reports
    // through the same shared path if the payload is ever malformed enough
    // to throw (e.g. a getter that throws).
    try {
      const nextSource = payload?.source?.tokenId ?? null;
      const nextTarget = payload?.target?.tokenId ?? null;
      const nextPicking = isPickingActive(payload?.mode);
      const sourceChanged = nextSource !== sourceTokenId;
      const targetChanged = nextTarget !== targetTokenId;
      const pickingChanged = nextPicking !== picking;
      sourceTokenId = nextSource;
      sourceCharacterId = payload?.source?.characterId ?? null;
      targetTokenId = nextTarget;
      targetCharacterId = payload?.target?.characterId ?? null;
      picking = nextPicking;
      if (pickingChanged) void reconcileCursor();
      if (sourceChanged) void reconcileOutline();
      if (targetChanged) void reconcileRing();
    } catch (error) {
      logRingFailure("target-state-to-token-lookup", "handleTargetingState", error);
    }
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
      try {
        outlineVisible = false;
        ringVisible = false;
        ringTokenId = null;
        lastRingBounds = null;
        picking = false;
        toolActive = false;
      } catch (error) {
        logRingFailure("scene-change-handling", "onReadyChange-reset", error);
      }
    });
    // The anchor/geometry layer's event source — fires whenever the SHARED
    // scene reports any item change; handleSceneItemsChanged() itself checks
    // whether the change is actually relevant (our current ring's target
    // token) before doing anything. This replaces the old fixed-interval
    // timer entirely: no scene write happens unless a real geometry change
    // was just reported.
    unsubscribeSceneItems = OBR.scene.items.onChange((items) => {
      if (disposed) return;
      void handleSceneItemsChanged(items);
    });
  });

  return {
    handleTargetingState,
    handleSelectionState,
    async cleanup() {
      if (disposed) return;
      disposed = true;
      unsubscribeSceneReady?.();
      unsubscribeSceneItems?.();
      await restorePickingCursor();
      // No explicit token-deletion handler exists in this module — a
      // deleted target token relies entirely on OBR's own attachment DELETE
      // sync to remove the anchor/ring automatically; token-deletion-driven
      // target CLEARING is targetSelectionController.js's responsibility,
      // which re-routes through the normal targetChanged -> reconcileRing()
      // path once it detects the link is gone (see
      // docs/TARGET_RING_ANIMATION_AUDIT.md).
      try {
        await hideAllTargetingVisuals();
      } catch (error) {
        logRingFailure("ring-cleanup", "hideAllTargetingVisuals(teardown)", error);
      }
      if (toolRegistered) {
        try { await OBR.tool.removeMode(TARGETING_CURSOR_MODE_ID); } catch (_e) { /* ignore */ }
        try { await OBR.tool.remove(TARGETING_CURSOR_TOOL_ID); } catch (_e) { /* ignore */ }
      }
    },
  };
}
