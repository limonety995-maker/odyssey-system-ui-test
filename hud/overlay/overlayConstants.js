// Combat HUD overlay — shared constants & pure positioning helpers
// (Phase 1A · Phase 2 · Phase 2.1).
//
// Imported by BOTH the background controller (OBR-coupled) and the popover
// page (DOM-coupled), so this module must stay PURE: no OBR SDK, no DOM, no
// CSS. Only data + math.

import {
  SAFE_MARGIN,
  DEFAULT_PLACEMENT,
  clampPlacement,
  placementToPixels,
  parsePlacement,
  serializePlacement,
} from "./hudPlacement.js";

export { SAFE_MARGIN };

/** Deterministic popover id — re-opening with this id updates in place
 *  rather than spawning a duplicate overlay. */
export const OVERLAY_POPOVER_ID = "com.odyssey.combat-hud/overlay";

/** Root HTML page loaded into the popover iframe (resolved against the
 *  background page's origin at runtime). */
export const OVERLAY_HTML = "combat-hud-overlay.html";

/** LOCAL broadcast channel: popover iframe → background controller, carrying
 *  the full minimal UI snapshot whenever it changes (collapse / scenario /
 *  role / token / placement). The controller keeps the latest snapshot in
 *  memory so it can resize in place on collapse, re-open at the new anchor on
 *  placement change, and re-seed the iframe via URL on any re-anchor. */
export const BC_HUD_UI_STATE = "com.odyssey.combat-hud/ui-state";

/** LOCAL broadcast: scene-selection controller (background) → module iframes,
 *  carrying the TRIMMED selection payload (status + viewer + access + ready-only
 *  view). Drives every module's content on real token selection. */
export const BC_HUD_SELECTION = "com.odyssey.combat-hud/selection";

/** LOCAL broadcast: a freshly-mounted module iframe → scene-selection controller,
 *  asking it to replay the latest selection payload (so a module opened after a
 *  selection change still renders the current state). */
export const BC_HUD_SELECTION_REQUEST = "com.odyssey.combat-hud/selection-request";

/** LOCAL broadcast: module iframe → background scene controller. Carries
 *  ephemeral HUD commands (weapon pick, reload, prepared action, target pick).
 *  The iframe never calls Supabase directly. */
export const BC_HUD_COMMAND = "com.odyssey.combat-hud/command";

/** LOCAL broadcast: Phase 3B target selection controller -> scene/UI bridge. */
export const BC_HUD_TARGETING = "com.odyssey.combat-hud/targeting";

/** LOCAL broadcast: module iframe -> target controller, asking for latest state. */
export const BC_HUD_TARGETING_REQUEST = "com.odyssey.combat-hud/targeting-request";

/** LOCAL broadcast: controller command channel for target picking lifecycle. */
export const BC_HUD_TARGETING_COMMAND = "com.odyssey.combat-hud/targeting-command";

// NOTE: the temporary Debug Console (hud/debug/*) intentionally does NOT use
// this shared overlay-constants file — it defines its own, fully separate
// broadcast channels so it stays trivially deletable later without touching
// any file the real HUD depends on. See hud/debug/debugConsoleController.js.

/* ----------------- HUD geometry (Phase 2.1) ----------------- */
//
// The HUD is a left-anchored bottom panel: a tall PlayerBlock, a responsive
// gap, then a compact combat rail. Widths are fixed/near-fixed to match the
// reference rather than an even fr-grid.

export const PLAYER_W = 144;
export const PLAYER_HEIGHT = 146;
export const RAIL_GAP = 10;
export const GUN_W = 240;
export const SKILLS_W = 430;
export const TARGET_W = 100;
export const MODACT_W = 126;
export const ROW_HEIGHT = 95;                 // combat-rail block height
export const RAIL_W = GUN_W + SKILLS_W + TARGET_W + MODACT_W + RAIL_GAP * 3; // 926
/** Horizontal inner padding of the HUD (left for the grip, right breathing). */
export const HUD_PAD_X = 16;
/** Top strip that holds the grip handle + LOG/collapse controls. */
export const HUD_TOP_STRIP = 16;

/** Min/typical/max gap between Player and the combat rail. */
export const HUD_GAP_MIN = 110;
export const HUD_GAP_MAX = 235;

/** Expanded HUD height — tight to the content (PlayerBlock + top strip). */
export const EXPANDED_HEIGHT = HUD_TOP_STRIP + PLAYER_HEIGHT + 4; // 166
/** Two-row (compact/mini) height. */
export const COMPACT_EXPANDED_HEIGHT = 300;
/** Widest the single-row HUD ever gets (Player + max gap + rail + padding). */
export const EXPANDED_MAX_WIDTH = PLAYER_W + HUD_GAP_MAX + RAIL_W + HUD_PAD_X; // 1321

