# Target-ring animation audit

Priority Bugfix Pack: "Body Thresholds, Debug Roll Trace, Target Ring, HUD
Typography".

**Status note:** the anchor/inner-ring separation §1-8 below describes was
already implemented in an earlier session of this same bugfix pack (commit
`fix(targeting): stabilize local target ring rotation`, already on `main`)
and fixed the reported STUTTER. A later report showed a DIFFERENT, more
fundamental bug: the overlay can be **entirely absent** even though Combat
Control correctly shows a selected target — see the "Missing-overlay
lifecycle audit" section below, which is the actual work of this pass.

## 1. Current target-pick visual flow

`Combat Control → Pick target on map` (`TargetBlock.js`'s pick area) drives
`hud/targeting/targetSelectionController.js`'s existing OBR-selection-watch
flow (unchanged by this pack). Once a target token is picked, that
controller broadcasts the resolved target over `BC_HUD_TARGETING` (its own
outbound state broadcast — distinct from `BC_HUD_TARGETING_COMMAND`, the
INBOUND channel Combat Control uses to send `pick`/`cancel`/`clear`/
`selectZone` commands back to this same controller).
`hud/targeting/visuals/targetingVisualController.js`
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
`showTargetRing()` creates the anchor and the ring in two SEQUENTIAL
`addItems()` calls (see "Missing-overlay lifecycle audit" below for why this
was changed from one batched call);
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

## Missing-overlay lifecycle audit

Reported bug: Combat Control correctly shows a selected target ("Target
block shows selected target name", "target body zone UI is active") but the
map overlay ring around that target token is absent. This is a different bug
from the stutter §1-8 already fixed — the state/UI layer works; the
map-rendering layer does not.

### 2. Where the target state is stored after target selection

Entirely in `targetSelectionController.js`'s own in-memory `state.target`
(background context, survives HUD popover open/close, reset only by
`clearTarget()`/`applySource()` on a genuine character change/scene
teardown). It is never written to OBR scene/token metadata and never
persisted — Combat Control's rendering of the name/zone UI reads the
`BC_HUD_TARGETING` broadcast built from this same state
(`buildTargetingBroadcast()`), which is why the NAME can be correct even if
the separate map overlay fails independently.

### 4/14. Why selected-target state can exist while the overlay is absent — root cause

`targetingVisualController.js`'s `reconcileRing()` is a pure CONSUMER of the
SAME broadcast (via the `onTargetingState` hook `combatHudOverlayController.js`
wires directly to `targetSelectionController`'s own `broadcast()` call — a
synchronous, same-process function call, not a second network/broadcast
round trip, so the two layers do not "miss" each other's updates). The state
layer and the render layer are correctly wired together on paper. But
`reconcileRing()`'s actual creation call, `showTargetRing(tokenId)`, was
wrapped in a `try { ... } catch (_e) { ringVisible = false; ringTokenId =
null; }` with **no logging at all** — any failure inside `showTargetRing()`
silently resulted in "target selected, ring absent," indistinguishable from
"everything working" with no diagnostic trail.

The most concrete, previously-untested risk inside `showTargetRing()` itself:
it created the invisible anchor AND the visible ring — where the ring's
`.attachedTo(TARGET_RING_ANCHOR_ITEM_ID)` references the anchor's id — in a
**single batched** `OBR.scene.local.addItems([anchor, ring])` call. This
"attach to a sibling being created in the very same call" pattern has no
precedent anywhere else in this codebase (`movement/combatMovementPreview.js`,
the project's other local-only map overlay, never attaches one freshly-
created local item to another — it positions everything by absolute
coordinates instead), so it was never validated against the Owlbear SDK's
actual same-batch attachment-resolution behavior. If the SDK resolves
`attachedTo` against the scene state as it was BEFORE the batch is applied
(rather than resolving sibling references within the same batch), the ring
item would either be silently rejected or created unattached/at a degenerate
position — exactly matching "selected target exists, ring absent, no error."

**Fix:** `showTargetRing()` now issues two SEQUENTIAL `addItems()` calls —
the anchor first, awaited to completion, then the ring referencing that
now-committed anchor id. This removes the same-batch ordering risk entirely
regardless of which way the SDK actually resolves it. `reconcileRing()` also
now logs a `targeting/target-ring-shown` (success) or
`targeting/target-ring-failed` (failure, with the real thrown error message)
Debug Console event on every creation attempt, so if the overlay is ever
missing again for some other reason, there is now a diagnosable trace
instead of silence.

### 5. Whether the ring is tied only to pick mode

No. `shouldShowTargetRing({ targetTokenId })` in `targetingVisualPolicy.js`
depends ONLY on a target token id existing — it takes no `mode`/`picking`
parameter at all. The ring is designed to persist through picking → idle
exactly as required ("restore an already selected target… the ring must
remain visible while… the target remains selected").

### 6. Whether the ring is removed immediately after successful pick

No code path does this. `resolveCandidate()` (the pick-resolution function)
calls `commit(applyResolvedTarget(state, result.candidate))` — which sets a
real target — then `await restoreSourceSelection()`, which only calls
`OBR.player.select([sourceTokenId], true)` (restoring the NATIVE Owlbear
selection outline to the source token). It never touches `state.target` and
never sends a `clear`/`cancel` command. Ruled out as a cause.

### 7. Whether scene/token listeners are subscribed after target selection

Not needed, and none are added. Position/size/rotation tracking is delegated
entirely to OBR's own `attachedTo()` sync on the anchor — no per-target JS
listener is ever registered (or needs to be) for token geometry.

### 8/9. Whether token lookup uses the correct id / source-target confusion

Traced end to end: the picked token id comes from `OBR.player.selection[0]`
during picking (a real OBR scene-item id, captured in
`targetSelectionController.js`'s `subscribePlayerChanges` callback) →
`adapter.resolve(tokenId)` returns `{ tokenId: String(tokenId), ... }`
verbatim → `applyResolvedTarget()` stores it as `state.target.tokenId` →
`buildTargetingBroadcast()` copies it to `payload.target.tokenId` →
`handleTargetingState()` reads it into `targetTokenId` → `showTargetRing(targetTokenId)`.
No aliasing, relabeling, or accidental swap with `sourceTokenId` at any
point in this chain.

### 10. Whether native Owlbear selection outline was mistaken for the overlay

Worth flagging as a visual-verification caution, not a code bug: after a
successful pick, `restoreSourceSelection()` deliberately moves OBR's OWN
native (purple) selection outline back onto the SOURCE token. A viewer
watching only the native selection outline would correctly see it move away
from the target — the CUSTOM dashed ring around the target is a completely
separate, independently-rendered item and must be checked for on its own,
not inferred from where the native outline currently is.

### 11-13. Recreation on updates / geometry vs. rotation transforms

Unchanged from §3-5 above — still correct: `reconcileRing()` only recreates
on an actual target-token change; the anchor alone tracks geometry; only the
ring's own `.rotation` is animated.

### 16. Final fixed architecture (this pass)

Unchanged topology (anchor + ring, §7 above), with the creation sequence
hardened to two sequential `addItems()` calls and failure now logged instead
of silently swallowed — see §4/14.

### 17. Why local-only, still

Unchanged — see §8 above; this pass adds no new OBR capability, only
reorders two already-local-only calls and adds Debug Console logging (which
itself is a purely local, in-memory diagnostic store — see
`hud/debug/debugLogStore.js`, never persisted, never shared).

## Tests

The prior session's `scripts/hud-targeting-visuals.test.mjs` "Fix #4" block
already covered: anchor `attachedTo(tokenId)` with full sync (tracks
position/size/rotation), the ring attached to the anchor (never the token)
with independent rotation, `setTargetRingRotation` touching only the ring,
`reconcileRing` only firing on an actual target-token change (never on
routine geometry updates — i.e. the ring persists/never remounts during
normal token movement), scene-teardown resetting `ringTokenId`, rotation
origin centered, and the existing local-only/no-shared-state source-contract
tests.

This pass adds: `showTargetRing()` issues two SEPARATE, sequential
`addItems()` calls (anchor committed before the ring references it) rather
than one batched call; `reconcileRing()` logs a debug event on both success
and failure of ring creation; and the full lifecycle matrix the new
requirements call out — overlay created on pick, restored after HUD/
Tactical-Move/attack-result refresh with a still-valid target, attached to
the TARGET (never the source) token, working for NPC targets and targets not
currently Owlbear-selected, and removed on every required teardown path
(clear/Escape/source-change/scene-change/token-deletion/HUD-teardown) —
all as pure/source-contract tests (no live OBR session available to this
harness; see the file header for why).

**Superseded note (2026-07-08):** the two-item anchor+ring architecture
described in §1-8 above (`TARGET_RING_ANCHOR_ITEM_ID`, `attachedTo`,
`layer("ATTACHMENT")`) was itself replaced by a later hotfix after a live
Owlbear Rodeo session produced a real `ValidationError` on
`addItems(anchor)` — Owlbear's host-side item-schema validator rejected the
anchor item outright. `attachedTo`/`layer("ATTACHMENT")` had no precedent
anywhere else in this codebase for `OBR.scene.local` items, and the anchor
concept was removed entirely in favor of a single local Shape item plus pure
internal JS state (`ringTokenId`) — see the git history for
`hud/targeting/visuals/targetingVisualRenderer.js` around that change. The
video-regression section below documents the NEXT bug found in that
single-item architecture, and is the CURRENT, authoritative description of
how the ring works today.

## Video regression: 2026-07-08 target ring stutter

A screen recording from the user showed the (by-then single-item, no-anchor)
target ring appearing correctly — visible, centered, roughly the right size —
but its rotation was NOT smooth: the dashed segments visibly jumped/stepped/
strobed instead of rotating continuously. This is a different bug from
anything in §1-16 above: the ring exists and is positioned correctly: only
its *animation* was broken.

### 1. How the ring was created (at the time of the video)

`targetingVisualRenderer.js`'s `showTargetRing(tokenId)` — a single
`buildShape()` `CIRCLE` item (`TARGET_RING_ITEM_ID`), `layer("POINTER")`, no
`attachedTo`, created ONCE via `OBR.scene.local.addItems([...])` when the
target token changes. This part was already correct and is unchanged by this
fix.

### 2. How rotation was animated (at the time of the video)

`targetingVisualController.js`'s `startRingTimer()` ran a plain
`setInterval(..., RING_TICK_MS)` with `RING_TICK_MS = 150`. On every tick it
computed a new `ringRotationDeg` via `nextRingRotation()` (a linear stepping
function advancing degrees proportionally to elapsed time, wrapping at 360°)
and pushed BOTH the freshly-recomputed geometry AND that new rotation value
through a single `OBR.scene.local.updateItems([TARGET_RING_ITEM_ID], ...)`
call — i.e. a real network/message-bus round trip to the host, once every
150ms, for as long as any target remained selected.

### 3. Whether Owlbear local item update calls happened every animation frame

Not every rendered frame (which would be ~16ms at 60fps), but every 150ms —
still a **fixed-interval poll**, entirely decoupled from whether the token's
geometry had actually changed. Every one of those ~6.7 calls per second was a
real `OBR.scene.local.updateItems` round trip through the host's message
bus, regardless of whether anything about the target had moved.

### 4. Whether the ring item was deleted/re-added during animation

No — this part was already correct. `showTargetRing()`/`hideTargetRing()`
(add/delete) were only ever called on retarget or clear, never from the
150ms tick; the tick exclusively called `updateItems`. Delete/re-add churn
was ruled out as a contributing cause.

### 5. Whether target/HUD refresh restarted the animation

No — also already correct, and covered by existing tests
(`hud-targeting-visuals.test.mjs`'s `ringVisible && ringTokenId ===
targetTokenId` no-op guard, and the Tactical-Move/attack-result refresh
tests in `tactical-move-hud-refresh.test.mjs`). A same-target HUD/Tactical-
Move/attack-result refresh never re-entered `reconcileRing()`'s creation
path, so it never restarted `startRingTimer()`. Refresh-driven restarts were
ruled out as the cause.

### 6. Exact reason the video shows stepped/stuttering animation

The rotation was driven by **repeated discrete writes to a real scene item**,
not by continuous rendering. Each `updateItems` call is a genuine
message-bus round trip from the extension's background context, through
Owlbear's host, to the item the renderer actually paints — there is no
mechanism in the `@owlbear-rodeo/sdk` for a local item's transform to
interpolate BETWEEN two writes on its own. At a 150ms cadence, the rendered
ring therefore visibly "jumps" through roughly `(150ms / 3500ms) × 360° ≈
15.4°` of rotation on every write, instead of appearing to glide — exactly
the "jump/step/strobe" behavior in the video. Reducing the tick interval
would only shrink the step size, never eliminate it (and violates the
architecture requirement below regardless: no per-frame scene-item writes),
and timer/network jitter on top of a fixed interval can make the steps
themselves visibly uneven in addition to being discrete.

### 7. Final fixed architecture

**The ring no longer animates rotation at all.** Two changes, both required
by the fact above:

1. **`buildTargetRingItem()` never calls `.rotation()`** — the ring is a
   static, correctly-centered, correctly-sized dashed circle. There is no
   longer any repeated write driving a visible spin, so there is nothing left
   to step or stutter.
2. **Geometry (position/width/height) is now updated by a real scene event,
   never a fixed-interval poll.** The controller subscribes to
   `OBR.scene.items.onChange(...)` once (alongside the existing
   `OBR.scene.onReadyChange` subscription); its handler,
   `handleSceneItemsChanged(items)`, only proceeds if the reported change
   batch actually includes the CURRENT target token's id, then calls
   `updateTargetRingGeometry(ringTokenId, lastRingBounds)`. That function
   re-reads the token's bounds via `getItemBounds` and diffs them against
   `lastRingBounds` (the anchor layer's own last-known geometry, kept as
   plain JS state in the controller) — it only issues an
   `OBR.scene.local.updateItems` write when the bounds genuinely differ,
   never unconditionally. `RING_TICK_MS`/`RING_ROTATION_PERIOD_MS`/
   `nextRingRotation()` are deleted entirely (dead code once the tick is
   gone) — see `hud/targeting/visuals/targetingVisualPolicy.js`'s git history.

This satisfies the required lifecycle exactly: ring created once on target
select, kept alive (never recreated) while the same target remains selected
across HUD/Tactical-Move/attack-result refreshes, geometry-synced only when
the target's OWN bounds actually change, and removed on
clear/source-change/scene-change/teardown.

### Option A (animated local image/effect) — feasibility assessment

The task's own preferred approach was an animated local IMAGE item (an SVG
with an internal `animateTransform`/CSS keyframe spin) so the animation lives
in the asset itself and Owlbear's own renderer plays it continuously, with no
JS-driven scene writes at all. Two candidates were investigated in the
installed `@owlbear-rodeo/sdk` (v3.1.0) before ruling this out for THIS pass:

- **`buildImage()` / `IMAGE` items** (`image.url` + `image.mime`): Owlbear
  Rodeo's scene renderer is a canvas/WebGL-based engine, which — like
  virtually every renderer of this kind — decodes an image URL into a single
  static GPU texture at load time. SMIL (`animateTransform`) or CSS
  keyframe animation embedded in an SVG document does not survive that
  rasterize-once-to-texture step; the texture becomes a frozen snapshot of
  the SVG's initial frame. This is a general, well-established limitation of
  WebGL/canvas image compositing, not something this SDK's types can
  override. A pre-rendered ANIMATED raster format (GIF/APNG/animated WEBP —
  Owlbear Rodeo does support animated GIF *tokens* as a first-party feature)
  is a somewhat more plausible variant, but building a valid animated
  GIF/WEBP by hand was judged out of scope: this repo has no image/canvas
  encoding dependency in `package.json` (only `@owlbear-rodeo/sdk`,
  `@supabase/supabase-js`, and `esbuild`), and whether a local extension-
  created `IMAGE` item's raw `image.url` is decoded through the SAME
  animated-frame-aware path as a user-uploaded token (vs. a simpler
  always-static-texture path used for extension-drawn overlays) could not be
  confirmed from the SDK alone.
- **`buildEffect()` / `EFFECT` items** (`sksl` Skia shader string +
  `uniforms`): the only item type genuinely driven by the HOST's own
  per-frame render loop rather than by our JS — in principle the correct
  mechanism for real continuous animation with zero scene writes. However,
  whether Owlbear auto-feeds any continuously-incrementing "time" uniform to
  a shader (the only way a shader could animate at all, since a shader is a
  pure function of its given uniforms/position with no persisted state
  between frames) is NOT documented anywhere in the installed
  `@owlbear-rodeo/sdk` package — no README, no type comment, no reference in
  this codebase. Relying on it would be exactly the same kind of unverified
  assumption as the IMAGE-texture approach.

**Both hypotheses require a live Owlbear Rodeo render to verify.** This
harness attempted to check for a connected browser via the same
`claude-in-chrome` MCP bridge used earlier in this engagement to reproduce
the original `ValidationError` — `list_connected_browsers()` returned empty;
no browser is currently connected/authorized, and re-establishing that
requires the user to reinstall/reauthorize "Claude for Chrome" and share a
room URL again. Given neither approach could be genuinely tested, and given
the real risk that guessing wrong on either (especially `IMAGE` items' grid/
scale math, which is materially more complex than `Shape`'s direct
`.width()/.height()`) could reintroduce a DIFFERENT visible regression (a
mis-scaled or fully invisible ring) — worse than the current stutter — this
pass takes the task's own explicitly-sanctioned fallback: **Option B, a
stable, correctly-anchored, non-animated ring**, exactly as described above.
A live-tested follow-up with real OBR access could revisit Option A/the
EFFECT-shader route with actual verification.

### Tests

See `scripts/hud-targeting-visuals.test.mjs` and
`scripts/target-ring-diagnostic.test.mjs` for the full source-contract suite
covering: no fixed-interval timer survives in the controller
(`setInterval`/`RING_TICK_MS`/`nextRingRotation` all gone), the ring builder
never calls `.rotation()`, `updateTargetRingGeometry` only writes via
`updateItems` (never `addItems`/`deleteItems`), `handleSceneItemsChanged`
only acts on changes that include the current target token id, and the
existing same-target/HUD-refresh/Tactical-Move-refresh/scene-teardown
lifecycle guards all still hold.
