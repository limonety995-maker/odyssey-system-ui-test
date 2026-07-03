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
import { loadWeaponProfileMagazine, getCharacterArmory, switchWeaponFireMode } from "../../api/weaponApi.js";
import { performAttack } from "../../api/combatApi.js";
import { getCharacterInventory } from "../../api/inventoryApi.js";
import { resolveReloadMagazineId, normalizeReloadRpcResult } from "./reloadPolicy.js";
import { normalizeFireModeRpcResult } from "./fireModePolicy.js";
import { evaluateBasicAttack, buildAttackRequestSignature, isAttackResultStale } from "../combat/basicAttackPolicy.js";
import { buildBasicAttackCtx, resolveAttack } from "../combat/basicAttackPayload.js";
import { BC_HUD_COMMAND, BC_HUD_SELECTION, BC_HUD_SELECTION_REQUEST, BC_HUD_TARGETING_COMMAND } from "../overlay/overlayConstants.js";
import { createSceneSelectionAdapter } from "./sceneSelectionAdapter.js";
import { buildCanonicalArmory } from "../runtime/runtimeBundleMapper.js";
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
    // Raw { ok, error, message } from the last loadWeaponProfileMagazine RPC
    // call, so ?debug=1 can show the server's actual verdict — see
    // buildReloadDebugInfo() in selectionState.js.
    reloadRpcResult: null,
    // Fire Mode v1: companion-popover open flag (ephemeral, like
    // weaponSelectorOpen) + the last switch_weapon_fire_mode outcome for
    // ?debug=1 — see buildFireModeDebugInfo() in selectionState.js. There is
    // NO ephemeral "selected fire mode id" override: the current mode always
    // comes fresh from armory (weapon.fireMode.selectedId), so switching
    // weapons away and back never carries a mode over from a different weapon.
    fireModeSelectorOpen: false,
    fireModeRpcResult: null,
    // Basic Weapon Attack v1: true only for the duration of an in-flight
    // perform_attack call — blocks double-submit (see handleCommand's
    // "execute" branch) and disables the Action button client-side.
    basicAttackInFlight: false,
    // Last outcome for ?debug=1 / the commandStatus toast — never a
    // fabricated hit/miss/damage, only what buildBasicAttackDebugInfo()
    // forwards from the real server response or exception.
    basicAttackResult: null,
  };
  let debugEnabled = false;
  try { debugEnabled = new URLSearchParams(window.location.search).get("debug") === "1"; } catch (_e) { debugEnabled = false; }
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
        // Fetch the runtime bundle PLUS the canonical armory/inventory (the same
        // RPCs the Resolve-Attack screen uses). The armory/inventory path carries
        // the working magazine details (loaded_magazine, magazines, calibers) that
        // the bundle's own armory section can omit. Inventory is optional: when it
        // errors (known backend 25006) buildCanonicalArmory falls back to
        // armory.magazines, exactly like Resolve-Attack's storeInventory().
        const [bundle, armory, inventory] = await Promise.all([
          getCharacterRuntimeBundle(
            { character_id: characterId, sections: HUD_RUNTIME_SECTIONS },
            settings,
          ),
          getCharacterArmory(characterId, settings).catch(() => null),
          getCharacterInventory(characterId, settings).catch(() => null),
        ]);
        if (!bundle || typeof bundle !== "object") return bundle;

        const merged = { ...bundle, __hudDebug: { requestedSections: HUD_RUNTIME_SECTIONS } };
        const canonicalArmory = buildCanonicalArmory(armory, inventory);
        if (canonicalArmory) {
          merged.armory = canonicalArmory;
          if (merged.sections && typeof merged.sections === "object") {
            merged.sections = { ...merged.sections, armory: canonicalArmory };
          }
        }
        return merged;
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
      ephemeral.reloadRpcResult = null;
      ephemeral.fireModeSelectorOpen = false;
      ephemeral.fireModeRpcResult = null;
      // NOTE: basicAttackInFlight is intentionally NOT force-cleared here — an
      // in-flight request's own staleness check (comparing a source/weapon/
      // target signature captured at request time) is what actually protects
      // against a stale result applying to a new character; see "execute".
      ephemeral.basicAttackResult = null;
    }

    function buildEphemeralForPayload() {
      const prepared = ephemeral.preparedAction;
      const activeIntent = (prepared?.kind === "skill" && prepared.id)
        ? { kind: "skill", id: prepared.id }
        : { kind: "weapon-attack", weaponId: ephemeral.selectedWeaponId };
      return {
        selectedWeaponId: ephemeral.selectedWeaponId,
        selectedReloadMagazineId: ephemeral.selectedReloadMagazineId,
        weaponSelectorOpen: ephemeral.weaponSelectorOpen,
        preparedAction: ephemeral.preparedAction,
        targeting: ephemeral.targeting,
        commandStatus: ephemeral.commandStatus,
        activeIntent,
        debugEnabled,
        reloadRpcResult: ephemeral.reloadRpcResult,
        fireModeSelectorOpen: ephemeral.fireModeSelectorOpen,
        fireModeRpcResult: ephemeral.fireModeRpcResult,
        basicAttackInFlight: ephemeral.basicAttackInFlight,
        basicAttackResult: ephemeral.basicAttackResult,
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
        // NOTE: selectedBodyPartId here is the WIRE ZONE CODE (e.g. "TORSO"),
        // an existing, unchanged field used for display/highlight. The REAL
        // per-character body-part uuid perform_attack needs is the separate
        // resolvedBodyPartId field below — never conflate the two.
        selectedBodyPartId: target?.selectedZoneId ?? "torso",
        selectedTargetCharacterId: target?.characterId ?? null,
        resolvedBodyPartId: target?.resolvedBodyPartId ?? null,
        distance: Number.isFinite(Number(target?.distance?.value)) ? Number(target.distance.value) : null,
        error: payload?.error ?? null,
      };
      if (lastState) publishState(lastState);
    }

    async function handleCommand(command) {
      if (!command || typeof command !== "object") return;
      if (!lastPayload || lastPayload.status !== "ready") return;

      // Fire Mode v1: namespaced commands ({scope:"combat-hud", feature:"fire-mode"})
      // are routed BEFORE the flat-`type` switch below, on scope+feature (not just
      // `type`), so they can never collide with weapon/magazine/reload/target/
      // skill commands regardless of what `type` string they happen to reuse.
      if (command?.scope === "combat-hud" && command?.feature === "fire-mode") {
        const fmType = String(command.type ?? "");
        if (fmType === "toggle-selector") {
          ephemeral.fireModeSelectorOpen = !ephemeral.fireModeSelectorOpen;
          if (lastState) publishState(lastState);
          return;
        }
        if (fmType === "close-selector") {
          ephemeral.fireModeSelectorOpen = false;
          if (lastState) publishState(lastState);
          return;
        }
        if (fmType === "select") {
          const weapon = lastPayload.hudSnapshot?.weapon?.primary ?? null;
          const weaponId = weapon?.id ?? null;
          const profileId = weapon?.activeProfileId ?? null;
          const fireModeId = String(command.fireModeId ?? "").trim() || null;
          ephemeral.fireModeSelectorOpen = false;
          ephemeral.commandStatus = null;
          if (!weaponId || !profileId || !fireModeId) {
            ephemeral.commandStatus = { type: "error", message: "Fire mode switch unavailable: missing weapon, profile, or mode." };
            ephemeral.fireModeRpcResult = { ok: false, error: "MISSING_FIELDS", message: "weaponId/profileId/fireModeId missing before RPC call." };
            if (lastState) publishState(lastState);
            return;
          }
          try {
            await switchWeaponFireMode(ephemeral.characterId, weaponId, fireModeId, settings);
            // Success: switch_weapon_fire_mode persists selected_fire_mode_id
            // server-side (keyed by weapon+profile) and returns the fresh
            // armory — an authoritative refresh (not a local override) is the
            // only way the Gun HUD's new mode can be trusted. No local
            // "selectedFireModeId" ephemeral is kept: the mode always comes
            // straight from armory for whichever weapon is active.
            ephemeral.fireModeRpcResult = normalizeFireModeRpcResult(null);
            ephemeral.commandStatus = { type: "ok", message: "Fire mode changed." };
            await refetchCurrent();
          } catch (error) {
            // switch_weapon_fire_mode RAISEs an exception (not {ok:false}) on
            // an invalid weapon or a mode not allowed for the active profile —
            // the real server message must reach the player, never a silent
            // local "success".
            const normalized = normalizeFireModeRpcResult(error);
            ephemeral.fireModeRpcResult = normalized;
            ephemeral.commandStatus = { type: "error", message: normalized.message || "Fire mode switch failed." };
            if (lastState) publishState(lastState);
          }
          return;
        }
        return; // unknown fire-mode command → ignore, never falls through below
      }

      // Basic Weapon Attack v1: same namespaced-scope routing pattern as
      // fire-mode above — cannot collide with weapon/magazine/reload/target/
      // skill/arrange commands regardless of `type` string reuse.
      if (command?.scope === "combat-hud" && command?.feature === "basic-attack") {
        const baType = String(command.type ?? "");
        if (baType !== "execute") return; // unknown → ignore

        // Double-submit guard: a second "execute" while one is in flight is a
        // no-op, not a queued second attack.
        if (ephemeral.basicAttackInFlight) return;

        const weapon = lastPayload.hudSnapshot?.weapon?.primary ?? null;
        const targeting = ephemeral.targeting ?? {};
        const evalCtx = {
          sourceCharacterId: ephemeral.characterId,
          weaponId: weapon?.id ?? null,
          targetTokenId: targeting.selectedTargetIds?.[0] ?? null,
          targetCharacterId: targeting.selectedTargetCharacterId ?? null,
          bodyZoneId: targeting.selectedBodyPartId ?? null,
          resolvedBodyPartId: targeting.resolvedBodyPartId ?? null,
          inFlight: false,
        };
        const evalResult = evaluateBasicAttack(evalCtx);
        ephemeral.commandStatus = null;
        if (!evalResult.uiAllowed) {
          ephemeral.commandStatus = { type: "error", message: evalResult.uiBlockReason };
          ephemeral.basicAttackResult = { ok: false, error: "PRECONDITION_FAILED", message: evalResult.uiBlockReason };
          if (lastState) publishState(lastState);
          return;
        }

        // Snapshot the source/weapon/target this request is FOR. If any of
        // them changed by the time the RPC resolves, the result must not be
        // applied to the (now different) HUD state — see the staleness check
        // below.
        const requestCtx = { sourceCharacterId: evalCtx.sourceCharacterId, weaponId: evalCtx.weaponId, targetCharacterId: evalCtx.targetCharacterId };
        const ctx = buildBasicAttackCtx({
          sourceCharacterId: evalCtx.sourceCharacterId,
          weaponId: evalCtx.weaponId,
          targetCharacterId: evalCtx.targetCharacterId,
          bodyPartId: evalCtx.resolvedBodyPartId,
          distance: targeting.distance ?? 0,
        });

        ephemeral.basicAttackInFlight = true;
        if (lastState) publishState(lastState); // Action disables immediately

        let outcome;
        try {
          outcome = await resolveAttack(ctx, { performAttack: (payload) => performAttack(payload, settings) });
        } catch (error) {
          // resolveAttack() already catches RPC/network errors internally and
          // returns { ok:false, ... } — this catch only guards a thrown
          // ValidationError (a locally-missing required field).
          outcome = { ok: false, payload: null, raw: null, normalized: null, code: null, error: String(error?.message ?? error ?? "Attack failed.") };
        }

        ephemeral.basicAttackInFlight = false;
        const currentCtx = {
          sourceCharacterId: ephemeral.characterId,
          weaponId: lastPayload.hudSnapshot?.weapon?.primary?.id ?? null,
          targetCharacterId: ephemeral.targeting?.selectedTargetCharacterId ?? null,
        };
        const stale = isAttackResultStale(requestCtx, currentCtx);

        ephemeral.basicAttackResult = { ok: outcome.ok, error: outcome.code ?? null, message: outcome.error ?? null };

        if (stale) {
          // Source/weapon/target changed mid-flight: never apply this result
          // to the new HUD state (no toast, no target/zone reset, no refresh
          // tied to the OLD context) — just stop showing "resolving".
          if (lastState) publishState(lastState);
          return;
        }

        if (outcome.ok) {
          ephemeral.commandStatus = { type: "ok", message: "Attack resolved." };
          // Only the temporary selection state that should end after a
          // normal attack: the selected target + its body zone. No modifier
          // state to reset — v1 wires none into the payload (see the report).
          try { OBR.broadcast.sendMessage(BC_HUD_TARGETING_COMMAND, { type: "clear" }, { destination: "LOCAL" }); } catch (_e) { /* best-effort */ }
          // Authoritative refresh of THIS source's armory/inventory/runtime —
          // never the target's private bundle.
          await refetchCurrent();
        } else {
          ephemeral.commandStatus = { type: "error", message: outcome.error || "Attack failed." };
          // Target/body zone are intentionally left untouched on failure. A
          // denial can stem from stale local state (e.g. a weapon lock that
          // changed elsewhere), so refresh the SOURCE's own state — this never
          // touches target/zone selection either.
          await refetchCurrent();
        }
        return;
      }

      const type = String(command.type ?? "");
      ephemeral.commandStatus = null;
      if (type === "select-weapon") {
        // Weapon selection is PURE LOCAL ephemeral state — no server mutation. The
        // mapper re-derives weapon.primary from selectedWeaponId on every publish,
        // so a local publishState immediately swaps the active weapon. (The overlay
        // controller closes/relays the gun popover off the same BC_HUD_COMMAND.)
        ephemeral.selectedWeaponId = String(command.weaponId ?? "").trim() || null;
        ephemeral.selectedReloadMagazineId = null;
        ephemeral.reloadRpcResult = null;
        ephemeral.weaponSelectorOpen = false;
        // A new weapon has its own active profile / fire mode — never carry
        // the previous weapon's selector state or last RPC result forward.
        ephemeral.fireModeSelectorOpen = false;
        ephemeral.fireModeRpcResult = null;
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
        // The player's EXPLICIT selection wins outright — the HUD must never
        // silently substitute a different magazine (e.g. reserve[0]). See
        // reloadPolicy.js for the shared, unit-tested fallback chain.
        const magazineId = resolveReloadMagazineId(command, ephemeral, weapon) ?? "";
        const profileId = weapon?.activeProfileId ?? weapon?.active_profile_id ?? weapon?.profileId ?? null;
        if (!weaponId || !magazineId || !profileId) {
          ephemeral.commandStatus = { type: "error", message: "Reload unavailable: missing weapon profile or magazine." };
          ephemeral.reloadRpcResult = { ok: false, error: "MISSING_FIELDS", message: "weaponId/profileId/magazineId missing before RPC call." };
          if (lastState) publishState(lastState);
          return;
        }
        try {
          const result = await loadWeaponProfileMagazine(
            { character_weapon_id: weaponId, profile_id: profileId, character_magazine_id: magazineId },
            settings,
          );
          // The RPC returns { ok:false, error, message } as a normal (HTTP 200)
          // jsonb body on validation failures — it does NOT throw. Treating any
          // non-throwing call as success silently swallowed real backend
          // rejections (the UI reported "Reloaded." while nothing changed).
          const normalized = normalizeReloadRpcResult(result);
          ephemeral.reloadRpcResult = normalized;
          if (normalized.ok) {
            ephemeral.commandStatus = { type: "ok", message: "Reloaded." };
            ephemeral.selectedReloadMagazineId = null;
            await refetchCurrent();
          } else {
            ephemeral.commandStatus = { type: "error", message: normalized.message || normalized.error || "Reload failed." };
            if (lastState) publishState(lastState);
          }
        } catch (error) {
          ephemeral.reloadRpcResult = { ok: false, error: "RPC_EXCEPTION", message: String(error?.message ?? error ?? "Reload failed.") };
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
