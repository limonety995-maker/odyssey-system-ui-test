# Tactical Move → HUD refresh audit

Priority bugfix pack: "Immediate HUD refresh after Tactical Move". This audit
follows the real active code path — no assumption is made from naming alone.

## 1. Which function receives the successful movement RPC result?

`movement/moveToolController.js`, inside the drag-commit handler (the
function that calls `combatApi.moveCharacter(...)`, i.e. the
`combat_move_character` RPC). On `result.ok !== false` it calls:

```js
await finalizeMutationSuccess(
  result,
  "combat-movement",
  `Moved ${preview.moveCostM} m - ${Math.max(preview.remainingMoveM, 0)} m remaining.`,
);
```

`finalizeMutationSuccess(result, source, successMessage)` (same file) is the
actual success handler.

## 2. Is `result.runtime` already available there?

Yes. `combat_move_character` (the live definition in
`supabase/odyssey_supabase.sql`, confirmed by locating its LAST
`create or replace function` in the file — the file is a concatenation of
every migration ever applied in order, so the last definition of a given
function name is the one actually live) returns, on every branch:

```sql
return jsonb_build_object(
  ...,
  'runtime', public.odyssey_build_combat_runtime(v_encounter_id, v_actor_player_id, v_actor_is_gm, v_actor_is_gm, 5)
);
```

