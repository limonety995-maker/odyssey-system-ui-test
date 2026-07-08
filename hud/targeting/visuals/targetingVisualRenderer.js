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
//     bounds) — never an OBR item, never passed to addItems.
//   - TARGET_RING: the one real local item, created ONCE via addItems, then
//     kept in sync by re-fetching the token's bounds and writing
//     position/width/height via a single updateItems() call — addItems is
//     never called again after the initial creation.
//
// Hotfix (video regression: stepped/stuttering rotation — see
// docs/TARGET_RING_ANIMATION_AUDIT.md's "Video regression: 2026-07-08" for
// the full write-up): the ring previously "spun" by having the controller's
// own 150ms setInterval push a fresh `rotation` value through updateItems on
// every tick. Each write is a real round-trip through the local scene store,
// so what should have read as continuous motion instead read as a visible
// step every ~150ms — exactly the stutter shown in the video. There is no
// mechanism in this SDK for OBR to animate a local item's transform on its
// own between our writes, so ANY animation driven by repeated scene-item
// writes will show the same stepping, no matter how the tick is tuned. The
// ring is therefore now STATIC (no rotation) and geometry-only updates are
// driven by real scene-item-change EVENTS (OBR.scene.items.onChange), not a
// fixed-interval poll — see updateTargetRingGeometry() below and the
// controller's handleSceneItemsChanged().
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
 *  no top-left anchor concept). STATIC — no rotation: see the header comment
 *  for why an OBR.scene.local item cannot be spun smoothly by repeated
 *  scene-item writes, which is what produced the reported stutter. */
function buildTargetRingItem(bounds) {
  const geo = computeOverlayGeometry(bounds, RING_GAP_RATIO);
  return buildShape()
    .id(TARGET_RING_ITEM_ID)
    .name("Odyssey Target Ring (local only)")
    .shapeType("CIRCLE")
    .width(geo.width)
    .height(geo.height)
    .position(geo.position)
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
  // called again after this for the same target; geometry updates go
  // through updateTargetRingGeometry()'s updateItems call instead, fired only
  // by real token-geometry-change events (see the controller's
  // handleSceneItemsChanged), never on a fixed interval.
  try {
    await OBR.scene.local.addItems([buildTargetRingItem(bounds)]);
  } catch (error) {
    throw tagPhase(error, "ring-creation", "addItems(ring)");
  }
  return bounds;
}

export async function hideTargetRing() {
  await OBR.scene.local.deleteItems([TARGET_RING_ITEM_ID]);
}

function boundsEqual(a, b) {
  if (!a || !b) return false;
  return a.width === b.width && a.height === b.height
    && a.center?.x === b.center?.x && a.center?.y === b.center?.y;
}

/** Refreshes the ring's position/width/height from the target token's
 *  CURRENT bounds — but ONLY writes to the local scene item when those
 *  bounds actually differ from `lastBounds` (the anchor layer's own
 *  last-known geometry, kept in the controller's plain JS state). Called
 *  from the controller's OBR.scene.items.onChange handler, i.e. reactively
 *  when the scene reports a real change, never on a fixed-interval poll —
 *  this is what "update only when token geometry/state changes" means in
 *  practice. Returns the freshly-read bounds either way so the caller can
 *  update its own `lastBounds` bookkeeping. */
export async function updateTargetRingGeometry(tokenId, lastBounds) {
  const bounds = await getTokenBounds(tokenId);
  if (boundsEqual(bounds, lastBounds)) return { bounds, changed: false };
  const geo = computeOverlayGeometry(bounds, RING_GAP_RATIO);
  await OBR.scene.local.updateItems([TARGET_RING_ITEM_ID], (items) => {
    for (const item of items) {
      item.position = geo.position;
      item.width = geo.width;
      item.height = geo.height;
    }
  });
  return { bounds, changed: true };
}

export async function hideAllTargetingVisuals() {
  await OBR.scene.local.deleteItems([SOURCE_OUTLINE_ITEM_ID, TARGET_RING_ITEM_ID]);
}
