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
  BC_HUD_COMMAND,
  BC_HUD_UI_STATE,
  BC_HUD_TARGETING_COMMAND,
  DEFAULT_HUD_UI_STATE,
  normalizeHudUiState,
  serializeHudUiState,
} from "./overlayConstants.js";
import { setupSceneSelection } from "../scene/sceneSelectionController.js";
import { setupTargetSelection } from "../targeting/targetSelectionController.js";
import {
  SELECTION_STATUS,
  SECONDARY_MODULE_IDS,
} from "../scene/selectionState.js";
import { selectVisibleReserveMagazines } from "../core/combatHudSelectors.js";
import {
  moduleShouldBeOpen as computeModuleShouldBeOpen,
  secondaryReconcileAction,
  characterChangeClosesCompanions,
  computeCompanionSelectorHeight,
  COMPANION_SELECTOR_WIDTH,
} from "./hudPopoverLifecycle.js";
import {
  HUD_MODULE_IDS,
  HUD_MODULE_POPOVER_IDS,
  LEGACY_HUD_POPOVER_IDS,
  GUN_WEAPON_SELECTOR_POPOVER_ID,
  GUN_MAGAZINE_SELECTOR_POPOVER_ID,
  GUN_FIRE_MODE_SELECTOR_POPOVER_ID,
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
const COMPANION_POPOVER_W = 280;
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
let targetSelection = null;
let gunWeaponSelectorOpen = false;
let gunMagazineSelectorOpen = false;
let gunFireModeSelectorOpen = false;
let lastActiveCharacterId = null;
/** Latest full trimmed selection payload (the same one module iframes get),
 *  kept ONLY to size the magazine-selector companion popover to its content
 *  (row count) at open time — never read for anything else here. */
let lastSelectionPayload = null;
/** @type {Array<() => void>} */
const cleanups = [];

const SECONDARY_SET = new Set(SECONDARY_MODULE_IDS);

/** Whether a module popover should currently be open (modules mode only). */
function moduleShouldBeOpen(id) {
  return computeModuleShouldBeOpen(mode, lastSelectionStatus, id);
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
    const baseParams = new URL(baseHref()).searchParams;
    if (baseParams.get("debug") === "1") params.set("debug", "1");
  } catch (_e) { /* ignore */ }
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

function companionPopoverRectAboveGun(width = COMPANION_POPOVER_W, height = 200) {
  if (!lastLayout.modules?.gun) return null;
  const gunRect = moduleRect("gun");
  const gap = 4;
  return {
    left: Math.max(0, gunRect.left + (gunRect.width - width) / 2),
    top: Math.max(0, gunRect.top - height - gap),
    width,
    height,
  };
}

/** Row count backing the currently-open magazine selector, from the latest
 *  trimmed selection payload — reuses the SAME eligibility selector the Gun
 *  module and the companion panel use (single source of truth). */
function visibleReserveMagazineCount() {
  const hudSnapshot = lastSelectionPayload?.hudSnapshot ?? null;
  if (!hudSnapshot) return 0;
  return selectVisibleReserveMagazines({ snapshot: hudSnapshot }).length;
}

/** The magazine-selector companion popover is sized to its content (row
 *  count), not a fixed oversized rect — a fixed rect left a large empty area
 *  and squeezed the rows into a tiny absolutely-positioned corner. */
function magazineSelectorRect() {
  const height = computeCompanionSelectorHeight(visibleReserveMagazineCount());
  return companionPopoverRectAboveGun(COMPANION_SELECTOR_WIDTH, height);
}

/** Row count backing the currently-open fire-mode selector (Fire Mode v1) —
 *  from the SAME trimmed payload, no separate fetch. */
function visibleFireModeCount() {
  const fireMode = lastSelectionPayload?.hudSnapshot?.weapon?.primary?.fireMode ?? null;
  return Array.isArray(fireMode?.available) ? fireMode.available.length : 0;
}

/** Content-sized fire-mode companion popover rect (same policy as the
 *  magazine selector). */
function fireModeSelectorRect() {
  const height = computeCompanionSelectorHeight(visibleFireModeCount());
  return companionPopoverRectAboveGun(COMPANION_SELECTOR_WIDTH, height);
}

async function setGunWeaponSelectorOpen(open) {
  const next = Boolean(open);
  if (next === gunWeaponSelectorOpen) return;
  gunWeaponSelectorOpen = next;
  if (mode !== "modules") return;
  if (next) {
    const rect = companionPopoverRectAboveGun();
    if (rect) {
      try {
        await OBR.popover.open({
          id: GUN_WEAPON_SELECTOR_POPOVER_ID,
          url: pageUrl("gun-weapon-selector"),
          ...paramsForRect(rect),
        });
      } catch (_e) { /* best effort */ }
    }
  } else {
    try { await OBR.popover.close(GUN_WEAPON_SELECTOR_POPOVER_ID); } catch (_e) { /* ignore */ }
  }
}

async function setGunMagazineSelectorOpen(open) {
  const next = Boolean(open);
  if (next === gunMagazineSelectorOpen) return;
  gunMagazineSelectorOpen = next;
  if (mode !== "modules") return;
  if (next) {
    const rect = magazineSelectorRect();
    if (rect) {
      try {
        await OBR.popover.open({
          id: GUN_MAGAZINE_SELECTOR_POPOVER_ID,
          url: pageUrl("gun-magazine-selector"),
          ...paramsForRect(rect),
        });
      } catch (_e) { /* best effort */ }
    }
  } else {
    try { await OBR.popover.close(GUN_MAGAZINE_SELECTOR_POPOVER_ID); } catch (_e) { /* ignore */ }
  }
}

async function setGunFireModeSelectorOpen(open) {
  const next = Boolean(open);
  if (next === gunFireModeSelectorOpen) return;
  gunFireModeSelectorOpen = next;
  if (mode !== "modules") return;
  if (next) {
    const rect = fireModeSelectorRect();
    if (rect) {
      try {
        await OBR.popover.open({
          id: GUN_FIRE_MODE_SELECTOR_POPOVER_ID,
          url: pageUrl("gun-fire-mode-selector"),
          ...paramsForRect(rect),
        });
      } catch (_e) { /* best effort */ }
    }
  } else {
    try { await OBR.popover.close(GUN_FIRE_MODE_SELECTOR_POPOVER_ID); } catch (_e) { /* ignore */ }
  }
}

/** Close every Gun companion popover (weapon/magazine/fire-mode selectors).
 *  Used on character change, invalid selection, collapse, and editor mode. */
async function closeAllCompanionSelectors() {
  try { await setGunWeaponSelectorOpen(false); } catch (_e) { /* best effort */ }
  try { await setGunMagazineSelectorOpen(false); } catch (_e) { /* best effort */ }
  try { await setGunFireModeSelectorOpen(false); } catch (_e) { /* best effort */ }
}

function sendTargetingCommand(command) {
  try { OBR.broadcast.sendMessage(BC_HUD_TARGETING_COMMAND, command, { destination: "LOCAL" }); } catch (_e) { /* ignore */ }
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
  const action = secondaryReconcileAction(prevStatus, nextStatus);
  if (action === "none") return;
  for (const id of OPEN_ORDER) {
    if (!SECONDARY_SET.has(id)) continue;
    try {
      if (action === "open") await openModule(id);
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
    gunWeaponSelectorOpen = false;
    gunMagazineSelectorOpen = false;
    gunFireModeSelectorOpen = false;
    await OBR.popover.close(GUN_WEAPON_SELECTOR_POPOVER_ID).catch(() => {});
    await OBR.popover.close(GUN_MAGAZINE_SELECTOR_POPOVER_ID).catch(() => {});
    await OBR.popover.close(GUN_FIRE_MODE_SELECTOR_POPOVER_ID).catch(() => {});
    await closeEditorPopover();
    await closeAllModules();
    await openPill();
  } else if (mode === "editor") {
    gunWeaponSelectorOpen = false;
    gunMagazineSelectorOpen = false;
    gunFireModeSelectorOpen = false;
    await OBR.popover.close(GUN_WEAPON_SELECTOR_POPOVER_ID).catch(() => {});
    await OBR.popover.close(GUN_MAGAZINE_SELECTOR_POPOVER_ID).catch(() => {});
    await OBR.popover.close(GUN_FIRE_MODE_SELECTOR_POPOVER_ID).catch(() => {});
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
      targetSelection = setupTargetSelection({
        onTargetingState: (payload) => {
          try { sceneCleanup?.applyTargetingPayload?.(payload); } catch (_e) { /* bridge best-effort */ }
        },
      });

      sceneCleanup = setupSceneSelection({
        shouldDeferSelection: () => targetSelection?.isPicking?.() === true,
        onSelectionState: async (payload) => {
          lastSelectionPayload = payload ?? null;
          try { targetSelection?.handleActiveSelection?.(payload); } catch (_e) { /* targeting owns its errors */ }
          try {
            const nextCharId = payload?.characterId ?? null;
            if (characterChangeClosesCompanions(lastActiveCharacterId, nextCharId)) {
              lastActiveCharacterId = nextCharId;
              await closeAllCompanionSelectors();
            }
          } catch (_e) { /* companion lifecycle is best effort */ }
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
          if (isCollapsed()) {
            gunWeaponSelectorOpen = false;
            gunMagazineSelectorOpen = false;
            gunFireModeSelectorOpen = false;
          }
          await applyMode();
        }
      }));

      // Transient module commands that affect companion-popover lifecycle.
      cleanups.push(OBR.broadcast.onMessage(BC_HUD_COMMAND, async (event) => {
        const data = event?.data ?? {};
        // Fire Mode v1: namespaced commands are routed on scope+feature FIRST,
        // never on the flat `type` alone — this popover-lifecycle handling
        // must never be confused with weapon/magazine/reload/target/skill
        // commands regardless of what `type` string a future command reuses.
        if (data?.scope === "combat-hud" && data?.feature === "fire-mode") {
          const fmType = String(data.type ?? "");
          if (fmType === "toggle-selector") await setGunFireModeSelectorOpen(!gunFireModeSelectorOpen);
          else if (fmType === "select" || fmType === "close-selector") await setGunFireModeSelectorOpen(false);
          return;
        }

        const type = String(data.type ?? "");
        if (type === "toggle-weapon-selector") await setGunWeaponSelectorOpen(!gunWeaponSelectorOpen);
        else if (type === "close-weapon-selector") await setGunWeaponSelectorOpen(false);
        else if (type === "select-weapon") {
          // The weapon actually changed — its fire modes belong to a
          // different active profile, so any open fire-mode selector must
          // close (its rows would otherwise describe the PREVIOUS weapon).
          await setGunWeaponSelectorOpen(false);
          await setGunFireModeSelectorOpen(false);
        }
        else if (type === "toggle-magazine-selector") await setGunMagazineSelectorOpen(!gunMagazineSelectorOpen);
        else if (type === "select-reload-mag") await setGunMagazineSelectorOpen(false);
        else if (type === "reload") {
          await setGunWeaponSelectorOpen(false);
          await setGunMagazineSelectorOpen(false);
        }

        if (type === "pick-target") sendTargetingCommand({ type: "pick" });
        else if (type === "cancel-target") sendTargetingCommand({ type: "cancel" });
        else if (type === "clear-target") sendTargetingCommand({ type: "clear" });
        else if (type === "select-target-zone") sendTargetingCommand({ type: "selectZone", zoneId: data.zoneId });
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
  if (targetSelection?.cleanup) { try { targetSelection.cleanup(); } catch (_e) { /* ignore */ } targetSelection = null; }
  started = false;
  lastUiState = { ...DEFAULT_HUD_UI_STATE };
  lastLayout = defaultLayoutState();
  lastSelectionStatus = SELECTION_STATUS.loading;
  gunWeaponSelectorOpen = false;
  gunMagazineSelectorOpen = false;
  gunFireModeSelectorOpen = false;
  lastActiveCharacterId = null;
  lastSelectionPayload = null;
  mode = "modules";
  await closeEditorPopover();
  await closePill();
  await closeAllModules();
  await OBR.popover.close(GUN_WEAPON_SELECTOR_POPOVER_ID).catch(() => {});
  await OBR.popover.close(GUN_MAGAZINE_SELECTOR_POPOVER_ID).catch(() => {});
  await OBR.popover.close(GUN_FIRE_MODE_SELECTOR_POPOVER_ID).catch(() => {});
  await closeLegacyPopovers();
}
