// Combat HUD — Phase 3B distance policy (PURE).
//
// Distance is computed ONLY from reliable scene data, never from an arbitrary
// "1 grid = 1 meter" coefficient. We reuse the project's canonical grid math
// (movement/gridMath.js) for cell conversion + measurement (square / hex /
// chebyshev / manhattan) and the scene's REAL scale (OBR getScale().parsed:
// { multiplier, unit }) for the value + unit.
//
// If the grid is unsupported, the scale is unparseable, or positions are
// missing → returns null, and the UI shows "Distance: —". This is the honest
// fallback the spec requires.

import {
  normalizeObrGridType,
  normalizeDistanceMode,
  sceneToCell,
  computeDistanceCells,
} from "../../movement/gridMath.js";

/**
 * Parse an OBR grid scale into { multiplier, unit }.
 * Accepts the SDK GridScale object ({ raw, parsed:{ multiplier, unit } }) or a
 * plain string like "5ft" / "1.5 km". Returns null when not reliably parseable.
 */
export function parseGridScale(scale) {
  if (scale && typeof scale === "object" && scale.parsed) {
    const multiplier = Number(scale.parsed.multiplier);
    const unit = String(scale.parsed.unit ?? "").trim();
    if (Number.isFinite(multiplier) && multiplier > 0 && unit) {
      return { multiplier, unit };
    }
  }
  const raw = String((scale && typeof scale === "object" ? scale.raw : scale) ?? "").trim();
  const match = raw.match(/^([\d.]+)\s*([^\d\s].*)$/);
  if (match) {
    const multiplier = Number(match[1]);
    const unit = String(match[2]).trim();
    if (Number.isFinite(multiplier) && multiplier > 0 && unit) {
      return { multiplier, unit };
    }
  }
  return null;
}

/**
 * Compute the center-to-center distance between two scene positions using the
 * scene's real grid + scale. PURE.
 *
 * @param {{ type:string, measurement:string, dpi:number, scale:any }} grid
 * @param {{x:number,y:number}|null} fromPos  source token center (scene px)
 * @param {{x:number,y:number}|null} toPos    target token center (scene px)
 * @returns {{ value:number, unit:string } | null}
 */
export function computeTargetDistance(grid, fromPos, toPos) {
  if (!grid || !fromPos || !toPos) return null;

  const gridType = normalizeObrGridType(grid.type);
  const distanceMode = normalizeDistanceMode(grid.type, grid.measurement);
  const dpi = Number(grid.dpi);
  if (!gridType || !distanceMode || !(dpi > 0)) return null; // unsupported grid → "—"

  const scale = parseGridScale(grid.scale);
  if (!scale) return null; // no reliable unit → "—"

  // gridMath settings. Anchor at (0,0): only the cell DIFFERENCE matters for a
  // distance, so the origin cancels out. meters_per_cell carries the scene's
  // real scale multiplier (the value's unit comes from scale.unit, not "m").
  const settings = {
    grid_type: gridType,
    distance_mode: distanceMode,
    grid_dpi: dpi,
    meters_per_cell: scale.multiplier,
    anchor_scene_x: 0,
    anchor_scene_y: 0,
  };

  const fromCell = sceneToCell(settings, fromPos);
  const toCell = sceneToCell(settings, toPos);
  if (!fromCell || !toCell) return null;

  const cells = computeDistanceCells(settings, fromCell, toCell);
  const value = Math.round(cells * scale.multiplier * 100) / 100;
  return { value, unit: scale.unit };
}
