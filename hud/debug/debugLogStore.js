// Combat HUD — temporary in-memory Debug Log sink.
//
// This is NOT the user-facing Combat Log (hud/log/combatResultLogPolicy.js)
// and NOT a permanent HUD module. It exists purely to help diagnose HUD
// action routing while developing/testing. Entries live ONLY in this module's
// memory for the current page lifetime:
//   - no Supabase persistence, no localStorage, no OBR metadata, no build files;
//   - gone on page reload;
//   - every call is a genuine no-op unless initDebugLog(true) ran first.
//
// Runs as a plain singleton module in the BACKGROUND page's JS realm (shared
// by sceneSelectionController.js, targetSelectionController.js, and
// combatHudOverlayController.js — all instantiated once per session there).
// The temporary Debug Console (hud/debug/debugConsoleController.js) is the
// ONLY thing that enables this store (initDebugLog(true)) and the only thing
// that displays it — it lives in a SEPARATE popover realm and receives
// entries only via its own broadcast channel.

const MAX_ENTRIES = 200;

let enabled = false;
let entries = [];
const listeners = new Set();

/** Must be called once (idempotent) with the real `?debug=1` state before any
 *  logDebugEvent() call has an effect. */
export function initDebugLog(isEnabled) {
  enabled = !!isEnabled;
}

export function isDebugLogEnabled() {
  return enabled;
}

function notify() {
  for (const fn of listeners) {
    try { fn(entries); } catch (_e) { /* a bad subscriber must never break logging */ }
  }
}

/**
 * @param {string} category  e.g. "targeting" | "weapon" | "magazine" | "fire-mode" | "attack" | "refresh" | "routing"
 * @param {string} action    short action name, e.g. "target-selected"
 * @param {object} [details] compact, SAFE key/value pairs only — NEVER raw
 *   runtime bundles, full inventory, full target bundles, auth headers, or
 *   access tokens. Caller's responsibility to pre-trim.
 * @param {boolean} [success]
 */
export function logDebugEvent(category, action, details = {}, success = true) {
  if (!enabled) return; // production / non-debug: zero cost, nothing collected
  entries = [
    { timestamp: Date.now(), category: String(category ?? ""), action: String(action ?? ""), details: details ?? {}, success: !!success },
    ...entries,
  ];
  if (entries.length > MAX_ENTRIES) entries = entries.slice(0, MAX_ENTRIES);
  notify();
}

export function getDebugLogEntries() {
  return entries;
}

/** Clears in-memory entries only — there is nothing else to clear (no disk/DB copy). */
export function clearDebugLog() {
  entries = [];
  notify();
}

/** @returns {() => void} unsubscribe */
export function subscribeDebugLog(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}