/** Collapsed pill size (just the reopen button). */
export const COLLAPSED_WIDTH = 150;
export const COLLAPSED_HEIGHT = 44;

/* ----------------- responsive layout modes ----------------- */

/** ≥ this → full single-row "wide" layout. */
export const WIDE_BREAKPOINT = 1280;
/** ≥ this (and < WIDE) → "medium" single-row layout (blocks compress). */
export const MEDIUM_BREAKPOINT = 960;
/** ≥ this (and < MEDIUM) → "compact" two-row layout. Below → "mini". */
export const MINI_BREAKPOINT = 620;
/** Back-compat alias. */
export const COMPACT_BREAKPOINT = MEDIUM_BREAKPOINT;

/**
 * Resolve the responsive layout mode for a given VIEWPORT width.
 * @param {number} vw  viewport width in px
 * @returns {"wide"|"medium"|"compact"|"mini"}
 */
export function resolveLayoutMode(vw) {
  const w = Math.max(0, Number(vw) || 0);
  if (w >= WIDE_BREAKPOINT) return "wide";
  if (w >= MEDIUM_BREAKPOINT) return "medium";
  if (w >= MINI_BREAKPOINT) return "compact";
  return "mini";
}

/** True when the layout mode stacks the HUD into two rows. */
export function isTwoRowMode(mode) {
  return mode === "compact" || mode === "mini";
}

/** Responsive Player→rail gap: clamp(110, 12vw, 235). */
export function computeHudGap(vw) {
  const v = Math.max(0, Number(vw) || 0);
  return Math.round(Math.min(HUD_GAP_MAX, Math.max(HUD_GAP_MIN, v * 0.12)));
}

/** Ideal single-row content width for a viewport. */
export function computeContentWidth(vw) {
  return PLAYER_W + computeHudGap(vw) + RAIL_W + HUD_PAD_X;
}

/**
 * Expanded popover width. Single-row layouts fit the content (capped to the
 * viewport); two-row layouts fill the available viewport width.
 * @param {number} vw
 * @returns {number}
 */
export function computeExpandedWidth(vw) {
  const avail = Math.max(0, (Number(vw) || 0) - 2 * SAFE_MARGIN);
  if (isTwoRowMode(resolveLayoutMode(vw))) return avail;
  return Math.max(0, Math.min(computeContentWidth(vw), avail));
}

/**
 * Expanded popover height. Two-row layouts are taller.
 * @param {number} vw
 * @returns {number}
 */
export function computeExpandedHeight(vw) {
  return isTwoRowMode(resolveLayoutMode(vw)) ? COMPACT_EXPANDED_HEIGHT : EXPANDED_HEIGHT;
}

/**
 * Popover width/height for the current collapsed state.
 * @param {boolean} collapsed
 * @param {number} vw
 * @returns {{width:number, height:number}}
 */
export function computeOverlaySize(collapsed, vw) {
  if (collapsed) return { width: COLLAPSED_WIDTH, height: COLLAPSED_HEIGHT };
  return { width: computeExpandedWidth(vw), height: computeExpandedHeight(vw) };
}

/** Bottom-left anchoring: the popover's bottom-LEFT corner sits at the anchor
 *  point, so the HUD grows up/right and stays pinned to the chosen corner. */
export const ANCHOR_ORIGIN = Object.freeze({ horizontal: "LEFT", vertical: "BOTTOM" });
export const TRANSFORM_ORIGIN = Object.freeze({ horizontal: "LEFT", vertical: "BOTTOM" });

/**
 * Compute the OBR popover anchorPosition (its bottom-left corner, in viewport
 * px) for a given placement + size. Clamps on-screen via placementToPixels.
 * @returns {{left:number, top:number}}
 */
export function computeAnchorPosition({ vw, vh, width, height, placement }) {
  const px = placementToPixels(placement, { vw, vh, hudW: width, hudH: height });
  return { left: px.left, top: px.top + height };
}

/* ----------------- HUD UI state persistence ----------------- */

/**
 * @typedef {Object} HudUiState
 * @property {boolean} isHudCollapsed
 * @property {string} mockScenarioId
 * @property {"player"|"gm"} viewerRole
 * @property {string|null} selectedTokenId
 * @property {import("./hudPlacement.js").HudPlacement} hudPlacement
 */

/** Default snapshot. */
export const DEFAULT_HUD_UI_STATE = Object.freeze({
  isHudCollapsed: false,
  mockScenarioId: "A",
  viewerRole: "player",
  selectedTokenId: null,
  hudPlacement: { ...DEFAULT_PLACEMENT },
});

/** URL param keys for the persisted UI snapshot. */
export const HUD_UI_PARAM_KEYS = Object.freeze({
  collapsed: "collapsed",
  scenario: "scenario",
  role: "role",
  token: "token",
  placement: "placement",
});

