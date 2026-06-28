// Combat HUD — Phase 3A scene-selection controller (OBR-bound, thin).
//
// Runs in the BACKGROUND context alongside combatHudOverlayController. It:
//   1. reads the viewer (OBR player id + role) and room/scene context;
//   2. resolves the current OBR selection → a normalized selection state via the
//      pure adapter (token link + runtime bundle through the existing Supabase
//      RPCs — no token metadata, no new RPCs);
//   3. broadcasts a TRIMMED selection payload (LOCAL) to the module iframes;
//   4. replays the latest payload to freshly-mounted iframes on request;
//   5. notifies the overlay controller of status changes so it can show/hide the
//      ready-only modules — WITHOUT re-opening popovers on every selection.
//
// All heavy lifting (state shape, ownership, stale-request gate) lives in the
// pure selectionState/sceneSelectionAdapter modules. This file only wires OBR.

import OBR from "@owlbear-rodeo/sdk";
import {
  subscribePlayerChanges,
  subscribeSceneItems,
  getPlayerInfo,
  getRoomSceneContext,
} from "../../bridge/obrBridge.js";
import { loadRoomSupabaseSettings, hasSupabaseSettings } from "../../bridge/settingsBridge.js";
import { getSceneTokenLinks, getCharacterRuntimeBundle } from "../../api/characterPlacementApi.js";
import { BC_HUD_SELECTION, BC_HUD_SELECTION_REQUEST } from "../overlay/overlayConstants.js";
import { createSceneSelectionAdapter } from "./sceneSelectionAdapter.js";
import { buildBroadcastPayload, normalizeViewer } from "./selectionState.js";

const SCENE_RERESOLVE_DEBOUNCE_MS = 600;

/**
 * @param {{ onSelectionState?: (payload:object) => (void|Promise<void>) }} [hooks]
 * @returns {() => void} cleanup
 */
export function setupSceneSelection(hooks = {}) {
  if (typeof OBR === "undefined" || OBR.isAvailable === false) return () => {};

  const onSelectionState = typeof hooks.onSelectionState === "function" ? hooks.onSelectionState : null;
  let disposed = false;
  let lastPayload = null;
  let sceneTimer = null;
  /** @type {Array<() => void>} */
  const cleanups = [];

  function broadcast(payload) {
    try { OBR.broadcast.sendMessage(BC_HUD_SELECTION, payload, { destination: "LOCAL" }); } catch (_e) { /* ignore */ }
  }

  async function init() {
    const [player, context, settings] = await Promise.all([
      getPlayerInfo(),
      getRoomSceneContext(),
      loadRoomSupabaseSettings(),
    ]);
    if (disposed) return;

    let viewer = normalizeViewer({ playerId: player.id, role: player.role });
    const configured = hasSupabaseSettings(settings);

    const adapter = createSceneSelectionAdapter({
      backendConfigured: configured,
      getViewer: () => viewer,
      fetchSceneTokenLink: (tokenId) => getSceneTokenLinks(
        { room_id: context.roomId, scene_id: context.sceneId, campaign_id: context.campaignId, token_id: tokenId },
        settings,
      ),
      fetchCharacterBundle: (characterId) => getCharacterRuntimeBundle(
        {
          character_id: characterId,
          sections: ["summary", "combat", "armory", "abilities", "effects"],
        },
        settings,
      ),
    });

    async function resolveAndPublish(selectionIds) {
      const { stale, state } = await adapter.resolveLatest(selectionIds);
      if (disposed || stale) return; // only the freshest selection updates the HUD
      lastPayload = buildBroadcastPayload(state);
      broadcast(lastPayload);
      if (onSelectionState) {
        try { await onSelectionState(lastPayload); } catch (_e) { /* controller handles its own errors */ }
      }
    }

    // Initial resolve from the current selection.
    await resolveAndPublish(player.selection);

    // Selection / role changes (OBR.player.onChange carries selection + role).
    cleanups.push(await subscribePlayerChanges((p) => {
      viewer = normalizeViewer({ playerId: p.id, role: p.role });
      void resolveAndPublish(p.selection);
    }));

    // Scene items can change a token's link while it stays selected. Debounced,
    // single-selection-only re-resolve keeps the binding fresh without RPC spam.
    cleanups.push(await subscribeSceneItems(() => {
      if (sceneTimer) clearTimeout(sceneTimer);
      sceneTimer = setTimeout(() => {
        OBR.player.getSelection()
          .then((sel) => { if (Array.isArray(sel) && sel.length === 1) return resolveAndPublish(sel); })
          .catch(() => {});
      }, SCENE_RERESOLVE_DEBOUNCE_MS);
    }));

    // Replay the latest state to a module iframe that just mounted.
    cleanups.push(OBR.broadcast.onMessage(BC_HUD_SELECTION_REQUEST, () => {
      if (lastPayload) broadcast(lastPayload);
    }));
  }

  OBR.onReady(() => {
    if (disposed) return;
    void init().catch((error) => {
      // eslint-disable-next-line no-console
      console.error("[combatHud/scene] selection setup failed", error);
    });
  });

  return () => {
    disposed = true;
    if (sceneTimer) { clearTimeout(sceneTimer); sceneTimer = null; }
    for (const fn of cleanups.splice(0)) { try { fn(); } catch (_e) { /* ignore */ } }
  };
}
