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
// deleted) — this file never re-computes that by hand.
//
// Bugfix pack (Fix #4): the target ring is TWO local items, not one —
//   - TARGET_RING_ANCHOR: invisible, attachedTo(tokenId) with full default
//     sync (position/scale/rotation/delete all follow the token). This is the
//     ONLY item whose transform tracks target geometry.
//   - TARGET_RING: the visible dashed circle, attachedTo(the anchor's id,
//     not the token), with ROTATION sync disabled — its own `.rotation` is
//     the SOLE thing the controller's animation timer ever touches.
// Before this fix both roles were the same single item (attachedTo(tokenId)
// directly), so the one transform OBR recomputes on every token geometry
// update was the exact same transform the animation timer was writing to —
// the two writers raced, which is what produced the reported stutter/reset
// on token move. Splitting them into a parent/child pair means the timer's
// writes land on an item whose own parent (the anchor) never changes rotation
// out from under it; the animation and the geometry-follow are now on
// genuinely separate transform layers, as required.
//
// Every local item ADD/UPDATE/DELETE call is wrapped in try/catch: a failure
// here is a lost cosmetic effect, never a reason to break targeting itself.

import OBR, { buildShape } from "@owlbear-rodeo/sdk";
import { computeOverlayGeometry, OUTLINE_GAP_RATIO, RING_GAP_RATIO } from "./targetingVisualPolicy.js";

export const SOURCE_OUTLINE_ITEM_ID = "com.odyssey-system/targeting-source-outline";
export const TARGET_RING_ANCHOR_ITEM_ID = "com.odyssey-system/targeting-target-ring-anchor";
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

/** The outer anchor: invisible, attachedTo the TOKEN with full default sync
 *  (position/scale/rotation/delete). This is the ONLY item whose transform
 *  is driven by the target's own geometry — the ring never attaches to the
 *  token directly, so the animation timer below never writes to the same
 *  transform OBR is simultaneously recomputing from token movement. */
function buildTargetRingAnchorItem(tokenId, bounds) {
  const geo = computeOverlayGeometry(bounds, RING_GAP_RATIO);
  return buildShape()
    .id(TARGET_RING_ANCHOR_ITEM_ID)
    .name("Odyssey Target Ring Anchor (local only, invisible)")
    .shapeType("RECTANGLE")
    .width(geo.width)
    .height(geo.height)
    .position(geo.position)
    .style({ fillColor: TARGET_RING_COLOR, fillOpacity: 0, strokeColor: TARGET_RING_COLOR, strokeOpacity: 0, strokeWidth: 0 })
    .layer("ATTACHMENT")
    .locked(true)
    .disableHit(true)
    .disableAutoZIndex(true)
    .attachedTo(tokenId)
    .visible(true)
    .build();
}

/** The inner ring: the visible dashed circle, attachedTo the ANCHOR (never
 *  the token) with ROTATION sync disabled — its `.rotation` is set ONLY by
 *  setTargetRingRotation() below, continuously, and is never reset/restarted
 *  by a token geometry update (that only ever touches the anchor). Centered
 *  on itself (position IS its own center — CIRCLE shapes have no top-left
 *  anchor concept), so its spin is a pure rotation-in-place. */
function buildTargetRingItem(anchorItemId, bounds, rotationDeg = 0) {
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
    .layer("ATTACHMENT")
    .locked(true)
    .disableHit(true)
    .disableAutoZIndex(true)
    .attachedTo(anchorItemId)
    // Position/scale/visibility/delete follow the ANCHOR; rotation is owned
    // exclusively by the controller's own animation tick, never the anchor's
    // (i.e. never the token's) facing.
    .disableAttachmentBehavior(["ROTATION"])
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
  // Self-healing: unconditionally clear any PRE-EXISTING item under these
  // fixed ids before creating fresh ones. These ids are constants (not
  // per-target-unique), so if a previous session ever left a ghost anchor/
  // ring behind (e.g. a hard page reload that skipped cleanup()'s own
  // best-effort hideAllTargetingVisuals()), a later addItems() call reusing
  // the SAME id could collide with — or silently attach to — stale state
  // instead of the fresh one just computed here. This does not depend on
  // this module's own in-memory ringVisible tracking (which only reflects
  // what THIS session believes, not what is actually already in the local
  // scene store).
  try {
    await OBR.scene.local.deleteItems([TARGET_RING_ITEM_ID, TARGET_RING_ANCHOR_ITEM_ID]);
  } catch (_e) { /* nothing to delete is the common, expected case */ }
  // Two SEQUENTIAL addItems calls, not one batched call: the ring's
  // .attachedTo(TARGET_RING_ANCHOR_ITEM_ID) must resolve against an anchor
  // that is already committed to the local scene store, never a same-call
  // sibling whose own commit ordering isn't guaranteed. This is the one part
  // of the local-only mechanism that is genuinely new to this codebase (no
  // existing local-only overlay — e.g. movement/combatMovementPreview.js —
  // ever attaches one freshly-created local item to another in the same
  // operation), so it is deliberately the most conservative possible
  // sequencing rather than relying on unconfirmed same-batch behavior.
  try {
    await OBR.scene.local.addItems([buildTargetRingAnchorItem(tokenId, bounds)]);
  } catch (error) {
    throw tagPhase(error, "ring-creation", "addItems(anchor)");
  }
  try {
    await OBR.scene.local.addItems([buildTargetRingItem(TARGET_RING_ANCHOR_ITEM_ID, bounds, 0)]);
  } catch (error) {
    // The anchor now exists but the ring doesn't — never leave a half-shown,
    // invisible-only overlay behind; clean up before surfacing the failure.
    try { await OBR.scene.local.deleteItems([TARGET_RING_ANCHOR_ITEM_ID]); } catch (_e) { /* best effort */ }
    throw tagPhase(error, "ring-creation", "addItems(ring)");
  }
}

export async function hideTargetRing() {
  await OBR.scene.local.deleteItems([TARGET_RING_ITEM_ID, TARGET_RING_ANCHOR_ITEM_ID]);
}

/** Sets ONLY the inner ring's own rotation — never touches the anchor, never
 *  re-adds/removes either item. Called every animation tick. */
export async function setTargetRingRotation(rotationDeg) {
  await OBR.scene.local.updateItems([TARGET_RING_ITEM_ID], (items) => {
    for (const item of items) item.rotation = rotationDeg;
  });
}

export async function hideAllTargetingVisuals() {
  await OBR.scene.local.deleteItems([SOURCE_OUTLINE_ITEM_ID, TARGET_RING_ITEM_ID, TARGET_RING_ANCHOR_ITEM_ID]);
}
