// HUD Abilities — Phase 4.0: quickbar controller (background, OBR-bound).
//
// Owns the live abilities runtime for the currently-selected character: fetches
// the quick-actions library + persisted quickbar layout, routes quickbar
// commands (refresh / save-layout), and keeps the Skills module + quickbar
// editor iframe in sync via BC_HUD_ABILITIES (replayed on BC_HUD_ABILITIES_REQUEST).
//
// Mirrors the combat-session controller's shape exactly:
//   - single-flight mutations (a second Save while one is in flight is a no-op);
//   - the server owns the version (optimistic concurrency); this controller never
//     fabricates a layout version or mutates it locally — on every outcome it
//     re-reads the authoritative runtime;
//   - only SAFE, whitelisted data is broadcast (mapper strips everything else).
//
// Phase 4.0 is metadata-only: no ability is executed here. Save persists layout;
// Phase 4.1 adds execution.

import OBR from "@owlbear-rodeo/sdk";
import { logDebugEvent } from "../debug/debugLogStore.js";
import { BC_HUD_COMMAND, BC_HUD_ABILITIES, BC_HUD_ABILITIES_REQUEST } from "../overlay/overlayConstants.js";
import { mapQuickActionsRuntime } from "./abilityRuntimeMapper.js";
import { fetchQuickActionsRuntime, saveQuickbarLayout, buildSlotPayload } from "./abilityApi.js";

