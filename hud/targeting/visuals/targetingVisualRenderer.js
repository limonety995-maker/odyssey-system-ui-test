// HUD Targeting — local map-visuals renderer (thin OBR.scene.local layer).
//
// Deliberately minimal: all interesting geometry/color decisions come from
// targetingVisualPolicy.js (pure, unit-tested); this file only turns a
// geometry spec into a real OBR item and writes it to `scene.local` — the
// SAME per-client, never-synced storage this project's own tactical-move
// preview (movement/combatMovementPreview.js) already uses for exactly this
// kind of "visible to me only" map overlay.
//
// `attachedTo(tokenId)` makes OBR itself keep the shape's position/scale in
// sync with its token on move/resize (and auto-delete it if the token is
// deleted) — this file never re-computes that by hand for the source outline.
//
// Hotfix (ValidationError on addItems(anchor)): the target ring used to be
// TWO local items — an invisible TARGET_RING_ANCHOR attachedTo(tokenId), plus
// a TARGET_RING attachedTo(the anchor) with rotation-sync disabled. A live
// Owlbear Rodeo session showed this anchor item failing host-side schema
// validation ("items[0]" does not match any of the allowed types) the moment
// it reached OBR.scene.local.addItems. attachedTo/layer("ATTACHMENT") has no
// other precedent anywhere in this codebase for OBR.scene.local items — the
// one PROVEN local-only overlay pattern this project already has,
// movement/combatMovementPreview.js, never attaches at all: it computes
// absolute position/size from the token's own bounds and uses
// layer("POINTER"). The ring now follows that exact proven pattern instead:
//   - anchorState: pure internal JS bookkeeping (which token, last-known
//     bounds/rotation) — never an OBR item, never passed to addItems.
//   - TARGET_RING: the one real local item, created ONCE via addItems, then
//     kept in sync by re-fetching the token's bounds and writing
//     position/width/height/rotation together in a single updateItems() call
//     every animation tick (updateTargetRingGeometry) — addItems is never
//     called again after the initial creation.
//
// Every local item ADD/UPDATE/DELETE call is wrapped in try/catch: a failure
// here is a lost cosmetic effect, never a reason to break targeting itself.

import OBR, { buildShape } from "@owlbear-rodeo/sdk";
import { computeOverlayGeometry, OUTLINE_GAP_RATIO, RING_GAP_RATIO } from "./targetingVisualPolicy.js";

export const SOURCE_OUTLINE_ITEM_ID = "com.odyssey-system/targeting-source-outline";
export const TARGET_RING_ITEM_ID = "com.odyssey-system/targeting-target-ring";

const SOURCE_OUTLINE_COLOR = "#34e1d6"; // --odyssey-cyan
const TARGET_RING_COLOR = "#ff5c6c";    // --odyssey-red (crimson-ish, matches the HUD's existing "negative" tone)

function buildSourceOutlineItem(tokenId, bounds) {
  const geo = computeOverlayGeometry(bounds, OUTLINE_GAP_RATIO);
  return buildShape()
    .id(SOURCE_OUTLINE_ITEM_ID)
    .name("Odyssey Source Outline (local only)")
    .shapeType("RECTANGLE")
    .width(geo.width)
    .height(geo.height)
    .position(geo.position)
    .style({
      fillColor: SOURCE_OUTLINE_COLOR,
      fillOpacity: 0.03,
      strokeColor: SOURCE_OUTLINE_COLOR,
      strokeOpacity: 0.9,
      strokeWidth: 6,
      strokeDash: [],
    })
    .layer("ATTACHMENT")
    .locked(true)
    .disableHit(true)
    .disableAutoZIndex(true)
    .attachedTo(tokenId)
    .visible(true)
    .build();
}

/** The ring: the visible dashed circle, positioned/sized directly from the
 *  target token's own bounds — same as movement/combatMovementPreview.js's
 *  proven local-only overlay pattern (layer("POINTER"), no attachedTo). Its
 *  geometry is refreshed by re-calling this same computation on a fresh
 *  bounds read (see updateTargetRingGeometry), never by OBR's own attachment
 *  sync. Centered on itself (position IS its own center — CIRCLE shapes have
 *  no top-left anchor concept), so its spin is a pure rotation-in-place. */
