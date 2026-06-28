// Combat HUD — Phase 3B target-selection controller (OBR-bound, thin).
//
// Runs in the BACKGROUND context alongside the Phase 3A scene-selection
// controller. It owns the EPHEMERAL targeting state (in memory only) and:
//   1. enters/leaves "picking" mode on commands from the Combat Control iframe;
//   2. while picking, interprets a single OBR selection as a TARGET CANDIDATE
//      (not a new active character) via the pure adapter + token-link layer;
//   3. restores the native OBR selection to the SOURCE token after a pick/cancel
//      using OBR.player.select([sourceTokenId], true) (a real SDK 3.1.0 method);
//   4. broadcasts the trimmed targeting state (LOCAL) to the Combat Control
//      iframe and replays it on request;
//   5. mirrors the active source character from the Phase 3A selection so the
//      target is cleared when the controlled character changes.
//
// Dual-mode coordination: while picking, the scene controller defers (it is given
// `shouldDeferSelection: () => isPicking()`), so the target selection never
// triggers a Phase 3A ownership error, never swaps the active character, and
// never closes the secondary modules.
//
// NOTHING here is persisted: no localStorage, no Supabase, no OBR/token metadata.

import OBR from "@owlbear-rodeo/sdk";
import {
  subscribePlayerChanges,
  getRoomSceneContext,
  getSceneItems,
  getSceneGrid,
} from "../../bridge/obrBridge.js";
import { loadRoomSupabaseSettings } from "../../bridge/settingsBridge.js";
import { getSceneTokenLinks } from "../../api/characterPlacementApi.js";
import {
  BC_HUD_TARGETING,
  BC_HUD_TARGETING_REQUEST,
  BC_HUD_TARGETING_COMMAND,
} from "../overlay/overlayConstants.js";
import { createTargetSelectionAdapter } from "./targetSelectionAdapter.js";
import {
  TARGETING_MODE,
  createInitialTargetState,
  startPicking,
  cancelPicking,
  applyResolvedTarget,
  clearTarget,
  selectZone,
  applySource,
  buildTargetingBroadcast,
} from "./targetSelectionState.js";

/**
 * @param {{ onTargetingState?: (payload:object) => void }} [options]
 * @returns {{ cleanup: () => void, isPicking: () => boolean, handleActiveSelection: (payload:object) => void }}
 */