/** Short id for debug details — never the full uuid. */
function shortId(id) {
  const s = String(id ?? "");
  if (s.length <= 12) return s || null;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

export function setupQuickbarController({ settings, getViewer, getSelectedCharacterId }) {
  let disposed = false;
  let lastRuntime = null; // mapped runtime (safe shape)
  let lastCharacterId = null;
  let mutationInFlight = false;
  /** @type {Array<() => void>} */
  const cleanups = [];

  const viewer = () => (typeof getViewer === "function" ? getViewer() : {}) ?? {};
  const selectedCharacterId = () => (typeof getSelectedCharacterId === "function" ? getSelectedCharacterId() : null) ?? null;

  function broadcastAbilities() {
    try {
      OBR.broadcast.sendMessage(
        BC_HUD_ABILITIES,
        {
          characterId: lastCharacterId,
          runtime: lastRuntime, // already SAFE (mapper-whitelisted)
        },
        { destination: "LOCAL" },
      );
    } catch (_e) { /* ignore */ }
  }

  /** Fetch + map the abilities runtime for a character. Emits requested/loaded. */
  async function loadRuntime(characterId, origin) {
    const cid = String(characterId ?? "") || null;
    lastCharacterId = cid;
    if (!cid) {
      lastRuntime = null;
      broadcastAbilities();
      return null;
    }

    logDebugEvent("abilities", "runtime-requested", { character: shortId(cid), origin });
    try {
      const raw = await fetchQuickActionsRuntime(cid, settings);
      if (disposed) return null;
      const mapped = mapQuickActionsRuntime(raw);
      lastRuntime = mapped;
      logDebugEvent(
        "abilities",
        "runtime-loaded",
        {
          character: shortId(cid),
          actionCount: mapped.quickActions.length,
          slotCount: mapped.quickbar.slots.length,
          version: mapped.quickbar.version,
        },
        mapped.ok !== false,
      );
      broadcastAbilities();
      return mapped;
    } catch (error) {
      if (disposed) return null;
      lastRuntime = null;
      logDebugEvent("abilities", "runtime-loaded", { character: shortId(cid), message: String(error?.message ?? error) }, false);
      broadcastAbilities();
      return null;
    }
  }

  /** Called by the scene controller when the selected character changes. */
  function onSelectionChanged(characterId) {
    const cid = String(characterId ?? "") || null;
    if (cid === lastCharacterId) return;
    void loadRuntime(cid, "selection-changed");
  }

  async function handleSaveLayout(data) {
    if (mutationInFlight) return; // Save double-click → single request
    const cid = lastCharacterId ?? selectedCharacterId();
    if (!cid) return;

    const expectedVersion = Number.isFinite(Number(data?.expectedVersion)) ? Number(data.expectedVersion) : null;
    const slots = buildSlotPayload(Array.isArray(data?.slots) ? data.slots : []);

    mutationInFlight = true;
    logDebugEvent("quickbar", "save-requested", {
      character: shortId(cid),
      slotIndexes: slots.filter((s) => s.characterActionId).map((s) => s.slotIndex),
      versionBefore: expectedVersion,
    });

    try {
      const result = await saveQuickbarLayout(cid, expectedVersion, slots, settings);
      const ok = result?.ok !== false;

      if (result?.error === "QUICKBAR_VERSION_CONFLICT") {
        logDebugEvent("quickbar", "version-conflict", {
          character: shortId(cid),
          versionBefore: expectedVersion,
          serverVersion: result?.server_version ?? null,
        }, false);
        // Re-read authoritative layout so the editor can offer Reload.
        await loadRuntime(cid, "version-conflict");
        return;
      }

      logDebugEvent("quickbar", "save-result", {
        character: shortId(cid),
        ok,
        error: ok ? null : result?.error ?? null,
        versionAfter: result?.version ?? null,
      }, ok);

      // Server response is the source of truth → re-read the full runtime.
      await loadRuntime(cid, "post-save");
    } catch (error) {
      logDebugEvent("quickbar", "save-result", { character: shortId(cid), message: String(error?.message ?? error) }, false);
      await loadRuntime(cid, "post-save-error");
    } finally {
      mutationInFlight = false;
    }
  }

  async function handleCommand(data) {
    const type = String(data?.type ?? "");

    if (type === "refresh") {
      await loadRuntime(lastCharacterId ?? selectedCharacterId(), "command-refresh");
      logDebugEvent("quickbar", "layout-refreshed", { character: shortId(lastCharacterId) });
      return;
    }

    if (type === "editor-opened") {
      // UI signalled the editor mounted — replay current runtime + log it.
      logDebugEvent("quickbar", "editor-opened", { character: shortId(lastCharacterId) });
      broadcastAbilities();
      return;
    }

    if (type === "draft-changed") {
      // Lightweight UX telemetry only (no server call). Details are index-level.
      logDebugEvent("quickbar", "draft-changed", {
        character: shortId(lastCharacterId),
        occupiedSlots: Number(data?.occupiedSlots ?? 0),
      });
      return;
    }

    if (type === "save-layout") {
      await handleSaveLayout(data);
      return;
    }
  }

  try {
    cleanups.push(OBR.broadcast.onMessage(BC_HUD_COMMAND, (event) => {
      const data = event?.data ?? {};
      if (data?.scope !== "combat-hud" || data?.feature !== "quickbar") return;
      void handleCommand(data).catch((error) => {
        logDebugEvent("quickbar", "command-exception", { type: String(data?.type ?? ""), message: String(error?.message ?? error) }, false);
      });
    }));
    cleanups.push(OBR.broadcast.onMessage(BC_HUD_ABILITIES_REQUEST, () => {
      // A freshly-mounted editor/Skills iframe asks for the current runtime. If
      // the selection changed while it was mounting, load the right character.
      const cid = selectedCharacterId();
      if (cid && cid !== lastCharacterId) {
        void loadRuntime(cid, "request-resync");
      } else {
        broadcastAbilities();
      }
    }));
  } catch (_e) { /* standalone/no OBR */ }

  return {
    onSelectionChanged,
    refresh: () => loadRuntime(lastCharacterId ?? selectedCharacterId(), "external"),
    getRuntime: () => lastRuntime,
    cleanup() {
      disposed = true;
      for (const fn of cleanups.splice(0)) { try { fn(); } catch (_e) { /* ignore */ } }
    },
  };
}
