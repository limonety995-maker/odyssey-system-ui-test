// Combat HUD — Phase 3E.0 combat-session controller (background, OBR-bound).
//
// Owns ALL live session state for the HUD: fetches the authoritative combat
// runtime, routes session commands (End Turn / GM start / skip / force-next /
// end combat), and keeps everyone informed:
//   - the scene-selection controller receives the raw runtime via
//     onSessionRuntime() and merges the mapped session into the broadcast
//     payload (hud/session/combatSessionMapper.js is the single mapper);
//   - the GM tracker iframe receives a pre-mapped safe session + start
//     candidates on BC_HUD_SESSION (replayed on BC_HUD_SESSION_REQUEST).
//
// Session state is deliberately NOT smeared across Gun/Player/Action — those
// read `snapshot.combatSession` from the normal selection broadcast.
//
// Every mutation is single-flight (a second End Turn while one is in flight
// is a no-op, not a queued repeat) and optimistic-concurrency-checked by the
// server (expected_encounter_version); this controller never mutates
// MAIN/MOVE locally — it only ever re-reads the authoritative runtime.

import OBR from "@owlbear-rodeo/sdk";
import { logDebugEvent } from "../debug/debugLogStore.js";
import { BC_HUD_COMMAND, BC_HUD_SESSION, BC_HUD_SESSION_REQUEST } from "../overlay/overlayConstants.js";
import { mapCombatRuntimeToSession } from "./combatSessionMapper.js";
import { buildStartCandidates, canSeeGmTracker } from "./combatSessionPolicy.js";
import { normalizeTacticalGridSettings } from "../../movement/gridMath.js";
import { syncCombatScenePositions } from "../../movement/tacticalSync.js";
import {
  getActiveRuntime as getActiveCombatRuntime,
  syncPositionsFromOwlbear,
} from "../../api/combatApi.js";
import {
  fetchActiveSessionRuntime,
  fetchSceneLinkCandidates,
  startSession,
  endSessionTurn,
  gmSkipTurn,
  gmForceNextTurn,
  endSession,
} from "./combatSessionApi.js";

