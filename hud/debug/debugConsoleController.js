// Odyssey Debug Console — background controller (TEMPORARY, fully isolated).
//
// This is NOT part of the real Combat HUD. It is a standalone diagnostics
// popover for live development, and it is designed to be deleted later by
// removing this whole hud/debug/ folder plus the two call sites in
// background.js (startDebugConsole/stopDebugConsole). It must never:
//   - touch HUD_MODULE_POPOVER_IDS, hudLayout.js, overlayConstants.js, or any
//     state owned by combatHudOverlayController.js;
//   - require ?debug=1 or any manifest/URL change;
//   - persist anything (no Supabase, no localStorage, no OBR metadata).
//
// It owns TWO popovers, both positioned top-right of the map, independent of
// the bottom-anchored main HUD:
//   - the Console itself (odyssey-hud-debug-console)
//   - a small floating launcher shown only while the Console is closed
//     (odyssey-hud-debug-launcher)
// Toggling between them never touches OBR.popover for any other id.

import OBR from "@owlbear-rodeo/sdk";
import { initDebugLog, getDebugLogEntries, clearDebugLog, subscribeDebugLog, logDebugEvent } from "./debugLogStore.js";
import { BC_DEBUG_CONSOLE_ENTRIES, BC_DEBUG_CONSOLE_REQUEST, BC_DEBUG_CONSOLE_COMMAND } from "./debugConsoleConstants.js";
import { DEBUG_CONSOLE_POPOVER_ID, DEBUG_LAUNCHER_POPOVER_ID, consoleRect, launcherRect } from "./debugConsoleLayout.js";

const DEBUG_CONSOLE_HTML = "debug-console.html";
const VIEWPORT_POLL_MS = 800;

let started = false;
let consoleOpen = true;
let lastVW = 0;
let lastVH = 0;
let pollTimer = null;
let unsubscribeLog = null;
/** @type {Array<() => void>} */
const cleanups = [];

function baseHref() {
  return typeof window !== "undefined" ? window.location.href : "";
}

function pageUrl(variant) {
  try {
    const url = new URL(DEBUG_CONSOLE_HTML, baseHref());
    url.searchParams.set("variant", variant);
    return url.toString();
  } catch {
    return `${DEBUG_CONSOLE_HTML}?variant=${variant}`;
  }
}

function paramsForRect(rect) {
  return {
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
    anchorReference: "POSITION",
    anchorPosition: { left: rect.left, top: rect.top },
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    hidePaper: true,
    disableClickAway: true,
    marginThreshold: 0,
  };
}

async function readViewport() {
  const [vw, vh] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  lastVW = vw; lastVH = vh;
}

async function openConsolePopover() {
  await OBR.popover.open({
    id: DEBUG_CONSOLE_POPOVER_ID,
    url: pageUrl("console"),
    ...paramsForRect(consoleRect(lastVW)),
  });
}

async function openLauncherPopover() {
  await OBR.popover.open({
    id: DEBUG_LAUNCHER_POPOVER_ID,
    url: pageUrl("launcher"),
    ...paramsForRect(launcherRect(lastVW)),
  });
}

async function closeConsolePopover() {
  try { await OBR.popover.close(DEBUG_CONSOLE_POPOVER_ID); } catch (_e) { /* ignore */ }
}

async function closeLauncherPopover() {
  try { await OBR.popover.close(DEBUG_LAUNCHER_POPOVER_ID); } catch (_e) { /* ignore */ }
}

/** Reflect `consoleOpen` by (re)opening exactly the right one of the two
 *  Debug Console popovers. Never touches any other popover id. */
async function applyConsoleState() {
  if (consoleOpen) {
    await closeLauncherPopover();
    await openConsolePopover();
  } else {
    await closeConsolePopover();
    await openLauncherPopover();
  }
}

function broadcastEntries() {
  try {
    OBR.broadcast.sendMessage(BC_DEBUG_CONSOLE_ENTRIES, { entries: getDebugLogEntries() }, { destination: "LOCAL" });
  } catch (_e) { /* ignore */ }
}

function startViewportPoll() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    try {
      const vw = await OBR.viewport.getWidth();
      const vh = await OBR.viewport.getHeight();
      if (vw === lastVW && vh === lastVH) return;
      lastVW = vw; lastVH = vh;
      await applyConsoleState(); // re-anchor top-right on resize
    } catch (_e) { /* transient; next tick retries */ }
  }, VIEWPORT_POLL_MS);
  cleanups.push(() => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } });
}

/** Start the temporary Debug Console. Idempotent. Always enables the shared
 *  debugLogStore (no ?debug=1 gate) and opens the Console popover. */
export function startDebugConsole() {
  if (started) return;
  if (typeof OBR === "undefined" || OBR.isAvailable === false) return;
  started = true;

  OBR.onReady(async () => {
    try {
      initDebugLog(true);
      logDebugEvent("hud", "initialized", {});
      await readViewport();
      consoleOpen = true;
      await applyConsoleState();
      startViewportPoll();

      unsubscribeLog = subscribeDebugLog(() => broadcastEntries());

      cleanups.push(OBR.broadcast.onMessage(BC_DEBUG_CONSOLE_REQUEST, () => broadcastEntries()));

      cleanups.push(OBR.broadcast.onMessage(BC_DEBUG_CONSOLE_COMMAND, async (event) => {
        const type = String(event?.data?.type ?? "");
        if (type === "close") {
          consoleOpen = false;
          logDebugEvent("hud", "popover-closed", { popover: "debug-console" });
          await applyConsoleState();
        } else if (type === "reopen") {
          consoleOpen = true;
          logDebugEvent("hud", "popover-opened", { popover: "debug-console" });
          await applyConsoleState();
        } else if (type === "clear") {
          clearDebugLog();
        }
      }));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[debugConsole] setup failed", error);
      started = false;
    }
  });
}

/** Stop the Debug Console and close both of its popovers. Exported for
 *  symmetry/testability — mirrors teardownCombatHudOverlay(), which is also
 *  never force-called from anywhere today. */
export async function stopDebugConsole() {
  for (const fn of cleanups.splice(0)) { try { fn(); } catch (_e) { /* ignore */ } }
  if (typeof unsubscribeLog === "function") { try { unsubscribeLog(); } catch (_e) { /* ignore */ } unsubscribeLog = null; }
  started = false;
  consoleOpen = true;
  await closeConsolePopover();
  await closeLauncherPopover();
}
