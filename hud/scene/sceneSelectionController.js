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
import { loadWeaponProfileMagazine } from "../../api/weaponApi.js";
import { BC_HUD_COMMAND, BC_HUD_SELECTION, BC_HUD_SELECTION_REQUEST } from "../overlay/overlayConstants.js";
import { createSceneSelectionAdapter } from "./sceneSelectionAdapter.js";
import { buildBroadcastPayload, normalizeViewer } from "./selectionState.js";

const SCENE_RERESOLVE_DEBOUNCE_MS = 600;
const HUD_RUNTIME_SECTIONS = Object.freeze(["summary", "combat", "armory", "abilities", "effects"]);

/**
 * @param {{
 *   onSelectionState?: (payload:object) => (void|Promise<void>),
 *   shouldDeferSelection?: () => boolean,
 * }} [hooks]
 * @returns {() => void} cleanup
 */
export function setupSceneSelection(hooks = {}) {
  if (typeof OBR === "undefined" || OBR.isAvailable === false) return () => {};

  const onSelectionState = typeof hooks.onSelectionState === "function" ? hooks.onSelectionState : null;
  const shouldDeferSelection = typeof hooks.shouldDeferSelection === "function" ? hooks.shouldDeferSelection : () => false;
  let disposed = false;
  let lastPayload = null;
  let lastState = null;
  let sceneTimer = null;
  let currentSelectionIds = [];
  const ephemeral = {
    characterId: null,
    selectedWeaponId: null,
    selectedReloadMagazineId: null,
    weaponSelectorOpen: false,
    preparedAction: null,
    targeting: { mode: "none", selectedTargetIds: [], selectedBodyPartId: "torso" },
    commandStatus: null,
  };
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
      fetchCharacterBundle: async (characterId) => {
        const bundle = await getCharacterRuntimeBundle(
          {
            character_id: characterId,
            sections: HUD_RUNTIME_SECTIONS,
          },
          settings,
        );
        return bundle && typeof bundle === "object"
          ? { ...bundle, __hudDebug: { requestedSections: HUD_RUNTIME_SECTIONS } }
          : bundle;
      },
    });

    function resetEphemeralForCharacter(characterId) {
      if (ephemeral.characterId === characterId) return;
      ephemeral.characterId = characterId ?? null;
      ephemeral.selectedWeaponId = null;
      ephemeral.selectedReloadMagazineId = null;
      ephemeral.weaponSelectorOpen = false;
      ephemeral.preparedAction = null;
      ephemeral.targeting = { mode: "none", selectedTargetIds: [], selectedBodyPartId: "torso" };
      ephemeral.commandStatus = null;
    }

    function buildEphemeralForPayload() {
      return {
        selectedWeaponId: ephemeral.selectedWeaponId,
        weaponSelectorOpen: ephemeral.weaponSelectorOpen,
        preparedAction: ephemeral.preparedAction,
        targeting: ephemeral.targeting,
        commandStatus: ephemeral.commandStatus,
      };
    }

    function publishState(state) {
      lastPayload = buildBroadcastPayload(state, buildEphemeralForPayload());
      broadcast(lastPayload);
      return lastPayload;
    }

    async function refetchCurrent() {
      if (currentSelectionIds.length === 1) await resolveAndPublish(currentSelectionIds);
      else if (lastState) publishState(lastState);
    }

    function applyTargetingPayload(payload) {
      const target = payload?.target && typeof payload.target === "object" ? payload.target : null;
      ephemeral.targeting = {
        mode: payload?.mode === "picking" ? "picking" : "none",
        selectedTargetIds: target?.tokenId ? [String(target.tokenId)] : [],
        selectedTargetName: target?.displayName ?? null,
        selectedBodyPartId: target?.selectedZoneId ?? "torso",
        distance: Number.isFinite(Number(target?.distance?.value)) ? Number(target.distance.value) : null,
        error: payload?.error ?? null,
      };
      if (lastState) publishState(lastState);
    }

    async function handleCommand(command) {
      if (!command || typeof command !== "object") return;
      if (!lastPayload || lastPayload.status !== "ready") return;
      const type = String(command.type ?? "");
      ephemeral.commandStatus = null;
      if (type === "select-weapon") {
        ephemeral.selectedWeaponId = String(command.weaponId ?? "").trim() || null;
        ephemeral.selectedReloadMagazineId = null;
        ephemeral.weaponSelectorOpen = false;
        if (lastState) publishState(lastState);
        return;
      }
      if (type === "toggle-weapon-selector") {
        ephemeral.weaponSelectorOpen = !ephemeral.weaponSelectorOpen;
        if (lastState) publishState(lastState);
        return;
      }
      if (type === "close-weapon-selector") {
        ephemeral.weaponSelectorOpen = false;
        if (lastState) publishState(lastState);
        return;
      }
      if (type === "select-reload-mag") {
        ephemeral.selectedReloadMagazineId = String(command.magazineId ?? "").trim() || null;
        if (lastState) publishState(lastState);
        return;
      }
      if (type === "prepare-skill") {
        const skillId = String(command.skillId ?? "").trim();
        ephemeral.preparedAction = ephemeral.preparedAction?.id === skillId ? null : { kind: "skill", id: skillId };
        if (lastState) publishState(lastState);
        return;
      }
      if (type === "pick-target" || type === "cancel-target" || type === "clear-target" || type === "select-target-zone") {
        return;
      }
      if (type === "reload") {
        const weapon = lastPayload.hudSnapshot?.weapon?.primary ?? null;
        const weaponId = String(command.weaponId ?? weapon?.id ?? "").trim();
        const magazineId = String(command.magazineId ?? ephemeral.selectedReloadMagazineId ?? weapon?.reserveMagazines?.[0]?.id ?? "").trim();
        const profileId = weapon?.activeProfileId ?? weapon?.active_profile_id ?? weapon?.profileId ?? null;
        if (!weaponId || !magazineId || !profileId) {
          ephemeral.commandStatus = { type: "error", message: "Reload unavailable: missing weapon profile or magazine." };
          if (lastState) publishState(lastState);
          return;
        }
        try {
          await loadWeaponProfileMagazine({ character_weapon_id: weaponId, profile_id: profileId, character_magazine_id: magazineId }, settings);
          ephemeral.commandStatus = { type: "ok", message: "Reloaded." };
          await refetchCurrent();
        } catch (error) {
          ephemeral.commandStatus = { type: "error", message: String(error?.message ?? error ?? "Reload failed.") };
          if (lastState) publishState(lastState);
        }
      }
    }

    async function resolveAndPublish(selectionIds) {
      if (shouldDeferSelection()) return;
      currentSelectionIds = Array.isArray(selectionIds) ? selectionIds.slice() : [];
      const { stale, state } = await adapter.resolveLatest(selectionIds);
      if (disposed || stale) return; // only the freshest selection updates the HUD
      if (state.status !== "ready") resetEphemeralForCharacter(null);
      else resetEphemeralForCharacter(state.characterId ?? null);
      lastState = state;
      const payload = publishState(state);
      if (onSelectionState) {
        try { await onSelectionState(payload); } catch (_e) { /* controller handles its own errors */ }
      }
    }

    // Initial resolve from the current selection.
    await resolveAndPublish(player.selection);

    // Selection / role changes (OBR.player.onChange carries selection + role).
    cleanups.push(await subscribePlayerChanges((p) => {
      viewer = normalizeViewer({ playerId: p.id, role: p.role });
      if (shouldDeferSelection()) return;
      void resolveAndPublish(p.selection);
    }));

    // Scene items can change a token's link while it stays selected. Debounced,
    // single-selection-only re-resolve keeps the binding fresh without RPC spam.
    cleanups.push(await subscribeSceneItems(() => {
      if (sceneTimer) clearTimeout(sceneTimer);
      sceneTimer = setTimeout(() => {
        if (shouldDeferSelection()) return;
        OBR.player.getSelection()
          .then((sel) => { if (Array.isArray(sel) && sel.length === 1) return resolveAndPublish(sel); })
          .catch(() => {});
      }, SCENE_RERESOLVE_DEBOUNCE_MS);
    }));

    // Replay the latest state to a module iframe that just mounted.
    cleanups.push(OBR.broadcast.onMessage(BC_HUD_SELECTION_REQUEST, () => {
      if (lastPayload) broadcast(lastPayload);
    }));

    cleanups.push(OBR.broadcast.onMessage(BC_HUD_COMMAND, (event) => {
      void handleCommand(event?.data).catch(() => {});
    }));

    cleanup.applyTargetingPayload = applyTargetingPayload;
  }

  OBR.onReady(() => {
    if (disposed) return;
    void init().catch((error) => {
      // eslint-disable-next-line no-console
      console.error("[combatHud/scene] selection setup failed", error);
    });
  });

  function cleanup() {
    disposed = true;
    if (sceneTimer) { clearTimeout(sceneTimer); sceneTimer = null; }
    for (const fn of cleanups.splice(0)) { try { fn(); } catch (_e) { /* ignore */ } }
  }

  cleanup.applyTargetingPayload = () => {};
  return cleanup;
}