export function setupTargetSelection(options = {}) {
  if (typeof OBR === "undefined" || OBR.isAvailable === false) {
    return { cleanup: () => {}, isPicking: () => false, handleActiveSelection: () => {} };
  }

  const onTargetingState = typeof options.onTargetingState === "function" ? options.onTargetingState : null;
  let disposed = false;
  let state = createInitialTargetState();
  let adapter = null;
  /** True while we programmatically restore the source selection — so our own
   *  onChange echo isn't mistaken for a target pick. */
  let restoreInProgress = false;
  /** @type {Array<() => void>} */
  const cleanups = [];

  function broadcast() {
    const payload = buildTargetingBroadcast(state);
    try {
      OBR.broadcast.sendMessage(BC_HUD_TARGETING, payload, { destination: "LOCAL" });
    } catch (_e) { /* ignore */ }
    if (onTargetingState) {
      try { onTargetingState(payload); } catch (_e) { /* bridge owns its errors */ }
    }
  }

  function commit(next) {
    if (next === state) return;
    state = next;
    broadcast();
  }

  async function restoreSourceSelection() {
    const sourceTokenId = state.source?.tokenId;
    if (!sourceTokenId) return;
    restoreInProgress = true;
    try {
      // Real SDK 3.1.0 method: replace the selection with the source token so the
      // HUD stays on the controlled character and Phase 3A re-resolves the SAME
      // character (no popover reopen, no target reset).
      await OBR.player.select([sourceTokenId], true);
    } catch (_e) { /* selection restore best-effort */ }
    restoreInProgress = false;
  }

  function onPick() {
    commit(startPicking(state));
  }

  async function onCancel() {
    if (state.mode !== TARGETING_MODE.picking) return;
    commit(cancelPicking(state)); // keeps the previously selected target
    await restoreSourceSelection();
  }

  function onClear() {
    commit(clearTarget(state));
  }

  function onSelectZone(zoneId) {
    commit(selectZone(state, zoneId));
  }

  async function resolveCandidate(tokenId) {
    if (!adapter) return;
    const { stale, result } = await adapter.resolveLatest(tokenId);
    if (disposed || stale) return;                 // race: only the latest commits
    if (state.mode !== TARGETING_MODE.picking) return; // cancelled meanwhile
    if (!result.ok) {
      // Unlinked / self / fetch error → keep any existing target, leave picking,
      // restore the source. Surface a machine-readable error code only.
      commit(cancelPicking({ ...state, error: { code: result.code, message: result.message ?? null } }));
      await restoreSourceSelection();
      return;
    }
    commit(applyResolvedTarget(state, result.candidate));
    await restoreSourceSelection();
  }

  /** Mirror the active source character from the Phase 3A selection payload. */
  function handleActiveSelection(payload) {
    if (disposed) return;
    const ready = payload && payload.status === "ready" && payload.access?.canView === true;
    const source = ready
      ? {
          tokenId: payload.selectedItemId ?? null,
          characterId: payload.characterId ?? null,
          characterName: payload.view?.name ?? null,
        }
      : { tokenId: null, characterId: null, characterName: null };
    commit(applySource(state, source));
  }

  async function init() {
    const [context, settings] = await Promise.all([
      getRoomSceneContext(),
      loadRoomSupabaseSettings(),
    ]);
    if (disposed) return;

    adapter = createTargetSelectionAdapter({
      fetchSceneTokenLink: (tokenId) => getSceneTokenLinks(
        { room_id: context.roomId, scene_id: context.sceneId, campaign_id: context.campaignId, token_id: tokenId },
        settings,
      ),
      getTokenSummary: async (tokenId) => {
        const items = await getSceneItems();
        const item = items.find((i) => String(i?.id ?? "") === String(tokenId));
        if (!item) return null;
        return { displayName: String(item.name ?? ""), position: item.position ?? null };
      },
      getGrid: () => getSceneGrid(),
      getSourceContext: () => state.source ?? {},
    });

    // While picking, a single new selection on the map is a TARGET CANDIDATE.
    cleanups.push(await subscribePlayerChanges((p) => {
      if (disposed || restoreInProgress) return;
      if (state.mode !== TARGETING_MODE.picking) return;
      const ids = Array.isArray(p.selection) ? p.selection.map((v) => String(v ?? "").trim()).filter(Boolean) : [];
      if (ids.length !== 1) return;                 // wait for exactly one token
      const tokenId = ids[0];
      if (tokenId === state.source?.tokenId) return; // reselecting source → ignore
      void resolveCandidate(tokenId);
    }));

    // Commands from the Combat Control iframe (pick / cancel / clear / zone).
    cleanups.push(OBR.broadcast.onMessage(BC_HUD_TARGETING_COMMAND, (event) => {
      const cmd = event?.data ?? {};
      switch (cmd.type) {
        case "pick": onPick(); break;
        case "cancel": void onCancel(); break;
        case "clear": onClear(); break;
        case "selectZone": onSelectZone(cmd.zoneId); break;
        default: break;
      }
    }));

    // Replay the latest targeting state to a freshly-mounted Combat Control iframe.
    cleanups.push(OBR.broadcast.onMessage(BC_HUD_TARGETING_REQUEST, () => broadcast()));

    broadcast(); // seed
  }

  OBR.onReady(() => {
    if (disposed) return;
    void init().catch((error) => {
      // eslint-disable-next-line no-console
      console.error("[combatHud/targeting] setup failed", error);
    });
  });

  return {
    cleanup() {
      disposed = true;
      for (const fn of cleanups.splice(0)) { try { fn(); } catch (_e) { /* ignore */ } }
    },
    isPicking: () => state.mode === TARGETING_MODE.picking,
    handleActiveSelection,
  };
}
