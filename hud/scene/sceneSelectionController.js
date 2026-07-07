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
import { buildAttackResolutionTrace, buildRollResolutionDetails } from "../combat/attackResolutionTrace.js";
import { createSelectedWeaponMemory, resolveStoredWeaponId } from "./selectedWeaponMemory.js";
import { createArmedTechniqueMemory } from "./armedTechniqueMemory.js";
import {
  appendCombatLogEntry,
  buildAttackLogEntry,
  buildReloadLogEntry,
  buildFireModeLogEntry,
} from "../log/combatResultLogPolicy.js";
import { getZoneLabel, DEFAULT_PROFILE_ID } from "../targeting/targetProfiles.js";
import { logDebugEvent } from "../debug/debugLogStore.js";
import { setupCombatSessionController } from "../session/combatSessionController.js";
import { setupQuickbarController } from "../abilities/quickbarController.js";
import { mapCombatRuntimeToSession } from "../session/combatSessionMapper.js";
import { sessionAttackGate, sessionReloadGate, expectedVersionOf } from "../session/combatSessionPolicy.js";

// Phase 4.1A: perform_attack error codes specific to an armed attack
// technique (migration 100) — used only to classify a Debug Console event,
// never to change attack gating (the server is the sole authority there).
const ARMED_TECHNIQUE_ERROR_CODES = new Set([
  "ARMED_ACTION_INVALID",
  "ARMED_ACTION_ON_COOLDOWN",
  "NOT_ENOUGH_PSI",
  "NOT_ENOUGH_CHARGES",
  "WEAPON_REQUIREMENT_NOT_MET",
  "TARGET_REQUIREMENT_NOT_MET",
  "ACTION_STACK_CONFLICT",
  "ACTION_EFFECT_NOT_IMPLEMENTED",
]);
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
  // Phase 3D.1: controller-local, session-scoped "last weapon per character"
  // memory — see selectedWeaponMemory.js for why this exists (Token A → B → A
  // must restore A's own weapon, not fall back to armory's first weapon).
  const selectedWeaponMemory = createSelectedWeaponMemory();
  // Phase 4.1A: per-character "armed attack technique" memory — same lifecycle
  // as selectedWeaponMemory (ephemeral, session-scoped, never persisted). See
  // armedTechniqueMemory.js for the max-1-until-stackGroup rule.
  const armedTechniqueMemory = createArmedTechniqueMemory();
  // Phase 3D.1: the real (server-result-only) local Combat Log — newest first,
  // capped, never persisted. Deliberately OUTSIDE `ephemeral` (not reset per
  // character) — it's a running session history, not per-character state.
  let combatLog = [];
  function pushLog(entry) { combatLog = appendCombatLogEntry(combatLog, entry); }
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
  // ephemeral.debugEnabled gates the reload/fireMode/basicAttack debug sub-objects
  // in selectionState.js (an unrelated diagnostics feature) — kept independent of
  // the Debug Console, which is always enabled via startDebugConsole().
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

    // Phase 3E.0: live combat-session layer. The session controller owns ALL
    // session fetching/commands; this controller only keeps the latest raw
    // runtime so buildBroadcastPayload can map it (via the single shared
    // mapper) into snapshot.combatSession on every publish.
    let sessionRuntime = null;
    const sessionController = configured
      ? setupCombatSessionController({
          context,
          settings,
          getViewer: () => viewer,
          onSessionRuntime: (runtime) => {
            sessionRuntime = runtime;
            if (lastState) publishState(lastState);
          },
        })
      : null;
    if (sessionController) cleanups.push(() => sessionController.cleanup());

    // Phase 4.0b: abilities/quickbar layer. The quickbar controller owns the
    // per-character quick-actions runtime (library + persisted layout); this
    // controller only keeps the latest SAFE mapped runtime so buildBroadcastPayload
    // folds it into snapshot.quickbar for the Skills block. The editor iframe gets
    // the same runtime via the controller's own BC_HUD_ABILITIES broadcast.
    let abilitiesRuntime = null;
    const quickbarController = configured
      ? setupQuickbarController({
          settings,
          getViewer: () => viewer,
          getSelectedCharacterId: () => ephemeral.characterId ?? null,
          onRuntime: (runtime) => {
            abilitiesRuntime = runtime;
            if (lastState) publishState(lastState);
          },
        })
      : null;
    if (quickbarController) cleanups.push(() => quickbarController.cleanup());

    /** Latest mapped session for the currently selected character — used only
     *  for the client-side pre-gates + request payload context; the server
     *  re-checks everything. */
    function currentMappedSession() {
      return mapCombatRuntimeToSession(sessionRuntime, {
        viewerPlayerId: viewer?.playerId ?? null,
        viewerIsGm: String(viewer?.role ?? "").toUpperCase() === "GM",
        selectedCharacterId: ephemeral.characterId,
      });
    }

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

    /** @returns {boolean} true when the character actually changed (and the reset ran) */
    function resetEphemeralForCharacter(characterId) {
      if (ephemeral.characterId === characterId) return false;
      ephemeral.characterId = characterId ?? null;
      // selectedWeaponId is NOT force-reset to null here — restoreSelectedWeapon()
      // (called right after this, once the fresh armory is known) sets it from
      // selectedWeaponMemory for the NEW character, or null if none/invalid.
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
      // Phase 4.0b: load the new character's quickbar runtime. Cleared first so
      // the Skills block doesn't briefly show the previous character's quickbar.
      abilitiesRuntime = null;
      if (quickbarController) quickbarController.onSelectionChanged(characterId ?? null);
      return true;
    }

    /** Restore this character's own remembered weapon (Token A → B → A), or
     *  fall back safely (and forget the stale entry) if it's no longer a
     *  valid weapon on their CURRENT armory. Never touches server state. */
    function restoreSelectedWeapon(characterId, bundle) {
      if (!characterId) return;
      const armory = bundle?.armory ?? bundle?.sections?.armory ?? null;
      const stored = selectedWeaponMemory.get(characterId);
      const valid = resolveStoredWeaponId(stored, armory?.weapons);
      if (valid) {
        ephemeral.selectedWeaponId = valid;
      } else if (stored) {
        selectedWeaponMemory.forget(characterId); // removed/unavailable — safe fallback below
      }
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
        combatLog,
        sessionRuntime,
        abilitiesRuntime,
        armedActionId: armedTechniqueMemory.get(ephemeral.characterId),
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
        // COLOR-ONLY body-zone condition map (svgPartId -> ZONE_STATES value)
        // for the Target Block silhouette — see targetBodyZones.buildTargetZonesMap.
        zonesMap: target?.zonesMap && typeof target.zonesMap === "object" ? target.zonesMap : {},
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
          logDebugEvent("fire-mode", "selector-toggled", { open: ephemeral.fireModeSelectorOpen });
          if (lastState) publishState(lastState);
          return;
        }
        if (fmType === "close-selector") {
          ephemeral.fireModeSelectorOpen = false;
          logDebugEvent("fire-mode", "selector-closed", {});
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
          logDebugEvent("fire-mode", "selected", { weaponId, fireModeId });
          if (!weaponId || !profileId || !fireModeId) {
            ephemeral.commandStatus = { type: "error", message: "Fire mode switch unavailable: missing weapon, profile, or mode." };
            ephemeral.fireModeRpcResult = { ok: false, error: "MISSING_FIELDS", message: "weaponId/profileId/fireModeId missing before RPC call." };
            logDebugEvent("fire-mode", "result", { error: "MISSING_FIELDS" }, false);
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
            pushLog(buildFireModeLogEntry({ sourceCharacterId: ephemeral.characterId, ok: true, message: "Fire mode changed." }));
            logDebugEvent("fire-mode", "result", { weaponId, fireModeId }, true);
            await refetchCurrent();
          } catch (error) {
            // switch_weapon_fire_mode RAISEs an exception (not {ok:false}) on
            // an invalid weapon or a mode not allowed for the active profile —
            // the real server message must reach the player, never a silent
            // local "success".
            const normalized = normalizeFireModeRpcResult(error);
            ephemeral.fireModeRpcResult = normalized;
            ephemeral.commandStatus = { type: "error", message: normalized.message || "Fire mode switch failed." };
            pushLog(buildFireModeLogEntry({ sourceCharacterId: ephemeral.characterId, ok: false, message: normalized.message }));
            logDebugEvent("fire-mode", "result", { weaponId, fireModeId, error: normalized.error, message: normalized.message }, false);
            if (lastState) publishState(lastState);
          }
          return;
        }
        return; // unknown fire-mode command → ignore, never falls through below
      }

      // Phase 4.1A: arm/disarm an attack technique from the Skills Block
      // (occupied attack_technique slot) or Combat Control's ARMED × button —
      // both funnel into the SAME toggle so max-1-armed and replace-on-arm
      // are enforced in exactly one place (armedTechniqueMemory.js). Pure
      // local ephemeral UI state — no server round-trip, no cost spent here;
      // the server re-validates everything at Attack time.
      if (command?.scope === "combat-hud" && command?.feature === "quickbar" && command?.type === "toggle-armed") {
        const actionId = String(command.characterActionId ?? "").trim() || null;
        if (actionId && ephemeral.characterId) {
          const { armedId, previousId } = armedTechniqueMemory.toggle(ephemeral.characterId, actionId);
          const eventType = armedId == null
            ? "attack-technique-disarmed"
            : (previousId ? "attack-technique-replaced" : "attack-technique-armed");
          logDebugEvent("abilities", eventType, {
            characterActionId: actionId,
            previousCharacterActionId: previousId ?? null,
          });
          if (lastState) publishState(lastState);
        }
        return;
      }

      // Basic Weapon Attack v1: same namespaced-scope routing pattern as
      // fire-mode above — cannot collide with weapon/magazine/reload/target/
      // skill/arrange commands regardless of `type` string reuse.
      if (command?.scope === "combat-hud" && command?.feature === "basic-attack") {
        const baType = String(command.type ?? "");
        if (baType !== "execute") return; // unknown → ignore
        logDebugEvent("attack", "requested", {});

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
          logDebugEvent("attack", "blocked", { reason: evalResult.uiBlockReason }, false);
          if (lastState) publishState(lastState);
          return;
        }

        // Phase 3E.0: client-side session pre-gate (UX mirror only — the
        // server re-checks turn/MAIN inside perform_attack regardless). A
        // blocked attack never reaches the RPC and never spends anything.
        const sessionAtRequest = currentMappedSession();
        const sessionGate = sessionAttackGate(sessionAtRequest);
        if (sessionGate.blocked) {
          ephemeral.commandStatus = { type: "error", message: sessionGate.reason };
          ephemeral.basicAttackResult = { ok: false, error: "SESSION_GATE", message: sessionGate.reason };
          logDebugEvent("attack", "session-gate-blocked", { reason: sessionGate.reason, sessionId: sessionAtRequest.id, round: sessionAtRequest.roundNumber }, false);
          if (lastState) publishState(lastState);
          return;
        }

        // Snapshot the source/weapon/target this request is FOR. If any of
        // them changed by the time the RPC resolves, the result must not be
        // applied to the (now different) HUD state — see the staleness check
        // below.
        const requestCtx = { sourceCharacterId: evalCtx.sourceCharacterId, weaponId: evalCtx.weaponId, targetCharacterId: evalCtx.targetCharacterId };
        const bodyZoneLabel = getZoneLabel(DEFAULT_PROFILE_ID, evalCtx.bodyZoneId) || evalCtx.bodyZoneId;
        // Phase 4.1A: whichever technique is armed for THIS attacker at
        // request time travels with the request — a later re-arm/disarm while
        // the RPC is in flight must not retroactively change what this
        // specific attack asked for.
        const requestArmedActionId = armedTechniqueMemory.get(evalCtx.sourceCharacterId);
        const ctx = buildBasicAttackCtx({
          sourceCharacterId: evalCtx.sourceCharacterId,
          weaponId: evalCtx.weaponId,
          targetCharacterId: evalCtx.targetCharacterId,
          bodyPartId: evalCtx.resolvedBodyPartId,
          distance: targeting.distance ?? 0,
          // Active session → carry the authoritative session context so the
          // server can optimistic-concurrency-check it. (The server gate does
          // NOT trust these fields — it derives participation itself.)
          roomContext: sessionAtRequest.exists
            ? { encounterId: sessionAtRequest.id ?? undefined }
            : {},
          expectedEncounterVersion: expectedVersionOf(sessionAtRequest),
          armedActionIds: requestArmedActionId ? [requestArmedActionId] : [],
        });

        ephemeral.basicAttackInFlight = true;
        logDebugEvent("attack", "payload-prepared", { weaponId: ctx.weaponId, targetCharacterId: ctx.targetCharacterId, bodyZone: evalCtx.bodyZoneId });
        if (requestArmedActionId) {
          logDebugEvent("abilities", "attack-modifier-validation-requested", { characterActionId: requestArmedActionId });
        }
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
        // Logged regardless of staleness — a stale result is still a REAL
        // thing that happened, attributed to the request it actually
        // belongs to (requestCtx), never to whatever is currently selected.
        pushLog(buildAttackLogEntry({
          sourceCharacterId: requestCtx.sourceCharacterId,
          targetCharacterId: requestCtx.targetCharacterId,
          bodyZoneLabel,
          outcome,
        }));
        logDebugEvent("attack", "result", { ok: outcome.ok, error: outcome.code ?? null, stale }, outcome.ok);
        // Full authoritative roll trace (Debug Console detail area / Copy
        // event). ONLY for a genuinely resolved attack — an { ok:false }
        // denial or an exception must never produce a fake roll-resolution
        // entry (the failure is already recorded by the `result` event above).
        if (outcome.ok) {
          logDebugEvent(
            "attack",
            "roll-resolution",
            buildRollResolutionDetails(buildAttackResolutionTrace(outcome)),
            true,
          );
        }
        // Phase 3E.0: server-confirmed session cost (MAIN spent on hit AND
        // miss identically) — logged from the server's own summary, then the
        // authoritative session state is re-read (never mutated locally).
        const sessionCost = outcome.raw?.combat_session ?? null;
        if (sessionCost && typeof sessionCost === "object") {
          logDebugEvent("attack", "action-cost-consumed", {
            sessionId: sessionCost.encounter_id ?? null,
            round: sessionCost.round ?? null,
            participant: sessionCost.participant_entry_id ?? null,
            versionBefore: sessionCost.state_version_before ?? null,
            versionAfter: sessionCost.state_version_after ?? null,
            mainAfter: sessionCost.main_available_after ?? null,
            moveAfter: sessionCost.move_available_after ?? null,
            usedReaction: sessionCost.used_reaction ?? null,
          });
        }
        if (outcome.code === "STATE_VERSION_CONFLICT") {
          logDebugEvent("session", "stale-version", { command: "attack" }, true);
        }
        if ((sessionCost || outcome.code === "STATE_VERSION_CONFLICT") && sessionController) {
          void sessionController.refresh();
        }

        if (stale) {
          // Source/weapon/target changed mid-flight: never apply this result
          // to the new HUD state (no toast, no target/zone reset, no refresh
          // tied to the OLD context) — just stop showing "resolving".
          if (lastState) publishState(lastState);
          return;
        }

        // Phase 4.1A: what happened to the armed technique for THIS request —
        // applied (consumed; clear it so it doesn't look armed for the NEXT
        // attack), rejected pre-attack or post-roll (left armed on purpose —
        // "ARMED очищается только по server confirmation", never by a bare
        // click on Attack), or nothing (no technique was armed here).
        if (requestArmedActionId) {
          const preRollValidated = outcome.ok || !ARMED_TECHNIQUE_ERROR_CODES.has(outcome.code);
          logDebugEvent("abilities", "attack-modifier-validation-result", {
            characterActionId: requestArmedActionId,
            validated: preRollValidated,
          }, preRollValidated);
          if (outcome.ok) {
            const armedActions = Array.isArray(outcome.raw?.armed_actions) ? outcome.raw.armed_actions : [];
            for (const entry of armedActions) {
              const actionId = entry?.characterActionId ?? requestArmedActionId;
              if (entry?.applied === true) {
                armedTechniqueMemory.forget(requestCtx.sourceCharacterId);
                logDebugEvent("abilities", "attack-modifiers-applied", { characterActionId: actionId, name: entry.name ?? null }, true);
                logDebugEvent("abilities", "attack-technique-cost-consumed", { characterActionId: actionId, costsConsumed: entry.costsConsumed ?? null }, true);
                if (entry.cooldownBefore !== entry.cooldownAfter) {
                  logDebugEvent("abilities", "attack-technique-cooldown-updated", {
                    characterActionId: actionId,
                    cooldownBefore: entry.cooldownBefore ?? null,
                    cooldownAfter: entry.cooldownAfter ?? null,
                  }, true);
                }
              } else {
                logDebugEvent("abilities", "attack-modifier-rejected", { characterActionId: actionId, reason: entry?.reason ?? null }, false);
              }
            }
          } else if (ARMED_TECHNIQUE_ERROR_CODES.has(outcome.code)) {
            logDebugEvent("abilities", "attack-modifier-rejected", { characterActionId: requestArmedActionId, reason: outcome.code }, false);
          }
        }

        if (outcome.ok) {
          ephemeral.commandStatus = { type: "ok", message: "Attack resolved." };
          // Phase 3D.1: the selected target + body zone are NOT reset after a
          // successful attack — the player must be able to re-attack the same
          // target without re-picking it. Target/zone are only ever cleared by
          // explicit Cancel/Escape/clear, a source-character change, or the
          // target token/link disappearing (all owned by the targeting
          // controller itself). Only a best-effort, NON-clearing refresh of the
          // target's own (safe, combat-only) body-zone condition is requested,
          // so its silhouette colors reflect the damage this attack just did.
          try { OBR.broadcast.sendMessage(BC_HUD_TARGETING_COMMAND, { type: "refreshBodyZones" }, { destination: "LOCAL" }); } catch (_e) { /* best-effort */ }
          // Authoritative refresh of THIS source's armory/inventory/runtime —
          // never the target's private bundle.
          await refetchCurrent();
          logDebugEvent("refresh", "source-refresh-result", { reason: "attack-success" }, true);
        } else {
          ephemeral.commandStatus = { type: "error", message: outcome.error || "Attack failed." };
          // Target/body zone are intentionally left untouched on failure. A
          // denial can stem from stale local state (e.g. a weapon lock that
          // changed elsewhere), so refresh the SOURCE's own state — this never
          // touches target/zone selection either.
          await refetchCurrent();
          logDebugEvent("refresh", "source-refresh-result", { reason: "attack-failure" }, true);
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
        logDebugEvent("weapon", "selected", { weaponId: String(command.weaponId ?? "").trim() || null });
        ephemeral.selectedWeaponId = String(command.weaponId ?? "").trim() || null;
        selectedWeaponMemory.set(ephemeral.characterId, ephemeral.selectedWeaponId);
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
        logDebugEvent("weapon", "selector-toggled", { open: ephemeral.weaponSelectorOpen });
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
        logDebugEvent("magazine", "selected", { magazineId: ephemeral.selectedReloadMagazineId });
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
        logDebugEvent("magazine", "reload-requested", { weaponId, magazineId });

        // Phase 3E.0: client-side MOVE pre-gate (UX mirror — the server
        // re-checks turn/MOVE inside load_weapon_profile_magazine anyway).
        const reloadSession = currentMappedSession();
        const reloadGate = sessionReloadGate(reloadSession);
        if (reloadGate.blocked) {
          ephemeral.commandStatus = { type: "error", message: reloadGate.reason };
          ephemeral.reloadRpcResult = { ok: false, error: "SESSION_GATE", message: reloadGate.reason };
          logDebugEvent("reload", "session-gate-blocked", { reason: reloadGate.reason, sessionId: reloadSession.id, round: reloadSession.roundNumber }, false);
          if (lastState) publishState(lastState);
          return;
        }

        if (!weaponId || !magazineId || !profileId) {
          ephemeral.commandStatus = { type: "error", message: "Reload unavailable: missing weapon profile or magazine." };
          ephemeral.reloadRpcResult = { ok: false, error: "MISSING_FIELDS", message: "weaponId/profileId/magazineId missing before RPC call." };
          pushLog(buildReloadLogEntry({ sourceCharacterId: ephemeral.characterId, ok: false, message: ephemeral.commandStatus.message }));
          logDebugEvent("magazine", "reload-result", { error: "MISSING_FIELDS" }, false);
          if (lastState) publishState(lastState);
          return;
        }
        try {
          const expectedVersion = expectedVersionOf(reloadSession);
          const result = await loadWeaponProfileMagazine(
            {
              character_weapon_id: weaponId,
              profile_id: profileId,
              character_magazine_id: magazineId,
              ...(expectedVersion != null ? { expected_encounter_version: expectedVersion } : {}),
            },
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
            pushLog(buildReloadLogEntry({ sourceCharacterId: ephemeral.characterId, ok: true, message: "Reloaded." }));
            logDebugEvent("magazine", "reload-result", { weaponId, magazineId }, true);
            // Phase 3E.0: server-confirmed MOVE cost — only a successful swap
            // spends it; re-read the authoritative session state afterwards.
            const reloadCost = result?.combat_session ?? null;
            if (reloadCost && typeof reloadCost === "object") {
              logDebugEvent("reload", "action-cost-consumed", {
                sessionId: reloadCost.encounter_id ?? null,
                round: reloadCost.round ?? null,
                participant: reloadCost.participant_entry_id ?? null,
                versionBefore: reloadCost.state_version_before ?? null,
                versionAfter: reloadCost.state_version_after ?? null,
                mainAfter: reloadCost.main_available_after ?? null,
                moveAfter: reloadCost.move_available_after ?? null,
              });
              if (sessionController) void sessionController.refresh();
            }
            await refetchCurrent();
          } else {
            ephemeral.commandStatus = { type: "error", message: normalized.message || normalized.error || "Reload failed." };
            pushLog(buildReloadLogEntry({ sourceCharacterId: ephemeral.characterId, ok: false, message: ephemeral.commandStatus.message }));
            logDebugEvent("magazine", "reload-result", { weaponId, magazineId, error: normalized.error }, false);
            if (normalized.error === "STATE_VERSION_CONFLICT") {
              logDebugEvent("session", "stale-version", { command: "reload" }, true);
              if (sessionController) void sessionController.refresh();
            }
            if (lastState) publishState(lastState);
          }
        } catch (error) {
          ephemeral.reloadRpcResult = { ok: false, error: "RPC_EXCEPTION", message: String(error?.message ?? error ?? "Reload failed.") };
          ephemeral.commandStatus = { type: "error", message: String(error?.message ?? error ?? "Reload failed.") };
          pushLog(buildReloadLogEntry({ sourceCharacterId: ephemeral.characterId, ok: false, message: ephemeral.commandStatus.message }));
          logDebugEvent("magazine", "reload-result", { error: "RPC_EXCEPTION", message: ephemeral.commandStatus.message }, false);
          if (lastState) publishState(lastState);
        }
      }
    }

    async function resolveAndPublish(selectionIds) {
      if (shouldDeferSelection()) return;
      currentSelectionIds = Array.isArray(selectionIds) ? selectionIds.slice() : [];
      logDebugEvent("selection", "source-token-selected", { tokenIds: currentSelectionIds });
      const { stale, state } = await adapter.resolveLatest(selectionIds);
      if (disposed || stale) return; // only the freshest selection updates the HUD
      if (state.status !== "ready") {
        const unavailableReason = state.error?.code ?? state.access?.reason ?? null;
        if (state.status !== "no-selection" && unavailableReason !== "NO_TOKEN_SELECTED") {
          logDebugEvent("selection", "source-character-unavailable", { status: state.status ?? null, reason: unavailableReason }, false);
        }
        resetEphemeralForCharacter(null);
      } else {
        const changed = resetEphemeralForCharacter(state.characterId ?? null);
        if (changed) restoreSelectedWeapon(state.characterId ?? null, state.runtimeBundle);
      }
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
      void handleCommand(event?.data).catch((error) => {
        logDebugEvent("routing", "unexpected-exception", {
          type: String(event?.data?.type ?? ""),
          feature: event?.data?.feature ?? null,
          message: String(error?.message ?? error ?? "unknown error"),
        }, false);
      });
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