`odyssey_build_combat_runtime(...)` is the **exact same helper**
`combat_get_active_runtime` returns directly as its own top-level result
(confirmed: `combat_get_active_runtime` has a single definition in the file,
`return public.odyssey_build_combat_runtime(...);`). So
`combat_move_character`'s `result.runtime` is byte-for-byte the same shape as
`combat_get_active_runtime`'s response — `{ encounter: { id, state_version,
active_entry_id, ... }, visible_participants: [{ character_id,
initiative_entry_id, move_current, move_max, movement_version, ... }],
viewer_controlled_character_ids, tactical_grid, ... }`. It is already fully
sufficient to feed `hud/session/combatSessionMapper.js`'s
`mapCombatRuntimeToSession()` — the same mapper that turns
`combat_get_active_runtime` into `snapshot.combatSession` today.

`finalizeMutationSuccess` already uses it locally:

```js
async function finalizeMutationSuccess(result, source, successMessage) {
  if (result?.runtime) {
    updateRuntimeCache(result.runtime); // moveToolController's OWN internal state.runtime
  }
  ...
}
```

## 3. Exact payload currently sent with `MOVE_TOOL_EVENTS.Applied`

```js
await publishMoveToolEvent(MOVE_TOOL_EVENTS.Applied, {
  ...buildStatus(state, { applied: true, source }),
  runtime: result?.runtime ?? null,
});
```

`buildStatus(state, extras)` (same file) already builds:

```js
{
  active, pending, toolRegistered,
  encounterId: state.encounterId,
  tokenId, characterId, characterName,
  moveCurrent, moveMax,
  stateVersion: Number(state.stateVersion ?? 0) || 0,
  movementVersion: Number(participant?.movement_version ?? 0) || 0,
  tacticalGrid, gridReady, currentTurn, measureOnly, canCommit, controlAllowed,
  position, preview,
  applied: true, source: "combat-movement",
  runtime: result.runtime,
}
```

This **already matches** the task's preferred shape almost verbatim
(`encounterId`/`characterId`/`tokenId`/`stateVersion`/`movementVersion`/
`runtime` are all present under those exact names). It carries no raw
Supabase internals, no credentials, and no target-private data — it is the
mover's own participant status plus the full combat runtime (the same data
`combat_get_active_runtime` already exposes to every HUD client). **No
payload changes were needed for this fix.**

`publishMoveToolEvent(type, payload, destination = "LOCAL")` sends this on
`MOVE_TOOL_CHANNEL` ("odyssey:tactical-move") with `destination: "LOCAL"` —
i.e. only the same browser/client that performed the move receives it, never
other players.

## 4. Does the HUD currently subscribe to this local event?

**No.** `grep -rn "MOVE_TOOL_EVENTS|subscribeMoveToolMessages|moveToolBridge" hud/`
returned zero matches before this fix. Nothing under `hud/` ever imported
`movement/moveToolBridge.js`. This is the actual root cause (see §7).

## 5. Where is HUD runtime currently stored?

Two separate runtime "worlds" exist:

- **Per-character runtime bundle** (`hud/scene/sceneSelectionController.js`,
  fetched via `getCharacterRuntimeBundle` → RPC `get_character_runtime_bundle`,
  sections `["summary","combat","armory","abilities","effects"]`). Feeds
  `entity.zones`, `entity.shield`, weapon/armory data. Refreshed via
  `refetchCurrent()` → `resolveAndPublish(currentSelectionIds)`, a **second,
  separate RPC round trip**, called explicitly after a successful/failed
  attack (`await refetchCurrent(); logDebugEvent("refresh", "source-refresh-result", ...)`).
- **Combat-session runtime** (`hud/session/combatSessionController.js`,
  fetched via `combat_get_active_runtime`, held in the module-closure
  variable `lastRuntime`). This is what `mapCombatRuntimeToSession()` turns
  into `snapshot.combatSession`, and it is where `selectedMoveCurrent` /
  `selectedMoveMax` (the MOVE tile's color source, see the prior "Priority
  Bugfix Pack" work on `hud/session/combatSessionPolicy.js`'s
  `deriveMoveState()`) actually come from.

The MOVE tile's color is driven **only** by the second world. Tactical
Move's own `result.runtime` is shaped exactly like that second world's data
— so the correct integration point is `combatSessionController.js`'s
existing `lastRuntime`/`applyRuntime`, not the character-bundle refetch.

## 6. Which version fields are available?

All present, both in `combat_move_character`'s `result.runtime` and in the
move tool's own `Applied` event payload:

- `runtime.encounter.state_version` — the canonical encounter/session
  version (what `combatSessionMapper.mapCombatRuntimeToSession()` maps to
  `combatSession.version`).
- `runtime.visible_participants[].movement_version` — per-participant
  movement version (not currently mapped into `combatSession`, but present
  on the raw participant row).
- The `Applied` event's own top-level `stateVersion` / `movementVersion`
  fields (from `buildStatus()`), mirroring the above for the mover's own
  participant — informational, not needed as the freshness authority since
  the embedded `runtime.encounter.state_version` already is one.

There is **no per-character "source-character runtime version"** separate
from the encounter's `state_version` — the whole session runtime is
versioned as one unit.

## 7. Why does the Player Block remain stale after movement?

Root cause: `movement/moveToolController.js` already does everything
correctly on its own side (calls the RPC, receives `result.runtime`, caches
it internally, and broadcasts `MOVE_TOOL_EVENTS.Applied` with that runtime
attached) — but **nothing in `hud/` ever listens for this event**. The HUD's
`combatSession` (and therefore the MOVE tile's color) only ever changes when
`hud/session/combatSessionController.js`'s own `lastRuntime` is updated,
which only happened via its own `refresh()` (polling `combat_get_active_runtime`)
or via a mutation *it itself* issued (end turn, GM skip/force-next/start/end).
Tactical Move is a **separate controller with its own RPC call**
(`combat_move_character`, not routed through `combatSessionController.js` at
all), so its result never reached `lastRuntime` until the next unrelated
event triggered `sessionController.refresh()` (e.g. an attack's
`sessionController.refresh()` call inside `sceneSelectionController.js`'s
attack-outcome handling, or the next periodic/session-command refresh) — this
is exactly the "later general runtime refresh" the task describes.

## 8. Do the existing attack/end-turn/reload refresh paths share one runtime-apply mechanism?

Partially. End turn / GM skip / GM force-next / GM start / GM end all funnel
through `combatSessionController.js`'s single `applyRuntime()` (called from
`runMutation()` and from `refresh()`). **Weapon attack and reload do not** —
they refresh via the separate `refetchCurrent()` path (a second RPC call
against `get_character_runtime_bundle`), because they need armory/inventory
data `combatSessionController.js` doesn't carry; they additionally call
`sessionController.refresh()` only when the attack outcome specifically
reports a session-relevant cost (`sessionCost`) or a version conflict.

For Tactical Move specifically, the correct, already-existing shared path is
`combatSessionController.js`'s `applyRuntime()` — it needs no second RPC
call, since `result.runtime` is already the exact shape that function
expects.

## Conclusion / fix implemented

1. Added a pure freshness guard, `isRuntimeApplicable(next, prev)`, in
   `hud/session/combatSessionMapper.js`, and wired it into
   `combatSessionController.js`'s existing `applyRuntime()` (used by
   **every** caller — refresh, mutations, and now movement — so there is
   still exactly one apply path, not a fork).
2. Exposed a new `applyExternalRuntime(runtime, origin)` on the object
   `setupCombatSessionController()` returns, which validates the incoming
   runtime actually has an `encounter` (a movement result can only exist
   inside an active session — unlike `applyRuntime`'s internal callers, which
   legitimately see `encounter: null` on session end), applies it through the
   same guarded `applyRuntime()`, and schedules one debounced, non-blocking
   reconciliation `refresh()` afterward.
3. Added the one missing subscription: `hud/scene/sceneSelectionController.js`
   now calls `subscribeMoveToolMessages(...)` and, on
   `MOVE_TOOL_EVENTS.Applied` with `payload.source === "combat-movement"`,
   calls `sessionController.applyExternalRuntime(payload.runtime, "tactical-move")`.

No changes were needed to `movement/moveToolController.js`'s event payload,
and no migration was needed — the server already returned everything
required.
