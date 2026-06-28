// Combat HUD overlay — background controller (Phase 2.2 multi-popover).
//
// Runs in the BACKGROUND extension context. Owns the lifecycle of SEVEN
// independent module popovers (player/gun/skills/target/modifiers/action/log),
// plus the fullscreen Arrange-HUD editor popover and the collapsed pill. Each
// module popover has a stable id, anchorReference:"POSITION", and is sized tight
// to its module rect so the map stays clickable between modules.
//
// OBR's PopoverApi has no z-index and no setPosition (open/close/set{Width,
// Height} only), so: stacking is controlled by OPEN ORDER (ascending z-index →
// higher-z opens last → on top); repositioning is a re-open (done only on
// resize, layout Save, collapse/reopen and editor open/close — never per
// pointermove). Layout itself lives in the iframe's localStorage; the Player
// module broadcasts it on mount so this controller can place the popovers.
//
// Imports the OBR SDK + pure helpers only — no Phase 0 core/models/adapters.

import OBR from "@owlbear-rodeo/sdk";
import {
  OVERLAY_HTML,
  BC_HUD_UI_STATE,
  DEFAULT_HUD_UI_STATE,
  normalizeHudUiState,
  serializeHudUiState,
} from "./overlayConstants.js";
import { setupSceneSelection } from "../scene/sceneSelectionController.js";
import {
  SELECTION_STATUS,
  PRIMARY_MODULE_ID,
  SECONDARY_MODULE_IDS,
  isReadyStatus,
} from "../scene/selectionState.js";
import {
  HUD_MODULE_IDS,
  HUD_MODULE_POPOVER_IDS,
  LEGACY_HUD_POPOVER_IDS,
  HUD_EDITOR_POPOVER_ID,
  HUD_PILL_POPOVER_ID,
  DEFAULT_HUD_LAYOUT_V2,
  BC_HUD_LAYOUT,
  BC_HUD_EDITOR,
  defaultLayoutState,
  normalizeLayoutState,
  resolveModuleRect,
  clampRect,
} from "./hudLayout.js";

const VIEWPORT_POLL_MS = 600;
const PILL_W = 150;
const PILL_H = 44;
/** Module open order: ascending z-index → higher-z opens last → renders on top. */
const OPEN_ORDER = [...HUD_MODULE_IDS].sort(
  (a, b) => DEFAULT_HUD_LAYOUT_V2[a].zIndex - DEFAULT_HUD_LAYOUT_V2[b].zIndex,
);

let started = false;
let lastVW = 0;
let lastVH = 0;
let lastUiState = { ...DEFAULT_HUD_UI_STATE };
let lastLayout = defaultLayoutState();
let mode = "modules"; // "modules" | "editor" | "collapsed"
let pollTimer = null;
/** Phase 3A: latest scene-selection status. The Player module is always open;
 *  the four ready-only modules open/close as this crosses the `ready` boundary. */
let lastSelectionStatus = SELECTION_STATUS.loading;
let sceneCleanup = null;
/** @type {Array<() => void>} */
const cleanups = [];

const SECONDARY_SET = new Set(SECONDARY_MODULE_IDS);

/** Whether a module popover should currently be open (modules mode only). */
function moduleShouldBeOpen(id) {
  if (mode !== "modules") return false;
  if (id === PRIMARY_MODULE_ID) return true; // Player is always present
  if (SECONDARY_SET.has(id)) return isReadyStatus(lastSelectionStatus);
  return true;
}

function isCollapsed() { return Boolean(lastUiState.isHudCollapsed); }

function placementsEqual(a, b) {
  if (!a || !b) return a === b;
  if (a.mode !== b.mode) return false;
  return Math.abs((a.x || 0) - (b.x || 0)) < 1e-4 && Math.abs((a.y || 0) - (b.y || 0)) < 1e-4;
}
function layoutsEqual(a, b) {
  if (!a || !b || !a.modules || !b.modules) return false;
  return HUD_MODULE_IDS.every((id) => placementsEqual(a.modules[id], b.modules[id]));
}

async function readViewport() {
  const [vw, vh] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  lastVW = vw; lastVH = vh;
  return { vw, vh };
}

