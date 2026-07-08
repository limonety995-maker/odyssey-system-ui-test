# Target-ring animation audit

Priority Bugfix Pack: "Body Thresholds, Debug Roll Trace, Target Ring, HUD
Typography".

**Status note:** the anchor/inner-ring separation this section describes was
already implemented in an earlier session of this same bugfix pack (commit
`fix(targeting): stabilize local target ring rotation`, already on `main`).
This audit re-verifies that current, already-shipped architecture against
this task's exact requirements and closes the one test gap not yet covered
(rotation-origin-centered — see §Tests). It does not re-do the fix.

## 1. Current target-pick visual flow

`Combat Control → Pick target on map` (`TargetBlock.js`'s pick area) drives
`hud/targeting/targetSelectionController.js`'s existing OBR-selection-watch
flow (unchanged by this pack). Once a target token is picked, that
controller broadcasts the resolved target over the existing `BC_HUD_TARGETING_COMMAND`
payload. `hud/targeting/visuals/targetingVisualController.js`
(`setupTargetingVisuals()`) is a pure CONSUMER of that broadcast (via
`handleTargetingState`) — it starts no new target-selection mechanism and
sends no commands back into that flow. It only asks
`hud/targeting/visuals/targetingVisualRenderer.js` to reflect "what should
the map show ME right now" via `OBR.scene.local` (never-synced, per-client
only).

## 2. Where the ring is created

`targetingVisualRenderer.js`'s `showTargetRing(tokenId)`, called from
`targetingVisualController.js`'s `reconcileRing()` whenever
`handleTargetingState` sees the target token id itself change
(`targetChanged`).

## 3. Whether it is currently recreated on token updates

**No** — and this is the key point of the whole fix. `reconcileRing()` is
only ever invoked from `handleTargetingState`, and only inside the `if
(targetChanged) void reconcileRing();` branch — a token's own position/size/
rotation updates on the map do NOT flow back through this broadcast at all
(OBR's own `attachedTo()` sync handles those directly, at the SDK level, with
no JS callback into this controller). So the ring is only torn down/recreated
when the TARGET actually switches to a different token (or is cleared) — a
normal token drag/resize/rotate never re-triggers creation.

## 4. What transform currently tracks geometry / 5. What transform currently animates rotation

**This was the actual root cause.** Before this pack's fix, the ring was a
SINGLE `OBR.scene.local` item, `attachedTo(tokenId)` directly, with only
`disableAttachmentBehavior(["ROTATION"])` set. That single item's
`.rotation` property was BOTH:

- the thing OBR itself recomputes/re-derives as part of keeping the item's
  overall transform in sync with the token on every geometry update (an
  attached item's transform is a function of its parent's transform plus its
  own local offset — even with ROTATION sync explicitly disabled for
  *inheriting the token's own facing*, the item is still the SAME object
  whose transform OBR revisits on every attachment-parent update), and
- the thing the controller's own `setInterval` animation tick was writing to
  every 150ms via `setTargetRingRotation()`.

Two independent writers on the exact same transform, racing on every token
move — this produced the reported stutter/reset/jump.

## 6. Root cause (summary)

The ring's "track target geometry" role and its "spin continuously" role
were the same OBR item and the same `.rotation` property. The fix's own
required architecture ("do not animate the same transform layer that tracks
target geometry") directly names this.

## 7. Final fixed architecture

Two local items, in a parent/child chain:

- **Outer anchor** (`TARGET_RING_ANCHOR_ITEM_ID`, `buildTargetRingAnchorItem()`):
  invisible (`fillOpacity`/`strokeOpacity: 0`), `attachedTo(tokenId)` with
  full default sync (position/scale/rotation/delete all follow the token).
  This is the ONLY item whose transform is ever driven by the target's own
  geometry.
- **Inner ring** (`TARGET_RING_ITEM_ID`, `buildTargetRingItem()`): the
  visible dashed CIRCLE, `attachedTo(the anchor's id — never the token)`,
  with `disableAttachmentBehavior(["ROTATION"])` relative to the anchor. Its
  `.rotation` is the ONLY thing `setTargetRingRotation()`'s animation tick
  ever touches (`OBR.scene.local.updateItems([TARGET_RING_ITEM_ID], ...)` —
  never the anchor's id).

Because the ring's parent (the anchor) never itself changes rotation out
from under it, the animation tick's writes and the token-geometry-driven
transform recompute are now on genuinely separate objects — no more race.
`showTargetRing()` creates both together (`addItems([anchor, ring])`);
`hideTargetRing()`/`hideAllTargetingVisuals()` always delete both together —
no orphaned anchor can be left behind.

`reconcileRing()` additionally now tracks `ringTokenId` (which token the ring
is CURRENTLY attached to), not just a visibility boolean — a related bug
fixed in the same pass: retargeting directly from one token to a different
one used to leave the ring attached to the stale token (the old code only
compared `wanted === ringVisible`, both already `true`, so it no-opped
instead of reattaching). It now tears down and recreates whenever the target
switches to a genuinely different token, and no-ops only when already
correctly attached to that exact token.

Rotation: `RING_ROTATION_PERIOD_MS = 3500` (one full turn every 3.5s, inside
the required 3-4s), advanced linearly by `nextRingRotation()` on a fixed
150ms tick — continuous, never restarted by a token update. The ring is a
`CIRCLE` shape whose `.position()` IS its own geometric center (OBR circles
have no separate top-left anchor concept) — rotation is inherently
"around its own center," matching `transform-origin: center center`.

## 8. Why the final implementation remains local-only

Both items live exclusively in `OBR.scene.local` — confirmed by an existing
source-contract test asserting the renderer never calls
`OBR.scene.items.(addItems|updateItems|deleteItems)` (the SHARED/synced
scene API), only `OBR.scene.local.*`. No shared scene items, no token/scene
metadata writes (`.setMetadata()`), no Supabase writes, and no persistent
token metadata are used anywhere in `targetingVisualController.js`/
`targetingVisualRenderer.js` — this is the same mechanism this project's own
tactical-move drag preview (`movement/combatMovementPreview.js`) already
uses for "visible to me only" map overlays, so no new Owlbear SDK capability
or fallback was needed; a fully smooth, local-only rotating ring was
achievable with the supported `attachedTo`/`disableAttachmentBehavior` API.

## Tests

The prior session's `scripts/hud-targeting-visuals.test.mjs` "Fix #4" block
already covered: anchor `attachedTo(tokenId)` with full sync (tracks
position/size/rotation), the ring attached to the anchor (never the token)
with independent rotation, `showTargetRing`/`hideTargetRing` creating and
deleting both items together, `setTargetRingRotation` touching only the
ring, `reconcileRing` only firing on an actual target-token change (never on
routine geometry updates — i.e. the ring persists/never remounts during
normal token movement), scene-teardown resetting `ringTokenId`, and the
existing local-only/no-shared-state source-contract tests.

This pass adds the one test the requirements newly call out that wasn't yet
explicit: rotation origin stays centered — a dedicated test now pins that
the ring is built as a `CIRCLE` shape positioned at `computeOverlayGeometry`'s
own center-derived `position` (never a top-left offset), and that
`computeOverlayGeometry` itself always returns the token's true center, not
a top-left corner.