export function setupCombatSessionController({ context, settings, getViewer, onSessionRuntime }) {
  let disposed = false;
  let lastRuntime = null;
  let lastCandidates = [];
  let mutationInFlight = false;
  let prevActiveEntryId = null;
  let prevSessionId = null;
  /** @type {Array<() => void>} */
  const cleanups = [];

  const viewer = () => (typeof getViewer === "function" ? getViewer() : {}) ?? {};
  const isGm = () => String(viewer()?.role ?? "").toUpperCase() === "GM";

  function encounterOf(runtime) {
    return runtime?.encounter && typeof runtime.encounter === "object" ? runtime.encounter : null;
  }

  function broadcastSessionState() {
    try {
      OBR.broadcast.sendMessage(
        BC_HUD_SESSION,
        {
          session: mapCombatRuntimeToSession(lastRuntime, { viewerIsGm: isGm(), viewerPlayerId: viewer()?.playerId ?? null }),
          candidates: lastCandidates,
        },
        { destination: "LOCAL" },
      );
    } catch (_e) { /* ignore */ }
  }

  function applyRuntime(runtime, { origin }) {
    const next = runtime && typeof runtime === "object" ? runtime : null;
    const nextEncounter = encounterOf(next);
    const nextSessionId = nextEncounter?.status === "active" ? nextEncounter.id ?? null : null;
    const nextEntryId = nextEncounter?.active_entry_id ?? null;

    if (prevSessionId && !nextSessionId) {
      logDebugEvent("session", "ended", { sessionId: prevSessionId, origin });
    }
    if (nextSessionId && nextEntryId && nextEntryId !== prevActiveEntryId) {
      logDebugEvent("session", "turn-started", {
        sessionId: nextSessionId,
        round: nextEncounter?.current_round ?? null,
        characterId: nextEncounter?.active_character_id ?? null,
        version: nextEncounter?.state_version ?? null,
      });
    }
    prevSessionId = nextSessionId;
    prevActiveEntryId = nextEntryId;

    lastRuntime = next;
    if (typeof onSessionRuntime === "function") {
      try { onSessionRuntime(lastRuntime); } catch (_e) { /* consumer owns its errors */ }
    }
    broadcastSessionState();
  }

  function hasReadyTacticalRuntime(runtime) {
    if (!normalizeTacticalGridSettings(runtime?.tactical_grid)) {
      return false;
    }
    const participants = Array.isArray(runtime?.visible_participants) ? runtime.visible_participants : [];
    for (const participant of participants) {
      const tokenId = String(participant?.token_id ?? "").trim();
      if (!tokenId) continue;
      const position = participant?.position ?? null;
      if (!position || typeof position !== "object") return false;
      if (
        !Number.isFinite(Number(position.scene_x))
        || !Number.isFinite(Number(position.scene_y))
        || !Number.isFinite(Number(position.cell_q))
        || !Number.isFinite(Number(position.cell_r))
      ) {
        return false;
      }
    }
    return true;
  }

  async function ensureTacticalRuntime(origin = "tactical-runtime") {
    if (!isGm()) return lastRuntime;
    if (!lastRuntime?.encounter?.id || hasReadyTacticalRuntime(lastRuntime)) {
      return lastRuntime;
    }

    try {
      logDebugEvent("session", "tactical-sync-started", {
        origin,
        sessionId: lastRuntime?.encounter?.id ?? null,
      });

      const syncResult = await syncCombatScenePositions({
        combatApi: {
          getActiveRuntime: getActiveCombatRuntime,
          syncPositionsFromOwlbear,
        },
        settings,
        runtimeResponse: lastRuntime,
      });

      const runtime = syncResult?.result?.runtime
        ?? await fetchActiveSessionRuntime({ context, viewer: viewer(), settings });

      if (runtime) {
        applyRuntime(runtime, { origin: `${origin}-tactical-sync` });
      }

      logDebugEvent("session", "tactical-sync-result", {
        origin,
        ok: !!runtime?.encounter?.id,
        gridReady: hasReadyTacticalRuntime(runtime),
      }, !!runtime?.encounter?.id);

      return runtime;
    } catch (error) {
      logDebugEvent("session", "tactical-sync-result", {
        origin,
        ok: false,
        message: String(error?.message ?? error),
      }, false);
      return lastRuntime;
    }
  }

  async function refresh(origin = "refresh") {
    try {
      const runtime = await fetchActiveSessionRuntime({ context, viewer: viewer(), settings });
      if (disposed) return;
      logDebugEvent("session", "refresh-result", { ok: runtime?.ok !== false, origin }, runtime?.ok !== false);
      applyRuntime(runtime, { origin });
      if (isGm() && encounterOf(runtime)?.status === "active" && !hasReadyTacticalRuntime(runtime)) {
        await ensureTacticalRuntime(`${origin}-recovery`);
      }
    } catch (error) {
      if (disposed) return;
      logDebugEvent("session", "refresh-result", { origin, message: String(error?.message ?? error) }, false);
    }
  }

  function currentSessionRef() {
    const encounter = encounterOf(lastRuntime);
    if (!encounter || encounter.status !== "active") return null;
    return { sessionId: encounter.id, expectedVersion: encounter.state_version ?? null };
  }

  /** Shared mutation runner: single-flight, stale-version detection, and an
   *  authoritative runtime re-read on every outcome. */
  async function runMutation(kind, call, extraDetails = {}) {
    if (mutationInFlight) return; // e.g. End Turn double-click → single request
    mutationInFlight = true;
    try {
      const result = await call();
      const ok = result?.ok !== false;
      if (result?.error === "STATE_VERSION_CONFLICT") {
        logDebugEvent("session", "stale-version", { command: kind, serverVersion: result?.encounter_state_version ?? null }, false);
      }
      logDebugEvent("session", kind, { ok, error: ok ? null : result?.error ?? null, ...extraDetails }, ok);
      if (ok && result && typeof result === "object" && result.encounter !== undefined) {
        applyRuntime(result, { origin: kind }); // mutation RPCs return the fresh runtime
        if (result?.partial_refresh_required === true) {
          void refresh(`${kind}-post`);
        }
      } else {
        await refresh(kind);
      }
    } catch (error) {
      logDebugEvent("session", kind, { ok: false, message: String(error?.message ?? error), ...extraDetails }, false);
      await refresh(kind);
    } finally {
      mutationInFlight = false;
    }
  }

  async function handleCommand(data) {
    const type = String(data?.type ?? "");

    if (type === "refresh") { await refresh("command"); return; }

    if (type === "load-start-candidates") {
      if (!canSeeGmTracker(viewer()?.role)) return;
      try {
        const links = await fetchSceneLinkCandidates({ context, viewer: viewer(), settings });
        lastCandidates = buildStartCandidates(links?.links ?? links?.rows ?? (Array.isArray(links) ? links : []));
      } catch (_e) {
        lastCandidates = [];
      }
      broadcastSessionState();
      return;
    }

    if (type === "end-turn") {
      const ref = currentSessionRef();
      if (!ref) return;
      await runMutation("turn-ended", () => endSessionTurn({ context, viewer: viewer(), settings, ...ref }), { sessionId: ref.sessionId });
      return;
    }

    if (type === "gm-skip-turn" || type === "gm-force-next") {
      if (!isGm()) return;
      const ref = currentSessionRef();
      if (!ref) return;
      const kind = type === "gm-skip-turn" ? "turn-skipped" : "turn-forced-next";
      const call = type === "gm-skip-turn"
        ? () => gmSkipTurn({ context, viewer: viewer(), settings, ...ref })
        : () => gmForceNextTurn({ context, viewer: viewer(), settings, ...ref });
      await runMutation(kind, call, { sessionId: ref.sessionId });
      return;
    }

    if (type === "gm-start") {
      if (!isGm()) return;
      const excluded = Array.isArray(data?.excludedCharacterIds) ? data.excludedCharacterIds : [];
      logDebugEvent("session", "start-requested", { excludedCount: excluded.length });
      await runMutation(
        "start-result",
        () => startSession({ context, viewer: viewer(), settings, excludedCharacterIds: excluded }),
      );
      await ensureTacticalRuntime("start-result");
      const session = mapCombatRuntimeToSession(lastRuntime, { viewerIsGm: true });
      if (session.exists) {
        logDebugEvent("session", "initiative-calculated", {
          sessionId: session.id,
          participantCount: session.participants.length,
          order: session.participants
            .slice()
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((p) => `${p.displayName}:${p.initiativeTotal}`)
            .join(", "),
        });
      }
      return;
    }

    if (type === "gm-end") {
      if (!isGm()) return;
      const ref = currentSessionRef();
      if (!ref) return;
      await runMutation("ended", () => endSession({ context, viewer: viewer(), settings, ...ref }), { sessionId: ref.sessionId });
      return;
    }
  }

  try {
    cleanups.push(OBR.broadcast.onMessage(BC_HUD_COMMAND, (event) => {
      const data = event?.data ?? {};
      if (data?.scope !== "combat-hud" || data?.feature !== "combat-session") return;
      void handleCommand(data).catch((error) => {
        logDebugEvent("session", "command-exception", { type: String(data?.type ?? ""), message: String(error?.message ?? error) }, false);
      });
    }));
    cleanups.push(OBR.broadcast.onMessage(BC_HUD_SESSION_REQUEST, () => broadcastSessionState()));
  } catch (_e) { /* standalone/no OBR */ }

  void refresh("startup");

  return {
    refresh: () => refresh("external"),
    getSessionRuntime: () => lastRuntime,
    cleanup() {
      disposed = true;
      for (const fn of cleanups.splice(0)) { try { fn(); } catch (_e) { /* ignore */ } }
    },
  };
}
