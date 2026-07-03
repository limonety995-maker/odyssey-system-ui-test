// Odyssey Debug Console — PURE layout math (TEMPORARY, see debugConsoleController.js).
//
// No OBR, no DOM — kept separate so it's directly unit-testable without
// mocking the OBR SDK, matching the hud/overlay/hudPopoverLifecycle.js
// pattern used for the real HUD's popover lifecycle.

export const DEBUG_CONSOLE_POPOVER_ID = "odyssey-hud-debug-console";
export const DEBUG_LAUNCHER_POPOVER_ID = "odyssey-hud-debug-launcher";

export const MARGIN = 12;
export const CONSOLE_WIDTH = 400;
export const CONSOLE_HEIGHT = 460;
export const LAUNCHER_WIDTH = 118;
export const LAUNCHER_HEIGHT = 36;

/** Top-right anchored rect for a given viewport width — always clear of the
 *  bottom-anchored main HUD (which occupies the opposite corner) regardless
 *  of viewport size. */
export function topRightRect(vw, width, height, margin = MARGIN) {
  const w = Math.max(0, Number(vw) || 0);
  return {
    left: Math.max(0, w - width - margin),
    top: margin,
    width,
    height,
  };
}

export function consoleRect(vw) {
  return topRightRect(vw, CONSOLE_WIDTH, CONSOLE_HEIGHT);
}

export function launcherRect(vw) {
  return topRightRect(vw, LAUNCHER_WIDTH, LAUNCHER_HEIGHT);
}