/** URL param keys for the (non-persisted) render context the iframe needs for
 *  drag math: true viewport size + the computed Player→rail gap. */
export const HUD_RENDER_PARAM_KEYS = Object.freeze({ vw: "vw", vh: "vh", gap: "gap" });

/**
 * Serialize a HUD UI snapshot to a URL query string (without leading `?`).
 * @param {Partial<HudUiState>} ui
 * @returns {string}
 */
export function serializeHudUiState(ui) {
  const src = ui && typeof ui === "object" ? ui : {};
  const params = new URLSearchParams();
  params.set(HUD_UI_PARAM_KEYS.collapsed, src.isHudCollapsed ? "1" : "0");
  params.set(HUD_UI_PARAM_KEYS.scenario, src.mockScenarioId != null ? String(src.mockScenarioId) : "");
  params.set(HUD_UI_PARAM_KEYS.role, src.viewerRole === "gm" ? "gm" : "player");
  params.set(HUD_UI_PARAM_KEYS.token, src.selectedTokenId == null ? "" : String(src.selectedTokenId));
  params.set(HUD_UI_PARAM_KEYS.placement, serializePlacement(src.hudPlacement));
  return params.toString();
}

/**
 * Parse a URL query string into a partial HUD UI snapshot. Never throws.
 * @param {string} search
 * @returns {Partial<HudUiState>}
 */
export function parseHudUiState(search) {
  /** @type {Partial<HudUiState>} */
  const out = {};
  let params;
  try { params = new URLSearchParams(search || ""); } catch { return out; }
  if (params.has(HUD_UI_PARAM_KEYS.collapsed)) {
    out.isHudCollapsed = params.get(HUD_UI_PARAM_KEYS.collapsed) === "1";
  }
  const scenario = params.get(HUD_UI_PARAM_KEYS.scenario);
  if (scenario) out.mockScenarioId = scenario;
  const role = params.get(HUD_UI_PARAM_KEYS.role);
  if (role === "player" || role === "gm") out.viewerRole = role;
  if (params.has(HUD_UI_PARAM_KEYS.token)) {
    const token = params.get(HUD_UI_PARAM_KEYS.token);
    out.selectedTokenId = token ? token : null;
  }
  const placement = parsePlacement(params.get(HUD_UI_PARAM_KEYS.placement));
  if (placement) out.hudPlacement = placement;
  return out;
}

/** Read the render context (viewport size + gap) from a URL query string. */
export function parseRenderContext(search) {
  const out = {};
  let params;
  try { params = new URLSearchParams(search || ""); } catch { return out; }
  const num = (k) => {
    const v = Number(params.get(k));
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const vw = num(HUD_RENDER_PARAM_KEYS.vw);
  const vh = num(HUD_RENDER_PARAM_KEYS.vh);
  const gap = num(HUD_RENDER_PARAM_KEYS.gap);
  if (vw) out.vw = vw;
  if (vh) out.vh = vh;
  if (gap != null) out.gap = gap;
  return out;
}

/**
 * Merge a partial snapshot over the defaults, producing a complete HudUiState.
 * @param {Partial<HudUiState>} [partial]
 * @returns {HudUiState}
 */
export function normalizeHudUiState(partial) {
  const p = partial && typeof partial === "object" ? partial : {};
  return {
    isHudCollapsed: typeof p.isHudCollapsed === "boolean" ? p.isHudCollapsed : DEFAULT_HUD_UI_STATE.isHudCollapsed,
    mockScenarioId: p.mockScenarioId != null && p.mockScenarioId !== "" ? String(p.mockScenarioId) : DEFAULT_HUD_UI_STATE.mockScenarioId,
    viewerRole: p.viewerRole === "gm" ? "gm" : "player",
    selectedTokenId: Object.prototype.hasOwnProperty.call(p, "selectedTokenId") ? p.selectedTokenId : DEFAULT_HUD_UI_STATE.selectedTokenId,
    hudPlacement: clampPlacement(p.hudPlacement ?? DEFAULT_HUD_UI_STATE.hudPlacement),
  };
}

/**
 * Build the full Popover params object (minus id/url) for OBR.popover.open().
 * @param {{vw:number, vh:number, collapsed:boolean, placement?:object}} params
 */
export function buildOverlayPopoverParams({ vw, vh, collapsed, placement }) {
  const { width, height } = computeOverlaySize(collapsed, vw);
  return {
    width,
    height,
    anchorReference: "POSITION",
    anchorPosition: computeAnchorPosition({ vw, vh, width, height, placement }),
    anchorOrigin: { ...ANCHOR_ORIGIN },
    transformOrigin: { ...TRANSFORM_ORIGIN },
    hidePaper: true,
    disableClickAway: true,
    marginThreshold: 0,
  };
}