function baseHref() {
  return typeof window !== "undefined" ? window.location.href : "";
}

/** URL for a popover page: shared UI snapshot + module + render context. */
function pageUrl(moduleId) {
  const params = new URLSearchParams(serializeHudUiState(lastUiState));
  params.set("module", moduleId);
  params.set("vw", String(Math.round(lastVW)));
  params.set("vh", String(Math.round(lastVH)));
  try {
    const url = new URL(OVERLAY_HTML, baseHref());
    url.search = params.toString();
    return url.toString();
  } catch {
    return `${OVERLAY_HTML}?${params.toString()}`;
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

function moduleRect(moduleId) {
  return resolveModuleRect(moduleId, lastLayout.modules[moduleId], lastVW, lastVH);
}

async function openModule(moduleId) {
  const rect = moduleRect(moduleId);
  await OBR.popover.open({
    id: HUD_MODULE_POPOVER_IDS[moduleId],
    url: pageUrl(moduleId),
    ...paramsForRect(rect),
  });
}

/** Open every module that should currently be visible (Player always; the four
 *  ready-only modules only when the selection is `ready`). */
async function openVisibleModules() {
  for (const id of OPEN_ORDER) {
    if (!moduleShouldBeOpen(id)) continue;
    try { await openModule(id); } catch (_e) { /* skip one bad module, keep the rest */ }
  }
}

/** Open/close the four ready-only modules when the selection crosses the `ready`
 *  boundary. Player is never touched here, and a ready→ready change (different
 *  owned character) does NOT reopen anything — iframes just re-render on the
 *  broadcast. This is the only popover lifecycle tied to selection. */
async function reconcileSecondaryModules(prevStatus, nextStatus) {
  if (mode !== "modules") return;
  const wasReady = isReadyStatus(prevStatus);
  const nowReady = isReadyStatus(nextStatus);
  if (nowReady === wasReady) return;
  for (const id of OPEN_ORDER) {
    if (!SECONDARY_SET.has(id)) continue;
    try {
      if (nowReady) await openModule(id);
      else await OBR.popover.close(HUD_MODULE_POPOVER_IDS[id]);
    } catch (_e) { /* skip one, keep the rest */ }
  }
}

async function closeAllModules() {
  for (const id of HUD_MODULE_IDS) {
    try { await OBR.popover.close(HUD_MODULE_POPOVER_IDS[id]); } catch (_e) { /* ignore */ }
  }
}

/** Close popovers retired in 2.2.3 (Target/Modifiers/Action) so an update never
 *  leaves stale separate popovers behind. */
async function closeLegacyPopovers() {
  for (const id of LEGACY_HUD_POPOVER_IDS) {
    try { await OBR.popover.close(id); } catch (_e) { /* ignore */ }
  }
}

/** Re-open only the modules whose placement changed (in z-order). Re-opening a
 *  module reloads its iframe, so we must NOT touch unchanged ones — re-opening
 *  the Player module re-triggers its BC_HUD_LAYOUT broadcast, which would loop. */
async function openChangedModules(prev, next) {
  const changed = OPEN_ORDER.filter(
    (id) => moduleShouldBeOpen(id) && !placementsEqual(prev.modules[id], next.modules[id]),
  );
  for (const id of changed) {
    try { await openModule(id); } catch (_e) { /* skip one, keep the rest */ }
  }
}

async function openEditor() {
  const rect = { left: 0, top: 0, width: lastVW, height: lastVH };
  await OBR.popover.open({ id: HUD_EDITOR_POPOVER_ID, url: pageUrl("editor"), ...paramsForRect(rect) });
}
async function closeEditorPopover() {
  try { await OBR.popover.close(HUD_EDITOR_POPOVER_ID); } catch (_e) { /* ignore */ }
}

function pillRect() {
  const p = moduleRect("player");
  return clampRect({ left: p.left, top: p.top + p.height - PILL_H, width: PILL_W, height: PILL_H, zIndex: 50 }, lastVW, lastVH);
}
async function openPill() {
  await OBR.popover.open({ id: HUD_PILL_POPOVER_ID, url: pageUrl("pill"), ...paramsForRect(pillRect()) });
}
async function closePill() {
  try { await OBR.popover.close(HUD_PILL_POPOVER_ID); } catch (_e) { /* ignore */ }
}

/** Reflect the current `mode` by (re)opening exactly the right popovers. */
async function applyMode() {
  if (mode === "collapsed") {
    await closeEditorPopover();
    await closeAllModules();
    await openPill();
  } else if (mode === "editor") {
    await closePill();
    await closeAllModules();
    await openEditor();
  } else {
    await closePill();
    await closeEditorPopover();
    await openVisibleModules();
  }
}

function startViewportPoll() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    try {
      const { vw, vh } = { vw: await OBR.viewport.getWidth(), vh: await OBR.viewport.getHeight() };
      if (vw === lastVW && vh === lastVH) return;
      lastVW = vw; lastVH = vh;
      await applyMode(); // normalized placements + scaled defaults re-flow + clamp
    } catch (_e) { /* transient; next tick retries */ }
  }, VIEWPORT_POLL_MS);
  cleanups.push(() => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } });
}