function buildTargetRingItem(bounds, rotationDeg = 0) {
  const geo = computeOverlayGeometry(bounds, RING_GAP_RATIO);
  return buildShape()
    .id(TARGET_RING_ITEM_ID)
    .name("Odyssey Target Ring (local only)")
    .shapeType("CIRCLE")
    .width(geo.width)
    .height(geo.height)
    .position(geo.position)
    .rotation(rotationDeg)
    .style({
      fillColor: TARGET_RING_COLOR,
      fillOpacity: 0,
      strokeColor: TARGET_RING_COLOR,
      strokeOpacity: 0.95,
      strokeWidth: 5,
      strokeDash: [14, 10],
    })
    .layer("POINTER")
    .locked(true)
    .disableHit(true)
    .disableAutoZIndex(true)
    .visible(true)
    .build();
}

/** Attach phase/operation to a thrown error (best-effort — never itself
 *  throws) so the controller's catch block can report a MORE specific phase
 *  than its own generic fallback. Mutates the error object directly when
 *  possible (never wraps it — the caller must still see the REAL error for
 *  serializeError() to work on); falls back to a plain object carrying the
 *  same fields when the thrown value isn't itself an object. */
function tagPhase(error, phase, operation) {
  if (error && typeof error === "object") {
    try {
      error.phase = phase;
      error.operation = operation;
      return error;
    } catch (_e) { /* frozen/sealed error object — fall through */ }
  }
  return { phase, operation, message: String(error), originalError: error };
}

async function getTokenBounds(tokenId) {
  try {
    const box = await OBR.scene.items.getItemBounds([tokenId]);
    return { width: box.width, height: box.height, center: box.center };
  } catch (error) {
    throw tagPhase(error, "scene-item-lookup", "getItemBounds");
  }
}

export async function showSourceOutline(tokenId) {
  const bounds = await getTokenBounds(tokenId);
  await OBR.scene.local.addItems([buildSourceOutlineItem(tokenId, bounds)]);
}

export async function hideSourceOutline() {
  await OBR.scene.local.deleteItems([SOURCE_OUTLINE_ITEM_ID]);
}

export async function showTargetRing(tokenId) {
  const bounds = await getTokenBounds(tokenId);
  // Self-healing: unconditionally clear any PRE-EXISTING item under this
  // fixed id before creating a fresh one. The id is a constant (not
  // per-target-unique), so if a previous session ever left a ghost ring
  // behind (e.g. a hard page reload that skipped cleanup()'s own best-effort
  // hideAllTargetingVisuals()), a later addItems() call reusing the SAME id
  // could collide with stale state instead of the fresh one just computed
  // here. This does not depend on this module's own in-memory ringVisible
  // tracking (which only reflects what THIS session believes, not what is
  // actually already in the local scene store).
  try {
    await OBR.scene.local.deleteItems([TARGET_RING_ITEM_ID]);
  } catch (_e) { /* nothing to delete is the common, expected case */ }
  // ONE addItems call for a single, plain, unattached local item — matching
  // movement/combatMovementPreview.js's proven pattern. addItems is never
  // called again after this for the same target; geometry/rotation updates
  // go through updateTargetRingGeometry()'s updateItems call instead.
  try {
    await OBR.scene.local.addItems([buildTargetRingItem(bounds, 0)]);
  } catch (error) {
    throw tagPhase(error, "ring-creation", "addItems(ring)");
  }
}

export async function hideTargetRing() {
  await OBR.scene.local.deleteItems([TARGET_RING_ITEM_ID]);
}

/** Refreshes the ring's position/width/height (re-derived from the target
 *  token's CURRENT bounds) together with its rotation in a single
 *  updateItems() call. Called every animation tick in place of the old
 *  rotation-only setTargetRingRotation — this is the "outer anchor" role now:
 *  a piece of logic that re-reads token geometry and folds it into the one
 *  real local item's transform, never a second OBR item of its own. */
export async function updateTargetRingGeometry(tokenId, rotationDeg) {
  const bounds = await getTokenBounds(tokenId);
  const geo = computeOverlayGeometry(bounds, RING_GAP_RATIO);
  await OBR.scene.local.updateItems([TARGET_RING_ITEM_ID], (items) => {
    for (const item of items) {
      item.position = geo.position;
      item.width = geo.width;
      item.height = geo.height;
      item.rotation = rotationDeg;
    }
  });
}

export async function hideAllTargetingVisuals() {
  await OBR.scene.local.deleteItems([SOURCE_OUTLINE_ITEM_ID, TARGET_RING_ITEM_ID]);
}
