import { getPlayerInfo, getRoomSceneContext, waitForObrReady } from "./bridge/obrBridge.js";
import { hasSupabaseSettings, loadRoomSupabaseSettings } from "./bridge/settingsBridge.js";
import { setupCombatHudOverlay } from "./hud/overlay/combatHudOverlayController.js";
import { createOdysseyRuntime } from "./runtime/createRuntime.js";
import { setupTacticalMoveTool } from "./movement/moveToolController.js";
import { addDiagnosticEntry } from "./utils/diagnostics.js";
// TEMPORARY, fully-isolated diagnostics popover — see hud/debug/*. Delete this
// import + the startDebugConsole() call below (plus the hud/debug/ folder) to
// remove it entirely; nothing else in the app depends on it.
import { startDebugConsole } from "./hud/debug/debugConsoleController.js";

async function bootstrapBackgroundShell() {
  const runtime = createOdysseyRuntime();
  setupCombatHudOverlay();
  setupTacticalMoveTool({ runtime });
  startDebugConsole();
  await waitForObrReady();
  const [player, roomContext, settings] = await Promise.all([
    getPlayerInfo(),
    getRoomSceneContext(),
    loadRoomSupabaseSettings(),
  ]);

  globalThis.OdysseyBackgroundBridge = {
    runtime,
    player,
    roomContext,
    settings,
    supabaseConfigured: hasSupabaseSettings(settings),
  };

  addDiagnosticEntry(
    "info",
    "Background shell ready",
    `role=${player.role || "PLAYER"} room=${roomContext.roomId || "unknown"}`,
  );
}

void bootstrapBackgroundShell().catch((error) => {
  addDiagnosticEntry(
    "error",
    "Background shell failed",
    String(error?.message ?? error),
  );
  throw error;
});