export function setupCombatHudOverlay() {
  if (started) return;
  if (typeof OBR === "undefined" || OBR.isAvailable === false) return;
  started = true;

  OBR.onReady(async () => {
    try {
      await readViewport();
      await closeLegacyPopovers(); // drop any 2.2.2 Target/Modifiers/Action popovers
      mode = isCollapsed() ? "collapsed" : "modules";
      await applyMode();
      startViewportPoll();

      // Phase 3A: scene-selection layer. The scene controller broadcasts the
      // trimmed selection payload to the iframes (and replays it on request);
      // here we only reconcile which popovers are open when the selection
      // crosses the `ready` boundary (Player is always open).
      sceneCleanup = setupSceneSelection({
        onSelectionState: async (payload) => {
          const prev = lastSelectionStatus;
          lastSelectionStatus = payload?.status ?? SELECTION_STATUS.loading;
          await reconcileSecondaryModules(prev, lastSelectionStatus);
        },
      });

      // Collapse / reopen coordination (Player module → controller).
      cleanups.push(OBR.broadcast.onMessage(BC_HUD_UI_STATE, async (event) => {
        const next = normalizeHudUiState(event?.data);
        const collapseChanged = next.isHudCollapsed !== lastUiState.isHudCollapsed;
        lastUiState = { ...lastUiState, ...next };
        if (collapseChanged) {
          mode = isCollapsed() ? "collapsed" : "modules";
          await applyMode();
        }
      }));

      // Arrange-HUD editor open/close.
      cleanups.push(OBR.broadcast.onMessage(BC_HUD_EDITOR, async (event) => {
        const open = Boolean(event?.data && event.data.open);
        if (open && mode !== "editor") { mode = "editor"; await applyMode(); }
        else if (!open && mode === "editor") { mode = "modules"; await applyMode(); }
      }));

      // Layout updates: Player module seeds the stored layout on mount; the
      // editor sends the new layout on Save. Ignore an UNCHANGED layout —
      // otherwise the Player module's mount broadcast would re-open all modules,
      // reload the Player iframe, re-broadcast … an infinite re-open loop that
      // leaves every module perpetually "not loaded". Only reposition the
      // modules that actually changed.
      cleanups.push(OBR.broadcast.onMessage(BC_HUD_LAYOUT, async (event) => {
        const next = normalizeLayoutState(event?.data);
        if (layoutsEqual(next, lastLayout)) return;
        const prev = lastLayout;
        lastLayout = next;
        if (mode === "modules") await openChangedModules(prev, next);
      }));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[combatHud/overlay] setup failed", error);
      started = false;
    }
  });
}

export async function teardownCombatHudOverlay() {
  for (const fn of cleanups.splice(0)) { try { fn(); } catch (_e) { /* ignore */ } }
  if (typeof sceneCleanup === "function") { try { sceneCleanup(); } catch (_e) { /* ignore */ } sceneCleanup = null; }
  started = false;
  lastUiState = { ...DEFAULT_HUD_UI_STATE };
  lastLayout = defaultLayoutState();
  lastSelectionStatus = SELECTION_STATUS.loading;
  mode = "modules";
  await closeEditorPopover();
  await closePill();
  await closeAllModules();
  await closeLegacyPopovers();
}
