// HUD Targeting — local map-visuals decision + geometry logic (PURE, no OBR
// import — fully unit-testable in Node). Everything here answers "should X
// show, and with what geometry", never touches the OBR SDK itself; the
// controller/renderer layer turns these answers into real scene.local items.
//
// Honesty rule: these functions only ever read already-existing signals
// (viewer.role, access.canView, the targeting broadcast's source/target
// tokenId) — no new ownership check, no new RPC, no invented state.

/** Default gap between the token's own bounds and the outline/ring, expressed
 *  as a fraction of the token's bounding-box size (NOT literal CSS pixels —
 *  scene items live in scene units, which the viewport already scales with
 *  zoom, so a fixed additive "6px" doesn't translate 1:1; a proportional gap
 *  reads as a small, calm margin at any zoom level, matching the spec's
 *  "3-6px" / "6-10px" intent rather than its literal unit). */
export const OUTLINE_GAP_RATIO = 0.10;   // ~3-6px equivalent at typical zoom
export const RING_GAP_RATIO = 0.18;      // ~6-10px equivalent at typical zoom

/**
 * Source outline shows ONLY for a player who OWNS the selected source
 * character — never for a GM merely inspecting (spec §C: "не добавлять новые
 * GM-specific правила; для GM сохранить существующее access/inspect
 * behavior"). `canView` here is the SAME access signal computeAccess() already
 * produces: for a non-GM viewer it is only ever true when they own the
 * character (see hud/core/combatHudActions.js computeAccess), so this reuses
 * an existing signal rather than adding a new ownership check.
 * @param {{ viewerRole?: string, canView?: boolean, sourceTokenId?: (string|null) }} input
 * @returns {boolean}
 */
export function shouldShowSourceOutline({ viewerRole, canView, sourceTokenId } = {}) {
  if (!sourceTokenId) return false;
  if (String(viewerRole ?? "").toLowerCase() === "gm") return false;
  return canView === true;
}

/**
 * Target ring shows whenever a target token is currently selected — no extra
 * gating beyond "a target exists" (validation/ownership of the TARGET itself
 * is the existing target-selection adapter's job, untouched here).
 * @param {{ targetTokenId?: (string|null) }} input
 * @returns {boolean}
 */
export function shouldShowTargetRing({ targetTokenId } = {}) {
  return !!targetTokenId;
}

/** True while the existing targeting flow is in "picking" mode — the ONLY
 *  signal that drives cursor-tool activation. */
export function isPickingActive(targetingMode) {
  return targetingMode === "picking";
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Compute a square/rect overlay sized slightly larger than a token's own
 * bounding box, centered on it. Used for BOTH the source outline (rectangle)
 * and the target ring (circle) — only the shapeType/color/dash differ.
 * @param {{ width:number, height:number, center:{x:number,y:number} }} bounds
 * @param {number} gapRatio
 * @returns {{ width:number, height:number, position:{x:number,y:number} }}
 */
export function computeOverlayGeometry(bounds, gapRatio) {
  const width = Math.max(1, num(bounds?.width, 1));
  const height = Math.max(1, num(bounds?.height, 1));
  const center = { x: num(bounds?.center?.x, 0), y: num(bounds?.center?.y, 0) };
  const ratio = Math.max(0, num(gapRatio, 0));
  return {
    width: width * (1 + ratio),
    height: height * (1 + ratio),
    position: center,
  };
}
